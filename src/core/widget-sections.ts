// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Every page widget, as a section — 4.12 §C.
//
// THE QUESTION THIS ANSWERS, AND THE ONE IT REFUSES TO ASK. ChronoAnvil draws 48
// directives and a reader could add about six of them, because a section is
// something a catalogue declares and a widget is a word you have to already
// know. The obvious fix is a second kind of row in the section window — a
// "widget row", with its own identity, its own removal path and its own pass
// over the file — and that is a second object doing a first object's job. This
// release was written because a section and a widget look alike and behave
// differently; answering it by adding a third thing that looks like both would
// have been the same mistake one level up.
//
// So a widget IS a section. One `FlatSection` per registry keyword, appended to
// the catalogue the model is built from, and every question the editor already
// knows how to ask is answered by machinery that already exists:
//
//   • `optIn` keeps it out of `composeFlatNote`, so no note the plugin writes
//     changes by a byte.
//   • `hasKnownExtent` is "renders one line", which every one of these does — so
//     a widget section is `loose`, can be cut out of a shared fence, and is a
//     legal column of a group.
//   • It is in `present()`, so it reorders through `desiredOrder` like anything
//     else. There is no "its position is set on the page".
//   • Its question names its own directive, so `withAnswers` splices the answer
//     in and `answerIn` reads it back — re-pointing a widget's argument after
//     the fact costs nothing.
//   • A hand-written `events` fence stops being reported as a foreign block and
//     becomes a row the reader can move and remove.
//
// WHY THIS IS ITS OWN MODULE AND NOT PART OF `note-sections.ts`. A test in
// `test/home-sections.test.ts` asserts that every line of that file mentioning
// `optIn` outside the declaration sits inside `composeFlatNote`'s body — the
// rule being that only the composer may ask, because `plan`, `apply`, `refusal`,
// `addable` and `present` are about the note in front of the reader. The rule is
// right and a generated literal carrying `optIn: true` would break it. So the
// generator lives where the rule does not reach, and `note-sections.ts` only
// calls it.

import { HEADER_PREFIX } from "./constants";
import { sectionOf, soleFence } from "./sections";
import { splitDirective } from "./directive-grammar";
import type { FlatSection } from "./note-sections";
import { joinParts } from "./section-model";
import type { SectionQuestion } from "./section-model";
import { WIDGETS } from "./widget-registry";
import type { WidgetNeed } from "./widget-registry";
import type {
  VaultLists,
  WidgetArg,
  WidgetArgVaultSource,
  WidgetChoice,
  WidgetSpec,
} from "./widget-registry";

// What marks a section id as a widget rather than a catalogue entry.
//
// A PREFIX RATHER THAN A FIELD ON `SectionView`. The prefix is imported rather
// than spelled at the call site so the rule has one home — the same way
// `questionIsRequired`, `idsOf` and `optionsFor` are asked rather than
// reimplemented.
//
// ── AND THE EDITOR NO LONGER ASKS (5.27) ─────────────────────────────
//
// This used to end "and this is the one place the editor learns anything about
// kinds", followed by a rejection: *"The alternative was `SectionView.family`,
// which three of the four models would never set, existing so that one
// `<select>` could group its options."* Both halves stopped being true in 5.26,
// and `SectionView.category` — a SUBJECT, not a kind — is now the field that
// groups the add list. `section-editor.ts` imports nothing from this file.
//
// THE PREFIX IS STILL THE RULE, and still has one home here. What changed is
// who asks: four model-layer callers (`journal-template.ts`, `journal-plan.ts`,
// `entry-sections.ts`, `section-model.ts`'s own note) and no window.
export const WIDGET_ID_PREFIX = "w:";

export const isPageWidgetId = (id: string): boolean =>
  id.startsWith(WIDGET_ID_PREFIX);

