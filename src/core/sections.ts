// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What a section IS, for every surface that has one.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// `section-model.ts` unified what an EDITOR may ask a surface (3.0). It did
// not unify what a surface's catalogue is made OF, and four of them grew
// separately to the same shape and no shared type:
//
//   `FlatSection`   — the homepage, Search, both logbook notes, both folder
//                     notes, every journal dashboard
//   `JournalSection` — every journal template
//   `DiarySection`   — the four period dashboards
//   `EntrySection`   — diary entries
//
// The cost was never abstract. Two adapters existed to paper over it —
// `asFlat` in `diary-sections.ts` and in `journal-plan.ts` — each projecting a
// bespoke section into a `FlatSection` so it could borrow `flatBlocks` and
// `regroupFlatNote`, and each LOSSY: the journal one threw away every block
// but the first fence, and the diary one filled three fields of a
// `FlatNoteSpec` with, in its own words, "what a dashboard would say if
// asked". Beside them sat three copies of `ownersOf`, three of
// `insertionPoint`, three of `joinRowChunk` and four of `viewOf` — and
// `diary-sections.ts` described its own `ownersOf` as "`parseFlatSections`'
// loop, transposed", which is the whole argument for this file written by
// somebody who had just finished transposing it.
//
// `rowRuns` (`note-sections.ts`) made the case first and made it for one rule:
// "a rule stated four times is four things that can disagree about what a
// `cell` line means". This is that argument applied to the type the rule
// operates on.
//
// ── WHAT IS SHARED AND WHAT IS NOT ───────────────────────────────────────
//
// `Section<Ctx>` carries everything the SHARED MACHINERY reads — the planner,
// the parser, the composer, the row rule, the editor's view. A catalogue may
// extend it with fields that only that catalogue's own code reads, and two do:
//
//   `JournalSection.surface` — which is deliberately NOT folded into
//   `applies`. `sectionApplies` argues the case in full and it is right: a
//   section's `surface` says whether it may be written on an index or on a
//   note with a body, which is TWO-valued, while what a note IS is
//   three-valued. Collapsing them "would make every section state an opinion
//   about pages when almost none has one".
//
//   `JournalSection.claims` — read by one test's coverage assertion and by
//   nothing that runs.
//
// So this is not "every field every catalogue ever wanted". It is the set the
// one parser and the one planner are written against, and a field that only
// one surface's own code reads stays on that surface's own type.
//
// ── THE CONSTRAINT THIS TYPE IS BEING SHAPED BY ──────────────────────────
//
// A `Section` should be writable as DATA. Not today, and no user-facing
// surface is planned for one — but every closure on this type is a reason a
// section has to be code, and `widget-sections.ts` already proves the other
// direction works: a `WidgetSpec` is pure data, and `widgetSection()` turns
// one into a live section with `render` and `locate` synthesised from the
// keyword. Where a field here could be data and is a function, that is a debt
// rather than a design. If such definitions ever become the reader's to write,
// they belong in settings beside `customJournals` and are carried by
// `registry-mirror.ts` — the path a custom journal type already takes.

import type {
  SectionOp,
  SectionQuestion,
  SectionView,
  SectionWant,
} from "./section-model";
import {
  SECTION_FORM,
  desiredOrder,
  formQuestion,
  moveOps,
  optionsFor,
} from "./section-model";
import type { VaultLists, WidgetNeed } from "./widget-registry";
import {
  CELL_KEYWORD,
  ROW_KEYWORD,
  TAB_KEYWORD,
  dropSoloBar,
  isCellLine,
  isRowLine,
  isTabLine,
  leadingBar,
  needsSoloBar,
  splitDirective,
} from "./directive-grammar";
import {
  instanceId,
  instanceIdOf,
  locateNth,
  widgetLine,
  widgetQuestions,
} from "./widget-sections";

export type SectionBlock =
  | {
      kind: "fence";
      // Info string after the backticks. Only `charts` differs, and it differs
      // because that region is managed by journal-charts.ts rather than by the
      // catalogue.
      info: string;
      lines: string[];
    }
  | {
      // A `<!--chronoanvil:key-->` body region a content field persists into.
      // Written immediately after its fence so the section stays one
      // contiguous run — which is what makes cut-and-paste move the whole
      // thing, and a splice well-defined.
      kind: "region";
      key: string;
    }
  | {
      // ORDINARY MARKDOWN THE PLUGIN CANNOT PROVE IT WROTE — the banner's
      // spacer, and nothing else since 5.6. Unprovable by construction, and
      // never deleted or moved on that basis. See `sectionRemovable`: this is
      // the one block kind that makes a section unremovable, and that is the
      // whole of what it means.
      kind: "markdown";
      lines: string[];
      // Abut the following block with a single newline instead of a blank
      // line. True in exactly one place — the banner's `chronoanvil:spacer`, which
      // is documented as sitting on line 0 of the body, immediately above the
      // fence it exists to stop the reader clicking into. Serialisation only;
      // it says nothing about extent.
      tight?: boolean;
    }
  | {
      // VISIBLE MARKDOWN BETWEEN TWO INVISIBLE MARKERS — the prose skeleton,
      // and today only that. 5.6.
      //
      // NAMED FOR THE MECHANISM RATHER THAN THE CONTENT, because `prose` is
      // already a section id on this same catalogue (the Notes field) and a
      // comment about "the prose block" would have two referents.
      //
      // WHY THIS IS NOT `markdown`, AND WHY IT IS NOT A `region` EITHER.
      //
      // `markdown` is unprovable, so a section emitting it can never be taken
      // out again: `sectionRemovable` refuses, and the reader is told to delete
      // their own headings by hand. That was the right answer for as long as
      // the plugin genuinely could not tell its `## Notes` from theirs. It is
      // not a law of prose — it is a consequence of writing prose with nothing
      // around it.
      //
      // A `region` would solve identification and lose the point. Its contents
      // live INSIDE an HTML comment, which is how `note:` fields keep the raw
      // file readable, and a heading inside a comment is not a heading: it
      // renders as nothing, folds as nothing, and appears in no outline. The
      // whole argument for the skeleton being `##` markdown rather than a
      // `note:` field is that it is the shape of the DOCUMENT and survives the
      // plugin being uninstalled.
      //
      // NOT A CONTRADICTION OF notestore.ts, WHICH SETTLED THE OPPOSITE CASE.
      // Its own header argues for "one HTML comment rather than two separate
      // marker comments", and it is right about a `note:` field: that content
      // must not render, and one comment hides it natively. A skeleton's
      // content MUST render. Only its edges have to be invisible, and each edge
      // is itself a whole comment, so both are dropped natively too. Same
      // mechanism, opposite requirement, opposite answer.
      //
      // So the markers go AROUND the prose rather than over it. The headings
      // are real markdown, in the outline, in the fold gutter, editable in any
      // editor; the two comment lines are invisible in reading view and in
      // every renderer that has ever handled HTML comments, and they say
      // exactly one thing — the catalogue wrote what is between these.
      //
      // `chronoanvil-key` RATHER THAN `chronoanvil:key`, WITH A HYPHEN, and it
      // is not a style choice. The colon form IS the region grammar, and three
      // separate parsers key off it: `notestore.ts`'s `OPEN_PREFIX`,
      // `regionsIn` in journal-plan.ts, and `looseLines` in reload-loss.ts.
      // Each currently declines `<!--chronoanvil:skeleton-->` for its own
      // incidental reason — a character class that happens to exclude `>`, a
      // `\s*$` that happens to follow the key — which is three accidents to
      // stay lucky about forever. A marker with no colon in it cannot be a
      // region under any of them, and that is a property rather than a
      // coincidence.
      kind: "bracketed";
      // Names the span in the markers. One key today; keyed anyway, because a
      // second bracketed section would otherwise have to invent the scheme
      // under deadline.
      key: string;
      lines: string[];
    };

// One repeatable piece of a section that a file may be missing. 3.18 §1.3.
//
// WHY A SECTION NEEDS PIECES AT ALL
//
// Every section shipped before 3.18 was all-or-nothing: it is in the file or it
// is not, and `locate` answers which. `children` is not, and never was — on the
// deepest index it emits one header, one button and one table PER NOTE KIND, so
// a journal that gains a kind has dashboards that are present and short of
// something. The model had no word for that, so the planner called it `add` and
// would have appended a second copy of the whole section (§1.2).
//
// THE PROBE IS THE LAST LINE OF THE PART, and that is a rule rather than a
// coincidence of how `children` happens to be written. `journal-plan.ts` finds
// a part in an existing fence by its probe and inserts a missing part directly
// after the probe of the part before it — which is the correct position only
// because the probe closes its own group. A part whose probe sat first would
// insert the new block into the middle of the previous one.
//
// Sections that declare no parts are unaffected, which is every section but
// this one: `parts` absent means all-or-nothing, and that is the truth about
// all of them.
export interface SectionPart {
  // Stable within the section — the note kind's id, here.
  id: string;
  // Human name, read into the plan's detail line ("Practice has no table
  // here"), so it is written as a noun phrase rather than a sentence.
  label: string;
  // The line that identifies this part in a file. MUST be the last entry in
  // `lines`; see above. Matched whole, so a retitled `header:` above it does
  // not stop the part being found — the same rule fence matching already
  // follows, where headers are excluded because they are retitleable.
  probe: string;
  // Every line this part contributes, in order.
  lines: string[];
}

// ── what a section is ABOUT ───────────────────────────────────────────────
//
// The subject a section belongs to. Seven of them, and the only taxonomy in
// this tree — every section on every surface, and every entry in `WIDGETS`,
// names one.
//
// A SUBJECT, NOT A KIND, and the distinction is the whole reason this type
// exists. The add list used to be cut in two, "Sections" above "Widgets", and
// that split sorted by a TOGGLE: `widget` is a form a section is DRAWN in —
// `SECTION_FORM` / `WIDGET_FORM`, flipped per section by `formQuestion` — not a
// class it belongs to. All 32 entries in `WIDGETS` carry a `SECTION_TITLES`
// heading, so "Widgets" was a heading over two dozen rows that are all
// sections, and "Sections" a heading over the two or three the page was
// designed around. The keywords that genuinely are widget-shaped — `note`,
// `list`, `title`, `spacer` — sit in `NOT_PAGE_WIDGETS` and never reach a
// reader's list at all.
//
// ORDER IS THIS ARRAY'S SECOND JOB. `DetailedChoice.group` draws a heading
// where the value CHANGES and never sorts (see modals.ts), so a category's
// rank here is what makes the runs contiguous and the headings correct.
// Reordering this array reorders the add list on every surface, which is the
// point of it being an array rather than a set.
export type SectionCategory =
  | "writing"
  | "diary"
  | "journals"
  | "tasks"
  | "trackers"
  | "finding"
  | "structure";

