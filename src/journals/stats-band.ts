// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// WHAT A STATS BAND SAYS, as data. 4.46 §2.
//
// ── THE TWO BANDS THIS FILE MERGES ───────────────────────────────────────
//
// A Media shelf drew two of them, stacked: `topic-stats` said *3 titles · 4.7/5
// avg stars · 1 open tasks*, and `journal-totals` directly beneath it said *753
// pages read*. Two widgets, two catalogue sections, two markup families and two
// collapse rules, answering one question — what do the notes below this one
// come to? — and differing only in which quantities they pick.
//
// They were never two ideas. `topic-stats` picked counts and an average;
// `journal-totals` picked sums. So the merge is not a compromise between two
// widgets: it is naming the thing they were both instances of, which is a LIST
// OF MEASURES, and letting a reader choose the list.
//
// ── NO ARITHMETIC LIVES HERE, AND THAT IS THE POINT ──────────────────────
//
// This file holds no `App`, no plugin, no DOM and no vault read. It answers
// three questions a test can ask in one call — which presets exist, which of
// them a scope can honour, and which measures survive on that scope — and
// `tables.ts::buildStatsBand` does every reading and every drawing.
//
// The split is `widget-registry.ts`' own ("a table with no functions in it")
// wearing this surface's clothes, and it is what makes the release's central
// claim checkable: *one preset, three scopes, three honest bands, no branch in
// the caller.* That claim is about this table, so it is asserted against this
// table.
//
// A `JournalType` is allowed in, because it is the shape the catalogues already
// hold and it says nothing about a vault — how many kinds a journal declares is
// a fact about the journal, not about what anybody has written.

import type { JournalType } from "./journal";
// The one function that knows how a compound argument is spelled — 4.16's, and
// the reason a slot list needs no join rule of its own.
import { joinParts } from "../core/section-model";
import type { SectionQuestion } from "../core/section-model";

// ── Scope ─────────────────────────────────────────────────────────────────

// WHERE THE BAND IS, WHICH IS THE ONLY THING THAT DECIDES WHAT IT MEANS.
//
// DERIVED, NEVER WRITTEN. `stats-band` carries a preset and nothing else. A
// scope written into the directive would be a second answer to a question the
// note's own position already answers, and it would not follow the note when it
// moves — the same failure a path written into a directive has, which is why
// both dashboards compose bare directives (RESUME §6, *derive, don't
// configure*).
//
//   vault      the host note is in no registered journal — the homepage, the
//              journals dashboard. Scope is every journal's root, unioned.
//   journal    the host note IS a journal's folder note. Scope is that root.
//   container  a Subject, a Topic, an Area, a Block. Scope is the host folder.
export type StatScope = "vault" | "journal" | "container";

// THE THREE SCOPES OFF ONE NUMBER, and the number is `containerDepth`'s.
//
// −1 IS THE JOURNAL ROOT AND IS NOT A CONTAINER — that function's own words,
// and the distinction it was corrected to make in 4.13: the root is the box the
// first level sits in, so a rollup drawn there headed its first column "Topic"
// over rows that were Subjects. This reads the same −1 to mean the same thing,
// so the two cannot drift.
//
// `null` IS "NO JOURNAL HERE", which is what a caller passes when
// `journalTypeOfNote` came back empty. It is not a depth and is deliberately not
// spelled as one: a homepage is not at depth −2.
export function statScopeOf(depth: number | null): StatScope {
  if (depth === null) return "vault";
  return depth < 0 ? "journal" : "container";
}

// ── Measures ──────────────────────────────────────────────────────────────

