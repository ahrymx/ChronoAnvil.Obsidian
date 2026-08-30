// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What every section catalogue can be asked, and the pieces each needs to
// answer.
//
// WHY THIS EXISTS
//
// Three catalogues — `journal-sections.ts`, `diary-sections.ts`,
// `entry-sections.ts` — were built to the same SHAPE and to no shared TYPE.
// Journals answer through `addableSections` / `detectSections` /
// `planSections`; the diary through `addableDiarySections` /
// `detectDiarySections` and `removableFrom` / `addSectionToNote`. The functions
// correspond one to one and have nothing in common a compiler can see.
//
// So an editor over all three either branches on surface at every call — three
// code paths through one modal, which is the shape that produced `isMonthly`
// and `cls == null` — or the interface gets extracted first. This is the
// extraction.
//
// THE RULE THIS INTERFACE EXISTS TO ENFORCE
//
//   The editor must never learn which surface it is on. If it asks, the
//   interface is wrong.
//
// Every method here is one an editor would otherwise have written a
// three-armed conditional for. Nothing here returns the surface, the grain,
// the journal type or the note kind, and no implementation exposes one.
//
// WHAT IS NOT HERE, DELIBERATELY
//
// Composition. A catalogue can also write a whole template from scratch
// (`composeEntryTemplate`, `composeDiaryDashboard`, `composeTemplate`), and the
// editor never wants that: it edits a file that exists. Putting compose on the
// interface would give the editor a method whose only correct use is to destroy
// the thing it is editing.

import {
  FRAME_KEYWORD,
  HEADER_KEYWORD,
  argSpanIn,
  hasSectionBar,
  isFrameLine,
  isHeaderLine,
  parseFrame,
  readArg,
  renameSoleKeyword,
  soleArgSpanIn,
  spliceArg,
} from "./directive-grammar";

// ── operations ────────────────────────────────────────────────────────
//
// MOVED HERE FROM journal-plan.ts, unchanged, and re-exported from there so
// every existing caller is untouched. It was always the general vocabulary —
// add, remove, move, keep, foreign are what a plan over ANY catalogue says —
// and it lived in the journal module for the accident of having been needed
// there first.

// `reconfigure` IS 3.15's, and it is a sixth value rather than a `keep`
// carrying a detail. The plan's whole justification is that it cannot drift
// from the action, and a section whose answer changed is one whose directive
// line Save rewrites — a preview saying *keep* over a write is exactly the
// silence this surface exists not to keep.
//
// It is also load-bearing rather than cosmetic. `changeCount` counts add,
// remove and move; the footer disables Save at zero; and all four `apply`
// implementations return null — "nothing to do" — on the same three kinds. Had
// this been a `keep` with a detail, a reader who changed an answer and nothing
// else would have got a disabled button reading "No changes" over a plan
// promising one. It is the same shape as `noteKind`, `TrackerSurface` and
// `isMonthly` before them: a distinction with more cases than its type can hold.
// `extend` IS 3.18's, and it is a seventh value for the reason `reconfigure`
// was a sixth: a section that is present and short of a piece is not a `keep`,
// and calling it one is the plan lying about a write.
//
// The case is `children` on a journal that gained a note kind. Its fence
// carries one header, button and table per kind, so a dashboard written before
// the kind existed is present, wanted, and missing a table — and until 3.18 the
// planner could only say `add`, which appends a SECOND copy of the whole
// section beside the short one. That is worse than the silence `reconfigure`
// was introduced to end, because it writes.
//
// Load-bearing rather than cosmetic, exactly as `reconfigure` is: `changeCount`
// counts it, so Save is enabled for a reader whose only change is a dashboard
// catching up, and `applySections` returns null — "nothing to do" — without it.
// `regroup` IS 4.8's, and it is an eighth value for the reason the sixth and
// the seventh were added: it is a write the plan would otherwise have to call
// something else.
//
// A section moving into or out of a row does not change WHICH sections the note
// has, or what order they are in — `moveOps` sees nothing and reports nothing —
// and it rewrites the note. Reported as a `keep` it would be the plan saying
// "unchanged" over a file that is about to be edited, which is the exact silence
// `reconfigure` was introduced to end. Counted, so Save is enabled for a reader
// whose only change is that two blocks became one.
export type SectionOpKind =
  | "add"
  | "remove"
  | "move"
  | "keep"
  | "reconfigure"
  | "extend"
  | "regroup"
  | "foreign";

export interface SectionOp {
  kind: SectionOpKind;
  // Null only for "foreign".
  sectionId: string | null;
  label: string;
  detail: string;
  // Set on "remove" when the section owns a region with text in it. The plan
  // KEEPS that text; this is what the confirmation reports.
  keepsContent?: { key: string; lines: number }[];
}

// ── a section, as a window over it needs one ──────────────────────────

// What the editor draws a row from.
//
// A PROJECTION, not a catalogue entry. `JournalSection`, `DiarySection` and
// `EntrySection` stay different types with different fields, because they
// describe genuinely different things — a journal section declares blocks, a
// dashboard section renders a fence, an entry section is a directive and its
// region. What a ROW needs is the same five facts from all three, so that is
// what crosses the seam.
export interface SectionView {
  id: string;
  label: string;
  blurb: string;
  // The glyph the row is tokened with. Journal sections have carried one since
  // the catalogue existed; the diary's two gained theirs when this interface
  // did, for the same reason journal sections have one — a row with no token
  // reads as a different list from the one two clicks away.
  icon: string;
  // Whether this section may be removed AT ALL, ignoring what is written in
  // it. `refusal` answers the question that depends on the note's contents;
  // this one is a property of the section, and the row needs it before the
  // reader has done anything, to decide whether to draw a remove control.
  removable: boolean;
  // Whether this section may be REORDERED. Added in 3.2 §4, when navigation
  // became the fixed top row of every diary surface.
  //
  // A SECOND FLAG RATHER THAN A SECOND MEANING FOR `removable`. 2.60.2 spent an
  // argument on the difference — the lock is on existence, not on order — and
  // collapsing the two now would erase the distinction rather than express the
  // new rule. `entry-header` is the case that proves they are different: it is
  // unremovable and it is also immovable, and the two facts have different
  // reasons (it is what an entry IS; it has nothing left in its band to trade
  // places with).
  //
  // Read by the editor to decide whether a row is a drag source, a drop target
  // and an arrow host. False makes the row inert to reordering rather than
  // making it refuse one — the same shape `group` already uses, where a rule
  // is expressed as data the model supplies rather than a check the editor
  // performs.
  movable: boolean;
  // The band of the surface this section sits in, or null where the surface
  // has only one.
  //
  // THE FIELD THAT KEEPS THE EDITOR FROM ASKING WHAT IT IS ON. A diary entry
  // has two bands — the structural fences above the rule and the widget fence
  // below it — and a section may not cross between them (see `fence` in
  // entry-sections.ts, which is a property rather than a position for exactly
  // this reason). A journal note and a diary dashboard have one band each.
  //
  // Expressed as data the model supplies rather than a rule the editor knows,
  // so the editor's reordering rule is "two rows may swap when their groups
  // match" — one sentence, no surface test, and it happens to be a no-op on
  // the two surfaces with a single band.
  group: string | null;
  // What this section cannot be rendered without an answer to.
  //
  // Absent — the healthy state, and true of every section but one — means the
  // catalogue can write this section's directive without asking anybody
  // anything.
  questions?: readonly SectionQuestion[];
  // Whether a page may hold more than one of these. 4.15 §4.
  //
  // WHAT THE EDITOR DOES WITH IT, AND ONLY THIS: it keeps offering the widget in
  // the add list after one has been staged. Everything else about a repeating
  // section — that each occurrence has its own id, that the ids are ordinals
  // re-derived from the text — is the model's, and this window never learns it.
  //
  // Absent means one, which is every section on every surface but one.
  repeatable?: boolean;
  // What this section's OWN line in the file already says, per question key.
  // 4.15 §4.
  //
  // THE MODEL READS IT BECAUSE THE MODEL LOCATED THE SECTION. The editor's own
  // read-back finds a directive in the whole file and refuses when it appears
  // more than once — the right answer for a window holding a file and no
  // extents, and the refusal 3.18 added after `header:` handed two boxes one
  // value. A repeating widget makes its directive plural on purpose, so that
  // refusal would take the selector off every card the moment a page had two.
  //
  // ABSENT WHERE THE MODEL CANNOT SAY, which is every model but the flat one and
  // every question whose directive is not the section's own anchor line. The
  // editor falls back to the read it already did, so nothing that worked stops.
  answered?: Record<string, string>;
}