export const SECTION_CATEGORIES: readonly {
  id: SectionCategory;
  label: string;
}[] = [
  { id: "writing", label: "Writing" },
  { id: "diary", label: "Diary" },
  { id: "journals", label: "Journals" },
  { id: "tasks", label: "Tasks & events" },
  { id: "trackers", label: "Trackers" },
  { id: "finding", label: "Finding" },
  { id: "structure", label: "Structure" },
];

// The heading a category is drawn under. Both add prompts read this rather
// than spelling the seven labels twice — `section-insert.ts`'s rule about one
// command knowing what its neighbour does not applies to the words as much as
// to the behaviour.
export const categoryLabel = (c: SectionCategory): string =>
  SECTION_CATEGORIES.find((x) => x.id === c)?.label ?? c;

// Where a category sorts. Unknown ranks last, which cannot happen while the
// field is typed and is stated so the sort is total anyway.
export const categoryRank = (c: SectionCategory): number => {
  const at = SECTION_CATEGORIES.findIndex((x) => x.id === c);
  return at < 0 ? SECTION_CATEGORIES.length : at;
};

// ── one section, on any surface ───────────────────────────────────────────

// `Ctx` is WHATEVER THAT SURFACE'S CATALOGUE NEEDS TO ANSWER ABOUT ITSELF, and
// this file never looks inside it. A journal template's context is the LEVEL it
// is composed for; a period dashboard's is its grain; an entry's is its grain
// and what the vault has added; a flat note's is the spec the caller built.
// Nothing here reads a field off one, which is `section-model.ts`'s rule —
// "the editor must never learn which surface it is on" — held one layer down:
// the shared machinery is handed a context and passes it back to the catalogue
// that understands it.
//
// `void` FOR A SURFACE WITH NOTHING TO SAY, so a catalogue that varies by
// nothing writes `Section` and takes no parameter.
// `Opts` is THE OVERRIDE BAG THAT SURFACE'S SECTIONS READ, and it is a second
// parameter for `Ctx`'s reason: the shared machinery carries it and never opens
// it, while the catalogue that declared it wants it typed. A journal section
// reads a `SectionOverrides` — a label, a set of shelves, a stat preset — and
// before this type existed both adapters cast for it inline (`opts as
// SectionOverrides | undefined` in `journal-plan.ts`'s `asFlat`). One parameter
// replaces two casts with none.
//
// `Record<string, unknown>` FOR A SURFACE WITH NO NAMED OVERRIDES, which is the
// three catalogues whose options arrive from `SectionChoice.options` and are
// read by key.
export interface Section<
  Ctx = void,
  Opts extends object = Record<string, unknown>,
> {
  // Stable id. The unit every list, every plan line and every saved layout is
  // written in terms of.
  id: string;
  label: string;
  // One line, for the picker row and the wizard's schematic.
  blurb: string;
  // The glyph a row is tokened with. Where the section renders a header bar
  // this is that bar's own emoji, so the row and the note agree — the rule all
  // four catalogues already stated separately.
  icon: string;
  // What this section is ABOUT — see `SectionCategory`. Required, so that the
  // compiler is the sweep: a catalogue entry with no subject is a row the add
  // list would have to invent a heading for, and `tsc` finds it before a reader
  // does.
  category: SectionCategory;
  // Whether this section may be removed AT ALL, ignoring what is written in it.
  //
  // SPELLED `locked` RATHER THAN `required`, which is what the journal
  // catalogue called it. One name, because it is one fact: this section is part
  // of what the page IS. The journal catalogue's extra consequence — a locked
  // section LEADS a saved layout's order, because the banner's first block is
  // `chronoanvil:spacer` and that has to sit on line 0 — is a rule in
  // `sectionsFor` reading this field, not a second meaning of it.
  locked: boolean;
  // PINNED sections cannot be MOVED. They can still be REMOVED, which is the
  // other half of the same distinction and the reason these are two fields
  // rather than one: a page head is a coherent thing to want gone — the note's
  // name is in the tab, the file explorer and the window — and an incoherent
  // thing to want third. 2.60.2 spent an argument on it and 3.2 §4 partly
  // retracted it; `EntrySection.pinned` carried the retraction and
  // `FlatSection.pinned` the general case.
  //
  // ABSENT MEANS NO, and every section but a page's own head leaves it out.
  // `viewOf` turns it into `SectionView.movable`, which is where the editor
  // reads it; nothing asks it directly except the `holdPinned` calls that keep
  // the write side honest when a stale `want` disagrees.
  //
  // ON A BANDED SURFACE THE FLAG IS A SECOND STATEMENT OF AN ARITHMETIC FACT.
  // A dashboard's head is `band: "head"`, and a band of one is immovable by the
  // arithmetic `isMovable` already does. A flat note has one band, so there is
  // no arithmetic to lean on and the flag is the whole of the mechanism — which
  // is why it is a field and not a derivation.
  //
  // ── A RETRACTION, AND IT IS NAMED AS ONE (3.2 §4) ────────────────────
  //
  // 2.60.2 argued that a lock on existence must not become a lock on position,
  // and 3.0 patch 1 was built because `entryRemovalRefusal` had been promising
  // a move that did not exist. 3.2 §4 decides that navigation is the top row of
  // every diary surface, which makes that promise false again for an entry's
  // `links` — deliberately this time, which is worse and is why it is written
  // down here rather than in a changelog line.
  //
  // THE ARGUMENT FOR THE PIN: an entry whose route home sits underneath the
  // card, or an overview whose route home sits underneath a seven-row table, is
  // not a preference being expressed. It is the one control on the page that
  // has to be findable before the reader knows what the page is.
  //
  // THE PIN DOES NOT RELOCATE ANYTHING. It is a rule about what the editor will
  // do, not about what a file should look like — see `holdPinned` in
  // `section-model.ts`, which keeps a pinned section at the index the file
  // already gives it rather than dragging it to the front.
  pinned?: boolean;
  // Which band of the page this section belongs to, or absent where the surface
  // has one.
  //
  // TWO FIELDS BECAME ONE. `DiarySection.band` was `"head" | "body"` and
  // `EntrySection.fence` was `"own" | "trackers" | "shared"`, and they are the
  // same fact under two names: a section may not cross between bands, so the
  // rule is unreachable rather than refused. Widened to `string` because a band
  // is a partition key and this file must not know the names — the moment it
  // does, it has learned which surface it is on.
  //
  // BANDS ARE CONTIGUOUS, which is what makes the partition safe: each band is
  // one run of the note, reordered against its own part of `want`.
  band?: string;
  // Which composed ROW this section is a cell of, or absent for a section that
  // takes a block of its own — 4.2 §2, and 4.70 for the context-dependent form.
  //
  // AN ID RATHER THAN A FLAG, because a page has more than one row and adjacent
  // rows have to be told apart — two rows running together would compose as one
  // block of six cells, which is the near-miss the `row` grammar refuses when a
  // reader types it and which a composer must not create by accident.
  //
  // CONSECUTIVE MEMBERS ONLY. A row is a block, a block is a contiguous run of
  // the note, so two sections with the same `row` and another section between
  // them are not a row and are not composed as one. The catalogue's order is
  // what makes a row, which keeps this one fact in one place.
  //
  // A SECTION IN A ROW STILL RENDERS ALONE when it is ADDED back later, because
  // the composer composes one section and knows nothing about its neighbours.
  // That is the honest outcome rather than a gap: re-adding gives the reader
  // the section in a block of its own, which they can then move into the row by
  // hand. Guessing that it wanted to rejoin a row would mean writing into a
  // block they may have arranged since.
  //
  // A FUNCTION OF THE CONTEXT WHERE A SURFACE NEEDS ONE. The journal catalogue
  // serves a container index and a leaf index from one entry, and a row that a
  // section joins on one and not the other cannot be a constant. Every other
  // catalogue passes a string and never learns the difference.
  row?: string | ((ctx: Ctx) => string | undefined);
  // Which CELL of that row this section shares, or absent for a section that
  // takes a cell of its own — 4.4 §3.
  //
  // AN ID FOR `row`'s REASON, one level in: a row has more than one cell, and
  // two sections that happen to be adjacent are not in the same one unless they
  // say so. Consecutive members of a row carrying the same id share a cell and
  // stack inside it; anything else starts the next cell.
  //
  // ABSENT IS NOT A VALUE. Two sections that both leave this out do NOT share a
  // cell — they each get their own, which is what a row meant before cells
  // existed. That is the property that keeps this additive: a catalogue where
  // nobody declares a cell composes exactly the note it composed before, `cell`
  // lines and all, which is to say none.
  //
  // THE SINGLE-SECTION COMPOSER IGNORES IT, as it ignores `row`, and for the
  // same reason: a section added back arrives in a block of its own rather than
  // writing itself into a cell the reader may have rearranged since.
  //
  // WHAT HAPPENS TO A SECTION THAT DECLARES NEITHER IS THE SURFACE'S CALL, and
  // on one surface it is not "a block of its own": a band of a diary ENTRY is
  // ONE fence, so an unrowed section joins the block beside it. That is
  // `rowRuns`' `weld` parameter, and it is the one place the four surfaces
  // genuinely disagree about what an absent `row` means.
  //
  // A ROW MAY NOT CROSS A BAND, and nothing has to enforce it: a composer runs
  // each band separately, so two sections in different bands are never
  // candidates to share a run however they are labelled. That is `band` being a
  // property rather than a position, one more time.
  cell?: string;
  // Whether this member opens a PAGE of its row rather than a column — 5.18.
  // Not a function of the context: a member that is a page is a page wherever
  // its row is composed.
  tab?: boolean;
  // The bar this section composes ONLY IF its row comes down to it alone.
  //
  // A row carries one title, composed by the cell that OPENS it, and the cells
  // after it compose none — which leaves those cells titleless the moment a
  // reader unticks the opener. `soloBar` in `directive-grammar.ts` carries the
  // argument.
  bar?: string | ((ctx: Ctx) => string | undefined);
  // Offered, but not composed into a fresh note. `DiarySection.optIn` and
  // `FlatSection.optIn`'s meaning exactly: the section is in the lists, the
  // editor offers it, `locate` finds it once added — and the shipped note does
  // not contain it.
  //
  // A PREDICATE WHERE A SURFACE NEEDS ONE, which is `row`'s and `bar`'s
  // arrangement and arrived for the same kind of reason. 3.11 §5: a quarter's
  // rollup overlaps its recap and is offered rather than assumed, while a
  // week's and a month's overlap nothing — so on one catalogue the answer
  // varies by grain. A bare `true` is still the common case and still reads as
  // "offered everywhere it applies, shipped nowhere". `optInOf` is the read.
  optIn?: boolean | ((ctx: Ctx) => boolean);
  // Whether a page may hold more than one of these — 4.15 §4. Absent means one,
  // which is every catalogue section; every page WIDGET repeats, and says so
  // through `widget-sections.ts`.
  repeatable?: boolean;
  // How many lines of the READER'S OWN content this section holds, for a
  // section whose body is theirs rather than the catalogue's. Absent means
  // removing it costs nothing but the section.
  holds?: (text: string) => number;
  // Structurally possible here at all. Distinct from `default`: a section that
  // does not apply is not offered, whereas one that applies but is off is
  // offered unticked.
  applies?: (ctx: Ctx) => boolean;
  // Pre-ticked, and composed by a generator with no GUI at all.
  //
  // A PREDICATE rather than a flag, because a flag cannot express what the
  // journal catalogue needs: a container index and a leaf index carry different
  // sets, and the difference is the meaningful one. Absent is `optIn`'s inverse
  // read the other way — a section that applies and says nothing is on.
  default?: (ctx: Ctx) => boolean;
  // Whether this section persists into a note region of its own, keyed by its
  // id. True for every section that ships, and the assumption three separate
  // pieces of machinery were written on before 3.8 made one that isn't.
  //
  // MEANINGFUL ONLY WHERE A CATALOGUE WRITES REGIONS AT ALL, which today is the
  // entry catalogue alone. Absent means true.
  //
  // WHAT IT ACTUALLY CONTROLS, and why it is a field rather than a test:
  //
  //   the region block written under the widget fence, which a section with no
  //   writing to persist would get as a permanently empty pair of markers;
  //   the removal refusal, which asks whether the reader has writing in it;
  //   and — the one that made this necessary — the PROBE that detects the
  //   section in a file.
  //
  // A region-owning section's directive is `<kind>:<sectionId>`, because the
  // second token IS the region key: `note:log`, `list:highlights`, `tasks:todo`.
  // So the probe can look for `^note:log\b` and be sure. A bridge's second
  // token is its TARGET — `bridge-notes:meal` — and probing for
  // `^bridge-notes:bridge` would never match the line the section itself
  // writes. The convention held because everything obeyed it; this names it so
  // the one thing that cannot is not a special case buried in a regex.
  ownsRegion?: boolean;
  // How to find this section in a note, for the one section whose directive is
  // not a directive. 4.20.
  //
  // `probeFor` derives a probe from the directive by taking everything before
  // the first colon, which is the whole grammar for `note:log` and
  // `tasks:todo|Tasks`. The tracker section's "directive" is the marker comment
  // `# chronoanvil:trackers:start`, whose first token is `# chronoanvil` — and a
  // probe of `^# chronoanvil\b` matches the END marker too, so the section was
  // found twice in its own fence and reported twice to the editor.
  //
  // AN OVERRIDE RATHER THAN A SMARTER DERIVATION, because the derivation is
  // right for every section that has a directive and this one does not have
  // one. Teaching `probeFor` about marker comments would make a rule about the
  // directive grammar answerable for a thing that is outside it.
  probe?: RegExp;
  // The repeatable pieces this section is built from, when it has any — 3.18 §1.
  //
  // ABSENT MEANS ALL-OR-NOTHING, which is every section but `children`. A
  // section that declares parts is one the planner may `extend`: present in a
  // file, wanted, and short of a piece it should have.
  parts?: (ctx: Ctx, opts?: Opts) => SectionPart[];
  // What this section can be asked, and where each answer is written.
  //
  // A FUNCTION OF THE CONTEXT rather than a literal, in every catalogue and for
  // one reason: the answers are what THIS VAULT defines, and a catalogue that
  // hardcoded a list would be describing a vault rather than reading one.
  // TAKES THE VAULT AS WELL AS THE CONTEXT, because the four catalogues split
  // on which one holds the answer. A journal, dashboard or entry section asks
  // its CONTEXT — the journal type, its kinds, the grain. A flat section asks
  // what the surrounding VAULT is: `hostFolder` is what an empty folder answer
  // resolves to, `vault` is what a widget's argument can be answered with, and
  // neither is a fact about the page's own context. So both are passed and a
  // catalogue reads whichever it needs.
  //
  // `QuestionEnv` RATHER THAN THE WHOLE SPEC, and the tree had already worked
  // this out: `widgetSection` types this parameter as a structural
  // `{ hostFolder?, vault? }` because those are the only two fields any
  // question has ever read. Passing `NoteSpec` would hand every catalogue the
  // section list and the refusal nouns as well, which is a wider promise than
  // the callers can keep — a journal template has no spec to pass at all.
  //
  // OPTIONAL, AND A LITERAL THAT READS IT DEFAULTS IT. `questions: (_ctx, env =
  // {}) => …` is the idiom, which keeps the body free of `?.` and states at the
  // top that a surface with nothing to say about its vault is a normal thing.
  questions?: (ctx: Ctx, env?: QuestionEnv) => SectionQuestion[];
  // What this section puts in the note.
  //
  // A LIST OF BLOCKS, WHICH IS THE WIDENING THAT MADE ONE TYPE POSSIBLE. Three
  // catalogues returned `{ fence, lines }` — one fence, always — and the
  // journal catalogue returned `SectionBlock[]`, because a section there may
  // also emit a body region, a bracketed span, or markdown the plugin cannot
  // prove it wrote. That difference is exactly what `asFlat` used to throw
  // away: it took the first fence and dropped the rest, which is why the
  // adapter could feed `blocks` and `regroup` and nothing else.
  //
  // A ONE-FENCE SECTION RETURNS A LIST OF ONE, and `soleFence` below is what
  // the machinery that genuinely wants a single fence asks instead of
  // destructuring.
  render: (ctx: Ctx, opts?: Opts) => SectionBlock[];
  // Where this section's markdown starts in an existing file, or -1.
  //
  // MATCHES THE DIRECTIVE, NOT THE HEADER — the rule all four catalogues state
  // and for one reason: a reader retitles a header, and matching on it would
  // make a renamed section invisible and then offer to add a second copy.
  locate: (text: string, ctx: Ctx) => number;
}