// One question a cell answers.
//
// TWO OF THEM EXPAND AND THE REST DO NOT. `kinds` draws one cell per note kind
// the journal declares and `totals` one per quantity it sums; the other five are
// one cell each. That asymmetry is the whole reason a preset names MEASURES
// rather than cells: *"the quantities this journal totals"* is a stable thing to
// ask for and its answer is a different width in every vault.
export type StatMeasureId =
  | "notes"
  | "kinds"
  | "below"
  | "rating"
  | "open"
  | "last"
  | "totals"
  // ONE NOTE TYPE, BY ID — `kind:lesson`. 4.47.
  //
  // WHAT MAKES "EACH CELL" LITERAL. `kinds` fills one cell per note type, which
  // is right for *"one per note type"* and wrong as the only way to say *"how
  // many Lessons"* — and a reader choosing what goes in the second cell of a
  // four-cell band is asking the second question, not the first.
  //
  // NOT A `needs-vault-answer` DEFERRAL, which is the reason it can be offered
  // at all: both catalogues that ask this question hold a `JournalType`, and a
  // journal's note types are a fact about the journal rather than about what
  // anybody has written in it. `total:<tracker>` WOULD be that deferral — the
  // registry is the only thing that lists trackers and neither catalogue holds
  // it — so it is deliberately not added, and `totals` already says the useful
  // thing.
  | `kind:${string}`;

// The id a per-kind slot is spelled with, and the id back out of it. One
// spelling, two directions, in one place — the rule this project keeps applying
// to any pair that could drift.
export const KIND_MEASURE_PREFIX = "kind:";

export function kindMeasure(kindId: string): StatMeasureId {
  return `${KIND_MEASURE_PREFIX}${kindId}` as StatMeasureId;
}

export function kindOfMeasure(m: string): string | null {
  return m.startsWith(KIND_MEASURE_PREFIX)
    ? m.slice(KIND_MEASURE_PREFIX.length) || null
    : null;
}

// WHICH SCOPES CAN ANSWER A MEASURE AT ALL, and a measure that cannot be
// answered YIELDS NO CELL.
//
// THAT RULE IS `journal-totals`' OWN, GENERALISED. It already said *"a quantity
// with no readings in scope draws no cell — a zero would be a claim that nobody
// read any pages; absence is the honest answer and the useful one"*, and that
// is what lets one directive serve a Books shelf banding *Pages read* and a Film
// shelf banding *Minutes*. Applying it to every measure is what lets one PRESET
// serve three scopes.
//
// `rating` AND `totals` STOP AT THE JOURNAL, AND 2.44 IS WHY. `journals-header`
// deleted an "avg confidence" cell that spanned every registered journal at
// once, and the reason that survived scrutiny was the scope one: *"the band
// spans every registered journal at once, and a type rates its kinds on whatever
// it likes"*. An average of Study's Confidence and Media's Stars is a number
// with no referent. The same is true of a sum: adding Pages read to Distance
// gives a figure in no unit.
//
// `kinds` STOPS THERE FOR THE SAME REASON ONE STEP EARLIER — a vault has no one
// list of note kinds, it has one per journal.
export const MEASURE_SCOPES: Record<string, readonly StatScope[]> = {
  notes: ["vault", "journal", "container"],
  kinds: ["journal", "container"],
  below: ["vault", "journal", "container"],
  rating: ["journal", "container"],
  open: ["vault", "journal", "container"],
  last: ["vault", "journal", "container"],
  totals: ["journal", "container"],
};

// WHICH SCOPES CAN ANSWER THIS MEASURE, per-kind slots included.
//
// A FUNCTION RATHER THAN A WIDER TABLE, because `kind:<id>` is a FAMILY and a
// table cannot hold a family — the ids come from whichever journal is being
// looked at. It answers the same question as the table and reads it for
// everything that is not a family member, so there is still one list of scopes.
export function scopesForMeasure(m: string): readonly StatScope[] {
  // A per-kind count needs a journal to name the kind, exactly as `kinds` does.
  if (kindOfMeasure(m)) return MEASURE_SCOPES.kinds;
  return MEASURE_SCOPES[m] ?? [];
}

// ── The cap ───────────────────────────────────────────────────────────────