// Where this keyword's directive line starts in the text, or -1.
//
// MATCHES THE KEYWORD AS A DIRECTIVE, never as a substring, and `splitDirective`
// is the grammar the dispatcher itself reads with — so "what this section
// matches" and "what this line draws" are one question. A substring test would
// have `tasks-table` find `tasks:` and `topic-stats` find `topics-table`, which
// is the failure the homepage's own `diary` locator had against `diary-search`
// until 4.12 and is why that one now spells out what may follow it.
//
// RETURNS THE START OF THE LINE, not of the trimmed content. `cellLineIn` turns a
// `locate` answer into a line number by counting newlines before it, and its
// comment states that every `locate` in every flat catalogue is a `^`-anchored
// match. This keeps that promise by construction rather than by luck.
//
// FIRST MATCH ONLY, which is all a `locate` has ever been able to say — it is one
// anchor, not a span. What happens to a second fence holding the same keyword is
// decided in `parseFlatSections`, which as of 4.12 attributes an id to its first
// run and reports the rest as nobody's.
export const locateKeyword =
  (keyword: string) =>
  (text: string): number => {
    let at = 0;
    for (const line of text.split("\n")) {
      if (splitDirective(line.trim()).keyword === keyword) return at;
      at += line.length + 1;
    }
    return -1;
  };

// ── every widget may appear more than once ────────────────────────────
//
// AS MANY COPIES AS THE READER WANTS, AND THAT IS THE RULE FOR ALL OF THEM as
// of 4.56. It was three widgets under a `repeats` flag, and the flag is gone:
// `WIDGETS` holds only pure renders — anything owning a keyed span of the note
// body is excluded from it under `reason: "region"` — so a second copy is a
// second view and there is nothing left for the flag to protect. The registry's
// own comment carries the argument in full.
//
// SECTIONS DID NOT CHANGE AND MUST NOT. One per page, withheld from the picker
// once present, because a section persists content into a region keyed by its
// name and a second one would write over the first.
//
// WHAT THE ONE-ANCHOR RULE ACTUALLY SAYS, because this is the place it looks
// like it is being broken and is not. `parseFlatSections` gives a keyword's
// SECOND fence to nobody, and its comment says why in full: two runs answering
// to one id become one entry in a `Map`, and the first fence's content is then
// written into both slots — a reader's block silently replaced on Save.
//
// The rule is "one id, one run". Repeating widgets keep it exactly, by giving
// every occurrence an id of its own. Nothing downstream learns a new shape: a
// third `journal-card` line is a third section, located, planned, moved and
// removed by machinery that cannot tell it from any other.
//
// THE ORDINAL IS DERIVED AND NEVER STORED. `w:journal-card#2` means "the second
// `journal-card` line in this text" and is worked out afresh every time a window
// opens. So removing the first one renumbers the rest, and that is correct
// rather than a migration: there is no format to be stuck with, and nothing in
// any note ever held one of these strings.
//
// WITHIN ONE SESSION IT IS STABLE, which is the property that makes it safe:
// the editor plans and applies against the text it OPENED, so an id means the
// same line from the moment the window is drawn until Save writes it.
export const WIDGET_INSTANCE_SEP = "#";

// `w:journal-card#2` → `{ keyword: "journal-card", n: 2 }`, or null.
//
// PARSEABLE ON PURPOSE, and that is what lets an id resolve without having been
// enumerated. A reader may stage three new cards on a note that contains none;
// those ids are not in any list built from the text, and the lookup builds them
// from their own spelling instead. The alternative was generating a pool of
// spares deep enough for any session, which is a number nobody can pick.
export function instanceIdOf(
  id: string
): { keyword: string; n: number } | null {
  if (!isPageWidgetId(id)) return null;
  const at = id.indexOf(WIDGET_INSTANCE_SEP);
  if (at < 0) return null;
  const keyword = id.slice(WIDGET_ID_PREFIX.length, at);
  const n = Number(id.slice(at + 1));
  // `Number("")` is 0 and `Number("1x")` is NaN — both are ids nobody wrote, and
  // an ordinal below 1 is not a position in a list.
  if (!Number.isInteger(n) || n < 1) return null;
  // A KEYWORD THE TABLE HOLDS, AND THAT IS THE WHOLE TEST AS OF 4.56. It used to
  // also ask whether that keyword `repeats`; every one of them does now, so the
  // question that is left is whether the id names a widget at all.
  return WIDGETS[keyword] ? { keyword, n } : null;
}

export const instanceId = (keyword: string, n: number): string =>
  `${WIDGET_ID_PREFIX}${keyword}${WIDGET_INSTANCE_SEP}${n}`;