// What a section's QUESTIONS may ask about the vault around the note.
//
// THE TWO FIELDS A QUESTION HAS EVER READ. `widgetSection` types its own
// `questions` parameter as exactly this shape, inline, and that is not a
// shortcut it took — it is the observation that a question needs the host
// folder an empty answer resolves to and the lists a widget argument can be
// answered from, and nothing else about the note. Naming it here is what lets
// `Section.questions` be one signature across four surfaces instead of one per
// surface with a spec bolted to it.
//
// `NoteSpec` EXTENDS IT rather than the other way round, so a flat surface goes
// on passing the spec it already builds and a surface with no spec passes
// nothing.
export interface QuestionEnv {
  // The folder this note itself sits in, when the caller knows it — what an
  // empty folder answer resolves to (3.15 §10.9). Absent means the caller could
  // not say, and a folder question drawn from it stays inert rather than
  // promising a default it cannot name.
  //
  // The homepage sits at the vault root, so its value is the empty string —
  // which is a KNOWN folder rather than an absent one, and the distinction is
  // exactly why this is `string | null | undefined` and not just falsy.
  hostFolder?: string | null;
  // What THIS VAULT can answer a widget's argument with. 4.15 §4.
  //
  // THE THING `needs-vault-answer` SAID WAS MISSING. `widget-registry.ts`
  // withholds five keywords from the add list because each must name a tracker,
  // a note kind or a journal, and the flat spec carried "the catalogue, the host
  // folder and two nouns" — nothing that could say what a vault contains. Its
  // note quotes the price of the fix as widening this type and threading the
  // lists through the model constructors, and that is what this field is.
  //
  // SUPPLIED BY THE CALLER THAT OPENED THE WINDOW, for `hostFolder`'s reason one
  // field up: only that caller knows which vault it is in. `note-sections.ts`
  // opens by forbidding itself to carry anything that says which note it is on
  // or what this vault contains, and that rule is honoured rather than broken —
  // this is data handed IN, not read.
  //
  // ABSENT IS A VAULT THAT COULD NOT BE ASKED, not an empty one, and both come
  // out as the same empty list with the same sentence over it. A journal
  // template has no vault to speak of and a test fixture has none either; both
  // want the question drawn as "there is nothing to choose" rather than as a
  // dropdown with no entries.
  vault?: VaultLists;
}

// The NOTE a catalogue of sections belongs to, as everything about it that is
// not a section.
//
// `FlatNoteSpec`'s FIELDS, MOVED AND MADE GENERIC. That type was the flat
// surfaces' own, and the diary adapter's comment recorded the cost of it being
// theirs alone: `asDiary` filled three of its five fields with "what a
// dashboard would say if asked", because a dashboard section's question needed
// a spec and the only spec in the tree was a flat one.
//
// WHAT IS NOT HERE YET IS THE CONTEXT AND THE PLANNER'S FIELDS — `ctx`,
// `bands`, `weld`, `frontmatter`, `regions`. Each of those exists today as an
// argument somewhere else (`rowRuns`' third parameter, the band loop inside
// `applyEntrySections`), and each arrives here when the one planner does and
// has a producer. A field with no producer is the shape `widget-registry.ts`
// warns against, and this file is not going to add five of them in advance.
export interface NoteSpec<Ctx = void> extends QuestionEnv {
  sections: readonly Section<Ctx>[];
  // The page, named as the reader would name it, for refusal messages.
  noun: string;
  // What `holds` counts, singular. "chart" on the homepage.
  heldUnit: string;
  // What this surface can answer a widget's `needs` with. 5.26.
  //
  // ON THE SPEC RATHER THAN DERIVED FROM THE CATALOGUE, and the difference is
  // what the two describe. A catalogue says what the page COMPOSES; this says
  // what the note IS — a period dashboard carries `week-start` because its
  // frontmatter does, whether or not a single section mentions it. Nothing in
  // `sections` could be read to find that out.
  //
  // ABSENT IS A SURFACE THAT SUPPLIES NOTHING, which is every flat note in the
  // tree. See `pageWidgetKeywords` for why that is the strict default.
  supplies?: readonly WidgetNeed[];
}