// A BAND IS AT MOST FOUR CELLS.
//
// `stat-strip.ts` has said so since it was written — *"capped at four: past that
// the cells are too narrow to read a label in, and no caller has five"* — and
// `journal-totals` quietly contradicted it, capping the COLUMN COUNT at four
// while drawing every cell, so a fifth quantity wrapped into a row of one
// against three tracks of exposed ground.
//
// THE CAP IS ON THE DATA, NOT ON THE LAYOUT, and that distinction is the
// release's, not a preference. `stat-strip.ts` records at length why a layout
// the CSS has to be able to ADAPT cannot be written from JavaScript: an inline
// declaration is the one thing a stylesheet cannot override, so the first cut of
// that component silently beat its own container query and stayed four across at
// every width. How many cells there ARE is a fact JavaScript knows; how many FIT
// is the stylesheet's, and `data-cols` stays its business.
//
// AND NOTHING SHIPPED REACHES IT. Study resolves Progress to four (two kinds,
// a rating, open tasks), Exercise & Diet resolves Totals to four, Media resolves
// Summary to four. The cap costs nothing today and stops an unreadable band in a
// vault whose journal declares six quantities.
export const STAT_CELL_CAP = 4;

// ── The presets ───────────────────────────────────────────────────────────

export interface StatPreset {
  id: string;
  // What the dropdown row says. A noun, on `WidgetSpec.label`'s rule.
  label: string;
  // One sentence for the reader, in their words rather than the directive's.
  blurb: string;
  // Which scopes this is OFFERED on. Not the same question as whether it can
  // draw there: `measuresFor` answers that, and a preset offered nowhere would
  // still render if a reader typed it. Offering is about a dropdown; drawing is
  // about honesty, and the two are kept apart for the reason
  // `NOT_PAGE_WIDGETS`' `needs-vault-answer` entry states — a widget withheld
  // from a menu is not a widget that does not work.
  scopes: readonly StatScope[];
  // In order. Where the cap bites, this order decides what survives — so it is
  // written most-important-first rather than in the order the cells happen to
  // read well.
  measures: readonly StatMeasureId[];
}

// FOUR, AND FOUR IS THE WHOLE MENU.
//
// A BUILDER WAS THE OBVIOUS ALTERNATIVE AND IS THE WRONG ONE. Let a reader tick
// seven measures and the band's job stops being a band: five cells do not fit
// (see the cap), the order becomes a thing to configure, and every journal in
// every vault gets a different one — which is the opposite of what a shared
// component is for. Four named arrangements is a `<select>` a reader answers in
// one click and a maintainer can draw on paper.
//
// TWO OF THEM ARE THE WIDGETS THIS RELEASE DELETES, unchanged. `progress` is
// `topic-stats` cell for cell and `totals` is `journal-totals`, so no band that
// exists today changes when the widget under it does — which is what makes the
// merge safe to run over notes nobody is going to re-compose.
export const STAT_PRESETS: readonly StatPreset[] = [
  {
    id: "activity",
    label: "Activity",
    blurb: "How much is here, when it was last worked, and what is still open.",
    // THE ONE PRESET EVERY SCOPE CAN HONOUR, which is why it is the default
    // everywhere (`defaultPresetFor`). Its four measures are the four questions
    // that mean the same thing about a vault, a journal and a folder.
    scopes: ["vault", "journal", "container"],
    measures: ["notes", "last", "open", "below"],
  },
  {
    id: "progress",
    label: "Progress",
    blurb: "One count per note type, the average rating, and what is still open.",
    scopes: ["journal", "container"],
    // `topic-stats` EXACTLY, in its order: a cell per kind, then the average,
    // then open tasks. That band has been on every Study Topic index since 3.11
    // and this is the entry that keeps it there.
    measures: ["kinds", "rating", "open"],
  },
  {
    id: "totals",
    label: "Totals",
    blurb: "What the notes add up to, for every quantity this journal totals.",
    scopes: ["journal", "container"],
    // `journal-totals` EXACTLY. One measure, because that widget had one idea.
    measures: ["totals"],
  },
  {
    id: "summary",
    label: "Summary",
    blurb: "How many, how well, what is open, and what it all adds up to.",
    scopes: ["journal", "container"],
    // THE MERGE, AND THE REASON THE MERGE IS NOT A LOSS. On a Media shelf this
    // resolves to *titles · avg stars · open tasks · pages read* — the four cells
    // that were two stacked bands before this release, in one band, with the
    // duplication gone rather than the content.
    //
    // `notes` RATHER THAN `kinds`, which is what keeps it inside the cap on a
    // journal with more than one note type. It costs nothing on Media, because
    // `notes` names itself after the single kind when a journal has one — see
    // `soleKindOf`.
    measures: ["notes", "rating", "open", "totals"],
  },
];

