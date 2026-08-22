// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Every directive Almanac dispatches, named — 4.12 §B.
//
// WHY THIS EXISTS. The 48 valid directive keywords existed only as `case`
// labels in one `switch` (`ui/widgets/index.ts::buildFromSpec`). Nothing
// enumerated them, `docs/reference.md`'s table had drifted in both directions,
// and a reader who wanted `events` or `activity-chart` on a page had to know
// the word and type the fence. A `case` label is not a list: you cannot offer
// it, you cannot check the documentation against it, and you cannot tell a new
// one from a forgotten one.
//
// IN `core`, NOT `ui/widgets/`. `ui/widgets/index.ts` imports half the plugin —
// every builder, the chart stack, the note store — and `core/note-sections.ts`
// plus the four flat catalogues need this table. A table that lived beside the
// switch would drag the whole render layer into the section model.
//
// THE SHAPE IS `BUTTON_LABELS`' (`ui/widgets/button-widgets.ts`): one record
// keyed by the word that appears in the file, holding what a list of them needs
// to draw a row. That table has been the plugin's answer to "name the things
// this switch dispatches" since 2.56 and it has not drifted once, because a
// test scrapes the switch and compares.
//
// AND IT IS A TABLE WITH NO FUNCTIONS IN IT. Everything here is data a test can
// read and a reader can edit. Anything that has to ASK the vault something —
// which folders exist, which trackers are registered, whether a catalogue
// already claims this keyword — is computed by the caller. `note-sections.ts`
// holds the probe; this file holds the words.

// A choice a reader can be offered, in the shape `ChoiceQuestion.values` and
// `FolderQuestion.keywords` both already use.
export interface WidgetChoice {
  value: string;
  label: string;
}

// What a directive's argument is, for the one question the section window will
// ask about it.
//
// THERE IS NO `required` FIELD, and that is deliberate rather than an omission.
// `questionIsRequired` (`core/section-model.ts`) answers it from the kind —
// a `choice` is required because an unanswered one composes a block that looks
// broken, a `folder` never is because its empty state is a working directive
// scoped to the host note's own folder. A second spelling of that fact here
// would be one more thing that can disagree with it.
export type WidgetArg =
  // A folder, drawn as a text field with type-ahead. The answer is a path from
  // the VAULT root — that is what `ArgSuggest` offers and therefore what the
  // editor writes. Empty means the host note's own folder, which is why this is
  // never required.
  //
  // `emptyLabel` OVERRIDES WHAT EMPTY IS CALLED, and exists because one argument
  // in this table has a different empty state: `level-index`'s second piece
  // falls back to the JOURNAL's root, not the note's folder, so a box saying
  // "This note's folder" would be describing a rule it does not follow. Absent
  // is the ordinary case and every other folder argument leaves it absent.
  | {
      kind: "folder";
      label: string;
      keywords?: readonly WidgetChoice[];
      emptyLabel?: string;
    }
  // One of a fixed set the plugin itself defines. NOT a set the vault defines —
  // see `vault` below, which is the kind that is.
  //
  // `emptyLabel` IS WHAT MAKES ONE OPTIONAL (4.46), on the folder variant's
  // field and with its meaning: present names a working empty state in the
  // reader's words, absent means there isn't one and `questionIsRequired` holds
  // the section back until the question is answered. `stats-band` is the first
  // choice in this table with a default worth stating — a bare band draws the
  // scope's own preset — and the rest deliberately have none.
  | {
      kind: "choice";
      label: string;
      values: readonly WidgetChoice[];
      emptyLabel?: string;
    }
  // One of a set THIS VAULT defines, named rather than listed. 4.15 §4.
  //
  // THE DEFERRAL UNDER `needs-vault-answer` IS WHAT THIS LIFTS, and it is worth
  // reading that note beside this one: five keywords are withheld from the add
  // list because they must name a tracker or a note kind and the section window
  // had nothing to build the list from. The price it quoted was widening
  // `FlatNoteSpec` and threading the lists through the model constructors and
  // `modelForSurface`, and that is exactly what was paid.
  //
  // A NAME, NOT A LIST, WHICH IS THE WHOLE OF WHY IT CAN LIVE HERE. This file
  // opens by saying it is "a table with no functions in it — everything here is
  // data a test can read and a reader can edit", and a `values` computed from
  // the plugin would end that. `source` says WHICH list; the caller that holds
  // the vault resolves it, and `argQuestion` turns the pair into an ordinary
  // `ChoiceQuestion` that nothing downstream can tell apart from a fixed one.
  //
  // ONE SOURCE SO FAR. `journals` is what this release needs. Trackers and note
  // kinds are the same shape and are deliberately not added speculatively —
  // each has its own question about what an id means when the thing is renamed.
  //
  // `keywords` IS THE FOLDER VARIANT'S FIELD, HERE FOR THE SAME REASON (4.36).
  // A vault argument becomes a `choice`, and a choice is REQUIRED — so a widget
  // whose empty argument means something useful has no way to say so, and the
  // add list would force a reader to name one journal where the widget's own
  // default is all of them. `journals-header` is that widget. A keyword is not
  // a member of the vault's list and cannot collide with one: the ids come from
  // `customJournals` and `all` is `SCOPE_ALL`, which `review-queue` and
  // `journal-search` already take with the same meaning.
  //
  // OFFERED BEFORE THE VAULT'S OWN ANSWERS, so "Every journal" is the first row
  // rather than the last of five — the default should be the easy pick.
  | {
      kind: "vault";
      label: string;
      // TWO SOURCES AS OF 4.52, and the second is what the paragraph above
      // predicted: "trackers and note kinds are the same shape and are
      // deliberately not added speculatively — each has its own question about
      // what an id means when the thing is renamed." A logbook's answer is the
      // one that made it addable: its id is assigned once and never rewritten,
      // so `logbook:work` keeps meaning the same note however often the reader
      // retitles it.
      source: "journals" | "logbooks";
      keywords?: readonly WidgetChoice[];
    };