// ── reading a note back ───────────────────────────────────────────────────

// A run of a note: one or more segments, and whose they are.
//
// `journal-plan.ts`' type, moved here in 5.23 and widened by one optional
// field. Three surfaces had a run type — `FlatRun`, `DashboardRun` and this —
// agreeing about `sectionIds` and `filler` and differing only in whether they
// carried the line numbers inside the run and whether a run could span more
// than one segment.
export interface SectionRun {
  // The section this run belongs to, or the FIRST of them where a row fence
  // holds several — 4.70. Kept beside `sectionIds` rather than replaced by it
  // because every consumer that asks "whose block is this" wants one answer,
  // and for every run but a row it is the only one there is.
  sectionId: string | null;
  // Every section in this run, in file order. Empty for a run that is nobody's.
  sectionIds: string[];
  // Which line of this run each of its sections is on, counted from the run's
  // first line — the opening fence included, which is the base every caller of
  // it already uses.
  //
  // RECORDED BY THE WALK THAT ATTRIBUTED THEM (4.15 §4). It used to be worked
  // out again from the section's own anchor, which was one derivation too many
  // even before it stopped being possible: an instance's anchor is an ordinal
  // over the whole note, and asked of one fence every card in it answers with
  // the first card's line.
  //
  // ABSENT WHERE THE WALK DID NOT ATTRIBUTE BY LINE. The journal parser matches
  // a fence by its keyword SIGNATURE rather than by probing each section for
  // itself, so it has no line to record and says so by leaving this out rather
  // than by filling it with an empty map. `OwnedRun` is the shape that has it.
  lineOf?: Record<string, number>;
  // Index into the segment list, inclusive. Equal for a surface whose runs are
  // one segment each; a journal run absorbs the regions that follow its fence.
  from: number;
  to: number;
  // Blank separators and the frontmatter block: structure rather than content.
  // Counting them as the reader's own blocks would have every untouched note
  // report "two blocks here aren't the catalogue's" — true, useless and
  // alarming.
  filler: boolean;
}

// A run from a walk that probed each section for itself, so every id in it has
// a line.
export interface OwnedRun extends SectionRun {
  lineOf: Record<string, number>;
}

export const isBlank = (lines: readonly string[]): boolean =>
  lines.every((l) => l.trim() === "");

// A run that is structure rather than anybody's content.
//
// THE THREE PARSERS' SHARED CLAUSE, which was written out three times with one
// of the three differing. Blank lines, the graph-link comment and the wikilink
// under it are furniture on every surface; the banner's `chronoanvil:spacer` is
// furniture on the two that compose one, and the journal parser does not list
// it because its spacer arrives inside the frontmatter run instead.
//
// WHAT IS NOT HERE IS THE FRONTMATTER RULE, and that is deliberate: a flat note
// strips it off the opening run and a dashboard tests the run's first line for
// `---`, which are different answers for a run holding frontmatter AND the
// reader's prose. Each surface keeps its own, beside the walk that calls this.
export function isFillerRun(
  lines: readonly string[],
  opts: { spacer?: boolean } = {}
): boolean {
  return (
    isBlank(lines) ||
    lines.every((l) => {
      const t = l.trim();
      return (
        t === "" ||
        (opts.spacer === true && t === "`chronoanvil:spacer`") ||
        t.startsWith("%%") ||
        t.startsWith("[[")
      );
    })
  );
}

// Which sections a fence holds, and which of its lines each one is on.
//
// ── ONE FUNCTION WHERE THERE WERE TWO IDENTICAL ONES ─────────────────────
//
// `note-sections.ts` and `diary-sections.ts` each carried this loop, and the
// second described itself as *"`parseFlatSections`' loop, transposed"*. They
// were: the same instance tally, the same `locateNth` walk, the same sort by
// offset, differing only in whether the caller wanted the line back with the id.
//
// `journal-plan.ts` ALSO HAS AN `ownersOf` AND IT IS NOT THIS ONE. That one
// deals a fence's keyword list against section SIGNATURES, longest first; it
// answers a different question about a different kind of file and shares
// nothing with this but a name. It stays where it is.
//
// ── WHY THE ORDINAL IS COUNTED HERE AND NOT INSIDE A `locate` (4.15 §4) ───
//
// An instance's id says WHICH occurrence it is — `w:journal-card#2` is the
// second `journal-card` line in the note — and a `locate` cannot answer that,
// because this function asks each fence about itself. Every fence containing a
// card would see it as the first one, so a note with three cards would report
// three copies of `#1` and hand two runs to nobody.
//
// So the count runs along the walk instead. `seen` is carried across the
// segments by the parser, which is the only thing that reads the note in order,
// and this is the single place an ordinal is decided.
//
// AND THE LINE COMES BACK WITH IT, which removes a re-derivation rather than
// adding one: `cellLineIn` used to work the same answer out a second time from
// the section's own anchor, and for an instance it could not — every card in a
// fence would report the fence's first card's line.
//
// EVERY OCCURRENCE IN THIS FENCE, not just the first: a reader may group two
// cards into one block, and each is its own section with its own line.
//
// Restricted to the sections the CALLER handed in, which is how a grain's
// catalogue keeps a `tasks-table` somebody added to a yearly dashboard foreign
// rather than adopting it and then offering it for removal.
export function sectionOwners<Ctx>(
  lines: readonly string[],
  sections: readonly Section<Ctx>[],
  ctx: Ctx,
  seen?: Map<string, number>
): { id: string; line: number }[] {
  const text = lines.join("\n");
  const lineAt = (at: number): number =>
    text.slice(0, at).split("\n").length - 1;
  const found: { id: string; at: number }[] = [];
  // The keywords whose sections are instances, taken from the list this note's
  // model was built with rather than from the registry — so a catalogue that
  // manages one itself is not second-guessed here.
  const repeating = new Set<string>();
  for (const s of sections) {
    const inst = instanceIdOf(s.id);
    if (inst) {
      repeating.add(inst.keyword);
      continue;
    }
    const at = s.locate(text, ctx);
    if (at >= 0) found.push({ id: s.id, at });
  }
  for (const keyword of repeating) {
    let n = seen?.get(keyword) ?? 0;
    for (let k = 1; ; k++) {
      const at = locateNth(keyword, k)(text);
      if (at < 0) break;
      found.push({ id: instanceId(keyword, ++n), at });
    }
    seen?.set(keyword, n);
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => ({ id: f.id, line: lineAt(f.at) }));
}

// A note as the runs its sections occupy, in file order.
//
// ── A SECTION IS ITS FIRST RUN, AND NOTHING AFTER IT (4.12 §A) ───────────
//
// THE BUG THIS CLOSES LOSES A READER'S CONTENT, SILENTLY. `sectionOwners` is
// asked of each fence on its own, and a `locate` is a match rather than a claim
// — so two fences holding one keyword BOTH come back owning that id.
// Downstream, the reorder builds `byChunk` keyed by a chunk's first id, and a
// `Map` keeps the last entry written under a key: the two chunks become one
// object, which is then written into both slots. The first fence's content is
// replaced by the second's, on Save, with nothing in the plan saying so.
//
// A SET RATHER THAN A SMARTER `sectionOwners`, and the difference is what it
// turns the failure INTO. The second fence now owns nothing, so it is a run
// with no `sectionIds` — which every path already knows how to treat: the block
// walk skips it, the apply re-emits it byte-identically, and the plan reports
// it as one block that is not the catalogue's. A silent content swap becomes a
// line in the Changes tab saying a block here was left alone.
//
// FILE ORDER IS WHAT DECIDES, because `segs` is in file order and this walks it
// once. The first fence in the note is the one the catalogue manages, which is
// the only choice a reader could predict without reading this comment.
//
// AN INSTANCE CANNOT BE CLAIMED TWICE ANYWAY (4.15 §4), which is worth saying
// beside the set rather than instead of it: a repeating widget's ordinal is
// handed out by `seen` as the walk passes each occurrence, so no two runs are
// ever offered the same one and the filter never fires for one. The set still
// guards every other section, which is what it was written for.
//
// ── WHAT THE CALLER STILL DECIDES ────────────────────────────────────────
//
// `filler`, and only `filler`. See `isFillerRun`: the two surfaces that use
// this walk disagree about what an opening run holding frontmatter AND the
// reader's prose is, and the disagreement is real rather than an oversight, so
// it is a parameter rather than a branch on which surface this is.
export function parseSectionRuns<Ctx>(
  segs: readonly { kind: string; lines: string[] }[],
  sections: readonly Section<Ctx>[],
  ctx: Ctx,
  filler: (seg: { kind: string; lines: string[] }, index: number) => boolean
): OwnedRun[] {
  const claimed = new Set<string>();
  const seen = new Map<string, number>();
  return segs.map((seg, i) => {
    const held =
      seg.kind === "fence" ? sectionOwners(seg.lines, sections, ctx, seen) : [];
    const owners = held
      .filter((o) => {
        if (claimed.has(o.id)) return false;
        claimed.add(o.id);
        return true;
      })
      .map((o) => o.id);
    const lineOf: Record<string, number> = {};
    for (const o of held) if (claimed.has(o.id)) lineOf[o.id] = o.line;
    return {
      sectionId: owners[0] ?? null,
      sectionIds: owners,
      lineOf,
      from: i,
      to: i,
      filler: !owners.length && filler(seg, i),
    };
  });
}

// Where each `<!--chronoanvil:key-->` region sits, by key.
//
// TWO WALKS OVER ONE MARKER, MERGED (5.23). `entry-sections.ts` scanned for the
// span and `journal-plan.ts`' `regionsIn` scanned for the line count, and both
// carried their own copy of the opening regex and their own idea of what an
// unclosed marker means. They agreed on all of it; what they wanted back
// differed, and a span answers both questions while a count answers one.
//
// LOCATED BY THE MARKERS RATHER THAN BY POSITION, because `readNoteRegion`
// locates one by a whole-file scan and a region a reader moved is still theirs.
//
// AN UNCLOSED MARKER IS NOT A REGION. Both walks already agreed: a region is
// recorded when its `-->` is found and skipped otherwise, because guessing
// where an unterminated one ends is how a reconciler eats the rest of a file.
export function regionSpans(
  lines: readonly string[]
): Map<string, { from: number; to: number }> {
  const out = new Map<string, { from: number; to: number }>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^<!--chronoanvil:([A-Za-z0-9_-]+)\s*$/);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() !== "-->") continue;
      out.set(m[1], { from: i, to: j });
      i = j;
      break;
    }
  }
  return out;
}