// One question a section declares, and the answers this vault can give it.
//
// DECLARED BY THE MODEL, DRAWN BY THE EDITOR, READ BY THE CATALOGUE, and the
// editor never learns what any of it MEANS. `key` is a map key here and a
// property name there; `values` is a list some surface assembled out of its own
// vault. This layer carries all three and interprets none — the same contract
// `SectionChoice.options` has one level down, and for the same reason: the
// moment this module knows a key's NAME it has learned which surface it is on.
//
// ON THE VIEW RATHER THAN BEHIND A METHOD, which is where `group` and `movable`
// already are and for the argument those two made. A rule the editor would
// otherwise have to ASK about becomes data the model supplies, and the editor's
// version stays one sentence with no surface test in it. The sentence this one
// buys is:
//
//   a section may not be ADDED until every question it declares has an answer
//
// — true on all three surfaces, vacuous on the two that declare none, and the
// thing that stops the editor writing a directive it already knows is broken.
//
// IT IS NOT ASKED OF A SECTION ALREADY IN THE FILE, and that is a property of
// the editor rather than of this type. See `renderQuestions` in
// section-editor.ts: a kept section's directive line is copied out of the
// reader's file verbatim, so the answer stored in it is theirs and is not this
// window's to restate or to overwrite.
interface SectionQuestionCommon {
  // Which key the answer is written under in `SectionChoice.options`. Opaque
  // here; meaningful only to the catalogue that declared it.
  key: string;
  // The question, as a noun phrase, in the surface's own vocabulary — "a
  // journal to pull from". Read into a placeholder ("Choose …") and into a pill
  // ("needs …"), so it is written to sit inside a sentence rather than to be a
  // heading.
  label: string;
  // WHICH DIRECTIVE'S ARGUMENT THIS ANSWER IS WRITTEN INTO, and therefore where
  // it can be read back from. 3.15's whole subject, and it is a keyword rather
  // than a function.
  //
  // §2.2 asked for `readOptions(line) -> options`, the inverse of
  // `directive(ctx, opts) -> string`, and §9.3 pointed out that only one
  // catalogue in four HAS a `directive`: the other three emit blocks or
  // `{ fence, lines }`. An inverse per catalogue is three parsers to keep equal
  // to three writers, plus a round-trip test whose job is to notice when they
  // stop being equal.
  //
  // A keyword is the same fact stated as data. `core/directive-grammar.ts` finds
  // the span, every catalogue emits lines, and there is one parser rather than
  // four — so the pair cannot drift, because there is no second half to drift
  // from. Absent means nothing can read this answer back and the editor says so
  // rather than drawing a control over it, which is 3.0 patch 1's rule.
  directive?: string;
  // OLDER KEYWORDS THAT CARRY THIS SAME ANSWER, each mapped to what that
  // spelling MEANS. 4.46.1.
  //
  // WHY A QUESTION NEEDS THIS AND A LOCATOR ALREADY HAD IT. A catalogue that
  // merges two widgets says so three times: `claims` lists the words, `locate`
  // probes for any of them, and — until this field — the QUESTION named exactly
  // one. So a section was correctly found on a note written before the merge,
  // its row appeared, and its control did not: `answerInText` looks for the
  // named keyword's span, finds none, and the editor draws the inert *"set when
  // added"* wording over a question it could perfectly well have answered.
  //
  // AND THE WRITE WAS WORSE THAN THE READ. `withAnswers` finds the span the same
  // way, so an answer given on such a note was dropped without a word. 4.46.0
  // shipped both halves of that.
  //
  // A MAP RATHER THAN A LIST, because a superseded spelling is not merely
  // another name for the line — it is another name that already MEANS something.
  // A bare `topic-stats` draws the Progress arrangement and a bare
  // `journal-totals` draws Totals; reading either as "no answer" would show a
  // reader the wrong preset over a band that is drawing a different one.
  //
  // ANSWERING MIGRATES THE LINE. The write renames the keyword to `directive`
  // and then splices — see `renameSoleKeyword`, which states why that is the
  // only honest option and why it never runs unasked.
  supersedes?: Readonly<Record<string, string>>;
  // ARGUMENT WORDS THAT STAND FOR A LONGER ARGUMENT. 4.47.
  //
  // `supersedes` maps a KEYWORD to what that spelling means; this maps an
  // ARGUMENT to what it means, and the two compose — `topic-stats` means the
  // argument `progress`, and `progress` means `kinds,rating,open`.
  //
  // WHY A QUESTION NEEDS IT. A compound argument is divided between several
  // questions, and a SHORTHAND is not divisible: four boxes over `summary` would
  // put the whole word in the first box and leave three empty, over a band
  // drawing four cells. Expanding first is what lets a reader see what their
  // note is actually doing — and what they change is then written out in full,
  // so the shorthand is a thing the plugin composes and reads rather than a
  // thing a control has to represent.
  //
  // BOTH DIRECTIONS ARE DATA, and neither is a parser: a word is looked up or it
  // is left exactly as it was written.
  shorthand?: Readonly<Record<string, string>>;
  // Which PIECE of that directive's argument this answers, where more than one
  // question shares one directive. 4.16.
  //
  // NO WIDGET TOOK TWO ARGUMENTS UNTIL `level-index`, and the reason this is a
  // field rather than a second directive is that a directive HAS one argument —
  // `keyword:argument` is the whole grammar, and inventing a second slot would
  // be inventing a second grammar for one widget. What a directive's argument
  // can be is a compound, which the tree already does: `launcher:diary,search`
  // and `links:today,scopes#diary` are both several answers in one argument.
  //
  // `at` IS THE PIECE AND `join` IS THE SEPARATOR, declared on every question
  // that shares the directive so that no single one of them knows the whole
  // spelling. `withAnswers` gathers a directive's questions, puts each answer in
  // its place, and splices the composed argument ONCE — because two splices of
  // one span is the second overwriting the first, which is what this field
  // exists to stop.
  //
  // THE LAST PIECE TAKES THE REMAINDER, so a folder with slashes in it survives
  // being the second half of `study/Maths/Algebra`. That makes the split
  // head-and-tail rather than a general list, which is exactly what two pieces
  // need and is stated here rather than left for a caller to discover.
  //
  // ABSENT IS ONE QUESTION OWNING THE WHOLE ARGUMENT, which is every other
  // question in every catalogue.
  part?: { at: number; of: number; join: string };
  // What to say in place of the control on a section ALREADY IN THE FILE whose
  // answer cannot be read back, when the standing wording would be wrong.
  //
  // WHY THE MODEL SUPPLIES IT (3.18 follow-ups §2). The editor's fallback has
  // read *"set when added"* since 3.8, with a tooltip telling the reader to
  // remove the section and add it again. That is true of a question whose
  // answer is only ever written at compose time, and it is FALSE of a title:
  // a title is renameable in the note, on the header bar itself, and sending a
  // reader off to delete their Resources section to change the word above it
  // would be the window advising the destruction of a region full of their
  // attachments to achieve a rename.
  //
  // Supplied as data rather than branched on in the editor, which is where
  // `group`, `movable` and `empty` already are and for the argument those made:
  // the editor puts a string under a string and still does not know what a
  // title is, what a header is, or which catalogue asked. Absent keeps the
  // wording every existing question already gets.
  settled?: { text: string; hint: string };
}