// Which of this vault's lists a `vault` argument draws its answers from.
export type WidgetArgVaultSource = Extract<
  WidgetArg,
  { kind: "vault" }
>["source"];

// What this vault can answer with, as the caller that holds it supplies them.
//
// ONE OPTIONAL FIELD PER SOURCE, and every one optional for the same reason: a
// caller with no vault in hand — a journal template, a test fixture — supplies
// none of them, and a question with nothing to offer is drawn as the sentence
// saying so rather than as an empty menu. Derived from the source names above,
// so adding a source to `WidgetArg` fails to compile until this grows the list
// it promises.
export type VaultLists = {
  [K in WidgetArgVaultSource]?: readonly WidgetChoice[];
};

// One widget, as a list of widgets needs it.
export interface WidgetSpec {
  // A NOUN, and this is the one field most easily got wrong. `SECTION_TITLES`
  // (`ui/widgets/index.ts`) also maps a keyword to a name and answers a
  // different question: what the bar over this block on THIS PAGE should say.
  // `tasks-table` is "⏳ Open tasks" there — a heading — and "Open tasks" here,
  // an item in a list of things you could add. The two tables are kept apart on
  // purpose; a test asserts every `SECTION_TITLES` key is a keyword this one
  // knows, which is as far as they may agree.
  label: string;
  // The glyph a row is tokened with, on `FlatSection.icon`'s idiom. An emoji,
  // because every glyph the catalogues write is one and a section list that
  // mixed emoji with Lucide ids would draw two sizes of the same slot.
  glyph: string;
  // One sentence, for `DetailedChoice.description` in the add prompt and for
  // `FlatSection.blurb` in the row. Says what the widget puts on the page, in
  // the reader's words rather than the directive's.
  blurb: string;
  // The argument this directive takes, where the window can ask about it.
  arg?: WidgetArg;
  // A SECOND question, answered into the same argument. 4.16.
  //
  // A DIRECTIVE HAS ONE ARGUMENT — `keyword:argument` is the whole grammar — so
  // this is not a second slot in the line, it is a second piece of the one
  // argument. `level-index:study/Maths` is the journal and then the folder
  // inside it, on the compound the tree already writes elsewhere
  // (`launcher:diary,search`).
  //
  // NAMED `arg2` RATHER THAN MADE A LIST, because two is what a directive can
  // carry legibly and a list invites a third: at three pieces the argument stops
  // being something a reader could type or read back off the page, and the
  // honest answer then is a second directive rather than more separators.
  //
  // THE SEPARATOR IS DECLARED HERE, once, and both questions are built from it —
  // see `argQuestions`. The last piece takes the remainder, so a folder with
  // slashes in it survives.
  arg2?: WidgetArg;
  // THE SAME COMPOUND, WITH MORE THAN TWO PIECES. 4.47.
  //
  // `arg` and `arg2` say "this argument has two pieces" and were written when
  // two was all anything wanted — the entry above makes that case at length and
  // every word of it still holds: a directive has ONE argument, and several
  // questions DIVIDE it rather than adding slots to the line.
  //
  // `stats-band` wants four, because a band is four cells and a reader chooses
  // each. That is the same compound one piece longer, not a new grammar, so it
  // is the same field generalised rather than an `arg3` and an `arg4`.
  //
  // `arg`/`arg2` STAY, and are not rewritten into this. They are the shorthand
  // for the common case, they are what two entries in this table already use,
  // and `argQuestions` normalises the two spellings into one list — so nothing
  // downstream can tell them apart, which is the test of whether a shorthand is
  // one.
  //
  // NAMED PIECES ARE STILL KEYED `arg`, `arg2`, `arg3`, … so a widget that grows
  // a piece does not rename the ones it had. A saved layout names those keys.
  args?: readonly WidgetArg[];
  argJoin?: string;
}