// One section as the editor's row.
//
// ── WHAT WAS THE SAME FOUR TIMES, AND WHAT WAS NOT ───────────────────────
//
// Four `viewOf`s existed, one per catalogue, and they agreed about the SHAPE
// and disagreed about the POLICY. The shape is here; the policy stays with the
// surface, handed in already answered.
//
// The shape is not decoration. `test/section-model.test.ts` asserts the exact
// KEY SET of every row it is given — deliberately, so that a field added to
// this projection without an argument fails a test — and that turns three
// conditional spreads into load-bearing code:
//
//   `questions` is present only when there is at least one. A key present and
//   undefined on all nine sections of an entry would have said "every section
//   here asks something" in the one place written to catch that claim.
//   `answered` is present only where a caller had a text to read it from.
//   `repeatable` is present only for a section that declared it.
//
// The policies that differ, and why none of them can live here: `removable` is
// `!locked` on three surfaces and a function of the reader's overrides on the
// journal one; `movable` is `!pinned` where a note has one band and band
// arithmetic where it has more; `group` is the band's name for the reader,
// which only the surface knows; and `questions` is the declared list on three
// catalogues and a DERIVED one on the journal, where a section that declares
// nothing can still have a form toggle.
export function viewOf<Ctx>(
  section: Section<Ctx>,
  policy: {
    removable?: boolean;
    movable?: boolean;
    group?: string | null;
    questions?: readonly SectionQuestion[];
    answered?: Record<string, string>;
  } = {}
): SectionView {
  return {
    id: section.id,
    label: section.label,
    blurb: section.blurb,
    icon: section.icon,
    // FORWARDED, NEVER DECIDED HERE. The subject is the catalogue's to state;
    // this function's whole job is that the four surfaces do not each have
    // their own idea of what crosses the seam.
    category: section.category,
    // `!locked` AND `!pinned` ARE THE DEFAULTS, not a fallback for a caller
    // that forgot: they are what the two flags MEAN, and a surface passes its
    // own answer only where it has an argument for a different one.
    removable: policy.removable ?? !section.locked,
    movable: policy.movable ?? !section.pinned,
    // ONE BAND UNLESS TOLD OTHERWISE, which the editor reads as "any two rows
    // may swap".
    group: policy.group ?? null,
    ...(policy.questions?.length ? { questions: policy.questions } : {}),
    ...(section.repeatable ? { repeatable: true } : {}),
    ...(policy.answered ? { answered: policy.answered } : {}),
  };
}

// A section's row, whichever of the two ways the catalogue declared it.
//
// TWO SPELLINGS FOR ONE FIELD, and this is where they meet. Three catalogues
// write a constant, because a row is a fact about the page's arrangement and
// their page has one arrangement. The journal catalogue writes a function,
// because it serves a container index and a leaf index from one entry and a row
// a section joins on one and not the other cannot be a constant.
//
// EVERY READER GOES THROUGH THIS, which is the point: the composer, the
// planner's cell arithmetic and `regroupFlatNote` all ask the same question,
// and before 5.22 two of them asked it of a `string` and the third of a
// `string | ((ctx) => string | undefined)` because they were reading two types.
export function rowOf<Ctx, Opts extends object>(
  section: Section<Ctx, Opts>,
  ctx: Ctx
): string | undefined {
  return typeof section.row === "function" ? section.row(ctx) : section.row;
}

// Is this section opt-in on THIS page? `rowOf`'s third twin, and the one whose
// two spellings are furthest apart: `boolean` on three catalogues, a predicate
// on the diary one, and `false` for a section that never declared it at all.
export function optInOf<Ctx, Opts extends object>(
  section: Section<Ctx, Opts>,
  ctx: Ctx
): boolean {
  return typeof section.optIn === "function"
    ? section.optIn(ctx)
    : section.optIn === true;
}

// A section's solo bar, whichever way the catalogue declared it. `rowOf`'s twin,
// and read in the same two places: composition, and the planner cutting a cell
// out of a fence that is already in a file.
export function soloBarOf<Ctx, Opts extends object>(
  section: Section<Ctx, Opts>,
  ctx: Ctx
): string | undefined {
  return typeof section.bar === "function" ? section.bar(ctx) : section.bar;
}

// The single fence a section composes, for the machinery that can only hold one.
//
// EVERY CALLER OF THIS IS A ROW RULE. `rowRuns`, `flatBlocks` and
// `regroupFlatNote` reason about fences — which sections share one, where a
// `cell` line goes, what a block's body is — and a `region` or a run of
// markdown has nothing a `cell` line could delimit. `asFlat` did this inline,
// twice, and this is that expression given a name and one definition.
//
// AN EMPTY FENCE FOR A SECTION THAT COMPOSES NONE, rather than null, because
// every caller went on to treat "no fence" as "no lines" and a nullable here
// would be three null checks that all mean the same thing. What such a section
// cannot be is a CELL, and `composeSectionRuns` already decides that by asking
// what `render` returned rather than by asking this.
export function soleFence(
  blocks: readonly SectionBlock[],
  fallbackInfo = "chronoanvil"
): { fence: string; lines: string[] } {
  const found = blocks.find((b) => b.kind === "fence");
  return found?.kind === "fence"
    ? { fence: found.info, lines: found.lines }
    : { fence: fallbackInfo, lines: [] };
}

// A section that composes ONE FENCE, as the block list every section returns.
//
// THE SHAPE THREE CATALOGUES WERE WRITTEN IN. `FlatSection.render` returned
// `{ fence, lines }` — one fence, always — because a flat note, a dashboard and
// a logbook have no section that emits anything else. `Section.render` returns
// a LIST, because a journal section may also emit a body region, a bracketed
// span or markdown; and the honest way to reconcile the two is not to widen
// thirty-six literals into block lists by hand, it is to name the conversion.
//
// TAKES THE OBJECT RATHER THAN THE PIECES, so a catalogue's own comments stay
// beside the lines they annotate. `{ fence, lines }` reads the way it always
// did; only the wrapper changed.
//
// `fence` HERE IS `info` THERE, and the two names are both right where they
// are: a catalogue says which FENCE it composes, and a block records the INFO
// STRING after the backticks. This function is the one place that has to know
// they are the same thing.
export function fenceBlock(block: {
  fence: string;
  lines: string[];
}): SectionBlock[] {
  return [{ kind: "fence", info: block.fence, lines: block.lines }];
}

// ── a section as data ────────────────────────────────────────────────────
//
// THE TEST THIS WHOLE CONSOLIDATION WAS JUDGED BY, made into a type. The header
// of this file states it: *a `Section` should be writable as DATA*, and every
// closure on that interface is a reason a section has to be code. This is the
// subset that is not.
//
// IT IS A MEASUREMENT BEFORE IT IS A FEATURE. No user-facing surface writes one
// — the reader who asked for this consolidation was explicit that an API is not
// in it — and `test/sections-declared.test.ts` is the point: it counts the
// catalogue entries that are declarations, asserts a floor, and the floor is
// raised when it moves. That is the only honest way to know how far a
// settings-backed catalogue actually is, and the alternative — shipping the
// field and finding out later — is the shape `widget-registry.ts` warns against.
//
// ── WHAT IS HERE, AND WHY EACH FIELD EARNED ITS PLACE ───────────────────
//
// Every field below was read off the seven flat catalogues rather than
// imagined. `fence`, `title`, `lines` and `anchor` are the block; `form` and
// `asks` are the toggle, which is the shape that recurs most and which the
// plan's first sketch of this type did not cover at all; `widget` is a registry
// keyword, and naming one buys both the line the widget composes and the
// questions its arguments become. The rest are the plain-data half of `Section`,
// forwarded unchanged.
//
// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────
//
// A section whose lines depend on the CONTEXT (`${noun(ctx)}-summary`), on the
// reader's ANSWER in a way the registry does not describe (the homepage's task
// folder), or on a BRANCH (the quarterly rollup) keeps its closures. Adding a
// field for each would be re-inventing a function with worse syntax; leaving
// them out is what makes the count mean something.
export interface DeclaredFields {
  id: string;
  label: string;
  blurb: string;
  icon: string;
  // Forwarded to `Section.category` unchanged, and required here for the same
  // reason it is required there.
  category: SectionCategory;
  // The plain-data half of `Section`, forwarded as written. `locked` is
  // required there and optional here because most declarations are not.
  locked?: boolean;
  pinned?: boolean;
  optIn?: boolean;
  repeatable?: boolean;
  band?: string;
  row?: string;
  cell?: string;
  tab?: boolean;
  bar?: string;
  // The fence's info string. Every catalogue but the trends charts writes the
  // same one, so it is the default rather than a required field.
  fence?: string;
  // The title line above the directives — `header:🕘 On this day`,
  // `frame: section`. Absent means this section composes no title of its own,
  // which is the ordinary case for a row's cell.
  title?: string;
  // WHICH FORM THE TITLE SHIPS IN when the reader has not answered. A catalogue
  // wrote this as the sense of its own conditional — `opts?.form === SECTION_FORM
  // ? [bar] : []` is a default of `widget`, and `opts?.form === WIDGET_FORM ? []
  // : [bar]` is a default of `section` — which is two spellings of one fact and
  // is why reading them off by eye was unreliable.
  form?: "section" | "widget";
  // WHETHER THE READER IS OFFERED THE TOGGLE, and about WHICH line: `title`
  // where the section composes one, else `bar`.
  //
  // IT CANNOT BE INFERRED FROM EITHER FIELD, which is why it is stated. Five
  // entries in the tree compose a title and offer no answer about it, every one
  // of them on purpose; and a row's SECOND cell composes no title at all and
  // still has an answer to give — the toggle there is about the bar it would
  // take back if the cell beside it left, which `Section.bar` is the other half
  // of. Default: true where there is a `title`, false where there is only a
  // `bar`.
  asks?: boolean;
  // The directives, verbatim. This is the field that has to be a list of
  // strings for the type to mean anything.
  lines?: readonly string[];
  // A registry keyword, which composes its own line and contributes its
  // arguments as questions. `widgetLine` and `widgetQuestions` are the pair
  // 4.58.1 exported for exactly this, one catalogue at a time.
  widget?: string;
  // WHICH OCCURRENCE OF `widget` THIS IS, for the one catalogue whose sections
  // repeat: a page may carry three `logbook` cards, and the third is found by
  // counting the keyword's lines rather than by a pattern that cannot tell them
  // apart. A declaration with `nth` needs no `anchor` and may not carry one.
  nth?: number;
  // What `locate` probes for. A regular expression rather than a keyword,
  // because that is what every catalogue in the tree actually wrote — and the
  // homepage's `/^diary(?::.*)?$/m` is the reason: `\b` matches at a hyphen, so
  // a keyword probe claimed the `diary-search` fence.
  anchor?: RegExp;
}