// Where the `n`th directive with this keyword starts, or -1.
//
// `locateKeyword`'s walk with a counter, in `locateKeyword`'s module, so the two
// cannot disagree about what a directive is — that function's own comment names
// itself "FIRST MATCH ONLY, which is all a `locate` has ever been able to say",
// and this is the same sentence with the restriction lifted.
export const locateNth =
  (keyword: string, n: number) =>
  (text: string): number => {
    let at = 0;
    let seen = 0;
    for (const line of text.split("\n")) {
      if (splitDirective(line.trim()).keyword === keyword) {
        if (++seen === n) return at;
      }
      at += line.length + 1;
    }
    return -1;
  };

// How many of this keyword's directives the text holds.
export const countKeyword = (keyword: string, text: string): number =>
  text
    .split("\n")
    .filter((line) => splitDirective(line.trim()).keyword === keyword).length;

// THE PIECES OF THIS WIDGET'S ONE ARGUMENT, however the table spelled them.
//
// `arg`/`arg2` is the shorthand for the common case and `args` is the general
// form (4.47). Normalising in ONE function is what makes the first a shorthand
// rather than a second mechanism — three call sites read this, and each of them
// used to test `spec.arg` directly, which is how a widget declaring `args` came
// to be offered with no questions at all and composed with no argument.
const argsOf = (spec: WidgetSpec): readonly WidgetArg[] =>
  spec.args ?? (spec.arg ? (spec.arg2 ? [spec.arg, spec.arg2] : [spec.arg]) : []);

// The line this section writes, with the reader's answer in it where there is one.
//
// AN ANSWER IS ONLY READ WHERE THE REGISTRY ASKED FOR ONE, which is `withAnswers`'
// own manners one level up — a question with no directive is skipped rather than
// guessed at. Without this a widget that declares no `arg` would still compose an
// argument if a hand-built `want` carried one, and `render` and `questions` would
// be able to disagree about whether this directive takes anything.
const renderLine = (
  keyword: string,
  spec: WidgetSpec,
  options?: Record<string, unknown>
): string => {
  const args = argsOf(spec);
  if (args.length === 0) return keyword;
  const piece = (key: string): string =>
    typeof options?.[key] === "string" ? (options[key] as string).trim() : "";
  // THE PIECES COMPOSE THE ONE ARGUMENT (4.16), through the same joiner
  // `withAnswers` uses to write one and `partsOf` uses to read one — so a
  // section ADDED with its answers and a section RE-POINTED afterwards spell the
  // line identically. Three spellings of one compound is how a control comes to
  // disagree with the file it wrote.
  //
  // THE KEYS ARE `arg`, `arg2`, `arg3`, … which is what `argQuestions` writes.
  const answer =
    args.length === 1
      ? piece("arg")
      : joinParts(
          args.map((_, i) => piece(i === 0 ? "arg" : `arg${i + 1}`)),
          spec.argJoin ?? "/"
        );
  return answer ? `${keyword}:${answer}` : keyword;
};

// The one question a widget's argument becomes.
//
// TWO KINDS, AND `questionIsRequired` DECIDES WHICH IS WHICH WITHOUT BEING TOLD.
// It answers `kind === "choice"`, and that is already the right answer for both:
// a folder question's empty state is the host note's own folder, which is a
// working directive, and a choice with no answer would compose a line that
// renders a refusal. So nothing in `section-model.ts` widens for this.
//
// AND THE REQUIRED CASE NEEDS NO GUARD ANYWHERE. `want` drops a row whose
// required question is unanswered, so `planFlatSections` emits no `add` op and
// `apply` is never handed a section it would render as a bare keyword. The row
// wears "needs …" instead. That is `holdPinned`'s posture reused rather than
// restated: the refusal belongs in the model, not in the one window that happens
// to ask politely.
//
// `directive` IS THE KEYWORD, which is what makes the answer writable and
// readable: `withAnswers` finds the span with `argSpanIn` — which returns an
// EMPTY span sitting where the argument would go for a bare directive, and
// `spliceArg` composes the `:` itself — and `answerIn` reads the reader's own
// line back through the same coordinates.
// What each `vault` source is called and what to say when it is empty.
//
// HERE RATHER THAN IN THE REGISTRY, which is the split that lets that file stay
// "a table with no functions in it": the registry names a source, and this says
// what a source resolves to and how to explain an absent one. The sentence names
// what is missing AND where to get it, which is `emptyCallout`'s rule and the
// standard `ChoiceQuestion.empty` was written to.
const VAULT_SOURCES: Record<
  WidgetArgVaultSource,
  { of: (v: VaultLists) => readonly WidgetChoice[]; empty: string }