// ── HOW MANY OF ONE WIDGET A PAGE MAY HOLD: AS MANY AS THE READER WANTS ──
//
// THERE IS NO FIELD FOR THIS, AND 4.56 IS WHERE THE FIELD WENT. 4.15 §4 added
// `repeats?: true`, opt-in, absent meaning one — and three widgets opted in.
// The other thirty were limited by nothing but the default, which is how a page
// came to be allowed one `logbook` when a reader's whole reason for a homepage
// is a work log beside what they are focused on beside what is scheduled.
//
// THE RULE IS NOW STRUCTURAL RATHER THAN PER-ENTRY, and this table is why it can
// be. A widget is in `WIDGETS` only if it is a PURE RENDER of something it
// names: everything that owns a keyed span of the note body is in
// `NOT_PAGE_WIDGETS` under `reason: "region"`, because two of those would share
// one region and overwrite each other. That exclusion is the whole of the
// danger, and it is already handled one table down — so a second copy of
// anything left in here is a second VIEW, never a second writer, and there is
// nothing left for a per-entry flag to protect.
//
// THE ONE-ANCHOR RULE IS UNTOUCHED. `parseFlatSections` still gives a keyword's
// second fence to nobody, and every occurrence still gets an id of its own —
// `w:journal-card#2` is "the second `journal-card` line in this text", derived
// afresh and never stored. See `widget-sections.ts`, which is where all of that
// lives and now applies it to every keyword instead of three.
//
// SECTIONS ARE STILL ONE PER PAGE, which is the other half of the rule and is
// unchanged: a catalogue section persists content into a `<!--almanac:key-->`
// region keyed by name, so `addableFlatSections` withholds one already present
// and the picker stops offering it. A widget renders; a section remembers. That
// difference is what decides which of the two may be added twice.

// Why a keyword that dispatches is not offered as a page widget.
//
// FIVE REASONS, AND THE REASON IS THE POINT. A flat list of exclusions is a
// list somebody will "tidy" — the entry looks arbitrary, so it looks removable.
// Each of these says what would go wrong, at the entry it would go wrong for.
export type WidgetExclusionReason =
  // Bound to one frontmatter property, and drawn as a control inside a line
  // rather than as a block. A page-level `slider:Mood` would write to the
  // dashboard's own frontmatter, which is not where a reading lives.
  | "inline"
  // Owns a keyed region of the note BODY (`<!--almanac:<key>-->`). Two of one
  // kind on one page share the region and overwrite each other — which is
  // `addableSections`' own argument for withholding a section already present,
  // one level down.
  | "region"
  // What a page IS rather than something on it. A second banner is a second
  // answer to "which note is this".
  //
  // ── AND AS OF 4.20 EVERY ALMANAC PAGE HAS ONE, IN TWO FORMATS ───────
  //
  // A banner is the file's NAME, its NAVIGATION and the CONTROL that edits the
  // page — those three, and nothing else. That last clause is what 4.20 settled
  // and it is the reason the tracker grid left both minimal banners: a rating is
  // content, and content that lives in the banner's fence lives in its card.
  //
  //   DASHBOARD BANNER — the homepage, Search, both folder notes and the four
  //   period overviews. Composed from `title:` and `links:` in one fence, drawn
  //   loud: an accent wash and a hatch across the whole block, because these are
  //   pages you land on and a page you land on announces itself.
  //   `.journal-page-banner`.
  //
  //   ENTRY BANNER — diary entries and journal notes. Composed from
  //   `entry-header` or `journal-header`, each of which already draws an
  //   editable name, and drawn quiet: a tight card, no wash, no hatch, a
  //   small-caps context line above the name. These are pages you WRITE in, and
  //   a note you are writing in does not announce itself.
  //   `.journal-entry-banner` and `.journal-study-banner`.
  //
  // TWO FORMATS AND NOT THREE, which is why the two classes in the second
  // paragraph are one entry: they take the same padding, the same name size and
  // the same context row, so a reader moving between an entry and a journal note
  // sees one object. They stay two classes because they are built by two
  // builders; `30-header-bars.css` spells the shared numbers once.
  //
  // NEITHER FORMAT CARRIES SPECIAL NAVIGATION. The launcher, the diary calendar
  // card and the period overview's date navigator are widgets a reader chose,
  // and they are sections of their own on the pages that have them.
  | "banner"
  // Structure rather than content: the page's own name, and the inert strip
  // that gives the cursor somewhere to land.
  | "structural"
  // Dispatches, but is a second spelling of a widget already in the table.
  // Offering both would be a choice between two names for one thing.
  | "alias"
  // Takes an argument naming something only THIS VAULT can list — a tracker, a
  // registered journal, a note kind. `FlatNoteSpec` carries no vault data by
  // design (`note-sections.ts` opens by forbidding it), so the section window
  // has nothing to build the list from, and a bare directive would render a
  // refusal in the reader's note. Not "never" — see the note under
  // `NOT_PAGE_WIDGETS`.
  | "needs-vault-answer";