// EXACTLY ONE OF THE TWO WAYS TO BE FOUND, said in the type rather than in a
// comment. A declaration is data, so "and one of these is required" cannot be a
// runtime check without the failure landing on a reader; the union makes a
// catalogue that declares neither, or both, a compile error at the literal.
export type DeclaredSection =
  | (DeclaredFields & { anchor: RegExp; nth?: never })
  | (DeclaredFields & { widget: string; nth: number; anchor?: never });

// A declaration, as the live section every planner and composer speaks.
//
// GENERIC AND CONTEXT-BLIND. A declaration by definition says nothing that
// depends on a context, so this fits any surface — a `Section<void>` on the
// homepage and a `Section<DiaryDashboardContext>` on a period dashboard are the
// same object with a parameter nothing reads.
export function sectionOf<Ctx, Opts extends object = Record<string, unknown>>(
  d: DeclaredSection
): Section<Ctx, Opts> {
  const shipsTitle = d.form !== "widget";
  const asks = d.asks ?? d.title !== undefined;
  // The line the toggle is ABOUT, which is the one composed where there is one
  // and the one held in reserve where there is not.
  const subject = d.title ?? d.bar;
  const titled = (opts?: { form?: unknown }): boolean =>
    d.title !== undefined &&
    (opts?.form === undefined
      ? shipsTitle
      : opts.form === SECTION_FORM);
  // WHETHER THE WIDGET HAS ANYTHING TO ASK, decided once at construction and
  // not per call. `argQuestions` yields one question per declared argument
  // whatever the vault answers with, so an empty list here is a widget with no
  // arguments rather than a vault with no folders — which is the distinction
  // the spread below turns on.
  const widgetAsks = d.widget !== undefined && widgetQuestions(d.widget).length > 0;
  const questions = (env: QuestionEnv = {}): SectionQuestion[] => [
    ...(asks && subject !== undefined ? [formQuestion(subject)] : []),
    ...(d.widget
      ? widgetQuestions(d.widget, env.hostFolder ?? null, env.vault)
      : []),
  ];
  return {
    id: d.id,
    label: d.label,
    blurb: d.blurb,
    icon: d.icon,
    category: d.category,
    locked: d.locked ?? false,
    ...(d.pinned ? { pinned: true } : {}),
    ...(d.optIn ? { optIn: true } : {}),
    ...(d.repeatable ? { repeatable: true as const } : {}),
    ...(d.band !== undefined ? { band: d.band } : {}),
    ...(d.row !== undefined ? { row: d.row } : {}),
    ...(d.cell !== undefined ? { cell: d.cell } : {}),
    ...(d.tab ? { tab: true } : {}),
    ...(d.bar !== undefined ? { bar: d.bar } : {}),
    // NO `questions` AT ALL WHERE THERE ARE NONE, rather than a function
    // returning an empty list. `viewOf` spreads the field only when it is
    // non-empty and `test/section-model.test.ts` pins that shape; a section
    // that answers "no questions" and one that was never asked must look the
    // same to the window.
    ...((asks && subject !== undefined) || widgetAsks
      ? { questions: (_ctx: Ctx, env?: QuestionEnv) => questions(env) }
      : {}),
    render: (_ctx: Ctx, opts?: Opts) =>
      fenceBlock({
        fence: d.fence ?? "chronoanvil",
        lines: [
          ...(titled(opts) ? [d.title as string] : []),
          ...(d.lines ?? []),
          ...(d.widget
            ? [widgetLine(d.widget, opts as Record<string, unknown> | undefined)]
            : []),
        ],
      }),
    locate:
      d.anchor !== undefined
        ? (text: string) => text.search(d.anchor as RegExp)
        : locateNth(d.widget as string, d.nth as number),
  };
}

// ── one row rule, four catalogues ────────────────────────────────────────

// What `rowRuns` needs to know about a section, and the whole of it.
//
// TWO OPTIONAL FIELDS AND NO ID. Every catalogue's section type carries these
// two under the names and the meanings `FlatSection.row` and `FlatSection.cell`
// argue for at length; nothing here needs to know which type it has been handed,
// which is `SectionModel`'s discipline applied to composition rather than to
// editing.
export interface RowMember {
  row?: string;
  cell?: string;
  tab?: boolean;
  // The bar this member composes ONLY IF its row comes down to it alone — the
  // barless cells of every row this plugin composes. `soloBar` in
  // `directive-grammar.ts` is the rule and the argument for it.
  bar?: string;
}

// ── THE DELIMITER AN ARRIVING CELL WRITES, FOR BOTH RECONCILERS (5.18) ───
//
// `rowRuns` writes a delimiter only where the cell id CHANGES, only in a row
// where somebody named one, and a `tab` wherever a member asked to open a page
// of its own. An arrival has to answer the same question about the one place it
// is landing: does the member ahead of me sit in a different cell, or am I a
// page in my own right? The homepage is the page that makes the cell half
// concrete — its row is `diary:3` in one cell and three widgets stacked in the
// other — and without this, re-adding the first of those three would put it in
// the diary card's column.
//
// A DELIMITER ALREADY THERE IS THE ANSWER, NOT A SECOND ONE. Cutting one of
// several cells leaves the fence's `cell` lines exactly where they were, so the
// commonest rejoin lands directly after one and needs nothing added. Arriving
// FIRST is the mirror image: the delimiter above the insert point belongs
// between this section and the one below it, so the arrival goes ABOVE it
// rather than gaining one of its own — which is what the returned `insertAt`
// says, and why it is returned rather than assumed unchanged.
//
// ── WHY IT IS A FUNCTION AND NOT TWO COPIES OF THE BLOCK (5.18) ─────────
//
// `rowRuns`' reason, one layer up. The rule was `joinFlatRowChunk`'s alone
// while flat notes were the only catalogue with a tabbed row; 5.18 gives the
// journal catalogue one — the tracker grid paged against the stats band on
// every leaf index — and `journal-plan.ts`'s `joinRowChunk` spliced a cell in
// with no delimiter at all, which welds a page onto the cell above it. Two
// spellings of "where does the divider go" is how a group re-added through the
// section editor comes back a different shape from the one composition writes.
//
// ASKED OF `RowMember` AND NOTHING MORE, so the journal catalogue — whose `row`
// is a function of the context — satisfies it with the two fields that are
// plain data on every catalogue.
export function rowDelimiter(arrival: {
  lines: readonly string[];
  insertAt: number;
  member: Pick<RowMember, "cell" | "tab">;
  // Undefined means "nothing of this row is above me in the fence", which is a
  // branch of its own rather than a member with no cell.
  prev: Pick<RowMember, "cell"> | undefined;
  later: Pick<RowMember, "cell"> | undefined;
  divided: boolean;
}): { delimiter: string | false; insertAt: number } {
  const { lines, insertAt, member, prev, later, divided } = arrival;
  const sameCell = (a: string | undefined, b: string | undefined): boolean =>
    a !== undefined && a === b;
  const above = (test: (line: string) => boolean): boolean =>
    insertAt > 0 && test(lines[insertAt - 1].trim());
  if (member.tab) {
    return {
      delimiter: above(isTabLine) ? false : TAB_KEYWORD,
      insertAt,
    };
  }
  if (prev !== undefined) {
    return {
      delimiter:
        divided && !sameCell(prev.cell, member.cell) && !above(isCellLine)
          ? CELL_KEYWORD
          : false,
      insertAt,
    };
  }
  if (above(isCellLine)) return { delimiter: false, insertAt: insertAt - 1 };
  if (later !== undefined) {
    return {
      delimiter:
        divided && !sameCell(member.cell, later.cell) ? CELL_KEYWORD : false,
      insertAt,
    };
  }
  return { delimiter: false, insertAt };
}

// ── writing a note back ───────────────────────────────────────────────────
//
// FOUR RECONCILERS, ONE VOCABULARY (5.24). `applyFlatSections`,
// `applyDiarySections`, `applyEntrySections` and `applySections` each opened
// with the same thirty-five lines — sift the plan into five sets, return null
// if all five are empty — and each closed with the same permutation of chunks
// against `want`. Between those two ends they genuinely differ, and stage C of
// the 5.22 plan expected otherwise; what is here is what survived being read
// side by side rather than what the plan predicted.
//
// WHAT IS SHARED IS WHAT IS PROVABLY THE SAME LINES. Nothing below takes a
// `surface` flag or a pair of callbacks standing in for two implementations —
// that is the shape stage B refused for the parser, and it is refused here for
// the same reason. Where two reconcilers differ in BEHAVIOUR, they keep their
// own code and say so beside it.

// A block of a note being rebuilt: the lines, and whose they are.
//
// `ids` EMPTY IS A REAL CHUNK, not a missing one — the spacer, a reader's own
// fence, the blank line between two blocks. Everything here that permutes or
// counts chunks has to keep them where they are, which is why they are carried
// rather than filtered out on the way in.
export interface Chunk {
  ids: string[];
  lines: string[];
}

// What a plan asks the writer to do, as sets it can test membership in.
//
// RE-DERIVED FROM THE OPS RATHER THAN RETURNED ALONGSIDE THEM, which is the
// rule every reconciler here already followed: a plan that hands the writer a
// private extra is a plan the preview no longer fully describes. This function
// changes nothing about that — it is the same derivation, written once.
//
// `extending` IS COUNTED AS WORK. A missing title is a write like any other:
// the plan named it, and a plan promising a line the writer then declines to
// add is the disagreement this module is built not to have. `applyEntrySections`
// has no `extend` op to find, so its set is empty and `any` reads the same.
export interface PlannedWrites {
  removing: Set<string>;
  adding: string[];
  moving: boolean;
  rewriting: Set<string>;
  extending: Set<string>;
  // False means "nothing would change", which every reconciler answers with
  // null rather than with the text it was given.
  any: boolean;
}

export function plannedWrites(ops: readonly SectionOp[]): PlannedWrites {
  const named = (kind: SectionOp["kind"]): string[] =>
    ops
      .filter((o) => o.kind === kind)
      .map((o) => o.sectionId)
      .filter((id): id is string => id !== null);
  const removing = new Set(named("remove"));
  const adding = named("add");
  const moving = ops.some((o) => o.kind === "move");
  const rewriting = new Set(named("reconfigure"));
  const extending = new Set(named("extend"));
  return {
    removing,
    adding,
    moving,
    rewriting,
    extending,
    any: Boolean(
      removing.size ||
        adding.length ||
        moving ||
        rewriting.size ||
        extending.size
    ),
  };
}