> = {
  journals: {
    of: (v) => v.journals ?? [],
    empty:
      "No journals yet — turn on Study or add one in Settings → ChronoAnvil → Journals, and it can be shown here.",
  },
  logbooks: {
    of: (v) => v.logbooks ?? [],
    empty:
      "No logbooks yet — add one in Settings → ChronoAnvil → Logbooks, and it can be shown here.",
  },
  trackers: {
    of: (v) => v.trackers ?? [],
    // NAMES THE GATE, NOT JUST THE PLACE. A vault can have half a dozen
    // trackers and offer none of them here: a `select` has no arithmetic and a
    // journal tracker has no diary grain to read from, so `isChartable` refuses
    // both. A sentence saying only "add one" would send a reader who has six to
    // add a seventh and watch it not appear either.
    empty:
      "No trackers with numbers to summarise — add a scale, quantity or habit in Settings → ChronoAnvil → Trackers, and it can be shown here.",
  },
};

// Every question this widget's argument becomes. 4.16.
//
// ONE OR TWO, AND THE PAIR IS A COMPOUND rather than a second slot in the line:
// a directive has one argument, so two questions divide it. `part` carries which
// piece each owns and the separator between them, declared once on the registry
// entry so neither question knows the whole spelling — see
// `SectionQuestionCommon.part`, and `partsOf`, which is what reads one back.
const argQuestions = (
  keyword: string,
  spec: WidgetSpec,
  hostFolder: string | null,
  vault?: VaultLists
): SectionQuestion[] => {
  // TWO SPELLINGS, ONE LIST, AND NOTHING BELOW HERE CAN TELL THEM APART (4.47).
  // `arg`/`arg2` is the shorthand for the common case and `args` is the general
  // form; normalising here is what makes the first a shorthand rather than a
  // second mechanism.
  const list = argsOf(spec);
  if (list.length === 0) return [];
  if (list.length === 1) {
    return [argQuestion(keyword, list[0], hostFolder, vault)];
  }
  const join = spec.argJoin ?? "/";
  return list.map((a, i) => ({
    ...argQuestion(keyword, a, hostFolder, vault),
    // A KEY PER PIECE, because two answers cannot share one. `arg` stays the
    // first piece's key so a widget that grows a second question does not
    // rename the one it had — nothing reads these keys but the catalogue that
    // wrote them, and a rename is a saved layout that stops applying.
    key: i === 0 ? "arg" : `arg${i + 1}`,
    part: { at: i, of: list.length, join },
  }));
};

const argQuestion = (
  keyword: string,
  arg: WidgetArg,
  hostFolder: string | null,
  vault?: VaultLists
): SectionQuestion => {
  if (arg.kind === "folder") {
    return {
      kind: "folder",
      key: "arg",
      label: arg.label,
      directive: keyword,
      hostFolder,
      ...(arg.keywords ? { keywords: arg.keywords } : {}),
      ...(arg.emptyLabel ? { emptyLabel: arg.emptyLabel } : {}),
    };
  }
  // A VAULT ARGUMENT BECOMES AN ORDINARY CHOICE, and nothing downstream can tell
  // the two apart — which is the point. `questionIsRequired` answers on the
  // kind, the "needs …" pill is drawn from the same field, and `withAnswers`
  // splices the answer into the same directive. The only difference is where the
  // list came from, and that difference ends here.
  //
  // A MISSING `vault` IS AN EMPTY LIST, NOT A CRASH. The caller that holds the
  // plugin supplies it; a caller that does not — a journal template, a test
  // fixture — gets the sentence, which is the same posture `FolderQuestion`'s
  // null `hostFolder` already takes on the same surface.
  if (arg.kind === "vault") {
    const source = VAULT_SOURCES[arg.source];
    // KEYWORDS FIRST, AND THEY ARE NOT PART OF THE VAULT'S LIST (4.36). A
    // `vault` choice is required, so a widget whose EMPTY argument means
    // something — `journals-header` covers every journal — would otherwise be
    // unaddable without narrowing it. The keyword is an answer the plugin
    // defines rather than one the vault does, which is exactly the split
    // `WidgetArg`'s `choice` and `vault` variants already draw; offering it
    // ahead of the vault's own rows makes the widget's default the first pick.
    const have = source.of(vault ?? {});
    // AND A VAULT WITH NOTHING IN IT GETS NO KEYWORDS EITHER. The editor draws
    // the `empty` sentence when `values` is empty, so a lone "Every journal" row
    // would replace *"No journals yet — turn on Study or add one…"* with a
    // dropdown offering to cover every one of none. The keyword is a way of
    // naming the vault's whole list, and there is no list.
    const keywords = have.length ? (arg.keywords ?? []) : [];
    return {
      kind: "choice",
      key: "arg",
      label: arg.label,
      directive: keyword,
      values: [...keywords, ...have],
      empty: source.empty,
    };
  }
  return {
    kind: "choice",
    key: "arg",
    label: arg.label,
    directive: keyword,
    values: arg.values,
    // CARRIED WHERE THE REGISTRY DECLARED ONE (4.46), and omitted rather than
    // passed as undefined for the reason the folder branch above spells: the two
    // are the same field, and `questionIsRequired` reads its ABSENCE.
    ...(arg.emptyLabel ? { emptyLabel: arg.emptyLabel } : {}),
    // Unreachable as written — every fixed `choice` in the registry ships its
    // own answers and a test pins that each has at least two — but the field is
    // not optional and a sentence beats an empty string if one ever is. A
    // `vault` choice CAN be empty, and has its own sentence above.
    empty: "This widget has nothing to point at in this vault.",
  };
};