const BY_ID = new Map(STAT_PRESETS.map((p) => [p.id, p]));

// ── The two spellings this widget replaced ────────────────────────────────

// THE OLDER WORDS, AND WHAT EACH OF THEM MEANS. 4.46.1.
//
// `topic-stats` sits in every Study Topic index in every vault and
// `journal-totals` in every Exercise Block index, so both go on dispatching —
// see `NOT_PAGE_WIDGETS`, where they sit as aliases, and `RETIRED_WIDGETS`,
// where they deliberately do not.
//
// ── ONE TABLE, BECAUSE 4.46.0 HAD THREE AND THE THIRD WAS MISSING ─────────
//
// The mapping "which preset does this old word draw" was written twice — once
// in the dispatch switch, once in each catalogue's `locate` alternation — and
// the place that needed it THIRD was the section editor's question, which had
// no way to express it at all. What the reader saw was the release's own
// feature missing: on every note written before 4.46 the preset control was
// replaced by the inert words *"set when added"*, and had it been drawn, the
// answer would have been silently dropped on save — `withAnswers` finds a span
// by keyword, and the keyword in their file was not the one the question named.
//
// So the mapping is data, in the module that owns the presets, and the three
// readers take it from here. A fourth spelling added later gets the locator,
// the dispatcher and the editor at once.
export const STATS_BAND_ALIASES: Readonly<Record<string, string>> = {
  "topic-stats": "progress",
  "journal-totals": "totals",
};

// The current word first, then the superseded ones. Order matters to the two
// readers below: a locator wants the alternation, and a rename wants to know
// which spelling is the one to arrive at.
export const STATS_BAND_KEYWORD = "stats-band";
export const STATS_BAND_WORDS: readonly string[] = [
  STATS_BAND_KEYWORD,
  ...Object.keys(STATS_BAND_ALIASES),
];

// WHERE THE SECTION IS, WHATEVER IT IS SPELLED. Built here rather than typed
// into each catalogue, because a locator that knew only the new word would
// report the section ABSENT on every note composed before 4.46 and offer to add
// a second copy of what is already there — 4.16 §1's finding, and the reason
// two catalogues had the alternation written out by hand.
//
// A FRESH REGEXP PER CALL, because a `g`-less `RegExp` is still stateful enough
// to be worth not sharing, and these are built once per locate rather than per
// line.
export function statsBandProbe(): RegExp {
  return new RegExp(`^(?:${STATS_BAND_WORDS.join("|")})\\b`, "m");
}

// ── Resolving what a directive said ───────────────────────────────────────

// THE SCOPE'S OWN DEFAULT, for a bare `stats-band` and for an argument that
// names nothing.
//
// `progress` ON A CONTAINER AND `activity` EVERYWHERE ELSE, and the split is
// migration rather than taste: `topic-stats` is composed by the journal note
// catalogue onto container index notes and by nothing else, so a container's
// default has to be the preset that reproduces it. Above that level nothing was
// ever composed, so the default is the one preset every scope can answer.
export function defaultPresetFor(scope: StatScope): StatPreset {
  return BY_ID.get(scope === "container" ? "progress" : "activity")!;
}