// A question with a fixed list of answers, drawn as a `<select>`. The shape
// `SectionQuestion` has had since 3.8, now wearing its name.
export interface ChoiceQuestion extends SectionQuestionCommon {
  kind: "choice";
  // What may be answered, as the vault currently defines it.
  //
  // EMPTY IS A REAL ANSWER and is not the same as absent: it means this section
  // could be configured here and this vault has nothing to configure it with.
  // That is a sentence to write, not an empty dropdown to draw — the same
  // judgement `bridgeRefusal` makes when it lists what the vault has instead of
  // reciting the syntax.
  values: readonly { value: string; label: string }[];
  // What to say in place of the control when `values` is empty.
  empty: string;
  // WHAT EMPTY RESOLVES TO, WHERE EMPTY RESOLVES TO SOMETHING. 4.46.
  //
  // `FolderQuestion.emptyLabel` is the same field with the same meaning, and it
  // is spelled the same on purpose: absent is the ordinary case, and present
  // means the catalogue is naming a working default in the reader's words.
  //
  // AND IT IS WHAT `questionIsRequired` READS. That function used to answer from
  // the KIND — every choice required, every folder not — and the sentence under
  // it says why: *"a choice is required because an unanswered one composes a
  // block that looks broken, a folder never is because its empty state is a
  // working directive"*. Read that carefully and the kind was never the reason;
  // it was a proxy for the reason, and it held for exactly as long as no choice
  // had a working empty state.
  //
  // `stats-band` is the one that does. A bare directive resolves to the scope's
  // own preset — `Progress` inside a container, `Activity` above it — so
  // withholding the section until a reader picks one would be the window
  // demanding an answer the plugin already has. The field is how a catalogue
  // says so, and the derivation now reads the fact instead of the proxy.
  emptyLabel?: string;
}

// A question answered with a folder path, drawn as a text field with
// type-ahead. 3.15 §3.
//
// NOT A `choice` WITH EVERY FOLDER IN IT (§3.1): a mature vault has hundreds, a
// `<select>` gives no way to narrow them, the default is a RULE rather than a
// folder name and has nowhere in a list to live, and a folder that does not
// exist yet cannot be offered at all.
export interface FolderQuestion extends SectionQuestionCommon {
  kind: "folder";
  // What EMPTY resolves to on this host, for the placeholder — and, by being
  // absent, the answer to a question the editor is not allowed to ask.
  //
  // THE MODEL'S SILENCE IS THE SURFACE TEST (3.15 §10.9). A journal TEMPLATE is
  // composed once and used in every folder of its level, so it has no host
  // folder and a path typed into one would be written literally into every note
  // made from it afterwards — the failure `journal-sections.ts` already declined
  // to build when it chose not to interpolate `{{folder}}`. The caller that
  // opened the editor knows which it has: `section-insert.ts` holds a real note
  // and passes its parent, the settings rail holds a template and passes null.
  //
  // Null therefore leaves the question inert with the existing wording, and the
  // editor never learns what surface it is on — it draws a control when the
  // model gave it something to draw one with.
  hostFolder?: string | null;
  // What to CALL the empty state, where "this note's folder" is not what empty
  // means. 4.16.1.
  //
  // `hostFolder` answers "which folder is the fallback" and every question in
  // the plugin but one has the same answer to "…and what is that called": the
  // note's own. `level-index`'s second piece falls back to the JOURNAL named in
  // its first piece — a sibling answer, which is not a path this question can be
  // handed when it is built, because the reader has not picked it yet. So the
  // catalogue supplies the WORDS rather than the path, and the control draws
  // them in place of its own. Absent is the ordinary case.
  emptyLabel?: string;
  // Answers that are not paths. `journal-search` and `review-queue` route
  // through `journalFolderScope`, whose grammar has three states rather than two
  // (3.15 §9.1) — and the third, `all`, is a value with a name rather than a
  // rule with none, so it is a suggestion the catalogue supplies and the control
  // shows by its label. `tag-index` and `tasks-table` declare none and therefore
  // cannot be offered one, which is the grammar they actually have.
  keywords?: readonly { value: string; label: string }[];
}

// A question answered with free text, written into a directive's argument as-is.
// 3.18 §3.
//
// THE SECTION'S OWN TITLE, and today that is all it is used for. `path` and
// `resources` have honoured a `label` override since the override existed
// (`headerBar(opts?.label ?? "🧭 Path", …)`), and nothing ever drew a control
// for one — the override could only arrive from a preset declared in code or
// from a saved layout. This is the control.
//
// NOT A `choice` WITH THE CATALOGUE'S DEFAULT IN IT. There is no list: a title
// is whatever the reader wants it to be, and the default is a string the
// catalogue supplies rather than an option to pick.
//
// THE EMOJI IS PART OF THE STRING. `headerBar("🧭 Path")` is one label, not a
// glyph and a name, so the control edits the whole thing and a reader who wants
// no emoji can delete it. Nothing has to learn to split it.
export interface TitleQuestion extends SectionQuestionCommon {
  kind: "title";
  // What the header reads when the reader has not set one — shown in the
  // placeholder, so the control states the default rather than pre-filling it.
  // Pre-filling would write the catalogue's own title into the note as though
  // the reader had chosen it, and then a change of default could never reach a
  // file again.
  placeholder: string;
}