// The questions a keyword's argument becomes, for a CATALOGUE that composes that
// keyword itself. 4.58.1.
//
// ONE DECLARATION OF THE ARGUMENT, WHICH IS THE WHOLE REASON THIS IS EXPORTED.
// `time-grid` is a section on the surfaces whose catalogue writes it and a page
// widget everywhere else — the same directive, drawn the same way, offered
// through two doors. Its three sources are declared once, in `widget-registry.ts`,
// and a catalogue that re-typed them here would be the second table that starts
// disagreeing the day one of them gains a fourth. `SECTION_TITLES` and the
// registry are kept apart on purpose because they answer DIFFERENT questions;
// this is the same question asked from a second place, so it is the same answer.
//
// RETURNS AN EMPTY LIST FOR AN UNKNOWN KEYWORD rather than throwing, on
// `pageWidgetKeywords`' manners: a catalogue asking about a directive the
// registry has never heard of has nothing to ask, and a section with no
// questions is the ordinary case.
export function widgetQuestions(
  keyword: string,
  hostFolder: string | null = null,
  vault?: VaultLists
): SectionQuestion[] {
  const spec = WIDGETS[keyword];
  return spec ? argQuestions(keyword, spec, hostFolder, vault) : [];
}

// The directive line a catalogue composes for a page widget it offers as a
// section, with the reader's answers already in it.
//
// THE SAME PAIRING AS `widgetQuestions`, AND FOR THE SAME REASON. That exports
// the questions a catalogue asks; this exports the line those answers spell. A
// catalogue that asked through the registry and then wrote `time-grid:${answer}`
// by hand would have re-implemented `renderLine`'s joiner, and the day a widget
// grows a second argument the section door would compose a line the widget door
// would not — the exact drift both exports exist to prevent.
//
// AN UNKNOWN KEYWORD IS ITS OWN LINE, on `widgetQuestions`' manners again: a
// directive the registry has never heard of takes no arguments as far as
// anything here knows, and the bare keyword is what that composes to.
export function widgetLine(
  keyword: string,
  options?: Record<string, unknown>
): string {
  const spec = WIDGETS[keyword];
  return spec ? renderLine(keyword, spec, options) : keyword;
}