// WHAT A DIRECTIVE'S ARGUMENT MEANS, INCLUDING WHEN IT MEANS NOTHING.
//
// AN UNKNOWN WORD FALLS BACK RATHER THAN REFUSING, and that is a decision this
// widget can make where `journal-chart` cannot. A chart naming a tracker that
// does not exist can draw nothing at all, so it refuses and lists what the vault
// has. A band's preset only chooses BETWEEN arrangements of numbers that are all
// available — so a typo costs a reader the arrangement they meant and never the
// page, and a refusal where a working band could be drawn is the state
// `confidence-trend` stays silent to avoid.
//
// A PRESET OUT OF ITS OFFERED SCOPE IS STILL HONOURED. `scopes` governs what a
// dropdown shows; a reader who typed `stats-band:totals` onto the homepage gets
// `totals`, and `measuresFor` drops every measure the vault scope cannot answer,
// which for that pair is all of them — so the band draws nothing rather than
// something false. Substituting a different preset behind their back would be
// the worse answer: it looks like it worked.
export function resolveStatPreset(arg: string, scope: StatScope): StatPreset {
  const id = arg.trim().toLowerCase();
  return BY_ID.get(id) ?? defaultPresetFor(scope);
}

// WHICH PRESETS A SCOPE IS OFFERED, for the dropdown each catalogue draws.
export function presetsFor(scope: StatScope): StatPreset[] {
  return STAT_PRESETS.filter((p) => p.scopes.includes(scope));
}

// The `{ value, label }` rows a `ChoiceQuestion` wants, so the four catalogues
// that ask this question build the list from one call rather than four maps.
//
// THE BLURB RIDES IN THE LABEL, because a `<select>` has one string per row and
// the difference between Progress and Summary is not legible from two nouns.
export function presetChoicesFor(
  scope: StatScope
): { value: string; label: string }[] {
  return presetsFor(scope).map((p) => ({
    value: p.id,
    label: `${p.label} — ${p.blurb.replace(/\.$/, "")}`,
  }));
}

// ── Slots: the argument as a list of cells ────────────────────────────────

// FOUR, AND IT IS `STAT_CELL_CAP` RATHER THAN A SECOND NUMBER. A slot is a cell,
// so how many slots there are and how many cells a band may draw are one fact —
// and two spellings of it is how the editor comes to offer a box whose answer
// the renderer throws away.
export const STAT_SLOTS = STAT_CELL_CAP;

const MEASURE_IDS = new Set(Object.keys(MEASURE_SCOPES));

// Is this word a measure — including a member of the per-kind family?
export function isMeasure(word: string): boolean {
  return MEASURE_IDS.has(word) || kindOfMeasure(word) !== null;
}

// ── AN ARGUMENT IS A PRESET OR A SLOT LIST, AND THEY CANNOT COLLIDE ───────
//
// Preset ids and measure ids are disjoint sets — asserted, because the whole
// grammar rests on it and a future preset called `notes` would silently become a
// one-cell band.
//
// THE ORDER OF THE THREE ARMS IS THE GRAMMAR:
//
//   every comma-separated token is a measure   -> a slot list, as typed
//   the whole string names a preset            -> that preset's measures
//   neither                                    -> the scope's own default
//
// The third arm is 4.46's rule unchanged and its reason is unchanged: a band's
// argument chooses BETWEEN arrangements of numbers that are all available, so a
// typo costs a reader the arrangement they meant and never the page.
//
// AN EMPTY SLOT IS DROPPED RATHER THAN DRAWN. `notes,,open` is two cells with
// nothing between them — the reader cleared the middle box — and a band with a
// hole in it would be the layout reporting a decision nobody made.
export function bandMeasures(arg: string, scope: StatScope): StatMeasureId[] {
  const raw = arg.trim();
  const slots = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const named =
    slots.length > 0 && slots.every(isMeasure)
      ? (slots as StatMeasureId[])
      : resolveStatPreset(raw, scope).measures;
  return named.filter((m) => scopesForMeasure(m).includes(scope));
}