// Whether this section is drawn as a SECTION or as a bare WIDGET. 4.59.0.
//
// THE FOURTH KIND, AND THE FIRST THAT IS NOT ABOUT A DIRECTIVE'S ARGUMENT. The
// other three answer "what should this section point at"; this one answers
// "what should this section BE", and the difference is one line in the fence.
// A section carries a `header:` bar — a title, a chevron, a fold. A widget
// carries none, and that absence is not cosmetic: `isSectionFence` refuses a
// fence that titles itself as a column of a group, because `layOutRow` inserts
// the group at the first cell child and a bar is not cell content — so the bar
// would render BELOW the group it was supposed to title. A section cannot be
// grouped. A widget can.
//
// SO THE TOGGLE IS THE HONEST WAY TO OFFER BOTH. The alternative considered was
// a separate widget entry beside the section, which on a dashboard whose
// summary cannot be removed would mean two summaries on one page — and on a
// page where it could, two rows in the picker that draw the same directive and
// differ by a line the reader cannot see. One row, one directive, two forms.
//
// NOT A `frame:` MODIFIER, though the neighbourhood is the same. `frame:
// section` withholds the block's card and wraps the children in a fold of their
// own; the period summary's card IS the summary — `.ca-journal-overview-card`
// carries its background, its border and the inset every band inside it bleeds
// against — so the section form has to keep the card and add a bar to it. The
// modifier cannot express that, and widening it to would make a value that
// means "no card" sometimes mean "card".
export interface FormQuestion extends SectionQuestionCommon {
  kind: "form";
  // The line that makes this a section. Written in when the answer is
  // `SECTION_FORM`, taken out when it is `WIDGET_FORM`.
  //
  // THE CATALOGUE'S OWN STRING, so this file never composes a title. It is the
  // line the catalogue would have rendered anyway — see the summary section in
  // `diary-sections.ts`, which passes the same expression to both.
  bar: string;
  // What to call each side of the toggle, in the surface's own words. The
  // control is a checkbox, so `widget` is what ticking it means.
  section: string;
  widget: string;
}

// The two answers a `FormQuestion` takes. Strings rather than a boolean because
// `SectionChoice.options` is `Record<string, unknown>` read as strings
// everywhere — a fourth shape through that plumbing would be a fourth thing for
// `withAnswers`, `answersOn` and the editor's `shownAnswer` to agree about.
export const SECTION_FORM = "section";
export const WIDGET_FORM = "widget";

// Standard FormQuestion builder for sections that can also be drawn as widgets.
export function formQuestion(
  bar: string,
  directive?: string
): FormQuestion {
  return {
    kind: "form",
    key: "form",
    label: "how this is drawn",
    directive: directive ?? (bar.startsWith("frame:") ? FRAME_KEYWORD : HEADER_KEYWORD),
    bar,
    section: "A section of its own, with a foldable bar",
    widget: "Show as a widget, so it can sit in a row",
  };
}

// Which form a fence is written in: it is a section if it titles itself.
//
// ASKED OF THE FENCE RATHER THAN OF THE ANSWER, which is what makes the read
// survive a rename. `attachHeaderRename` rewrites the bar's title in place, so
// a read that compared the line against `FormQuestion.bar` would report a
// renamed section as a widget and then, on the next save, write the catalogue's
// own title back over the reader's. The question is whether there is a bar at
// all, and `hasSectionBar` is the plugin's one answer to it.
export function formOf(lines: readonly string[]): string {
  return hasSectionBar(lines) || parseFrame(lines).frame === "section"
    ? SECTION_FORM
    : WIDGET_FORM;
}

// The form of the fence holding the directive at `line`.
//
// WALKS BACK TO THE OPENING FENCE rather than taking a run from the caller,
// because the two callers have different things in hand — `answersOn` has an
// offset into the whole file and `withAnswers` has one chunk's lines — and the
// question is about the BLOCK either way. A directive that is in no fence has
// no bar and cannot gain one, which is a widget by the same definition.
export function formAt(lines: readonly string[], line: number): string {
  let open = -1;
  for (let i = Math.min(line, lines.length - 1); i >= 0; i--) {
    if (lines[i].startsWith(FENCE_MARK)) {
      open = i;
      break;
    }
  }
  if (open < 0) return WIDGET_FORM;
  const body: string[] = [];
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].startsWith(FENCE_MARK)) break;
    body.push(lines[i]);
  }
  return formOf(body);
}

const FENCE_MARK = "```";

export type SectionQuestion =
  | ChoiceQuestion
  | FolderQuestion
  | TitleQuestion
  | FormQuestion;