const widgetSection = (
  keyword: string,
  spec: WidgetSpec,
  // WHICH OCCURRENCE THIS IS, AND IT IS NEVER ABSENT (4.56). Until then a widget
  // that could not repeat had one section under a bare `w:<keyword>` id, and the
  // two forms had to be kept off the same fence by hand — see the comment
  // `pageWidgetSections` carried about generating both. One form, one rule.
  n: number
): FlatSection => {
  const isLogbook = keyword === "logbook";
  return sectionOf({
    id: instanceId(keyword, n),
    label: spec.label,
    blurb: spec.blurb,
    icon: spec.glyph,
    // THE REGISTRY'S, VERBATIM. A widget and a catalogue section on the same
    // subject land under one heading in the add list, which is the whole point
    // of the field being on the spec rather than derived from the keyword.
    category: spec.category,
    // NOTHING A WIDGET SECTION DOES IS LOCKED OR PINNED. It is there because a
    // reader added it, so it is theirs to move and theirs to remove.
    locked: false,
    optIn: true,
    // EVERY PAGE WIDGET REPEATS. The editor reads this to know that adding one
    // more is a legal thing to ask for.
    repeatable: true,
    // THE ONE WIDGET THAT WEARS A BAR, and the declaration says so by carrying
    // a `title` where the others carry none. `logbook` draws a list of items
    // and nothing that names which logbook it is — `logbook-sections.ts` makes
    // the argument at length on the page where it bites hardest.
    ...(isLogbook
      ? { title: `${HEADER_PREFIX}${spec.glyph} ${spec.label}` }
      : {}),
    // THE KEYWORD DOES THE REST: its line, with the reader's answers already in
    // it, and its arguments as questions.
    widget: keyword,
    // THE NTH LINE, ALWAYS — and for the single occurrence that is most pages,
    // this is `locateKeyword` exactly, since the first match is the 1st.
    nth: n,
  });
};

// The section for any instance id, built from the id alone.
//
// SO THAT AN ID NEED NOT HAVE BEEN LISTED. `sectionsFor` enumerates what a text
// contains plus one spare, and a reader staging three new cards in one session
// reaches past that. Rather than guess how deep a pool to generate, the lookup
// falls back to here — which is exact, because the id says what it is.
export function instanceSectionFor(id: string): FlatSection | null {
  const parsed = instanceIdOf(id);
  if (!parsed) return null;
  const spec = WIDGETS[parsed.keyword];
  return spec ? widgetSection(parsed.keyword, spec, parsed.n) : null;
}

// Every instance this text holds, plus the one that would come next.
//
// THE SPARE IS WHAT KEEPS THE WIDGET ADDABLE. `addableFlatSections` offers a
// section the text does not already have, so a widget whose every instance is
// present would vanish from the add list exactly when a reader wanted another.
// The spare's `locate` returns -1 — there is no nth line — which is precisely
// what "not present, therefore addable" means, so nothing had to learn a new
// rule to offer it.
//
// AND IT IS WHY A WIDGET NEVER LEAVES THE PICKER (4.56). One row per keyword,
// always: the instances a page holds are present and the spare behind them is
// not, however many there are. A section behaves the other way and should — it
// is withheld once the page has it, because a second one would claim the first
// one's region.
//
// TAKES THE KEYWORDS RATHER THAN THE CATALOGUE, so the probe that produced them
// runs once per model instead of once per read. See `pageWidgetKeywords`.
export function widgetInstances(
  keywords: readonly string[],
  text: string
): FlatSection[] {
  const out: FlatSection[] = [];
  for (const keyword of keywords) {
    const spec = WIDGETS[keyword];
    if (!spec) continue;
    const held = countKeyword(keyword, text);
    for (let n = 1; n <= held + 1; n++) out.push(widgetSection(keyword, spec, n));
  }
  return out;
}

// The next instance id for this widget that nothing has claimed.
//
// `taken` IS THE EDITOR'S STAGED ROWS, not the file's contents, and that is the
// difference that makes this a method rather than a number: the text says two
// cards exist, and a reader who has already added a third this session must get
// a fourth rather than the third again.
export function nextInstanceId(
  id: string,
  text: string,
  taken: readonly string[]
): string {
  const keyword = instanceIdOf(id)?.keyword ?? id.slice(WIDGET_ID_PREFIX.length);
  // ONE SET, NOT TWO TESTS. An id is claimed if a row holds it or if the file
  // already does — and those are the same fact for the editor, whose rows begin
  // as what the file contains. Asking them separately would be a gate behind a
  // gate: the second could stop being reachable and no test would notice.
  const claimed = new Set(taken);
  for (let n = 1; n <= countKeyword(keyword, text); n++) {
    claimed.add(instanceId(keyword, n));
  }
  for (let n = 1; ; n++) {
    const next = instanceId(keyword, n);
    if (!claimed.has(next)) return next;
  }
}