// The argument text for a set of slots, as the editor writes it.
//
// THROUGH `joinParts` RATHER THAN `join(",")`, because that is what drops an
// empty TAIL: three answered boxes and a cleared fourth spells `a,b,c`, not
// `a,b,c,` — *"a directive that reads as though something went missing"*.
export function slotArgument(slots: readonly string[]): string {
  return joinParts(slots.map((s) => s.trim()), ",");
}

// What the four boxes show for an argument that is already in a note.
//
// A PRESET IS SHOWN AS THE MEASURES IT STANDS FOR, which is the whole of how a
// preset survives being demoted to shorthand: a Topic index carrying `progress`
// — or `topic-stats`, which resolves through it — opens with `kinds`, `rating`
// and `open` in the first three boxes, and touching any one of them writes the
// list out. A reader is never shown a word they cannot edit.
//
// PADDED TO `STAT_SLOTS`, because the editor draws a box per slot and an
// unanswered box is an empty string rather than a missing one.
export function slotsOf(arg: string, scope: StatScope): string[] {
  const filled = bandMeasures(arg, scope).slice(0, STAT_SLOTS);
  return Array.from({ length: STAT_SLOTS }, (_, i) => filled[i] ?? "");
}

// What a slot may be set to here, as a `ChoiceQuestion` wants its rows.
//
// THE TYPE IS OPTIONAL AND ITS ABSENCE IS A SCOPE, not a caller that forgot: the
// generic add-a-widget path holds no journal, and a vault-scoped band has no
// note types to count. Where a type IS held, its kinds are offered by name —
// which is the difference between "one per note type" and "how many Lessons".
export function slotChoicesFor(
  scope: StatScope,
  type?: JournalType | null
): { value: string; label: string }[] {
  const rows: { value: string; label: string }[] = [];
  const add = (value: string, label: string): void => {
    if (!scopesForMeasure(value).includes(scope)) return;
    rows.push({ value, label });
  };
  add("notes", "Notes — how many are here");
  add("kinds", "One per note type");
  for (const kind of type?.kinds ?? []) {
    add(kindMeasure(kind.id), `${kind.label} — how many`);
  }
  add("below", "What is below — one level down");
  add("rating", "Average rating");
  add("open", "Open tasks");
  add("last", "Last worked");
  add("totals", "Every quantity this journal totals");
  return rows;
}

// ── What a preset resolves to, here ───────────────────────────────────────

// THE MEASURES THIS SCOPE CAN ANSWER, in the preset's order.
//
// This is the release's central claim in one function: one preset, three scopes,
// three honest bands, and no branch in the caller. `Activity` on the journals
// dashboard keeps all four measures and `below` counts JOURNALS; on a Study
// Subject it keeps all four and `below` counts topics; on the deepest Topic it
// keeps all four and `below` finds nothing beneath, so the CALLER draws no
// fourth cell. The last of those three is not this function's business — a
// measure that is answerable in principle and empty in fact is a fact about the
// vault, and this file has no vault.
export function measuresFor(
  preset: StatPreset,
  scope: StatScope
): StatMeasureId[] {
  return preset.measures.filter((m) => scopesForMeasure(m).includes(scope));
}

// A JOURNAL WITH EXACTLY ONE NOTE KIND NAMES ITS NOTES AFTER IT.
//
// "3 notes" and "3 titles" describe the same set on Media, and the second is
// the better word — it is what the reader called the thing, and it is what
// `kind-table` and the create button beside this band already say. Where a
// journal has two kinds the word is genuinely "notes", because no kind's name
// covers the count.
//
// A DERIVATION, NOT A SPECIAL CASE, which is the only reason it is allowed:
// with one kind the two labels denote the same set, so nothing is being decided
// — the specific word is simply available. `journals-cards.ts` makes the same
// move for its fourth cell ("the rating where there is one, and the count
// otherwise") and states the same rule for it.
export function soleKindOf(type: JournalType | null) {
  return type && type.kinds.length === 1 ? type.kinds[0] : null;
}