// Where a new section goes, in chunk space. Anchored to the sections the file
// actually has rather than to an absolute position, so a note someone
// rearranged keeps its arrangement — and remove-then-re-add restores the file
// exactly, which is the property worth having because a test can check it.
//
// A CHUNK RANKS BY THE LAST OF ITS SECTIONS. The dashboard's masthead outranks
// a new body block by way of `summary`, not of `links`, so an added section
// lands below the whole card rather than between its two rows. `journal-plan.ts`
// ranked by the FIRST id until 5.24 and got the same answer everywhere it was
// asked — its runs list their ids in file order and its rows are contiguous —
// but "first" is the answer that stops being right the moment a row's cells are
// listed in catalogue order rather than in the file's, and the two spellings
// were one bug apart rather than one behaviour apart.
export function insertionPoint(
  chunks: readonly { ids: string[] }[],
  order: readonly string[],
  id: string
): number {
  const rank = order.indexOf(id);
  let after = -1;
  for (let i = 0; i < chunks.length; i++) {
    const ranks = chunks[i].ids
      .map((k) => order.indexOf(k))
      .filter((r) => r !== -1);
    if (!ranks.length) continue;
    if (Math.max(...ranks) > rank) return after === -1 ? i : after + 1;
    after = i;
  }
  return after === -1 ? chunks.length : after + 1;
}

// Reorder chunks into `want`'s order, in place.
//
// SECTIONS MOVE AROUND FOREIGN BLOCKS, WHICH KEEP THEIR INDEX. A reader's own
// fence sitting between two sections being swapped has no correct destination,
// so it stays put and the sections trade the slots they had. Blank separators
// keep their positions for the same reason — permuting filler would be
// reformatting a file to no end.
//
// PER BAND WHERE THERE ARE BANDS. A chunk belongs to the band of the sections
// in it, so a dashboard's masthead and its body permute among their own slots
// and never trade — which is what keeps a body block from landing above
// navigation, without a check anywhere saying so. One band is the same code
// with the predicate always true, which is why there is no second loop for it.
export function permuteChunks<C extends { ids: string[] }>(
  chunks: C[],
  want: readonly string[],
  bandOf?: (id: string) => string | undefined,
  bands: readonly string[] = []
): void {
  const partitions: ((id: string) => boolean)[] = bandOf
    ? bands.map((band) => (id: string) => bandOf(id) === band)
    : [() => true];
  for (const inBand of partitions) {
    const slots: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const first = chunks[i].ids[0];
      if (first && inBand(first)) slots.push(i);
    }
    const occupants = slots.map((i) => chunks[i].ids[0]);
    const desired = desiredOrder(occupants, want.filter(inBand));
    const byChunk = new Map(slots.map((i) => [chunks[i].ids[0], chunks[i]]));
    slots.forEach((slot, n) => {
      const wanted = byChunk.get(desired[n]);
      if (wanted) chunks[slot] = wanted;
    });
  }
}

// The `add` ops of a plan, and the ids they name.
//
// IN THE ORDER THE READER ASKED FOR THEM rather than in catalogue order: `want`
// is an ordered list, and a plan that renamed its own input would be describing
// a different request.
//
// `admits` IS THE ENTRY CATALOGUE'S GATE and nothing else uses it. Only that
// surface's shared half can be added to — its two structural sections are
// locked, which means they can neither leave nor arrive, because an entry that
// never had a banner is not an entry this catalogue wrote.
export function addOps<S extends { id: string; label: string }>(
  want: readonly string[],
  present: (id: string) => boolean,
  byId: Map<string, S>,
  detail: (section: S) => string,
  admits?: (section: S) => boolean
): { ops: SectionOp[]; adding: string[] } {
  const ops: SectionOp[] = [];
  const adding: string[] = [];
  for (const id of want) {
    if (present(id)) continue;
    const section = byId.get(id);
    if (!section) continue;
    if (admits && !admits(section)) continue;
    adding.push(id);
    ops.push({
      kind: "add",
      sectionId: id,
      label: section.label,
      detail: detail(section),
    });
  }
  return { ops, adding };
}

// The `move` ops of a plan, worked out from what the order will be once the
// adds and removes have happened — so a move is reported against the final
// arrangement rather than against an intermediate one nobody will ever see.
//
// PER BAND, matching `permuteChunks`. A `want` that interleaves two bands is
// not refused with a message because it is not REPRESENTABLE: each band is
// reordered against the part of `want` that belongs to it, so a list that mixes
// them resolves to the same permutations as one that does not.
export function moveOpsFor<S extends { label: string; band?: string }>(
  order: readonly string[],
  want: readonly string[],
  adding: readonly string[],
  byId: Map<string, S>,
  bands?: readonly string[]
): SectionOp[] {
  const label = (id: string): string | undefined => byId.get(id)?.label;
  const partitions: ((id: string) => boolean)[] = bands
    ? bands.map((band) => (id: string) => byId.get(id)?.band === band)
    : [() => true];
  const ops: SectionOp[] = [];
  for (const inBand of partitions) {
    const { surviving, target } = finalOrder(order, want, adding, inBand);
    ops.push(...moveOps(surviving, target, label));
  }
  return ops;
}

// What is left of a band once the adds and removes have happened, and what the
// reader asked that to be.
//
// A FUNCTION BECAUSE TWO PASSES ASK IT (5.24). `moveOpsFor` needs both halves
// to report the minimal set of moves; `planFlatSections` needs `target` again a
// few lines later, to ask whether a refused move was only two cells of one row
// trading places. Computed twice, the two would be one edit apart from
// describing different arrangements.
export function finalOrder(
  order: readonly string[],
  want: readonly string[],
  adding: readonly string[],
  inBand: (id: string) => boolean = () => true
): { surviving: string[]; target: string[] } {
  const surviving = order.filter((id) => inBand(id) && want.includes(id));
  const target = want.filter(
    (id) => inBand(id) && (surviving.includes(id) || adding.includes(id))
  );
  return { surviving, target };
}

// ── A SECTION WITH ITS CONTEXT ALREADY IN IT ─────────────────────────────
//
// `flatBlocks`, `regroupFlatNote` and `pageWidgetKeywords` are the row
// machinery: what a `row` line means, where a cell may be cut, what a group is.
// They speak `Section<void>`, because a flat note has no context, and the two
// surfaces that DO have one have each borrowed them through a hand-written
// adapter — `asFlat` in `diary-sections.ts` since 4.58 and in `journal-plan.ts`
// since 5.11.
//
// ── WHY THIS IS A BINDING AND NOT A DELETION (5.24) ─────────────────────
//
// The 5.22 plan called for both adapters to go, on the reading that they were
// lossy projections between four section types that stage A had since made one.
// Read again with that merge done, they are not projections at all: what is
// left of each is `ctx`, closed into the three members that take one and
// resolved out of the three that may be either a value or a function of it.
// That is a real operation with a name, and the honest fix was to name it once
// rather than to delete it twice.
//
// The alternative was to thread `Ctx` through the row machinery itself — a
// dozen functions and every caller of `flatBlocks` in the tree — to arrive at
// the same place with the binding spelled at each use instead of at one.
//
// NOT `...section`, DELIBERATELY. `applies`, `default` and `parts` are typed
// for `Ctx` and a spread would carry them onto a `Section<void>` where their
// parameter is wrong; and the row machinery reads none of them. What is
// forwarded is what that machinery asks for and the identity a window draws.
//
// `defaults` IS THE JOURNAL TEMPLATE'S, and it is the reason `render` is not
// simply closed over: a layout declares `SectionOverrides` about a section
// (Study's three resource shelves, its own bridge tracker) and a reader's own
// answer must still win over them. So they go UNDER the caller's options rather
// than replacing them.
//
// `renderWith` IS THE JOURNAL TEMPLATE'S THIRD, and it is not decoration: that
// catalogue's widget form strips the bar out of the fence it just rendered
// (`sectionBlocks`), and `hasKnownExtent` — the predicate deciding whether a
// cell may be cut out of a shared block — asks for the widget form on purpose.
// Binding straight to `render` would answer "two lines" for every self-titling
// section and take the group controls away from them.
//
// `keepBar: false` IS THE JOURNAL TEMPLATE'S TOO, and the reasoning is worth
// keeping because the field looks like it wants an answer. `bar` is the title a
// cell takes BACK — `undoRowOfOne` and the out-path of a break-up hand it to
// `soloBar`. On that catalogue the only section that can be a cell is one
// already in the widget form, because `isSectionFence` refuses a self-titling
// fence as a column; so every id this field would be read for is one whose bar
// the READER took off, and answering it would put that title back the first
// time they broke the group up. On the dashboards a cell is a cell because the
// CATALOGUE said so, and `bar` is that section's own name for standing alone —
// so there it is forwarded, and `regroupFlatNote` hands it back only to a
// section that has JUST stopped being a cell.
export function bindSection<Ctx, Opts extends object>(
  section: Section<Ctx, Opts>,
  ctx: Ctx,
  policy: {
    defaults?: Opts;
    keepBar?: boolean;
    renderWith?: (
      section: Section<Ctx, Opts>,
      ctx: Ctx,
      opts: Opts | undefined
    ) => SectionBlock[];
  } = {}
): Section<void, Opts> {
  const { defaults, keepBar = true, renderWith } = policy;
  const draw = renderWith ?? ((sec, c, opts) => sec.render(c, opts));
  return {
    id: section.id,
    label: section.label,
    blurb: section.blurb,
    icon: section.icon,
    category: section.category,
    locked: section.locked,
    ...(section.pinned ? { pinned: true } : {}),
    ...(section.repeatable ? { repeatable: true } : {}),
    ...(section.cell !== undefined ? { cell: section.cell } : {}),
    ...(section.tab ? { tab: true } : {}),
    row: rowOf(section, ctx),
    bar: keepBar ? soloBarOf(section, ctx) : undefined,
    optIn: optInOf(section, ctx),
    ...(section.questions
      ? {
          questions: (_ctx: void, env?: QuestionEnv) =>
            section.questions!(ctx, env),
        }
      : {}),
    render: (_ctx, opts) =>
      draw(
        section,
        ctx,
        defaults ? ({ ...defaults, ...(opts ?? {}) } as Opts) : opts
      ),
    locate: (text) => section.locate(text, ctx),
  };
}