export interface WidgetExclusion {
  reason: WidgetExclusionReason;
  // Said once more in this entry's own terms, because the reason above is a
  // category and this is the sentence a reader needs.
  note: string;
}

// `STAT_SLOT_ROWS` STOOD HERE AND IS DELETED (4.48). It was the vault scope's
// stat-band rows, spelled out because this table may hold no functions and
// `slotChoicesFor` is one — a copy kept in step with the real list by a test.
// The four `choice` rows it fed are gone with the band's argument questions (see
// the `stats-band` entry), and a second copy of a list that nothing reads is the
// staleness this file's own rule is against.

// ── the widgets a page can be given ───────────────────────────────────

export const WIDGETS: Record<string, WidgetSpec> = {
  // ── the diary ───────────────────────────────────────────────────────
  diary: {
    label: "Diary card",
    glyph: "📆",
    blurb:
      "The greeting, today's numbers, the month grid and what is coming up, as one card.",
  },
  "diary-search": {
    label: "Diary search",
    glyph: "🔍",
    blurb: "Full-text search across every diary entry, filters typed into the box.",
  },
  timeline: {
    label: "Entry timeline",
    glyph: "📜",
    blurb: "Every entry, newest first, grouped by the month it was written in.",
  },
  "on-this-day": {
    label: "On this day",
    glyph: "🕘",
    blurb: "This date in earlier years, one group per year that has an entry.",
  },
  events: {
    label: "Events",
    glyph: "🎉",
    blurb: "The special-events manager: every recurring and one-off event, with an Add button.",
  },
  "time-grid": {
    label: "Time grid",
    glyph: "\u23F1\uFE0F",
    blurb:
      "The week laid against the hours — meetings, logbook items and what is due, each in its own place.",
    arg: {
      kind: "choice",
      label: "what to draw",
      // ONE SOURCE PER ROW, WHERE THE DIRECTIVE TAKES A LIST. `time-grid:
      // events,tasks` is legal and is what a reader types when they want two;
      // offering every combination here would be seven rows for a question
      // whose useful answers are "all of it" and "only this". The empty answer
      // is the first pick because it is the one most readers want.
      emptyLabel: "Everything",
      values: [
        { value: "events", label: "Only events" },
        { value: "logbooks", label: "Only logbook items" },
        { value: "tasks", label: "Only tasks that are due" },
      ],
    },
  },
  "sleep-summary": {
    label: "Sleep summary",
    glyph: "😴",
    blurb:
      "Nights logged, average sleep, typical bedtime and wake-up, across every daily entry.",
  },

  // ── the period dashboards ───────────────────────────────────────────
  "week-summary": {
    label: "Week summary",
    glyph: "📅",
    blurb: "The seven-day table in a banner card, driven by this note's week-start.",
  },
  "month-summary": {
    label: "Month summary",
    glyph: "🗓️",
    blurb: "The day grid and the year of reviews in a banner card, driven by month-start.",
  },
  "quarter-summary": {
    label: "Quarter summary",
    glyph: "📊",
    blurb: "The quarter's banner over a rollup of the three months it spans.",
  },
  "year-summary": {
    label: "Year summary",
    glyph: "🗓️",
    blurb:
      "The year's statistics band: entries, coverage, longest streak and a twelve-month density strip.",
  },
  "entry-rollup": {
    label: "Entry rollup",
    glyph: "📋",
    blurb:
      "One dated line per day in this period that wrote something worth rolling up, oldest first.",
  },
  "period-recap": {
    label: "Period recap",
    glyph: "📝",
    blurb: "Goals, highlights and challenges gathered from the months this period covers.",
    arg: {
      kind: "choice",
      label: "the period to recap",
      // A FIXED SET THE PLUGIN DEFINES, which is what makes this askable where
      // a tracker is not: `period-recap` routes on the word, and the two words
      // it routes on are these. See `needs-vault-answer`.
      values: [
        { value: "quarter", label: "Quarter — the three months it spans" },
        { value: "year", label: "Year — all twelve months" },
      ],
    },
  },
  "period-nav": {
    label: "Period navigator",
    glyph: "⏮️",
    blurb:
      "A prev/next pair around a date picker that re-scopes this page to another week, month, quarter or year.",
    arg: {
      kind: "choice",
      label: "the period this page steps through",
      // ASKED RATHER THAN DEFAULTED, unlike the dispatcher, which falls back to
      // `week` for an unrecognised argument. That fallback is right for a line
      // somebody typed and wrong for a line this window writes: a navigator
      // silently stepping weeks on a year dashboard writes `week-start` onto
      // it, which is the bug 2.57 fixed one layer down.
      values: [
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
        { value: "quarter", label: "Quarter" },
        { value: "year", label: "Year" },
      ],
    },
  },

  // ── the journals ────────────────────────────────────────────────────
  journals: {
    label: "Journals",
    glyph: "📚",
    blurb: "Every enabled journal, with its notes and where to go next.",
  },
  "journal-card": {
    label: "Journal card",
    glyph: "📓",
    blurb:
      "One journal as a card — its banner, its containers and where to go next. Add as many as you like.",
    // THE FIRST `vault` ARGUMENT, and the first repeating widget. `journals`
    // draws every journal as one card and `journals:cards` draws a grid of all
    // of them; this draws ONE, chosen, so a page can put two side by side or
    // hold three of the six a vault has. Neither of the others can express that,
    // which is why this is a keyword rather than a third argument to one of
    // them.
    //
    // NOT `journals:card`. That spelling is REFUSED by the dispatcher on purpose
    // — "a near-miss that renders reads as the feature not working rather than
    // as the word being wrong" — and turning a deliberate refusal into a feature
    // would make every vault that ever typed it get something they did not ask
    // for. The refusal now names this word instead.
    arg: { kind: "vault", label: "the journal to show", source: "journals" },
  },
  "journals-header": {
    label: "Journals activity",
    glyph: "🔥",
    blurb:
      "At-a-glance numbers over a 53-week activity strip — every enabled journal at once, or one you name.",
    // POINTABLE AS OF 4.36 §3, because a page about ONE journal was composing
    // this band and getting the whole vault's figures under its name. The band's
    // own note states the scope it has always had — "every registered journal's
    // root folder, unioned" — and on a per-journal dashboard every one of those
    // numbers is a plausible figure about something else, which is the worst
    // shape a statistic can take.
    //
    // THE KEYWORD IS WHAT KEEPS THE OLD ANSWER REACHABLE. A `vault` argument
    // becomes a required choice, so without `all` the add list would force a
    // reader onto one journal where the widget's own default is all of them.
    // Bare still means every journal, so nothing already written changes.
    // THE LITERAL `"all"`, as `review-queue` and `journal-search` write it two
    // entries down — this file is "a table with no functions in it" and has no
    // imports, so `SCOPE_ALL` is spelled rather than referenced. A test pins
    // that the three agree.
    arg: {
      kind: "vault",
      label: "the journal to cover",
      source: "journals",
      keywords: [{ value: "all", label: "Every journal" }],
    },
  },
  "level-index": {
    label: "Journal level index",
    glyph: "🗂️",
    blurb:
      "What is below this note, as a live table — the folders inside it, or its notes where there are no folders left.",
    // WHAT IT REPLACED SAYS WHY IT IS GENERAL. `topics-table` asked "what topics
    // are under this subject" and was already answering it in every journal's
    // own nouns; what it could not do was be pointed anywhere, or say anything
    // at the level below, where the catalogue had to emit a different widget
    // entirely. One question — what is below this? — had two widgets and a
    // compose-time branch choosing between them. See `RETIRED_WIDGETS`.
    //
    // TWO PIECES, JOURNAL THEN FOLDER. The pair is unambiguous because a journal
    // id has no `/` in it, so the first one separates them.
    //
    // AND THE SECOND PIECE TAKES EITHER SPELLING, which 4.16.1 fixed after
    // shipping only one of them. `study/Maths` is journal-relative, is what this
    // comment originally promised and is the shorter thing to hand-type; a path
    // from the vault root is what the folder CONTROL writes, because that is
    // what `kind: "folder"` means everywhere else in this table and what
    // `ArgSuggest` offers. Declaring the first and building a control that emits
    // the second gave the journal's root twice over. `levelScope` resolves both
    // and requires the answer to land inside the journal either way.
    arg: { kind: "vault", label: "the journal to index", source: "journals" },
    arg2: {
      kind: "folder",
      label: "the folder inside it",
      // EMPTY IS THE JOURNAL'S ROOT HERE, not the host note's folder — this is
      // the one argument in the table whose fallback is the sibling answer
      // rather than the page, and the box has to say so.
      emptyLabel: "the whole journal",
    },
    argJoin: "/",
    // MORE THAN ONE IS THE POINT once it can be pointed: a page can carry
    // Study's subjects beside Cooking's recipes. True of every widget as of
    // 4.56; this was one of the three it was true of first.
  },
  // THE CARD ARRANGEMENT OF `level-index`'s QUESTION, 4.36 §2.
  //
  // A SECOND KEYWORD RATHER THAN AN ARGUMENT, and the entry above is why it
  // could not be one: `level-index` already spends both pieces of its single
  // argument on a journal and a folder, and the folder may contain slashes, so
  // there is no third piece to spend. `journals` / `journals:cards` rode the
  // argument slot because that keyword had one free.
  //
  // THE SAME TWO ARGUMENTS, VERBATIM, because they are the same question — and
  // the two widgets resolve them through one exported `levelScope`, so a
  // mistyped journal id gets the same sentence from either.
  "level-cards": {
    label: "Journal level cards",
    glyph: "🗂️",
    blurb:
      "What is below this note, as cards — one per folder, paired with what is inside it where there is a level below.",
    arg: { kind: "vault", label: "the journal to show", source: "journals" },
    arg2: {
      kind: "folder",
      label: "the folder inside it",
      // EMPTY IS THE JOURNAL'S ROOT, as on `level-index` and for its reason:
      // this is the sibling answer rather than the page.
      emptyLabel: "the whole journal",
    },
    argJoin: "/",
    // MORE THAN ONE IS THE POINT, exactly as it is one entry up: a page can
    // carry Study's subjects beside Cooking's recipes.
  },
  // ONE BAND, WHERE THERE WERE TWO (4.46). `topic-stats` and `journal-totals`
  // stood here as separate entries and answered one question — what do the notes
  // below this note come to? — differing only in which quantities they picked.
  // A Media shelf named both sections and drew them stacked. Both words still
  // dispatch; see `NOT_PAGE_WIDGETS`, where they now sit as aliases.
  //
  // ── AND IT DECLARES NO ARGUMENT ROWS, AS OF 4.48 ──────────────────────
  //
  // It declared four — one `choice` per cell, added in 4.47 — and every surface
  // that reaches this table drew them as four `<select>` boxes on the section's
  // row. **The control is on the cell now**: each cell of a rendered band
  // carries a `⋯`, revealed on hover, offering the same rows plus *Add cell* and
  // *Remove cell*. See `ui/widgets/stats-band-menu.ts`.
  //
  // WHAT THAT COSTS IS NOTHING A READER CAN REACH, and it is worth saying why: a
  // widget added from this table is composed BARE, and a bare `stats-band`
  // resolves to the scope's own default — `Progress` inside a container,
  // `Activity` above it. So the section arrives drawing something, and what it
  // draws is then chosen on the page rather than in a window over it.
  //
  // `STAT_SLOT_ROWS` WENT WITH THEM. The vault scope's rows are
  // `slotChoicesFor("vault", null)`, which is a function and belongs in
  // `stats-band.ts`; this table's opening paragraph is the rule that keeps
  // functions out of it, and a copy of that list here existed only to feed the
  // four rows above.
  "stats-band": {
    label: "Stats band",
    glyph: "🔢",
    blurb: "A row of numbers about what is below this note — you pick each one.",
  },
  "pages-table": {
    label: "Pages table",
    glyph: "📄",
    blurb: "The pages beneath this folder, one row each.",
  },
  "review-queue": {
    label: "Review queue",
    glyph: "🔁",
    blurb: "What is due for recall, soonest first.",
    arg: {
      kind: "folder",
      label: "the folder to review",
      keywords: [{ value: "all", label: "Every journal" }],
    },
  },
  "journal-search": {
    label: "Journal search",
    glyph: "🔎",
    blurb: "Full-text search over journal notes — what did I write about this?",
    arg: {
      kind: "folder",
      label: "the folder to search",
      keywords: [{ value: "all", label: "Every journal" }],
    },
  },

  // ── across the vault ────────────────────────────────────────────────
  "tasks-table": {
    label: "Open tasks",
    glyph: "⏳",
    blurb: "Every still-open Almanac task from the notes under a folder, grouped by note.",
    arg: {
      kind: "folder",
      label: "the folder to collect tasks from",
      // NO `all` KEYWORD, unlike the two above, and the journals dashboard's
      // own catalogue says why in full: `buildTasksTableRegion` takes
      // `folders[0]`, so a keyword naming several roots resolves to the first
      // one rather than to all of them. Offering it would promise a scope the
      // widget silently truncates.
      //
      // `./` IS THE OTHER ANSWER AND IS OFFERED, 4.44.0. It names ONE folder —
      // the vault root — so it is nothing like `all` and the objection above
      // does not reach it. It is here because the grammar had no way to say
      // "the whole vault" from a note that is not at the top of it: empty means
      // the HOST's folder, and `ArgSuggest` deliberately omits the root from
      // its folder list because `""` already spells something else there. A
      // scope the plugin resolves and no control can express is a scope only a
      // reader who reads source can use.
      keywords: [{ value: "./", label: "The whole vault" }],
    },
  },
  "tag-index": {
    label: "Tag index",
    glyph: "🏷️",
    blurb: "A table of tags, most-used first, counted under a folder.",
    arg: { kind: "folder", label: "the folder to count tags under" },
  },
  "activity-chart": {
    label: "Activity chart",
    glyph: "📊",
    blurb: "Open and completed tasks bucketed by date, drawn as three month heatmaps.",
  },
  launcher: {
    label: "Launcher",
    glyph: "🧭",
    blurb: "A grid of the places this vault goes.",
  },
  links: {
    label: "Quick links",
    glyph: "🔗",
    blurb: "A row of destination pills.",
  },

  // ── the diary's undated layer ───────────────────────────────────────
  logbook: {
    label: "Logbook",
    glyph: "🗒️",
    blurb:
      "One standing note's items — a work log, what you are focused on, links to come back to, what is scheduled.",
    arg: {
      kind: "vault",
      label: "the logbook to draw",
      source: "logbooks",
    },
    // AS MANY AS A PAGE WANTS, WHICH IS WHY THE FLAG IS GONE (4.56). This is the
    // entry that showed the old default was wrong: a homepage carrying the work
    // log beside Current focus beside what is scheduled is three `logbook:`
    // lines, and it was allowed one. A logbook widget writes into the LOGBOOK'S
    // own note rather than the page it sits on, so two of them on one page are
    // no more contested than the same widget on two different pages — which was
    // always permitted.
  },
};