// EVERY PRESET AS THE ARGUMENT IT STANDS FOR. 4.47.
//
// DERIVED FROM `STAT_PRESETS`, not typed out beside it: a preset IS a list of
// measures, and this is that list spelled the way the grammar spells one. Two
// copies would be a reader shown one arrangement and served another.
//
// WHAT IT IS FOR is the four boxes. A note carrying `stats-band:summary` — or
// `topic-stats`, which resolves through `progress` — has to open with the cells
// it is actually drawing in the four controls, and a whole word cannot be
// divided between them. See `SectionQuestionCommon.shorthand`.
export const STAT_PRESET_SHORTHAND: Readonly<Record<string, string>> =
  Object.fromEntries(
    STAT_PRESETS.map((p) => [p.id, p.measures.join(",")])
  );

// ── The four boxes a stats band is configured through ─────────────────────
//
// ONE QUESTION PER CELL, on the compound-argument grammar `level-index` has used
// since 4.16: `SectionQuestionCommon.part` says which piece of the one argument
// a question owns, `partsOf` reads a piece back and `withAnswers` composes the
// whole thing once. Nothing here is a new mechanism — 4.16 built it for two
// pieces and this is the first caller that wants four.
//
// THE LABELS ARE ORDINALS BECAUSE `fieldLabelOf` NAMES THE BOX FROM THEM. It
// takes the first word that is not an article, so "the first number" gives a box
// headed **First**. 4.46.0 shipped "which numbers to show" and got a box headed
// **Which**, which is recorded in that release's outcome as half the reason the
// control could not be found.
//
// EVERY ONE OPTIONAL, through `emptyLabel` — 4.46.1's corrected
// `questionIsRequired` doing its job for four questions instead of one. A band
// with two cells is a band a reader chose; three empty boxes must not hold the
// section hostage.
const ORDINALS = ["first", "second", "third", "fourth"] as const;

export function slotQuestions(
  scope: StatScope,
  type: JournalType | null
): SectionQuestion[] {
  const values = slotChoicesFor(scope, type);
  return ORDINALS.slice(0, STAT_SLOTS).map((word, at) => ({
    kind: "choice" as const,
    key: `slot${at + 1}`,
    label: `the ${word} number`,
    // WHERE THE ANSWER ALREADY IS. The directive this writes is
    // `stats-band:<a>,<b>,<c>,<d>`, so the answer is one piece of that line's
    // argument and the editor splices a span rather than re-composing the line.
    directive: STATS_BAND_KEYWORD,
    // THE OLDER SPELLINGS, so the boxes are drawn and the answers land on a note
    // written before the merge. 4.46.1's field, and the defect it exists for is
    // recorded there: without it the row shows the inert "set when added"
    // wording and an answer given anyway is dropped in silence.
    supersedes: STATS_BAND_ALIASES,
    // AND WHAT EACH PRESET WORD STANDS FOR, so a note that carries one opens
    // with its cells in the boxes rather than the word in the first box.
    shorthand: STAT_PRESET_SHORTHAND,
    part: { at, of: STAT_SLOTS, join: "," },
    values,
    // NOT REQUIRED, AND WHAT EMPTY MEANS DEPENDS ON WHICH BOX IT IS. The first
    // box empty is a band that falls back to the scope's own arrangement; a
    // later box empty is one cell fewer. Both are working directives, which is
    // the whole test `questionIsRequired` applies.
    emptyLabel: at === 0 ? "This page's own choice" : "Nothing",
    empty: "This build defines no stat measures.",
  }));
}

// ── Editing one cell of a band that is already on the page (4.48) ─────────
//
// THE CONTROL MOVED ONTO THE CELL. 4.47 asked the four questions above in the
// section editor, which drew four `<select>` boxes over a row of four cells —
// a model of the band beside the band. A cell now carries its own `⋯`, and
// what that menu does to the note is entirely these three functions: the DOM
// half decides which cell was clicked and the file half writes the line, and
// neither of them knows what a measure is.
//
// THEY TAKE AND RETURN THE FILTERED MEASURE LIST — `bandMeasures(arg, scope)`,
// which is what the band DREW — rather than the raw argument. A measure the
// scope cannot answer is already invisible on the page, and an edit that wrote
// it back would put a cell nobody can see between two they can.