// ── A BLOCK ALREADY ON DISK WITH NO TITLE OVER IT (5.9, widened 5.10) ────
//
// `soloBar` titles a lone cell when a page is COMPOSED without its row's opener
// and when one is CUT out of a fence. Neither reaches a page written before
// those rules existed — untick the rollup on a week, in any release before 5.9,
// and the tasks table beside it was left in a fence with nothing over it — and
// its reader has no gesture that fixes it: unticking the section and ticking it
// back composes the same headless fence. So the plan looks, reports what it
// finds as an `extend`, and the write adds one line.
//
// 5.9 SCOPED THIS TO A ROW'S CELL and that was too narrow. A section whose
// catalogue entry GAINED a bar is in the same state on every page composed
// before it, for the same reason, and the alternative — drawing a fallback bar
// at render time — gives a vault two looks for one object, chosen by the age of
// the page and never said out loud.
//
// THE TITLE COMES FROM THE RENDER. A row member names its own (`bar`, worded
// for itself rather than for the band); everything else opens with the
// `header:` line it would compose today, which is what `leadingBar` reads.
//
// ONLY WHERE THE RUN HOLDS ONE SECTION and the fence carries no bar of any
// kind; `needsSoloBar` is the gate and says why.
//
// AND NEVER WHERE THE SECTION OFFERS THE FORM TOGGLE (5.11). Once a section
// asks the reader "a section with its own title, or a widget?", a fence with no
// bar in it has TWO causes — a page composed before the title existed, and a
// reader who answered `widget` — and this rule cannot tell them apart. It used
// to guess the first, so opening the editor on a dashboard whose Recently
// written had been turned into a widget offered to put the title back, and
// saving took the answer away. Going quiet leaves the older page untitled,
// which the reader can fix with the toggle they were offered anyway; the
// opposite mistake overwrites an answer they already gave.
//
// AND THE TOGGLE OUTRANKS A DECLARED `bar` (5.14). Until 5.14 the two could not
// coexist — a row member declared `bar` and offered no toggle, everything else
// offered a toggle and composed its title in `render` — so reading `bar` first
// was right by accident. `open-tasks`, `tags` and `sleep` now declare BOTH: the
// bar is the line they take back when they leave a row, and the toggle is the
// reader's answer about whether they want it. Leaving `bar` in front would
// re-offer that line to exactly the sections that just learned to refuse it,
// which is 5.12's overwrite with a new set of victims.
//
// ── ONE SCAN, TWO SURFACES (5.24) ───────────────────────────────────────
//
// The flat planner and the dashboard planner each carried this loop and each
// carried a version of the argument above. They had already drifted once, in
// the direction that matters: 5.14's fix landed on both, but only because
// somebody remembered the second copy. A repair that overwrites a reader's
// answer is not the kind of rule that should depend on that.
export function barlessRuns<Ctx>(
  runs: readonly SectionRun[],
  segs: readonly { lines: string[] }[],
  byId: Map<string, Section<Ctx>>,
  ctx: Ctx,
  requested: readonly SectionWant[],
  env?: QuestionEnv
): Map<string, string> {
  const barless = new Map<string, string>();
  for (const run of runs) {
    if (run.sectionIds.length !== 1) continue;
    const only = byId.get(run.sectionIds[0]);
    if (!only) continue;
    const lines: string[] = [];
    for (let i = run.from; i <= run.to; i++) lines.push(...(segs[i]?.lines ?? []));
    const asks = (only.questions?.(ctx, env) ?? []).some(
      (q) => q.kind === "form"
    );
    const bar = asks
      ? undefined
      : (soloBarOf(only, ctx) ??
        (rowOf(only, ctx)
          ? undefined
          : leadingBar(
              soleFence(only.render(ctx, optionsFor(requested, only.id))).lines
            )));
    if (!needsSoloBar(lines, bar)) continue;
    barless.set(only.id, bar as string);
  }
  return barless;
}

// ── A CELL REJOINING THE ROW IT LEFT ─────────────────────────────────────
//
// A section that declares a row looks for that row's fence before it composes a
// block of its own, and puts its line back inside it. That is what makes
// remove-then-re-add a round trip for a grouped section: the ordinary add path
// composes a BLOCK, and a cut cell came out of a fence somebody else is still
// in.
//
// ── THE THIRD COPY, AND THE LAST (5.24) ─────────────────────────────────
//
// 4.70 wrote this rule for the diary dashboards and the flat notes, and 5.18
// wrote it a third time for the journal templates. The three agreed about the
// whole of it — find the chunk whose members all share my row, take the
// survivor's borrowed title back off, insert ahead of the first member that
// outranks me, put the `row` line back if the cut took it — and differed in
// three ways, every one of which was an omission rather than a decision:
//
//   * the dashboard reconciler wrote no DELIMITER, because no dashboard section
//     declares a `cell` or a `tab` and the omission therefore could not be seen.
//     It is here now, and for that catalogue `rowDelimiter` answers "nothing to
//     add" on every path it can reach — which is the state the code was already
//     in, said out loud.
//   * the dashboard reconciler had no `if (open < 0) return false` guard on a
//     chunk with no fence open. Its runs are fence segments, so it could not
//     reach one; the guard is free and the file it protects is the reader's.
//   * the journal reconciler turned away a section rendering anything but ONE
//     fence, which the other two never had to say because their catalogues emit
//     nothing else. A cell is a line inside a fence, so a section with a region
//     or a bracketed span has nothing a cell could hold, and refusing is right
//     on all three.
//
// `laterOpts` IS THE ONE GENUINE POLICY. Asking the member ahead of me what
// keywords it writes means rendering it, and only the journal catalogue has
// per-section overrides to render it WITH. The other two pass nothing, which is
// what they passed before.
export function joinRowChunk<Ctx, Opts extends object, C extends Chunk>(
  chunks: C[],
  section: Section<Ctx, Opts>,
  ctx: Ctx,
  byId: Map<string, Section<Ctx, Opts>>,
  order: readonly string[],
  opts: Opts | undefined,
  laterOpts?: (id: string) => Opts | undefined
): boolean {
  const row = rowOf(section, ctx);
  if (!row) return false;
  const mine = section.render(ctx, opts);
  if (mine.length !== 1 || mine[0].kind !== "fence") return false;

  const at = chunks.findIndex(
    (c) =>
      c.ids.length > 0 &&
      c.ids.every((id) => {
        const other = byId.get(id);
        return other !== undefined && rowOf(other, ctx) === row;
      })
  );
  if (at < 0) return false;

  const chunk = chunks[at];
  // AND THE SOLO BAR COMES BACK OFF FIRST — `dropSoloBar`, `soloBar`'s inverse.
  // The cut gave the survivor a title when the fence came down to it alone; the
  // cell arriving beside it composes the band's again, so the borrowed one goes
  // and the file is the file the reader started with.
  const lines = chunk.ids
    .reduce((out, id) => {
      const member = byId.get(id);
      return member ? dropSoloBar(out, soloBarOf(member, ctx)) : out;
    }, chunk.lines as readonly string[])
    .slice();

  const rank = order.indexOf(section.id);
  // Ahead of the first member that outranks it, found by the keyword that
  // member writes — the same probe the cut works by, so the two cannot disagree
  // about which line belongs to whom.
  const later = chunk.ids.find((id) => order.indexOf(id) > rank);
  const laterKeywords = later
    ? new Set(
        (byId.get(later)?.render(ctx, laterOpts?.(later)) ?? [])
          .flatMap((b) => (b.kind === "fence" ? b.lines : []))
          .map((l) => splitDirective(l).keyword)
      )
    : null;

  // Default: the last line before the fence closes.
  let insertAt = lines.length;
  for (let n = lines.length - 1; n >= 0; n--) {
    if (lines[n].trim() === "```") {
      insertAt = n;
      break;
    }
  }
  if (laterKeywords) {
    const found = lines.findIndex((l) =>
      laterKeywords.has(splitDirective(l.trim()).keyword)
    );
    if (found >= 0) insertAt = found;
  }

  // The `row` line comes back with the cell, because the cut took it when the
  // fence fell to one widget. A fence that gained a second directive without it
  // would be two widgets stacked in one block rather than a row of two.
  if (!lines.some((l) => isRowLine(l.trim()))) {
    const open = lines.findIndex((l) => l.trim().startsWith("```"));
    if (open < 0) return false;
    lines.splice(open + 1, 0, ROW_KEYWORD);
    if (insertAt > open) insertAt++;
  }

  const before = chunk.ids.filter((id) => order.indexOf(id) < rank);
  const prevId = before.length ? before[before.length - 1] : undefined;
  const arrival = rowDelimiter({
    lines,
    insertAt,
    member: section,
    // AN ID IN THE CHUNK IS A MEMBER, so `?? {}` keeps "there is a cell above
    // me" true for one the map cannot resolve rather than turning it into "I
    // arrive first", which is a different branch with a different answer.
    prev: prevId === undefined ? undefined : (byId.get(prevId) ?? {}),
    later: later === undefined ? undefined : (byId.get(later) ?? {}),
    // THE ROW'S MEMBERS ARE ASKED OF THE CONTEXT, because `row` may be a
    // predicate rather than a constant — the same call made above to find the
    // chunk.
    divided: order.some((id) => {
      const other = byId.get(id);
      return (
        other !== undefined && rowOf(other, ctx) === row && other.cell !== undefined
      );
    }),
  });
  insertAt = arrival.insertAt;
  lines.splice(
    insertAt,
    0,
    ...mine[0].lines,
    ...(arrival.delimiter && prevId === undefined ? [arrival.delimiter] : [])
  );
  if (arrival.delimiter && prevId !== undefined) {
    lines.splice(insertAt, 0, arrival.delimiter);
  }

  chunks[at] = {
    ...chunk,
    ids: [...chunk.ids, section.id].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b)
    ),
    lines,
  };
  return true;
}

// Anything the catalogue did not write, counted rather than named: the reader
// knows what their own blocks are, and the useful fact is that the plan is not
// going to touch them.
//
// `unit` IS "block" ON THREE SURFACES AND "line" ON THE ENTRY, which counts
// inside one fence the whole band shares rather than counting fences.
export function foreignOp(
  count: number,
  unit: string,
  where: string
): SectionOp | null {
  if (!count) return null;
  return {
    kind: "foreign",
    sectionId: null,
    label: "—",
    detail: `${count} ${unit}${count === 1 ? "" : "s"} ${where} ${
      count === 1 ? "isn't" : "aren't"
    } the catalogue's; left alone`,
  };
}