// Every page widget this catalogue has no opinion about, by keyword.
//
// THE DE-DUP IS DERIVED, NOT DECLARED, AND IT RUNS BOTH WAYS. A catalogue that
// already manages a keyword must not also be offered it as a widget, or the same
// fence answers to two ids — which `parseFlatSections` now resolves by silently
// dropping one, and which would put a duplicate in the reader's Add list either
// way. `locate` is a function, so the only honest way to know what it matches is
// to show it a line:
//
//   (a) DOES THE CATALOGUE CLAIM WHAT THIS WOULD WRITE? Render the bare
//       directive and ask every catalogue section to find it. This is the
//       question that matters when a section's `locate` is BROADER than its
//       `render` — an older spelling it still matches but no longer composes.
//       Stated honestly: no catalogue in the tree is like that today, so
//       removing this line leaves the shipped pages correct and only a synthetic
//       fixture in `test/widget-sections.test.ts` fails. It is kept because
//       `locate` is what decides which fence a section OWNS, and probing only
//       what a catalogue writes would make the de-dup depend on the narrower of
//       the two.
//
//   (b) WOULD THIS CLAIM WHAT THE CATALOGUE WRITES? Ask this section's own
//       `locate` about every line the catalogue composes. Direction (a) does not
//       see the Search note's `links:today,scopes#diary`, which lives INSIDE the
//       search fence and has no section of its own — so `w:links` would be
//       generated, would locate the composed note, and `present()` would report a
//       section the reader never added.
//
// BOTH DIRECTIONS, OR NEITHER IS ENOUGH. This was written with only (a) and the
// Search note found the hole immediately.
//
// ONCE PER MODEL, NOT AT MODULE LOAD. `flatNoteModel` is called when a window
// opens, the catalogues have single-digit lengths, and the alternative is a cache
// keyed on an array identity that `homeSections(diaryRoot)` deliberately rebuilds
// on every call. The probe reads `locate`, which is invariant in that parameter
// today — but "today" is exactly the kind of thing a cache turns into a bug three
// releases later.
//
// KEYWORDS RATHER THAN SECTIONS, AS OF 4.56, because a widget's sections are a
// question about a TEXT — how many of them it holds — and this half is a
// question about a CATALOGUE. They used to be one function because a
// non-repeating widget had a section that needed no text; nothing does now, so
// the split is along the line the two questions were always on. `widgetInstances`
// is the other half.
export function pageWidgetKeywords(
  catalogue: readonly FlatSection[],
  supplies: readonly WidgetNeed[] = []
): string[] {
  const composed = catalogue
    .flatMap((s) => {
      try {
        return soleFence(s.render()).lines;
      } catch {
        // A catalogue whose `render` needs an argument it was not given has
        // nothing to say here. Nothing in the tree does this; it is cheaper to
        // be indifferent than to require it.
        return [];
      }
    })
    .join("\n");

  const out: string[] = [];
  for (const keyword of Object.keys(WIDGETS)) {
    if (catalogue.some((s) => s.locate(keyword) >= 0)) continue;
    if (locateKeyword(keyword)(composed) >= 0) continue;
    // ── AND WHAT THIS SURFACE CAN ANSWER (5.26) ──────────────────────
    //
    // The two questions above are about the CATALOGUE — has this page already
    // claimed the keyword — and both were the whole of the rule until a door
    // was opened onto a leaf note. A diary entry claims almost nothing, so
    // every widget the registry has would have been offered on one, including
    // the two that cannot work on a note with no period.
    //
    // A DEFAULT OF "SUPPLIES NOTHING", which is deliberately the strict end.
    // Thirty of the thirty-two declare no need, so the default costs them
    // nothing; the two that do are withheld until a surface says otherwise, and
    // saying otherwise is one field on a spec. The other default would have
    // been every new surface silently offering whatever a future `needs` value
    // named, which is the failure this field exists to end.
    const need = WIDGETS[keyword].needs;
    if (need !== undefined && !supplies.includes(need)) continue;
    out.push(keyword);
  }
  return out;
}

// Both halves, for a caller holding the text already.
//
// THE MODEL DOES NOT USE THIS — it hoists `pageWidgetKeywords` out of the read
// path on purpose, which is the whole reason the two are separable. This is for
// everywhere else that just wants the answer, and it keeps "what widgets does
// this note offer" spelled once rather than at each call site.
export function pageWidgetSections(
  catalogue: readonly FlatSection[],
  text: string,
  supplies: readonly WidgetNeed[] = []
): FlatSection[] {
  return widgetInstances(pageWidgetKeywords(catalogue, supplies), text);
}