/** Set one slot. Out-of-range does nothing, which is a cell that has gone. */
export function setSlot(
  measures: readonly string[],
  at: number,
  to: string
): string[] {
  if (at < 0 || at >= measures.length) return [...measures];
  return measures.map((m, i) => (i === at ? to : m));
}

// REMOVAL CLOSES THE GAP, which is why this is a list operation and not an
// answer of `""` to one question. `joinParts` drops an empty TAIL and cannot
// shift a hole out of the middle, so `a,,c` would be a band with a cell missing
// in the middle of it — the directive reading *as though something went
// missing*, which is the phrasing that rule was written in.
export function removeSlot(measures: readonly string[], at: number): string[] {
  if (at < 0 || at >= measures.length) return [...measures];
  return measures.filter((_, i) => i !== at);
}

// AND INSERTION IS AFTER THE CELL THAT WAS CLICKED, not at the end. The reader
// opened a menu on a particular cell; a new one appearing at the far end of the
// row is the answer to a question they did not ask.
export function insertSlot(
  measures: readonly string[],
  after: number,
  add: string
): string[] {
  const out = [...measures];
  out.splice(Math.min(Math.max(after + 1, 0), out.length), 0, add);
  return out.slice(0, STAT_SLOTS);
}

// PLACES WITH ANOTHER SLOT (4.49), which is the drag gesture and not a move.
//
// NOTHING IS INSERTED AND NOTHING IS REMOVED — `cell-move.ts`'s own words for
// its own swap verb, and the reason it is right here too: a band is a row of
// POSITIONS, capped at four and read across, so the other cells must be exactly
// where they were when two of them trade. `drop-onto.ts`'s move-aside is right
// for a list that grows and this is not one.
//
// EQUAL OR OUT OF RANGE IS THE IDENTITY, because a cell dropped on itself is the
// commonest drag there is. `cell-move.ts` catches the equal case in a guard of
// its own and needs to — overlapping RANGES would splice nonsense — where two
// trading positions do not: `out[a] = measures[a]` twice is the list it started
// with. A mutation run proved that by deleting the `a === b` half and staying
// green, which is 4.47 §4's rule again: **an equivalent mutant is a deletion,
// not a cleverer test.** The behaviour is asserted; the branch is gone.
export function swapSlots(
  measures: readonly string[],
  a: number,
  b: number
): string[] {
  const inRange = (i: number): boolean => i >= 0 && i < measures.length;
  if (!inRange(a) || !inRange(b)) return [...measures];
  const out = [...measures];
  out[a] = measures[b];
  out[b] = measures[a];
  return out;
}

// What "Add cell" adds, given no argument.
//
// THE FIRST MEASURE THIS SCOPE OFFERS THAT THE BAND IS NOT ALREADY SHOWING,
// because a menu that adds a second copy of the cell you opened it from has
// added nothing you can see. Null when the scope has nothing left to offer,
// and a null is a menu row that is not drawn.
export function nextMeasureFor(
  measures: readonly string[],
  scope: StatScope,
  type: JournalType | null
): string | null {
  const shown = new Set(measures);
  for (const row of slotChoicesFor(scope, type)) {
    if (!shown.has(row.value)) return row.value;
  }
  return null;
}

// The measure list as `withAnswers` wants it: one option per slot question.
//
// EVERY SLOT ANSWERED, INCLUDING THE EMPTY ONES. A partial write leaves the
// unanswered slots reading whatever the line already said, which after a
// removal is the cell that was just removed.
export function bandAnswers(measures: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < STAT_SLOTS; i += 1) out[`slot${i + 1}`] = measures[i] ?? "";
  return out;
}