// Whether a section may be composed without an answer to this.
//
// THE DIFFERENCE §4 SAID THE MODEL MUST CARRY. The bridge's refusal is
// load-bearing: an unconfigured target renders a block that looks broken, so a
// section with no answer is not added at all. A folder question cannot be in
// that state — empty is the host note's own folder, which is a working
// directive and the one every journal index ships — so a folder row that has
// been touched by nobody is answered, not waiting.
// What to call this question's box, when it is drawn as a field. 4.15 §2.
//
// DERIVED FROM `label`, NOT DECLARED BESIDE IT. Every question already carries a
// noun phrase written to sit inside a sentence — "a journal to pull from", "the
// folder to collect tasks from" — and its head word is the name of the box. A
// `fieldLabel` on `SectionQuestionCommon` would be a second string saying the
// same thing in fewer words, in four catalogues, with nothing to keep the two
// agreeing; this window is the only place both would ever be read.
//
// HERE RATHER THAN IN THE EDITOR, beside `questionIsRequired` and for its
// reason: it is a rule about what a question IS, the editor is where rules are
// asked rather than restated, and a pure function in this file is one a test can
// call instead of grepping for.
//
// THE ARTICLE COMES OFF because the field's name is a noun, not a phrase: "the
// folder to review" is how you ask and "Folder" is what the box is called. A
// label with no article — one somebody writes later — is left exactly as its
// first word.
export function fieldLabelOf(q: SectionQuestion): string {
  const words = q.label.trim().split(/\s+/);
  const head = /^(the|a|an)$/i.test(words[0]) ? words[1] : words[0];
  if (!head) return q.label;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

// What a file already says for one question, or null when the directive it
// names is absent — or present more than once.
//
// HOISTED OUT OF `SectionEditorModal.answerIn` IN 4.29, unchanged in what it
// does and in the care it takes. It was a private method on the window, and
// 4.29 needs the same read from a second place: saving a page as a grain's
// default has to carry the reader's answers with it, or the save would quietly
// reset a bridge they had pointed at a journal kind — a loss at the exact
// moment they asked to keep something.
//
// AMBIGUITY IS AN ABSENT ANSWER, NOT THE FIRST ONE (3.18 follow-ups §2). The
// original comment is worth keeping whole: `header:` is structural and repeats
// once per section, so Study's Topic index carries six and `argSpanIn` would
// hand two different boxes the same value — the first header in the file. An
// answer that cannot be told apart from another section's is one this must not
// claim to have read. `soleArgSpanIn` states exactly that rule.
export function answerInText(text: string, q: SectionQuestion): string | null {
  // A FORM IS NOT AN ARGUMENT ANYWHERE (4.59.0), and this read is over the whole
  // file rather than one section's fence, so it has nothing to answer from. Its
  // callers fall back to the model's own `answered`, which is where `formAt`
  // puts the answer — see `answersOn`.
  if (q.kind === "form") return null;
  if (!q.directive) return null;
  const lines = text.split("\n");
  const span = soleArgSpanIn(lines, q.directive, q.part?.join);
  if (span) return expandShorthand(q, readArg(lines, span));
  // A SUPERSEDED SPELLING ANSWERS ITSELF (4.46.1). The reader's line says
  // `topic-stats`, the question names `stats-band`, and the answer is neither
  // absent nor whatever that line's argument happens to be: it is what the old
  // word MEANS. See `SectionQuestionCommon.supersedes`.
  //
  // STILL SOLE. `soleArgSpanIn` is asked for each older word in turn, so a note
  // carrying two of one spelling reads as unanswered exactly as it would on the
  // current one — the ambiguity rule this function already follows, applied to
  // the words it has just learned.
  for (const [word, means] of Object.entries(q.supersedes ?? {})) {
    if (soleArgSpanIn(lines, word)) return expandShorthand(q, means);
  }
  return null;
}

// A shorthand word replaced by what it stands for, or the text untouched.
//
// TRIMMED FOR THE LOOKUP AND RETURNED WHOLE, because a reader may have typed a
// space after the colon and a shorthand that missed on `" progress"` would show
// them an empty control over a working band.
function expandShorthand(q: SectionQuestion, argument: string): string {
  return q.shorthand?.[argument.trim()] ?? argument;
}

// What a file already says for each of these questions, per question key.
//
// ONE READER FOR BOTH SHAPES. `answerInText` answers for a question that owns a
// whole argument; a question that owns a PIECE needs the same read and then
// `partsOf`, which is the only thing that knows where one piece ends. Written
// once here because three models want it and `note-sections.ts::answersOn`
// already had a private copy for the flat surfaces — that copy answers a
// different question (which LINE, for a widget that repeats) and keeps its own
// body; this is the one the journal catalogue needed and did not have.
export function answersInText(
  text: string,
  questions: readonly SectionQuestion[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const whole = answerInText(text, q);
    if (whole === null) continue;
    out[q.key] = q.part
      ? (partsOf(whole, q.part.of, q.part.join)[q.part.at] ?? "").trim()
      : whole;
  }
  return out;
}

export function questionIsRequired(q: SectionQuestion): boolean {
  // THE RULE IS "HAS THIS QUESTION A WORKING EMPTY STATE", and until 4.46 it was
  // spelled as "is this a choice", which is a proxy that held while no choice
  // had one.
  //
  // A title is never required: unanswered means the catalogue's own heading,
  // which is a working directive and the one every shipped template carries. A
  // folder is never required: empty is the host note's own folder, the spelling
  // every journal index ships. A choice is required unless it NAMES what empty
  // means — see `ChoiceQuestion.emptyLabel`, which is the catalogue asserting
  // that a bare directive works, in the reader's words, in the control.
  return q.kind === "choice" && q.emptyLabel === undefined;
}

// ── what a caller asks for ────────────────────────────────────────────

// One section, and whatever it needs to know to render itself.
//
// WHY AN ID WAS NOT ENOUGH. Until 3.8 `plan` and `apply` took `string[]`, and
// that was right while every section rendered the same directive every time.
// It stops being right at the first section whose interesting decision is made
// by the reader: "From the journals" has to know WHICH journal kind to pull,
// and there was nowhere between the row the reader ticked and the catalogue
// that renders the directive for "Meals" to travel.
//
// NOT AN ID THAT CARRIES AN ARGUMENT. `bridge-notes:meal` as an id was the
// cheap alternative and it is the one that breaks everything an id is for:
// `present()` returns ids, `refusal(sectionId, …)` takes one, a saved layout
// names them, and `longestCommonSubsequence` diffs them. An id with an
// argument has an unbounded space, so a saved variant would silently stop
// matching the day a reader renamed their journal kind — and the move planner
// would read a rename as a remove plus an add.
//
// So the id stays exactly what it was, and the options ride beside it.
//
// OPAQUE TO THIS MODULE, and that is a rule rather than an accident. Nothing
// here reads a key out of `options`; it is carried and handed to the catalogue
// that understands it. The moment this layer knows a key name it has learned
// which surface it is on, which is the one thing the header forbids.
export interface SectionChoice {
  id: string;
  options?: Record<string, unknown>;
}

// A bare id IS a choice — the one with no options.
//
// Accepting both is not a mode flag with half its fields inapplicable (the
// shape 2.55 §3 removed and 2.56 §4.3 declined). It is one type with a
// shorthand: every caller that had nothing to say about options said it by
// passing a string, and none of them had to be rewritten to say the same thing
// at greater length. The property the roadmap asked to preserve — *an id is
// stable; its options are not part of it* — is exactly what this spelling
// states.
export type SectionWant = string | SectionChoice;

export function asChoices(want: readonly SectionWant[]): SectionChoice[] {
  return want.map((w) => (typeof w === "string" ? { id: w } : w));
}

export function idsOf(want: readonly SectionWant[]): string[] {
  return want.map((w) => (typeof w === "string" ? w : w.id));
}

// The options for one id, or undefined. Undefined rather than `{}` so a
// catalogue can tell "the reader chose nothing" from "the reader chose the
// empty set", and so `?? catalogueDefault` keeps working.
export function optionsFor(
  want: readonly SectionWant[],
  id: string
): Record<string, unknown> | undefined {
  for (const w of want) {
    if (typeof w !== "string" && w.id === id) return w.options;
  }
  return undefined;
}

// ── the interface ─────────────────────────────────────────────────────

export interface SectionModel {
  // Everything this surface offers, in catalogue order. The row labels come
  // from here.
  //
  // NOT IN THE 3.0 PLAN'S LIST, which named five methods. The editor needs a
  // sixth because a row for a section already in the file has to be drawn with
  // that section's label, icon and lock — and `addable` by definition excludes
  // exactly the sections the file already has. The plan's five would have sent
  // the editor back to `findSection`, which is the journal catalogue's, which
  // is the branch this interface exists to remove.
  // THE TEXT IS OPTIONAL, AND ONLY ONE MODEL READS IT (4.15 §4). A surface with
  // a repeating widget has one section per occurrence, so what it offers is a
  // question about a note rather than about a catalogue. Every other method here
  // already took the text; this one did not, and it is the only reason the flat
  // model could not simply answer.
  //
  // Omitting it is the answer this method has always given — the catalogue and
  // the widgets, with no instances — which is what the three models that cannot
  // repeat return either way.
  sections(text?: string): SectionView[];

  // Which of them this text already contains, in the order they appear in it.
  present(text: string): string[];

  // What could still be added: offered here, and not already present.
  addable(text: string): SectionView[];

  // Why this section cannot be removed from THIS text, or null if it can.
  // Two questions in one answer, in a fixed order: locked first, then holding
  // the reader's writing. See entryRemovalRefusal for the argument about the
  // order — telling someone to clear a region before removing a banner that
  // was never going anywhere sends them to do pointless work.
  refusal(sectionId: string, text: string): string | null;

  // What changing this text's sections to `want` would do, named before
  // anything is written.
  plan(text: string, want: readonly SectionWant[]): SectionOp[];

  // The text with `want`'s sections, or null if nothing would change.
  //
  // NULL FOR NO CHANGE is `applyLayout`'s and `applySections`' convention and
  // is what makes idempotence structural rather than claimed: a second call has
  // nothing left to return. On the diary side it also matters directly — mtime
  // is the source of truth for what is stale, so a rewrite that changes nothing
  // still costs something.
  apply(text: string, want: readonly SectionWant[]): string | null;

  // ── rows, where a surface has them (4.8 §2) ─────────────────────────
  //
  // OPTIONAL, AND THAT IS THE WHOLE OF THE SEAM. A block holding more than one
  // section is something only a flat note composes — `FlatSection.row` is the
  // field that makes one — so the other three models implement neither of
  // these and the window draws the list it always drew. This is `group` and
  // `handEdited`'s shape once more: a surface fact arrives as data or does not
  // arrive, and nothing in the editor asks which surface it is on.
  //
  // WHY THE EDITOR COULD NOT SAY THIS BEFORE. It learned about shared blocks
  // only in order to REFUSE — *"X is in one block with Y and moves with it.
  // Split the block to move them apart"* — and there was nowhere to split it.
  // The refusal named an operation the window did not have.
  // ── a widget a page may hold more than one of (4.15 §4) ─────────────
  //
  // The id to stage for another copy of `id`, given what is already claimed.
  //
  // A METHOD RATHER THAN THE EDITOR SPELLING ONE. An instance id encodes which
  // occurrence it is, and the editor must not learn that encoding: it already
  // learns exactly one thing about ids — `isPageWidgetId` — and
  // `widget-sections.ts` argues at length that this is the smallest departure
  // from `SectionView`'s discipline available. A second would end the argument.
  //
  // `taken` IS WHAT THE WINDOW IS HOLDING, not what the file contains, and the
  // difference is the whole reason it is a parameter: the text says two cards
  // exist, and a reader who has already staged a third this session must be
  // given a fourth rather than the third again.
  //
  // OPTIONAL, so a model with nothing repeatable implements nothing — the shape
  // `blocks` and `regroup` already set.
  instanceOf?(id: string, text: string, taken: readonly string[]): string;

  blocks?(text: string): BlockView[];

  // The text with its sections grouped into these blocks, or null if nothing
  // would change. `blocks` is a partition of the note's sections in the order
  // they should end up in, which is exactly what `blocks()` returns.
  // `pages` names the sections that begin a page of their block — the `tab`
  // lines, in the same terms `blocks` uses for the fences. Optional so a model
  // that has no pages, and every caller written before they existed, keeps its
  // behaviour exactly: absent means "leave the page boundaries alone", which is
  // not the same as an empty list ("this note has none"), and conflating the two
  // would make a Save on a surface that cannot page delete the pages of one that
  // can.
  regroup?(
    text: string,
    blocks: readonly (readonly string[])[],
    pages?: readonly string[]
  ): string | null;
}

// One block of a note, as the editor needs it.
export interface BlockView {
  // The sections in it, in file order. One of these per block, including the
  // blocks holding a single section — the editor draws a card only where there
  // is more than one, but it needs the whole partition to change it.
  ids: string[];
  // Which of them can be taken out on their own.
  //
  // NOT EVERY MEMBER CAN. Cutting a section out of a shared fence means knowing
  // where its lines END, and a section's `locate` is one anchor rather than a
  // span — so a section that renders two lines could only be bounded by
  // guessing, and guessing wrong deletes a line the reader typed. The plan has
  // refused exactly this since 4.2 (`hasKnownExtent`); this is the same rule
  // said forward, so the editor can offer the split where there is one.
  loose: string[];
  // Which of them can be a COLUMN of a group at all — 4.12 §A.
  //
  // A SECOND FIELD BECAUSE IT IS A SECOND QUESTION, and the two are independent
  // in both directions. `loose` asks *can this leave the block it is in*;
  // `column` asks *is it the kind of thing a column is*. A titled section alone
  // in its fence is loose and is not a column. A one-line section sharing a
  // fence with two others is a column and is not loose.
  //
  // THREE REFUSALS ARRIVE AS ONE FIELD, which is the whole reason it is computed
  // in the model rather than assembled in the window: the page head (its fence
  // holds `title`), a block holding two widgets (nobody has been asked which
  // column they go in), and a fence that draws its own title bar (its bar would
  // render below the group it titles). The editor asks one question and gets one
  // answer, and none of the three reasons is spelled there.
  column: string[];
  // Which of them begin a PAGE of this block rather than a column of the page
  // before it — 4.34.2, and the `tab` lines the fence already carries.
  //
  // THE EDITOR HAS TO SEE WHAT THE FILE SAYS BEFORE IT CAN CHANGE IT. Without
  // this, opening the window on a note that already has pages would show one
  // undivided group, and the first Save would flatten every page the reader had
  // made — a window that silently discards what it could not display, which is
  // the failure the stored `plural` and `variants` each cost a release.
  //
  // NEVER THE FIRST ID: the `row` line opens page one, exactly as it opens the
  // first column, so a block's opener cannot also be a page break.
  pages: string[];
}

// ── answers, in the note ──────────────────────────────────────────────

// Which sections in `want` are already in the file AND carry options.
//
// THE SIGNAL IS THE PRESENCE OF `options`, NOT A COMPARISON (3.15 §10.9).
// Comparing a composed line against the reader's would make the editor a
// formatter — it would "correct" a spelling nobody asked it to touch, which is
// §2.3's whole prohibition. So the window says what it changed: the editor
// attaches options to a settled row only when its control was touched
// (`SectionEditorModal.dirty`), and everything downstream reads that as the
// answer having moved.
//
// A section being ADDED carries options too and is not reconfigured — it is
// composed, by `directive`/`render`, with the answers in hand.
export function reconfigured(
  present: readonly string[],
  want: readonly SectionWant[]
): string[] {
  const here = new Set(present);
  return want
    .filter((w): w is SectionChoice => typeof w !== "string")
    .filter((w) => here.has(w.id) && w.options !== undefined)
    .map((w) => w.id);
}

// A section's lines with each answered question spliced into the directive it
// names, and nothing else touched.
//
// EVERY CATALOGUE EMITS LINES, which is why this can be shared where an inverse
// of `directive()` could not be (§9.3). A question with no `directive`, or one
// whose directive is not in these lines, is skipped rather than guessed at.
// A compound argument, split into the pieces its questions answer. 4.16.
//
// HEAD AND TAIL, NOT A LIST, and the last piece takes everything left — so
// `study/Maths/Algebra` is the journal `study` and the folder `Maths/Algebra`
// rather than three pieces, two of which nobody asked for. See
// `SectionQuestionCommon.part`.
//
// ONE FUNCTION, TWO READERS, which is the property that matters more than the
// six lines: `withAnswers` writes a compound and `partsOf` is how anything reads
// one back. A second copy of "where does the journal end" is how the box a
// reader types into and the line it is written to come to disagree.
export function partsOf(
  argument: string,
  of: number,
  join: string
): string[] {
  const out: string[] = [];
  let rest = argument;
  for (let i = 0; i < of - 1; i++) {
    const at = rest.indexOf(join);
    if (at < 0) {
      out.push(rest);
      rest = "";
      continue;
    }
    out.push(rest.slice(0, at));
    rest = rest.slice(at + join.length);
  }
  out.push(rest);
  return out;
}

// The pieces joined back up, with the empty tail left off.
//
// A TRAILING SEPARATOR IS NOT AN EMPTY ANSWER, it is a directive that reads as
// though something went missing: `level-index:study/` says a folder was named
// and lost. `study` is what "this journal, no folder" spells, and it is also
// what a reader would type.
export function joinParts(parts: readonly string[], join: string): string {
  const out = [...parts];
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.map((p) => p.trim()).join(join);
}

export function withAnswers(
  lines: readonly string[],
  questions: readonly SectionQuestion[],
  options: Record<string, unknown> | undefined
): string[] {
  if (!options) return [...lines];
  let out = [...lines];
  // ── THE FORM FIRST, BECAUSE IT IS THE ONLY ONE THAT ADDS OR REMOVES A LINE ──
  //
  // 4.59.0. Every splice below rewrites the ARGUMENT of a line that is already
  // there; this writes the line itself in or out. Taken first so the splices
  // read a settled fence — a `header:` question answered in the same pass would
  // otherwise be looking for a span in a line this had not written yet.
  //
  // AND IT WRITES NOTHING WHEN THE FENCE IS ALREADY IN THAT FORM, which is what
  // keeps a reader's renamed bar theirs: turning a section that is already a
  // section back into one must not replace their title with the catalogue's.
  const form = questions.find((q): q is FormQuestion => q.kind === "form");
  if (form && typeof options[form.key] === "string") {
    const want = options[form.key] as string;
    if (want === WIDGET_FORM) {
      out = out.filter(
        (l) =>
          !isHeaderLine(l) &&
          !(isFrameLine(l) && parseFrame([l]).frame === "section")
      );
    } else if (want === SECTION_FORM && formOf(out) === WIDGET_FORM) {
      // DIRECTLY UNDER THE FENCE, which is where every catalogue composes a bar
      // and where the dispatcher needs it: the bar anchors the widgets that
      // FOLLOW it, so one written below the summary would title nothing and take
      // the `button:` line into its actions strip. A chunk with no opening fence
      // is a section written as loose lines, and the bar goes at the top of it.
      const open = out.findIndex((l) => l.startsWith(FENCE_MARK));
      out.splice(open + 1, 0, form.bar);
    }
  }
  // A DIRECTIVE IS WRITTEN ONCE, HOWEVER MANY QUESTIONS ANSWER IT (4.16). Two
  // splices of one span is the second overwriting the first — so the questions
  // are grouped by the directive they name, and a group with more than one piece
  // composes its argument before touching the line.
  const byDirective = new Map<string, SectionQuestion[]>();
  for (const q of questions) {
    // A FORM NAMES ITS DIRECTIVE WITHOUT BEING AN ARGUMENT OF IT, which is the
    // one place the two meanings of that field come apart. `header` is there so
    // the editor knows the answer is writable; the answer is the line's
    // EXISTENCE, already settled above. Left in this loop it would splice the
    // token "section" into the bar's title — over the reader's own, if they had
    // renamed it — which is what the first cut of 4.59.0 did.
    if (q.kind === "form") continue;
    if (!q.directive) continue;
    byDirective.set(q.directive, [...(byDirective.get(q.directive) ?? []), q]);
  }
  for (const [directive, group] of byDirective) {
    // THE LINE MOVES ONTO THE CURRENT SPELLING BEFORE IT IS WRITTEN (4.46.1).
    // Only when the current word is absent, exactly one older one is present,
    // AND this group actually has an answer to write — `renameSoleKeyword` makes
    // the case for the rename existing at all. Without it the span below is null
    // and the answer is dropped in silence, which is what 4.46.0 did on every
    // note written before it.
    //
    // THE "HAS AN ANSWER" GUARD IS NOT BELT AND BRACES, and a test found it
    // missing. The rename is a write to the reader's line; running it on a group
    // whose answers turn out to be absent would migrate a keyword for nothing —
    // the file changes and the reader is told nothing changed, which is the
    // silence `reconfigure` exists to end, arriving from the other direction.
    const answering = group.some((q) => typeof options[q.key] === "string");
    // THE JOIN THIS GROUP DECLARES, HANDED TO THE READER OF THE SPAN (4.70).
    // `argSpanIn` cuts an argument at a label bar and a compound joined on `|`
    // has no label — see the note there. Read off the question rather than
    // guessed, so a widget that changes its separator changes it once.
    const argJoin = group.find((q) => q.part)?.part?.join;
    // WHAT THE OLD SPELLING MEANT, KEPT ACROSS THE RENAME (4.47). An alias
    // carries no argument — a bare `topic-stats` — so renaming it and then
    // seeding from the empty line would throw away the arrangement the reader
    // was looking at, and a reader who changed the SECOND cell would find the
    // first three gone.
    let meant: string | null = null;
    if (answering && !argSpanIn(out, directive, argJoin)) {
      for (const [word, means] of Object.entries(group[0].supersedes ?? {})) {
        const renamed = renameSoleKeyword(out, word, directive);
        if (renamed) {
          out = renamed;
          meant = means;
          break;
        }
      }
    }
    const span = argSpanIn(out, directive, argJoin);
    if (!span) continue;
    const compound = group.find((q) => q.part);
    if (!compound?.part) {
      // The ordinary case, unchanged: one question owns the whole argument.
      const q = group[0];
      const answer = options[q.key];
      if (typeof answer !== "string") continue;
      out = spliceArg(out, span, answer.trim());
      continue;
    }
    // SEEDED FROM WHAT IS THERE, so answering one piece leaves the other exactly
    // as the reader left it — the same promise a single-question splice makes
    // about the rest of the line, one level in.
    const { of, join } = compound.part;
    // SEEDED FROM WHAT THE LINE MEANS, NOT FROM WHAT IT SAYS. A shorthand is not
    // divisible — four pieces over `summary` would put the whole word in the
    // first and leave three empty — so it is expanded before the split, exactly
    // as the read side expands it before showing the boxes. See
    // `SectionQuestionCommon.shorthand`.
    const seed = expandShorthand(compound, meant ?? readArg(out, span));
    const parts = partsOf(seed, of, join);
    let touched = false;
    for (const q of group) {
      if (!q.part) continue;
      const answer = options[q.key];
      if (typeof answer !== "string") continue;
      parts[q.part.at] = answer.trim();
      touched = true;
    }
    if (!touched) continue;
    out = spliceArg(out, span, joinParts(parts, join));
  }
  return out;
}

// What the plan says a reconfigure does, in the reader's own words where there
// are any: the question's label and the answer they gave it.
export function describeAnswers(
  questions: readonly SectionQuestion[],
  options: Record<string, unknown> | undefined,
  hostLabel = "this note's folder"
): string {
  const parts: string[] = [];
  for (const q of questions) {
    const answer = options?.[q.key];
    if (typeof answer !== "string") continue;
    // A title has no list of answers to name one from, and an empty one is the
    // catalogue's own heading rather than a host folder — so both halves below
    // are asked per kind rather than of a union that has neither.
    // A FORM ANSWERS IN ITS OWN TWO WORDS. The catalogue writes both sides, so
    // the plan reads "how it is drawn → as a widget, so it can join a group"
    // rather than the bare token the option carries.
    if (q.kind === "form") {
      parts.push(
        `${q.label} → ${answer.trim() === WIDGET_FORM ? q.widget : q.section}`
      );
      continue;
    }
    // A title has no list of answers to name one from, and an empty one is the
    // catalogue's own heading rather than a host folder — so both halves below
    // are asked per kind rather than of a union that has neither.
    const shown =
      answer.trim() ||
      (q.kind === "folder"
        ? hostLabel
        : q.kind === "title"
          ? q.placeholder
          : "");
    const named =
      q.kind === "folder"
        ? q.keywords?.find((k) => k.value === answer.trim())?.label
        : q.kind === "title"
          ? undefined
          : q.values.find((v) => v.value === answer.trim())?.label;
    parts.push(`${q.label} → ${named ?? shown}`);
  }
  return parts.length ? parts.join(", ") : "answer changed";
}

// ── shared machinery ──────────────────────────────────────────────────

// The longest run of `a` that appears in `b` in the same relative order.
//
// Used to tell a real move from the shifting that a move causes. O(n²) on a
// list that cannot exceed a section catalogue, which is sixteen entries at its
// largest.
//
// MOVED HERE FROM journal-plan.ts because the diary catalogues need the same
// answer to the same question, and the alternative was the diary importing the
// journal planner — which would drag `JournalType`, `sectionsFor` and the whole
// journal catalogue into a module about diary entries for the sake of one
// twenty-line function.
export function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const grid: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      grid[i][j] =
        a[i] === b[j]
          ? grid[i + 1][j + 1] + 1
          : Math.max(grid[i + 1][j], grid[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (grid[i + 1][j] >= grid[i][j + 1]) i++;
    else j++;
  }
  return out;
}

// The minimal set of moves that turns `surviving` into `target`.
//
// REPORTED AS THE MINIMAL SET, via the subsequence above: moving one section
// past another shifts the index of everything between them, and a plan that
// named all of those would say "moves Charts, Path, Resources" when the reader
// dragged Review. What actually moved is what is not in the longest run that
// kept its relative order.
//
// `label` resolves an id to its display name and returns undefined for one the
// catalogue does not have — which is how a move whose destination is a section
// this surface never heard of degrades to "moves to the end" rather than
// throwing.
export function moveOps(
  surviving: string[],
  target: string[],
  label: (id: string) => string | undefined
): SectionOp[] {
  const stayed = new Set(longestCommonSubsequence(surviving, target));
  const out: SectionOp[] = [];
  for (const id of surviving) {
    if (stayed.has(id)) continue;
    const name = label(id);
    if (name === undefined) continue;
    const to = target.indexOf(id);
    const beforeLabel = label(target[to + 1] ?? "");
    out.push({
      kind: "move",
      sectionId: id,
      label: name,
      detail: beforeLabel ? `moves above ${beforeLabel}` : "moves to the end",
    });
  }
  return out;
}

// The order a permutation should actually be applied in: what the reader asked
// for, restricted to what is present, then anything present that `want` never
// mentioned, in the order it already had.
//
// THE SECOND HALF IS THE LOAD-BEARING ONE. A section the reader never touched
// must not be dropped because it was not in the list — a `want` that omits it
// is a want that has no opinion about it, not one that asked for its removal.
// Removal is a `remove` op and is planned, named and shown; falling out of an
// ordering is none of those.
// `want`, with every immovable section put back exactly where the file already
// has it.
//
// THE PIN IS A RULE ABOUT THE EDITOR, NOT A RECONCILIATION RULE ABOUT FILES.
// 3.2 §4 fixes navigation to the top row, and the tempting reading is "so force
// `links` to index 0". That would relocate a line in a dashboard whose author
// put it somewhere else years ago — an edit nobody asked for, applied on an
// opinion they never agreed to, which is the line `layout.ts` draws in its own
// header. So the pin refuses to move it in EITHER direction: an immovable
// section keeps the index it has, and the movable ones arrange themselves
// around it.
//
// A section named by `want` but absent from `present` is being added, and an
// added section has no existing index to keep — it is left in `want`'s order
// and the pin has nothing to say about it.
//
// AND A PINNED SECTION MISSING FROM `want` IS NOT HELD AT ALL. That is someone
// asking to remove it, which is a question for the refusal and not for this
// function. Re-inserting it here would silently convert a refused removal into
// a move to wherever it landed — an op the reader never asked for, on the one
// section that is not allowed to have any.
export function holdPinned(
  present: string[],
  want: string[],
  isFixed: (id: string) => boolean
): string[] {
  const kept = present.filter((id) => want.includes(id));
  const fixed = kept.filter(isFixed);
  if (!fixed.length) return want;
  const out = want.filter((id) => !fixed.includes(id));
  // Re-inserted in the order they appear in the file, so two fixed sections
  // cannot cross each other on the way back in.
  for (const id of fixed) {
    out.splice(Math.min(kept.indexOf(id), out.length), 0, id);
  }
  return out;
}

// The moves an arrangement makes INSIDE blocks whose membership it left alone.
// 4.44.1.
//
// `moveOps`' COMPANION, ONE LEVEL IN. That one is handed two flat lists and
// names the minimal set of sections that moved; this asks the same question of
// each block in turn, so two cells of one row trading places is reported as one
// move rather than as nothing at all.
//
// MATCHED BY MEMBERS, NOT BY OPENER. The opener is one of the rows that can
// move — a reader dragging the first cell of a group down is the case this
// exists for — so a block looked up under its own first id would not find
// itself. A block whose membership DID change is somebody joining or leaving,
// which is a regroup and is named as one; it is skipped here rather than
// reported twice under two different words.
export function cellMoveOps(
  before: readonly (readonly string[])[],
  after: readonly (readonly string[])[],
  label: (id: string) => string | undefined
): SectionOp[] {
  const key = (ids: readonly string[]): string => [...ids].sort().join("\u0000");
  const was = new Map(before.map((ids) => [key(ids), ids]));
  const out: SectionOp[] = [];
  for (const block of after) {
    const prior = was.get(key(block));
    if (!prior || prior.length < 2) continue;
    if (prior.every((id, i) => id === block[i])) continue;
    out.push(...moveOps([...prior], [...block], label));
  }
  return out;
}

// The page boundaries an arrangement moves inside blocks it left alone. 4.44.1.
//
// `cellMoveOps`' THIRD SIBLING, AND THE LAST PHASE OF `regroup` TO GET A NAME.
// The dry run reports what the write did, and it could see two of the four
// things it does: which block a section is in, and — since this release — which
// column of it. A `tab` line changes neither. So **Start a page here** wrote its
// bit, the write placed the boundary, and the pane that runs the write and reads
// the result came back with nothing to report — which the footer turns into "No
// changes" over a button the reader had just pressed.
//
// MATCHED BY MEMBERS, exactly as `cellMoveOps` matches, and for its reason: the
// row that opens a block can move. A block whose membership changed is a
// regroup and is named as one.
//
// TWO DIRECTIONS, BECAUSE THE CONTROL IS A TOGGLE. "Join the page before" is the
// only way to unmake a page from this window, and a change that can be made and
// not unmade is half a control.
export function pageBreakOps(
  before: readonly { ids: readonly string[]; pages: readonly string[] }[],
  after: readonly { ids: readonly string[]; pages: readonly string[] }[],
  label: (id: string) => string | undefined
): SectionOp[] {
  const key = (ids: readonly string[]): string => [...ids].sort().join("\u0000");
  const was = new Map(before.map((b) => [key(b.ids), new Set(b.pages)]));
  const out: SectionOp[] = [];
  for (const block of after) {
    const prior = was.get(key(block.ids));
    if (!prior) continue;
    const now = new Set(block.pages);
    // IN THE BLOCK'S OWN ORDER, so a plan naming two of them reads down the
    // group rather than in whichever order a Set happened to hold.
    for (const id of block.ids) {
      if (prior.has(id) === now.has(id)) continue;
      const name = label(id);
      if (name === undefined) continue;
      out.push({
        kind: "regroup",
        sectionId: id,
        label: name,
        detail: now.has(id)
          ? `${name} starts a new page of its group`
          : `${name} joins the page before it`,
      });
    }
  }
  return out;
}

export function desiredOrder(occupants: string[], want: string[]): string[] {
  return [
    ...want.filter((id) => occupants.includes(id)),
    ...occupants.filter((id) => !want.includes(id)),
  ];
}

// The `joined` bits a reordered list should carry MOVED TO `core/row-order.ts`
// IN 4.53.0, and the note is left here because this is where a reader looking
// for it will come. `keptBlocks` was one half of a rule — a reorder keeps the
// boundaries it found — whose other half (`keptPages`) did not exist and whose
// callers were four hand-written swaps in the editor. All of it now lives in one
// module with the operations that use it. See `row-order.ts`.