// ── the ones a page is not offered, and why ───────────────────────────

// Every other keyword the switch dispatches, with the reason at the entry.
//
// `WIDGETS` and this table are DISJOINT and their UNION IS THE SWITCH — which
// is asserted, not claimed, so a new `case` fails the suite until somebody
// classifies it. That is the whole mechanism: this file cannot go stale
// silently, because going stale is a test failure.
//
// THE RETIRED WIDGETS ARE NOT HERE. `RETIRED_WIDGETS` (`core/constants.ts`)
// holds four keywords that no longer dispatch at all; they have no `case`, so
// they are in neither table and the union still holds. That table already
// carries their `since` and their replacement, which is the data, in the table
// whose job it is.
//
// AND `needs-vault-answer` IS A DEFERRAL, NOT A JUDGEMENT. Those five are
// perfectly good page widgets; what is missing is a way to ask their question.
// `FlatNoteSpec` carries the catalogue, the host folder and two nouns, and
// `note-sections.ts` opens by forbidding it to carry anything that would tell
// it which note it is on or what this vault contains. Offering a tracker
// requires widening that spec and threading the lists through four model
// constructors and `modelForSurface` — a coherent release, with its own
// argument, and not this one. Until then the honest answer is that the door
// does not open onto them, said here rather than by their absence.
export const NOT_PAGE_WIDGETS: Record<string, WidgetExclusion> = {
  // Bound to one frontmatter property.
  slider: { reason: "inline", note: "writes a number onto the note it is in" },
  select: { reason: "inline", note: "writes a chosen value onto the note it is in" },
  time: { reason: "inline", note: "writes a time onto the note it is in" },
  date: { reason: "inline", note: "writes a date onto the note it is in" },
  tracker: {
    reason: "inline",
    note: "the control for one Settings → Trackers entry, on the note that records it",
  },
  sleep: {
    reason: "inline",
    note: "the coupled wake-up and bedtime pair, on the entry whose night it is",
  },
  button: { reason: "inline", note: "one action, drawn beside what it acts on" },

  // Owns a keyed body region.
  note: { reason: "region", note: "a free-text field; two would share one region and overwrite each other" },
  list: { reason: "region", note: "a list field; two would share one region and overwrite each other" },
  tasks: {
    reason: "region",
    note: "the per-note task editor; two would share one region and overwrite each other",
  },
  path: { reason: "region", note: "a path field; two would share one region and overwrite each other" },
  recall: {
    reason: "region",
    note: "recall cards; two would share one region and overwrite each other",
  },
  attach: {
    reason: "region",
    note: "the attachments field; two would share one region and overwrite each other",
  },

  // What a page is.
  "entry-header": { reason: "banner", note: "the strip that makes a note a diary entry" },
  "journal-header": { reason: "banner", note: "the strip that makes a note a journal note" },

  // Structure.
  title: { reason: "structural", note: "the page's own name — added and removed as the page head" },
  spacer: { reason: "structural", note: "an inert strip that gives the cursor somewhere to land" },

  // A second spelling.
  "confidence-trend": {
    reason: "alias",
    note: "the preset spelling of journal-chart, kept because it sits in shipped Topic notes",
  },
  // SUPERSEDED, STILL DRAWING, AND DELIBERATELY NOT RETIRED (4.16 §3). Every
  // Subject index note in every vault carries a bare `topics-table`, and it goes
  // on rendering — routed to `level-index`, which draws the same table when it
  // is given the same question. What it no longer does is appear in the add
  // list, because offering both would be a choice between two names for one
  // thing, which is what this reason means.
  //
  // NOT IN `RETIRED_WIDGETS`, and the distinction is the whole of §3: an entry
  // there tells `planLayout` to REMOVE the directive, so retiring a word that
  // still renders would have repair delete a working table out of a reader's
  // note. Retired means "gone and repair cleans it up"; this is "superseded and
  // still honoured".
  "topics-table": {
    reason: "alias",
    note: "the older spelling of level-index, kept because it sits in every shipped Subject index note",
  },
  // THE TWO BANDS 4.46 MERGED, ON THE SHELF `topics-table` IS ON AND FOR ITS
  // REASON. Both still dispatch — `topic-stats` resolves to `stats-band`'s
  // `progress` preset and `journal-totals` to its `totals` preset, which is cell
  // for cell what each of them drew — and neither is offered, because offering
  // three names for one band is exactly what this reason means.
  //
  // NOT IN `RETIRED_WIDGETS`, third time of stating it: `topic-stats` sits in
  // every Study Topic index in every vault and `journal-totals` in every
  // Exercise Block index, and an entry there would have repair delete a working
  // band out of a reader's note.
  "topic-stats": {
    reason: "alias",
    note: "the older spelling of stats-band's Progress preset, kept because it sits in every shipped Topic index note",
  },
  "journal-totals": {
    reason: "alias",
    note: "the older spelling of stats-band's Totals preset, kept because it sits in shipped Block index notes",
  },

  // Needs a list only the vault can supply.
  "journal-chart": {
    reason: "needs-vault-answer",
    note: "must name a tracker, and the section window has no list of this vault's trackers",
  },
  "journal-breakdown": {
    reason: "needs-vault-answer",
    note: "must name a tracker, and the section window has no list of this vault's trackers",
  },
  "journal-tally": {
    reason: "needs-vault-answer",
    note: "must name a tracker, and the section window has no list of this vault's trackers",
  },
  "bridge-readings": {
    reason: "needs-vault-answer",
    note: "must name a tracker, and the section window has no list of this vault's trackers",
  },
  "bridge-notes": {
    reason: "needs-vault-answer",
    note: "must name a note type, and the section window has no list of this vault's journals",
  },
  "kind-table": {
    reason: "needs-vault-answer",
    note: "must name a note type, and the section window has no list of this vault's journals",
  },
};

// Whether this keyword is one a page can be given from the section window.
export const isPageWidget = (keyword: string): boolean =>
  Object.prototype.hasOwnProperty.call(WIDGETS, keyword);
