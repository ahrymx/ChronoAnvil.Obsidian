// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import {
  LEGACY_TRACKER_MARK_START,
  TRACKER_MARK_END,
  TRACKER_MARK_START,
} from "../core/constants";
import {
  JournalKind,
  JournalLevel,
  JournalType,
  kindAllowsTracker,
} from "./journal";
import { JOURNAL_CHARTS_FENCE } from "../charts/journal-charts";
import { plural } from "../core/util";
import type { SectionQuestion } from "../core/section-model";
import { SCOPE_ALL, SCOPE_JOURNAL } from "../core/directive-grammar";
import { rowRuns } from "../core/note-sections";
import {
  STATS_BAND_WORDS,
  STAT_PRESET_SHORTHAND,
  statsBandProbe,
} from "./stats-band";

// ── The section catalogue ─────────────────────────────────────────────────
//
// A journal note is a stack of sections, and until 2.37 that fact lived in two
// places that could not check each other: the shipped Study templates (hand-
// written markdown assets) and custom-journal.ts's two template string
// literals. The literals were read off Study's templates once, in 2.28, and
// then Study kept growing — `journal-search` and `review-queue`, the 2.35
// charts region, `activity-chart`, `tasks-table` — while the generator did
// not. Eight releases, no error, no warning: every custom journal arrived with
// a bare `base` table where Study had six widgets.
//
// This file is the fix, and the fix is not "update the strings". It is to make
// the section list DATA, so that:
//
//   • a widget added to a Study template has somewhere it must be declared,
//     and a test can say so (see test/journal-sections.test.ts);
//   • the generator and the wizard offer the same set by construction rather
//     than by two people remembering — "one catalogue, not two", which is the
//     "one index, not two" rule from the study roadmap wearing this project's
//     clothes;
//   • `surface` — which widgets belong on an index note versus a leaf note —
//     stops being folklore readable only off the shape of four markdown files.
//
// A SECTION CAN ALSO BE WRONG, and then it is deleted rather than generalised
// further. `related` lived here for one release: it emitted a `related-notes`
// widget that stored bare filenames in an HTML comment, so links made through
// it appeared in neither the backlinks panel nor the graph — a connect-notes
// feature strictly worse than the `- [[Note]] — why` line it replaced. The
// catalogue's job is to offer the arrangements worth having; an entry that
// isn't earns removal, and removal is not a failure of the catalogue.
//
// WHAT THIS FILE IS NOT is a layout model. Nothing here is stored beside a
// note, nothing is diffed against a note, and nothing regenerates a note. A
// section renders markdown once and then the markdown is the user's, exactly
// like every other template file. Markdown is the source of truth; this is a
// function that writes some.

// Which kind of note a section can sit on.
//
//   index   a container's folder note — a Subject/Topic index, and by the
//           `basename === parent.name` rule every other dashboard in the
//           plugin, so a promoted leaf note counts too
//   leaf    a note of one of the type's kinds
//   both    genuinely surface-agnostic (the banner; free prose)
export type SectionSurface = "index" | "leaf" | "both";

// Everything a section needs to render itself without asking what type it is
// on. Assembled by sectionContext() below, which is the only place that reads
// a JournalType apart — a section that reached for `ctx.type.kinds` directly
// would be one refactor away from caring whether it was on Study.
// The three kinds of note a journal section can be written into.
//
// A page has a body and a banner but no tracker grid of its own — its ratings
// live on the note it belongs to — and its frontmatter names its parent instead
// of a date. That is a different thing from a leaf, not a leaf with a flag set.
export type JournalNoteKind = "index" | "leaf" | "page";

export interface SectionContext {
  // The folder the note being edited sits in, when the caller has one.
  //
  // ABSENT ON A TEMPLATE, AND THAT IS THE POINT (3.15 §10.9). A journal
  // template is composed once and used in every folder of its level, so it has
  // no host folder — and a path typed into a folder question on a template
  // would be written literally into every note made from it afterwards, which
  // is the failure this file already declined to build when it chose not to
  // interpolate `{{folder}}` into the Tags section. The settings rail opens
  // templates and passes null; `section-insert.ts` opens notes and passes their
  // parent. Nothing here asks which it is.
  hostFolder?: string | null;
  type: JournalType;
  // WHAT THE NOTE IS — one field, three values.
  //
  // Was `surface: "index" | "leaf"` beside a separate `isPage: boolean`, which
  // asks a three-value question as an enum plus a flag: it makes
  // `{ surface: "index", isPage: true }` representable and meaningless, and it
  // puts the answer in two places that can disagree. They did — see the note in
  // section-insert.ts about a page being built with `isPage: false` and then
  // offered the Pages section, which is a page offering to contain pages.
  //
  // Same shape as the three defects of 2.57–2.58 (`TrackerSurface`,
  // `isMonthly`, `cls == null`): a distinction with more cases than its type
  // can hold, where the extra case is absorbed by an `else`.
  noteKind: JournalNoteKind;
  // Container depth for an index note; null on a leaf.
  depth: number | null;
  level: JournalLevel | null;
  // The kind for a leaf note; null on an index.
  kind: JournalKind | null;
  // Which of the kind's saved layouts this template is. "default" or absent is
  // the plain one. It is only ever a KEY — nothing about a variant reaches a
  // note's frontmatter, because a variant is a layout and not a kind: a Math
  // Lesson is a Lesson, with the same `type:`, the same trackers and the same
  // place in the review queue.
  variantId?: string;

  // ── resolved nouns and structure ──
  // The `type:` frontmatter value a note here carries.
  typeValue: string;
  // Singular noun for this note itself ("Subject", "Lesson").
  ownNoun: string;
  // Whether this index has containers beneath it rather than notes. The
  // discriminator that separates Study's Subject Index from its Topic Index,
  // and it is structural rather than Study-flavoured: "are my children folders
  // or notes" is a question every journal type can answer about every level.
  hasSubContainers: boolean;
  // Whether notes of this kind can be split across pages.
  hasPages: boolean;
  // Long-form: either a note that can be split across pages, or one of those
  // pages. What `recall` turns on — the structural fact behind Study's
  // Lesson/Practice split rather than a list of kind ids.
  documentLike: boolean;
  // The tracker a grade on this note writes. On an index, the type's own —
  // the first rating any of its kinds declares — because an index's charts
  // plot the notes beneath it and those are what carry a rating at all.
  rating: string | null;
}

// Per-section, per-template overrides supplied at compose time.
//
// NOT PERSISTED, and that is the whole design. A preset declares these in code
// (see STUDY_JOURNAL.layout); the wizard would pass a reader's at creation,
// exactly as it already passes chosen section ids. Nothing is stored beside
// the note, so markdown stays the source of truth and the "generates, never
// regenerates" rule is untouched.
export interface SectionOverrides {
  // Header bar title, replacing the section's default.
  label?: string;
  // For a section that can emit several fields of the same kind, where one is
  // the default. Study's Topic index has three resource shelves.
  fields?: { key: string; label: string }[];
  // The prose skeleton a leaf template opens with. See the `headings` section:
  // a template's headings are the one part of it that is genuinely about what
  // the journal is FOR, so the catalogue supplies a generic set and a type that
  // knows better says so here.
  headings?: { title: string; body?: string[] }[];
  // Which tracker a bridge pulls across. Same shape of decision as `headings`:
  // the catalogue supplies a generic default because it holds a JournalType and
  // no plugin, so it cannot read the tracker registry to ask what a vault
  // actually defines — and a type that knows better says so here.
  tracker?: string;
  // WHICH TRACKERS A NOTE OF THIS TEMPLATE STARTS WITH. 4.35 §1.5.
  //
  // Ids into the registry, exactly as `rating` is. `trackerSeeds` seeds only
  // the kind's `rating` and `status`, and `showInTemplate` — the diary's
  // answer to this question — is forced false on a journal surface. So a
  // preset that ships five quantities would start a Workout with Intensity
  // and nothing else, and Duration would be added by hand from the cog on
  // every note ever written. Nobody keeps that journal.
  //
  // The same shape of decision as `headings` and `tracker` above, and for the
  // same stated reason: the catalogue supplies a generic default because it
  // holds a `JournalType` and no plugin, and a type that knows better says so
  // here.
  //
  // NO FRONTMATTER IS SEEDED FOR THESE — see `trackerSeeds`.
  trackers?: string[];
  // WHICH ARRANGEMENT OF NUMBERS THE `stats` SECTION BANDS. 4.46.
  //
  // The same shape of decision as `tracker` above and for the same stated
  // reason: the catalogue supplies a generic default because it holds a
  // `JournalType` and no plugin, and a type that knows better says so here.
  // Exercise & Diet wants its four sums; Media wants a count, a rating, its open
  // tasks and its pages read in one band, which is what replaced the two it drew
  // before this release.
  //
  // A PRESET ID, VALIDATED NOWHERE AND SAFE FOR IT. `resolveStatPreset` falls
  // back to the scope's default for a word it does not know, so a layout naming
  // a preset a later release removes degrades to the ordinary band rather than
  // to a refusal in the reader's note.
  preset?: string;
}

// How one template departs from the catalogue's own arrangement.
export interface TemplateLayout {
  // Section ids in the order they should be written. Ids the catalogue has but
  // this list omits keep catalogue order after the listed ones, so a layout
  // only has to name what it moves.
  //
  // Per-template because one global order genuinely cannot express Study: its
  // Subject Index puts the children table directly under the banner, and its
  // Topic Index puts the note tables below the learning path. 2.37 called that
  // "a cosmetic difference not worth per-level ordering data", which was true
  // while the equivalence test compared sets and stopped being true the moment
  // a dashboard was composed rather than compared.
  order?: string[];
  options?: Record<string, SectionOverrides>;
  // Exactly these sections, in this order — a SAVED layout rather than a
  // partial one.
  //
  // The difference from `order` is selection: `order` says where the sections
  // go and lets the catalogue decide which there are, which is what Study
  // wants, because Study's dashboards should gain a section the day the
  // catalogue does. `sections` says which as well, which is what a saved
  // variant wants, because "a Lesson without the Recall box" has to keep not
  // having one.
  //
  // Implies `order`: a list that names them all in sequence has already said
  // where they go, so a layout that sets this does not need both.
  sections?: string[];
}

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

export interface JournalSection {
  // What this section can be asked, and where the answer is written. Absent on
  // every section whose directive the catalogue can compose unaided.
  //
  // A FUNCTION OF THE CONTEXT, and on this surface the context is the reason
  // the answer is often unavailable: `SectionContext` describes a journal's
  // LEVEL, not a note, because one template is used in every folder of that
  // level. `hostFolder` is what the caller adds when it holds an actual note,
  // and its absence is what keeps a live folder control off a template.
  questions?: (ctx: SectionContext) => SectionQuestion[];
  // Stable id. Used by the wizard's checklist, by the "add a section" picker,
  // and as the unit the Study-equivalence test compares.
  id: string;
  label: string;
  // One line, for the picker and the wizard's schematic.
  blurb: string;
  // The glyph the schematic labels this block with. Where the section renders
  // a header bar this is that bar's own emoji, so the drawing and the note
  // agree — a schematic that used different icons from the finished note would
  // be teaching an arrangement nobody is going to see.
  icon: string;
  // Which composed ROW this section is a cell of, and which CELL of it — 4.70.
  //
  // `FlatSection.row` AND `.cell`'s MEANINGS, argued in full there and not
  // repeated: an id rather than a flag, consecutive members only, and an absent
  // `cell` is not a value.
  //
  // ── AND ONLY A SINGLE-FENCE SECTION CAN HONOUR THEM ──────────────────
  //
  // This is the one catalogue where the field is a REQUEST rather than an
  // instruction, and the reason is `SectionBlock`. A journal section renders a
  // LIST of blocks, and three of the kinds cannot be a column of anything: a
  // `region` is the reader's writing in the note body and lives outside every
  // fence, and `markdown` is prose indistinguishable from theirs. So a section
  // that emits either has nothing a `cell` line could delimit, and
  // `composeSectionRuns` drops its row rather than composing a fence that would
  // swallow the blocks after it.
  //
  // WHICH SECTIONS THAT EXCLUDES IS NOT A LIST KEPT HERE, deliberately — it is
  // whatever `render` returns, asked at compose time, so a section that gains a
  // region next release stops being a column without anybody remembering to
  // come back and say so. Today it is `path`, `resources`, `headings`, `recall`,
  // `checklist` and `prose`.
  //
  // ── A FUNCTION OF THE CONTEXT, WHERE THE OTHER THREE CATALOGUES TAKE A
  //    STRING ──────────────────────────────────────────────────────────
  //
  // One catalogue serves two shapes of page here — a container index and a leaf
  // index — and `default` already reads `ctx.hasSubContainers` to tell them
  // apart. A row that a section joins on one and not the other cannot be a
  // constant, and the alternative is worse than a callback: it is the same
  // section written twice, once per surface, with the drift that always
  // follows.
  //
  // WHAT IT IS ACTUALLY FOR is the bar. A `header:` in a row fence is drawn
  // ONCE, full width, above the columns (`row.ts`), so a row carries exactly one
  // title, worded for the band, composed by the cell that OPENS it — and the
  // cells after it compose none. A section that is a column on one surface and a
  // full-width block on the other therefore has to render differently on each,
  // and the two answers have to agree. Asking one predicate is how they do.
  row?: string | ((ctx: SectionContext) => string | undefined);
  cell?: string;
  surface: SectionSurface;

  // Structurally possible here at all. Distinct from `default`: a section that
  // does not apply is not offered, whereas one that applies but is off is
  // offered unticked. `pages` does not apply to a kind that cannot hold pages;
  // `find` applies to any index but is only pre-ticked where there is enough
  // beneath it to be worth searching.
  applies?: (ctx: SectionContext) => boolean;

  // Pre-ticked in the wizard, and emitted by the generator with no GUI at all.
  //
  // A PREDICATE rather than the roadmap's `default: boolean`, and the reason
  // is that a flag cannot express Study's own arrangement: its Subject Index
  // and its Topic Index carry different sets, and the difference is the
  // meaningful one — an index with containers beneath it aggregates and
  // searches, an index with notes beneath it lists them. A boolean would have
  // forced one of the two shipped templates to be wrong, and the equivalence
  // test to be weakened until it stopped catching anything.
  default: (ctx: SectionContext) => boolean;

  // Never offered unticked, because a note without it is the defect a previous
  // release shipped a fix for. Only the banner: a journal note with no
  // `journal-header` has no title, no crumbs and nowhere to render a tracker,
  // which is exactly the state 2.28 existed to end. Everything else is taste.
  required?: boolean;

  render: (ctx: SectionContext, opts?: SectionOverrides) => SectionBlock[];

  // What this section's `fields` keys ARE. 3.18 follow-ups §5, second half.
  //
  // `fields` is one shape carrying two meanings, and only one of them travels.
  // On `resources` a key is a shelf the reader named — `res-docs` — resolved by
  // nothing outside the layout that holds it, so it means as much in another
  // journal as it did here. On `children` a key is a KIND ID, and kind ids are
  // per journal by construction: `lesson` names nothing in a journal whose
  // kinds are `recipe` and `method`.
  //
  // SAID HERE RATHER THAN INFERRED THERE, because this is where the meaning
  // lives. `layout-transfer.ts` would otherwise have to know that `children` is
  // special — an id check in a module whose whole job is to be told things
  // rather than to know them, and one that would silently stop covering the
  // second section keyed this way.
  fieldKeys?: "kinds";

  // The repeatable pieces this section is built from, when it has any. 3.18 §1.
  //
  // ABSENT ON EVERY SECTION BUT `children`, and absent means all-or-nothing —
  // which is what every section shipped before 3.18 is. A section that declares
  // parts is one the planner may `extend`: present in a file, wanted, and short
  // of a piece it should have.
  //
  // MUST BE THE SAME LIST `render` COMPOSES FROM. Two derivations of "what this
  // section contains" is exactly the drift this file keeps arguing against, and
  // here it would be a live bug rather than an untidiness: a `parts` that named
  // something `render` did not emit would have the planner report a gap that
  // filling it could not close. So the section builds both from one helper, and
  // the catalogue shape test asserts a freshly composed file reports no missing
  // parts (§11.1).
  parts?: (ctx: SectionContext, opts?: SectionOverrides) => SectionPart[];

  // Where this section's markdown starts in an existing file, or -1.
  //
  // Detection exists for two callers and neither of them is rendering: the
  // Study-equivalence test (which reads the shipped assets and asks which
  // sections they contain) and the "add a section" command (which declines to
  // append a second copy of something already there). It is deliberately a
  // probe for the section's own directive rather than a parse of the file: the
  // catalogue does not own the note, and anything richer would be the first
  // step toward rewriting one.
  locate: (text: string, ctx: SectionContext) => number;

  // The directive kinds this section emits. Read only by the equivalence
  // test's coverage assertion, which is the guard against the rot this whole
  // file exists to fix: a widget added to a shipped Study template that no
  // section claims fails the build.
  claims: string[];
}

// ── What a section is made of ─────────────────────────────────────────────
//
// A section used to render a `string`, and that string was however many
// markdown blocks it felt like — one fence, two fences, a fence and a comment,
// four of each. Two things went wrong with that, and the second is expensive:
//
//   RENDERING. Obsidian makes every markdown block its own sibling element, so
//   a header in one fence and the table it titles in the next are two boxes
//   with a gap no styling can close. 2.13.9 removed that from the Journals card
//   and 2.18.4 from the entry banner, both by welding two fences into one; the
//   journal dashboards never got the same pass.
//
//   IDENTITY. Finding a section in a file meant *inferring* which blocks were
//   its — matching fences against `claims` and hoping. That works most of the
//   time, which is the worst property a deletion routine can have. A section
//   that DECLARES its blocks is one a planner can find exactly, and exact is
//   the difference between "remove this section" being a splice and being a
//   guess about somebody's file.
//
// So `render` returns the blocks. Two invariants, both asserted by test rather
// than asked for in a comment (see test/journal-sections.test.ts):
//
//   • AT MOST ONE `fence` PER SECTION. The fence is the section's head. This is
//     reachable at all only because 2.54 made the note tables native — a
//     ```base block cannot live inside a ```chronoanvil one, so while `children`
//     emitted Bases tables the rule was impossible rather than merely unmet.
//   • A section emitting `markdown` is NOT REMOVABLE, because the plugin cannot
//     tell markdown it wrote from markdown the reader wrote. See
//     sectionRemovable.
//
// There is deliberately no `base` variant. Nothing emits one any more, and a
// case for a thing with no producer is a shape to be careful about for no
// reason. If one is ever needed again, add it then — and note that it would
// also be the first block a section could not fold into its own fence.
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
      // Ordinary markdown: the banner's spacer, a prose skeleton's headings.
      // Unprovable by construction, and never deleted or moved on that basis.
      kind: "markdown";
      lines: string[];
      // Abut the following block with a single newline instead of a blank
      // line. True in exactly one place — the banner's `chronoanvil:spacer`, which
      // is documented as sitting on line 0 of the body, immediately above the
      // fence it exists to stop the reader clicking into. Serialisation only;
      // it says nothing about extent.
      tight?: boolean;
    };

// ── rendering helpers ─────────────────────────────────────────────────────

const FENCE = "```";

function fence(lines: string[], info = "chronoanvil"): SectionBlock {
  return { kind: "fence", info, lines: lines.filter((l) => l !== "") };
}

// A header bar plus, optionally, controls welded into the same fence — the
// arrangement every shipped dashboard uses, so a section's title and its
// buttons are one element rather than a heading with a button loose beneath it.
function headerBar(title: string, ...controls: string[]): SectionBlock {
  return fence([`header:${title}`, ...controls]);
}

// The body region a content field persists into. `note:`, `list:`, `tasks:`,
// `attach:`, `path:` and `recall:` all store their value in the note body
// inside these markers rather than in frontmatter, so the raw file stays
// readable — a section that emits one of those directives must emit its region
// too or the field has nowhere to write.
function region(key: string): SectionBlock {
  return { kind: "region", key };
}

function markdown(lines: string[], tight = false): SectionBlock {
  return tight
    ? { kind: "markdown", lines, tight: true }
    : { kind: "markdown", lines };
}

// One block as the markdown it is written as.
export function renderBlock(block: SectionBlock): string {
  if (block.kind === "fence") {
    return [`${FENCE}${block.info}`, ...block.lines, FENCE].join("\n");
  }
  if (block.kind === "region") return `<!--chronoanvil:${block.key}\n-->`;
  return block.lines.join("\n");
}

// A section as the markdown it is written as: its blocks, separated by a blank
// line except where one asks to abut the next.
//
// The one place block structure collapses back to text, so every caller that
// wants a section's markdown — composeTemplate, "add a section", the preview —
// comes through here rather than joining for itself. Two joiners is how a
// schematic and the file it describes come to disagree about spacing: a small
// thing to be wrong about and an annoying one to find.
export function renderSection(
  section: JournalSection,
  ctx: SectionContext,
  opts?: SectionOverrides
): string {
  const parts = section.render(ctx, opts);
  return parts.reduce((out, block, i) => {
    const text = renderBlock(block);
    if (i === 0) return text;
    const prev = parts[i - 1];
    const gap = prev.kind === "markdown" && prev.tight ? "\n" : "\n\n";
    return out + gap + text;
  }, "");
}

// A run of sections as the markdown blocks they compose to. 4.70.
//
// WHAT THIS ADDS TO `renderSection`, WHICH IS ONE THING: adjacent sections that
// asked to share a row, and can, are returned as ONE fence instead of two.
// Everything else about what a section renders is unchanged, which is why this
// wraps that function rather than replacing it.
//
// ── CHUNKED FIRST, SO THE ROW RULE IS STILL `rowRuns`' ───────────────────
//
// Only a section whose whole render is a single `fence` block can be a column
// (see `JournalSection.row`). Rather than teach the shared row rule about block
// kinds — a fact that exists in this catalogue and nowhere else — the list is
// split into maximal runs of column-capable sections, and only those runs are
// handed to `rowRuns`. A section that cannot be a column is emitted between
// them, whole and untouched.
//
// That keeps one implementation of what a `row` line and a `cell` delimiter
// mean, which is the property the extraction was for: four catalogues that
// compose rows, one function that decides what a row is.
// A section's row on this surface, whichever way the catalogue declared it.
export function rowOf(
  section: JournalSection,
  ctx: SectionContext
): string | undefined {
  return typeof section.row === "function" ? section.row(ctx) : section.row;
}

export function composeSectionRuns(
  sections: readonly JournalSection[],
  ctx: SectionContext,
  optionsFor?: (section: JournalSection) => SectionOverrides | undefined
): string[] {
  const rendered = sections.map((section) => {
    const opts = optionsFor?.(section);
    const blocks = section.render(ctx, opts);
    return {
      section,
      opts,
      // A LONE FENCE AND NOTHING ELSE. Asked of what `render` actually returned,
      // so the answer cannot go stale against a section that grows a region.
      column: blocks.length === 1 && blocks[0].kind === "fence",
      blocks,
    };
  });

  const out: string[] = [];
  let chunk: typeof rendered = [];
  const flush = (): void => {
    if (!chunk.length) return;
    for (const run of rowRuns(
      chunk.map((r) => ({ row: rowOf(r.section, ctx), cell: r.section.cell, r })),
      ({ r }) => {
        const block = r.blocks[0] as Extract<SectionBlock, { kind: "fence" }>;
        return { fence: block.info, lines: block.lines };
      }
    )) {
      out.push(renderBlock({ kind: "fence", info: run.fence, lines: run.lines }));
    }
    chunk = [];
  };
  for (const r of rendered) {
    if (r.column) {
      chunk.push(r);
      continue;
    }
    flush();
    out.push(renderSection(r.section, ctx, r.opts));
  }
  flush();
  return out;
}

// Whether a section can be removed from a file it is already in.
//
// DERIVED, not declared. A section is removable exactly when everything it
// wrote is machine-identifiable, and the block kinds already say that: a fence
// and a region are the plugin's and can be found precisely, a `markdown` block
// is indistinguishable from the reader's own writing. Deriving it means a
// section cannot claim to be removable and then emit prose, which a boolean
// on the catalogue would happily allow.
//
// `banner` is excluded by `required` before its blocks are looked at;
// `headings` excludes itself by emitting the headings.
export function sectionRemovable(
  section: JournalSection,
  ctx: SectionContext,
  opts?: SectionOverrides
): boolean {
  if (section.required) return false;
  return !section.render(ctx, opts).some((b) => b.kind === "markdown");
}

// The fence a section leads with, or null for one that is pure markdown.
// Exported for the invariant test and, later, for the planner: a fence is a
// section's handle in a file.
export function sectionFence(
  section: JournalSection,
  ctx: SectionContext,
  opts?: SectionOverrides
): SectionBlock | null {
  return section.render(ctx, opts).find((b) => b.kind === "fence") ?? null;
}

// First match position, for `locate`. A bare `indexOf` would be wrong for
// every directive that is a prefix of another (`tasks:` and `tasks-table`).
function probe(text: string, re: RegExp): number {
  return text.search(re);
}

// ── the catalogue ─────────────────────────────────────────────────────────
//
// Order here is the order sections are written into a generated template. One
// order for every type, which is a deliberate simplification: Study's own
// Topic Index happens to put its note tables below its learning path, and
// reproducing that would mean per-level ordering data earning its keep on a
// single cosmetic difference. See the equivalence test, which asserts the set
// for every shipped template and the order for the one the roadmap names.

// The tracker a `bridge` section reaches for when nothing overrides it. Kept
// beside the catalogue rather than read from settings because this file holds a
// JournalType and no plugin — see SectionOverrides.tracker. It matches
// DEFAULT_SETTINGS.moodTrackerId, and a test pins the two together, because a
// default that drifts from the registry emits a directive that refuses.
export const DEFAULT_BRIDGE_TRACKER = "Mood";

const always = (): boolean => true;
const never = (): boolean => false;

// The tracker the `tally` section counts when a type does not say otherwise.
//
// `status` and not a guess: it is the one id every journal is guaranteed to
// define — unified across every journal and every kind in `constants.ts`, and
// the only select the catalogue can name without reading a registry it cannot
// see. A type that measures something better overrides it through
// `options.tally.tracker`.
export const DEFAULT_TALLY_TRACKER = "status";

// The preset a `stats` section on a CONTAINER index resolves to when nothing
// says otherwise, and the reason it is spelled here as well as in
// `stats-band.ts` is that this file has to be able to compare against it.
//
// A BARE DIRECTIVE IS THE ANSWER, NOT A WRITTEN WORD. `resolveStatPreset` gives
// a bare `stats-band` this preset inside a container, so composing
// `stats-band:progress` would be the note restating a rule the plugin already
// applies — and it would make a Topic index composed by 4.46 differ, byte for
// byte, from one composed by 4.45 that says exactly the same thing. `render`
// compares against this to decide whether the argument is worth writing.
//
// A SECOND COPY OF A VALUE, WHICH THIS PROJECT HAS BEEN BITTEN BY (4.21.1: "two
// copies of a value cannot see a third"). It is here rather than imported
// because it is a fact about what this CATALOGUE composes, and a test pins the
// two together — the same treatment `DEFAULT_BRIDGE_TRACKER` gets against
// `DEFAULT_SETTINGS.moodTrackerId` four lines up, and for the same reason.
export const DEFAULT_CONTAINER_PRESET = "progress";

// What the section editor says about a title it cannot read back, and where it
// sends the reader instead. 3.18 follow-ups §2.
//
// EVERY TITLE QUESTION SHARES ONE, because they are one sentence about one
// capability rather than three sections each explaining themselves. The
// capability is real: a header bar is click-to-edit in the note (see
// `header-title.ts`), so this points at a control that exists rather than
// apologising for one that does not.
//
// WHY IT IS SAID AT ALL. On a note carrying a single `header:` the editor reads
// and writes the title perfectly well and this never renders. It renders on the
// notes where the answer is genuinely ambiguous — a Topic index carries six
// headers — and the alternative was the 3.18.0 behaviour, which drew a box
// showing the FIRST header in the file whatever section the row was for.
const TITLE_SETTLED = {
  text: "rename it on the note",
  hint:
    "This section's title is the header bar in the note — click it there to " +
    "rename it. Several sections on this note carry a header, so this window " +
    "cannot tell which one is this section's.",
};

// Which ratings a fresh note of this kind is seeded with.
//
// SPLIT OUT OF THE BANNER IN 4.20, and it is asked TWICE — once by `applies`, to
// decide whether this note has a grid at all, and once by `render`, to fill it.
// Two readings of one rule, which is why it is a function rather than two lists:
// a section that applied when it had nothing to compose would write an empty
// marked region, and one that composed what it had not applied for could not
// happen at all.
function trackerSeeds(ctx: SectionContext, opts?: SectionOverrides): string[] {
  // A page carries no tracker grid: its ratings belong to the note it is a page
  // of, and a per-page Confidence would mean the note's own average silently
  // counted its parts as peers.
  if (ctx.noteKind === "page") return [];
  const out: string[] = [];
  // A leaf note seeds the rating it is graded on; an index note is not graded,
  // so it gets Status alone — which is what both shipped Study index templates
  // carry.
  if (ctx.noteKind === "leaf" && ctx.rating) out.push(`tracker:${ctx.rating}`);
  if (
    ctx.rating !== "status" &&
    kindAllowsTracker(ctx.type, ctx.kind?.id ?? null, "status")
  ) {
    out.push("tracker:status");
  }
  // THE QUANTITIES A TYPE SAYS ITS NOTES ARE KEPT FOR. 4.35 §1.5.
  //
  // Appended rather than inserted, so the rating and Status keep the positions
  // every shipped template already has them in. Filtered through
  // `kindAllowsTracker` like Status is — a Meal must not start with Intensity
  // just because the journal defines it — and de-duped against what is already
  // seeded, so naming the rating here is a no-op rather than a second copy.
  //
  // NO FRONTMATTER IS SEEDED FOR THEM, and that asymmetry with `rating` is
  // deliberate. A rating is written as `1` because that is what a Recall
  // sitting grades and what the review queue reads; `Distance: 1` would be a
  // kilometre nobody ran. The widget is there to be filled in; the property
  // arrives when it has a value.
  for (const id of opts?.trackers ?? []) {
    if (out.includes(`tracker:${id}`)) continue;
    if (!kindAllowsTracker(ctx.type, ctx.kind?.id ?? null, id)) continue;
    out.push(`tracker:${id}`);
  }
  return out;
}

// ── THE ONE ROW A JOURNAL TEMPLATE COMPOSES (4.70) ───────────────────────
//
// A CONTAINER INDEX ONLY, which `hasSubContainers` is the discriminator for and
// which is not a hedge: on a container index both cells are composed by default
// — Review always, Open tasks because there is a tree beneath to collect from —
// and on a leaf index Open tasks is not. A row of one is not a row, so declaring
// it there would rely on `rowRuns` undoing it, and a reader who ticked Open
// tasks onto a Topic index would get the two welded under a band title neither
// of them had asked for.
//
// "DUE AND OPEN" IS THE BAND, AND IT IS THE THIRD PAGE TO USE THOSE WORDS —
// the journals dashboard and each journal's own dashboard pair the same two
// widgets under the same bar. That is deliberate: a reader who learns what the
// band means on one page has learned it everywhere, and the wording is true of
// the pair rather than of either half, which is what a row's single full-width
// bar requires.
//
// ── AND THE TWO ROWS 4.70 LOOKED AT AND DID NOT COMPOSE ─────────────────
//
// FIND BESIDE REVIEW was the obvious first pairing — they are adjacent, both
// compact, both a single fence. There is no honest name for the band. "Find" is
// a control the reader types into and "Review" is a list the plugin produces,
// and a bar naming one of them over both is worse than a bar naming neither.
//
// STATS BESIDE REVIEW on the leaf index, which is the pairing the release plan
// proposed for Topic, Project and Title. Declined because `stats-band` is
// ALREADY a horizontal band: four numbered cells dividing the width of the
// block, laid out by the widget rather than by the fence. Halving that width
// does not compress it, it wraps it into two rows of two — the same objection
// the tracker grid makes one file over, and the reason neither is a column.
const DUE_ROW = "due";
const DUE_BAR = "header:🔁 Due and open";

export const JOURNAL_SECTIONS: JournalSection[] = [
  {
    id: "banner",
    // ONE GLYPH FOR ONE SECTION (4.21.1). This was 🪧 while the three other
    // catalogues' banners were 🏷️ — four catalogues, one section, and the
    // editor is the one place a reader compares them, because it is the only
    // screen that draws a section as a row with an icon on it.
    icon: "🏷️",
    label: "Banner",
    // THE TRACKER GRID LEFT IN 4.20 and this sentence did not, so the editor
    // described the block by naming something that is now the row beneath it.
    blurb:
      "The note's own name, the trail back through its journal, and the control that renames it and edits its sections.",
    surface: "both",
    required: true,
    default: always,
    // THE TRACKER GRID LEFT THIS SECTION IN 4.20 — see `trackers` below. What is
    // claimed here is now exactly what the banner draws: the strip that names
    // the note.
    claims: ["journal-header"],
    locate: (t) => probe(t, /^journal-header\s*$/m),
    render: () => [
      // Tight against the fence below it: the spacer is documented as
      // sitting on line 0 of the body, directly above the banner it stops a
      // top-of-note click landing inside.
      markdown(["`chronoanvil:spacer`"], true),
      fence(["journal-header"]),
    ],
  },

  {
    id: "trackers",
    icon: "📊",
    label: "Trackers",
    // The level and the kind are named for `entry-sections.ts`' reason one
    // catalogue over: 4.21 put them on this block's own strip, and a blurb that
    // mentions only the ratings sends a reader looking for them in the banner.
    blurb: "What kind of note this is, and the ratings it is graded on.",
    surface: "both",
    // ── ITS OWN SECTION AS OF 4.20 ────────────────────────────────────
    //
    // It was lines inside the banner's fence, which made it part of the banner's
    // card. 4.20 settles what a banner is — the file's name, its navigation and
    // the control that edits it — and a rating is none of those. The diary
    // catalogue makes the same move in the same release, for the same reason and
    // with the same consequence: one fence is one card, so the only way out of
    // the card is out of the fence.
    //
    // NOT `required`, WHERE THE BANNER IS. A journal note with no
    // `journal-header` has no title, no crumbs and nowhere to render a rating —
    // that is the defect 2.28 existed to end. A journal note with no RATING is a
    // reader who does not grade their notes, which is a preference.
    //
    // APPLIES WHERE THERE IS SOMETHING TO GRADE. A page carries no grid at all:
    // its ratings belong to the note it is a page of, and a per-page Confidence
    // would mean the note's own average silently counted its parts as peers.
    // Below that, an index or leaf with nothing to seed gets no section rather
    // than an empty marked region — the region exists so "+ Add tracker" has
    // somewhere to write, and `spliceMarkedRegion` inserts one when it finds
    // none, so an empty pair of markers buys nothing and renders as a gap.
    // `applies` DELIBERATELY DOES NOT SEE `opts`. A section's applicability is
    // asked of the catalogue before any layout is resolved, and a note whose
    // only grid contents came from an override would be a template that
    // appears or vanishes depending on a field the editor can clear. What a
    // type adds through `options.trackers` is extra rows in a grid it already
    // has, not a reason for the grid to exist.
    applies: (ctx) => trackerSeeds(ctx).length > 0,
    default: always,
    claims: ["tracker"],
    locate: (t) =>
      probe(t, new RegExp(`^(?:${TRACKER_MARK_START}|${LEGACY_TRACKER_MARK_START})\\s*$`, "m")),
    render: (ctx, opts) => [
      fence([TRACKER_MARK_START, ...trackerSeeds(ctx, opts), TRACKER_MARK_END]),
    ],
  },

  {
    id: "nav",
    icon: "🔗",
    label: "Navigation links",
    blurb: "A row of links back to the homepage and the folder above.",
    surface: "both",
    // Off by default because no shipped Study template carries one: the banner
    // already renders breadcrumbs, so a `links:` row beneath it is a second
    // way up. Kept in the catalogue because a flat journal — whose banner has
    // one crumb and nothing above it — is a reasonable place to want one.
    default: never,
    // ── AND IT STAYED ITS OWN SECTION IN 4.19, WHICH IS THE ONE PLACE THAT
    //    RELEASE DID NOT REACH ─────────────────────────────────────────
    //
    // 4.19 merged every page's title and navigation into one Banner section, and
    // the intent was for this row to fold into the banner above it as a reader's
    // option. A journal note already satisfies the rule — `banner` is one
    // top-level section drawing the note's name AND its crumb trail — so what
    // was left was this row, and it does not fit through the door.
    //
    // WHY NOT: a `SectionQuestion` answers "what goes in this directive's
    // ARGUMENT". `SectionQuestionCommon.directive` says so and says what happens
    // without one — *"Absent means nothing can read this answer back and the
    // editor says so rather than drawing a control over it"* — so a question
    // cannot express "and this line may not exist at all". Folding the row in
    // as an option therefore needs a new question kind, a presence answer, and
    // write-back for it in all four catalogues. That is a release, not a field.
    //
    // AND THE ALTERNATIVE IS WORSE THAN THE SEAM. Composing the row
    // unconditionally would put a second way up under a crumb trail on every
    // journal note in every vault — which is the doubling 4.19 exists to remove,
    // arriving in the name of tidiness. The row is supplementary navigation, the
    // same class of thing as the launcher and the period navigator, and 4.19
    // deliberately left those outside the banner too.
    //
    // So this is a seam, it is named, and it is small: one off-by-default row on
    // one surface. It goes when a presence question does.
    claims: ["links"],
    locate: (t) => probe(t, /^links:/m),
    render: (ctx) => [
      fence([ctx.depth === 0 ? "links:home" : "links:home,up"]),
    ],
  },

  {
    id: "stats",
    icon: "🔢",
    label: "Stats band",
    blurb: "A row of numbers about everything below — you pick each one.",
    surface: "index",
    // ── IT ABSORBED `totals` IN 4.46 ──────────────────────────────────
    //
    // There were two sections here — this one, emitting `topic-stats`, and
    // `totals`, emitting `journal-totals` — and a Media shelf named BOTH,
    // because that was the only way the catalogue had to state both facts. What
    // it drew was two bands of divided numbered cells, stacked, in two markup
    // families with two collapse rules, answering one question and differing
    // only in which quantities they picked.
    //
    // So the second section is gone and this one takes a preset. `progress` is
    // what `topic-stats` drew, cell for cell; `totals` is what `journal-totals`
    // drew; and `summary` is the two of them at once, inside the four cells a
    // band gets. See `stats-band.ts`.
    //
    // THE DEFAULT STAYS THE DEEPEST INDEX and stays `progress`, which is the
    // half of this that must not change: every Study Topic index in every vault
    // has drawn that band since 3.11, and a merge that quietly re-picked its
    // numbers would be the release editing notes it did not compose. One level
    // up the same numbers are already a column each in the children table.
    default: (ctx) => !ctx.hasSubContainers,
    // ── AND IT ASKS NOTHING HERE, AS OF 4.48 ──────────────────────────
    //
    // 4.46 asked ONE question naming a whole arrangement; 4.47 corrected that to
    // FOUR, one per cell, and drew four `<select>` boxes wrapped across the
    // section's row. Reported from a vault as clutter, and the reader was right:
    // the row of boxes was a MODEL OF THE BAND, drawn beside the band, in a
    // window whose job is which sections a note has rather than what is inside
    // one.
    //
    // **THE CONTROL IS ON THE CELL NOW** — a `⋯` per cell, revealed on hover,
    // with the same rows this offered plus *Add cell* and *Remove cell*. See
    // `ui/widgets/stats-band-menu.ts`, which writes through `withAnswers` and
    // `slotQuestions` exactly as this row did, so nothing about the file format
    // or the migration of an older keyword changed with the control.
    //
    // The questions did not go anywhere; they stopped being the CATALOGUE's.

    // ALL THREE SPELLINGS, AND THE OTHER TWO ARE NOT SPECULATIVE. A locator that
    // knew only `stats-band` would report this section ABSENT on every index
    // note composed before 4.46 and offer to add a second copy of what is
    // already there — 4.16 §1's finding, arriving through a merged directive
    // instead of a renamed one. Both old words still render.
    claims: [...STATS_BAND_WORDS],
    locate: (t) => probe(t, statsBandProbe()),
    // BARE WHERE THE PRESET IS THE SCOPE'S OWN DEFAULT, which is how a Topic
    // index composed by this release and one composed by 4.45 come out reading
    // the same. `resolveStatPreset` gives a bare band `progress` inside a
    // container, so writing the word would be the note stating a rule the plugin
    // already applies — and a directive with nothing in its argument is one
    // fewer thing to go stale.
    // BARE WHERE THE ARRANGEMENT IS THE SCOPE'S OWN, which is how a Topic index
    // composed by this release and one composed by 4.45 come out reading the
    // same: `bandMeasures` gives a bare band `progress` inside a container, so
    // writing anything would be the note stating a rule the plugin applies.
    //
    // A PRESET NAMED IN A LAYOUT IS WRITTEN AS ITS CELLS (4.47), not as its
    // word. The word still resolves — every note in every vault carries one —
    // but a note composed today should say what it draws, so that the four boxes
    // in *Edit sections…* are showing the reader their own line rather than a
    // shorthand the plugin expanded on their behalf.
    render: (_ctx, opts) => {
      const preset = opts?.preset;
      if (!preset || preset === DEFAULT_CONTAINER_PRESET) {
        return [fence(["stats-band"])];
      }
      const cells = STAT_PRESET_SHORTHAND[preset] ?? preset;
      return [fence([`stats-band:${cells}`])];
    },
  },

  {
    id: "children",
    icon: "🗂️",
    label: "What's below this note",
    blurb: "A live table of the folders or notes inside this one.",
    surface: "index",
    default: always,
    claims: ["header", "button", "topics-table", "kind-table"],
    // EITHER SPELLING, ABOVE THE DEEPEST LEVEL (4.16 §1). The catalogue now
    // writes `level-index`; every Subject index note already in a vault carries
    // `topics-table`, which still renders and is the same section. A locator
    // that knew only the new word would report the section ABSENT on every
    // existing note and offer to add a second copy of what is already there —
    // which is the failure this catalogue's own comment warns about for a
    // renamed header, arriving through a renamed directive instead.
    locate: (t, ctx) =>
      ctx.hasSubContainers
        ? probe(t, /^(?:level-index|topics-table)\b.*$/m)
        : probe(t, kindTableProbe(ctx)),
    // ONE FENCE, EITHER WAY.
    //
    // This section used to emit a header fence and a body block as separate
    // markdown, and Obsidian renders each block as its own sibling element —
    // so the title and the table it titles were two boxes with a gap between
    // them that no styling could close. That is the same limit 2.13.9 removed
    // from the Journals card ("one fence is one container, so the card is real
    // rather than a resemblance") and 2.18.4 removed from the entry banner,
    // and the journal dashboards never got the same treatment.
    //
    // Welding them works because the block processor already understands it: a
    // `header:` opens a bar and the `button:` after it anchors into that bar,
    // then a composite widget closes the bar and appends to the same container.
    // Several headers in one fence is likewise already handled — each opens a
    // new bar — which is what lets the deepest index carry every kind in a
    // single fence rather than one per kind.
    //
    // The deepest branch got there by way of `kind-table` (tables.ts). Its
    // ```base tables could not be folded in at all, because a base block cannot
    // live inside a chronoanvil fence; making the table native is what made the
    // rule reachable, and it is why that widget exists.
    // A TITLE ONLY WHERE THERE IS ONE (3.18 §3.2). Above the deepest level this
    // section is a single folder rollup with one header, and `label` names it.
    // ON the deepest level it emits one header PER NOTE KIND, so "the title" is
    // not a thing the section has — asking for one and then silently applying
    // it to the first kind's header would be the worse kind of guess. Those are
    // named per kind through `fields` instead, which is the field `resources`
    // already uses for exactly this job, and they are reachable from a saved
    // layout rather than from this control.
    questions: (ctx) =>
      ctx.hasSubContainers
        ? [
            {
              kind: "title",
              key: "label",
              label: "this section's title",
              directive: "header",
              settled: TITLE_SETTLED,
              placeholder: `🗂️ ${plural(
                ctx.type.levels[(ctx.depth ?? 0) + 1]?.noun ?? "Item"
              )}`,
            },
          ]
        : [],
    render: (ctx, opts) => {
      if (ctx.hasSubContainers) {
        const child = ctx.type.levels[(ctx.depth ?? 0) + 1];
        return [
          fence([
            `header:${opts?.label ?? `🗂️ ${plural(child.noun)}`}`,
            `button:${ctx.type.id}:new-container`,
            // BARE, so it means "what is below THIS note" — the widget's own
            // default, and exactly what the word it replaces always meant. A
            // catalogue that wrote a journal id here would be writing the host's
            // own identity into the host's own note, which is the thing
            // `hostFolder` exists to avoid one layer up.
            "level-index",
          ]),
        ];
      }
      // The deepest index: its children are notes, so one table per kind
      // rather than a folder rollup. Per kind rather than one combined table
      // because the kinds are rated on different things — a single table would
      // need a column for every rating in the type and leave most of it blank.
      //
      // COMPOSED FROM `childrenParts`, which is also what `parts` returns
      // (3.18 §1.3). One list, two readers: the renderer that writes the fence
      // and the planner that notices a fence is short of one. Deriving them
      // separately is the drift that would let the plan report a gap filling
      // it could not close.
      return [fence(childrenParts(ctx, opts).flatMap((p) => p.lines))];
    },
    // Its `fields` keys are kind ids — see `fieldKeys`. This is the one section
    // whose overrides cannot cross a journal boundary unresolved.
    fieldKeys: "kinds",
    parts: (ctx, opts) => childrenParts(ctx, opts),
  },

  {
    id: "pages",
    icon: "📄",
    label: "Pages",
    blurb: "The index of pages this note has been split across.",
    surface: "leaf",
    applies: (ctx) => ctx.hasPages,
    default: (ctx) => ctx.hasPages,
    claims: ["header", "button", "pages-table"],
    locate: (t) => probe(t, /^pages-table\s*$/m),
    render: (ctx) => [
      fence([
        "header:📄 Pages",
        `button:${ctx.type.id}:new-page`,
        "pages-table",
      ]),
    ],
  },

  {
    id: "find",
    icon: "🔎",
    label: "Find",
    blurb: "Full-text search across the notes beneath this one.",
    surface: "index",
    // Pre-ticked only where there is a tree to search. On the deepest index
    // the notes are already listed on the page, so a search box over them is
    // a control that duplicates the table above it.
    default: (ctx) => ctx.hasSubContainers,
    questions: (ctx) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to search",
        directive: "journal-search",
        hostFolder: ctx.hostFolder ?? null,
        // `journalFolderScope`'s third state, offered by name rather than left
        // for a reader to guess at the spelling of (3.15 §9.1).
        keywords: [{ value: SCOPE_ALL, label: "Every journal" }],
      },
    ],
    claims: ["header", "journal-search"],
    locate: (t) => probe(t, /^journal-search\b/m),
    render: () => [fence(["header:🔎 Find", "journal-search"])],
  },

  {
    id: "review",
    icon: "🔁",
    label: "Review queue",
    blurb: "Notes that have come round for another look.",
    surface: "index",
    default: always,
    questions: (ctx) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to review",
        directive: "review-queue",
        hostFolder: ctx.hostFolder ?? null,
        // `journalFolderScope`'s third state, offered by name rather than left
        // for a reader to guess at the spelling of (3.15 §9.1).
        keywords: [{ value: SCOPE_ALL, label: "Every journal" }],
      },
    ],
    claims: ["header", "review-queue"],
    locate: (t) => probe(t, /^review-queue\b/m),
    // THE CELL THAT OPENS THE ROW, so on a container index this composes the
    // band's single bar and Open tasks below composes none. On a leaf index
    // there is no row and it keeps the title it has always written.
    row: (ctx) => (ctx.hasSubContainers ? DUE_ROW : undefined),
    render: (ctx) => [
      fence([ctx.hasSubContainers ? DUE_BAR : "header:🔁 Review", "review-queue"]),
    ],
  },

  {
    id: "tasks",
    // ⏳ AND NOT 📊 — 4.25 §1. This was the charts glyph on the open-tasks
    // section, and it was the only one: `widget-registry.ts`, both dashboard
    // catalogues and `home-sections.ts` all token this widget with the hourglass.
    // The `header:` line two dozen lines below carried the same mistake, so one
    // section drew the wrong icon in the section editor AND wrote the wrong one
    // into the note.
    icon: "⏳",
    label: "Open tasks",
    blurb: "Every unfinished task in the notes beneath this one.",
    surface: "index",
    default: (ctx) => ctx.hasSubContainers,
    questions: (ctx) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to collect tasks from",
        directive: "tasks-table",
        hostFolder: ctx.hostFolder ?? null,
        // 3.18 §5.3. Offered BY NAME rather than left for a reader to guess the
        // spelling of, which is the rule 3.15 §9.1 settled for `journal-search`.
        // `all` is deliberately not offered here: every registered journal's
        // open tasks on one subject's dashboard is a table nobody asked for,
        // and the word means something broader than the button that cycles to
        // this one says.
        keywords: [{ value: SCOPE_JOURNAL, label: "This whole journal" }],
      },
    ],
    claims: ["header", "tasks-table"],
    locate: (t) => probe(t, /^tasks-table\b/m),
    // THE SECOND CELL, AND SO NO BAR — see `DUE_BAR` above the catalogue. Ticked
    // onto a leaf index, where there is no row, it composes its own title again.
    //
    // MOVED UP THE CATALOGUE IN 4.70, from last among the index sections to
    // directly under Review, because catalogue order is composition order and
    // two cells of one row have to be adjacent. What it displaced — Progress and
    // Charts — are the two blocks that read as the bottom of the page anyway.
    row: (ctx) => (ctx.hasSubContainers ? DUE_ROW : undefined),
    render: (ctx) => [
      fence(
        ctx.hasSubContainers
          ? ["tasks-table"]
          : ["header:⏳ Open tasks", "tasks-table"]
      ),
    ],
  },

  {
    id: "progress",
    icon: "📈",
    label: "Progress",
    blurb: "A calendar heatmap of activity in the notes beneath this one.",
    surface: "index",
    default: (ctx) => ctx.hasSubContainers,
    claims: ["header", "activity-chart"],
    locate: (t) => probe(t, /^activity-chart\s*$/m),
    render: () => [headerBar("📈 Progress", "activity-chart")],
  },

  {
    id: "charts",
    icon: "📊",
    label: "Charts",
    blurb: "A managed region of tracker charts, with Add / Edit / Remove.",
    surface: "index",
    default: always,
    claims: ["jchart"],
    locate: (t) => t.indexOf(JOURNAL_CHARTS_FENCE),
    render: (ctx) => {
      const specs: string[] = [];
      // Seeded only when the type rates something. A charts region with no
      // `jchart:` lines is still a working managed region — Add chart writes
      // into it — so a type that measures nothing gets the affordance without
      // a chart of a property none of its notes carry.
      if (ctx.rating) {
        specs.push(`jchart:j1:trend:${ctx.rating}`);
        // The breakdown ranks the containers below, so it needs containers.
        if (ctx.hasSubContainers) {
          specs.push(`jchart:j2:breakdown:${ctx.rating}`);
        }
      }
      return [
        fence(
          ["header:📊 Charts", ...specs],
          JOURNAL_CHARTS_FENCE.slice(FENCE.length)
        ),
      ];
    },
  },

  // ── The 4.35 band that is left ────────────────────────────────────
  //
  // WAS TWO, AND `totals` IS NOW A PRESET OF `stats` ABOVE (4.46). What that
  // section's own note argues is the whole of it: two bands of divided numbered
  // cells, stacked on one Media shelf, were one idea drawn twice.
  //
  // `default: never`, AND THAT IS FORCED RATHER THAN CHOSEN. The
  // catalogue holds a `JournalType` and no plugin, so it cannot see whether a
  // vault has a vocabulary worth counting — which is `bridge`'s own argument,
  // verbatim, a few sections down. A section that defaulted on would write a
  // band into every journal in every vault and draw nothing in almost all of
  // them.
  //
  // So the presets that want it turn it on through `layout.sections`,
  // which is the field that can: `defaultSectionIds` filters on
  // `required || default(ctx)` regardless of layout, so `order` alone could
  // only rearrange what was already on. That is what §0 makes possible, and it
  // is the whole reason §0 ships first.
  //
  // NOTHING PLACES IT ON A JOURNAL THAT ALREADY EXISTS. A reader adds it from
  // *Edit sections…*, which is the silence 4.29 and 4.33 both chose.
  {
    id: "tally",
    icon: "🔢",
    label: "Tally",
    blurb: "How many of the things beneath this one sit at each value of a tracker.",
    surface: "index",
    default: never,
    claims: ["journal-tally"],
    locate: (t) => probe(t, /^journal-tally:/m),
    // THE TRACKER IS AN OVERRIDE WITH A DEFAULT, not a required question. The
    // catalogue cannot read the registry, so it names the one id every journal
    // is guaranteed to define — `status` is unified across every journal and
    // every kind — and a type that measures something better says so through
    // `options.tally.tracker`. Exactly the shape `bridge` uses for the same
    // reason, and the field is the one `SectionOverrides.tracker` already is.
    render: (_ctx, opts) => [
      fence([`journal-tally:${opts?.tracker ?? DEFAULT_TALLY_TRACKER}`]),
    ],
  },

  {
    id: "tags",
    icon: "🏷️",
    label: "Tags",
    blurb: "Every tag on the notes beneath this one, most-used first.",
    surface: "index",
    // OFF BY DEFAULT, AND THE ONE REASON IS TASTE — unlike `bridge`, which is
    // off because the catalogue cannot see whether the vault has a tracker
    // worth pulling. A tag cloud works on any index from the first tagged note;
    // whether a journal is a place you tag things is a fact about how somebody
    // writes, and no shipped Study template carries one.
    default: never,
    // INDEX ONLY. A leaf note's tags are its own frontmatter, so a cloud of
    // them is a list of four pills that says nothing a reader cannot see in
    // the properties panel. An index has a tree beneath it, which is what
    // makes a cloud a summary rather than a restatement.
    questions: (ctx) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to read tags from",
        directive: "tag-index",
        hostFolder: ctx.hostFolder ?? null,
      },
    ],
    claims: ["header", "tag-index"],
    locate: (t) => probe(t, /^tag-index\b/m),
    // BARE, WHICH SCOPES TO THE HOST NOTE'S OWN FOLDER. That is the same rule
    // `tasks`, `review` and `find` already emit — and as of 3.11 §6 it is what
    // the directive means with no argument, which it did not before: it used
    // to read the configured diary root, so a bare one here would have counted
    // diary tags on a Subject Index.
    //
    // A FOLDER COULD NOT HAVE BEEN WRITTEN HERE ANYWAY, which is worth stating
    // because it is why harmonising the default was the fix rather than one of
    // the alternatives. `SectionContext` has no folder in it — a journal
    // template is composed once and used in every folder of its level — so the
    // catalogue has nothing to interpolate. `{{folder}}` would have resolved at
    // container creation and been written literally by the section editor,
    // which is a worse failure than the one it fixes.
    render: () => [headerBar("🏷️ Tags", "tag-index")],
  },

  {
    id: "path",
    icon: "🧭",
    // RENAMED IN 3.18 (§5.1). The id stays `path`, the directive stays `path:`
    // and the region key stays `path` — an id with a name in it has an
    // unbounded space, so a saved layout would stop matching the day the label
    // moved, and the region key is where readers' existing text lives.
    label: "Task manager",
    blurb: "An ordered route through the notes here, for working in sequence.",
    surface: "index",
    // The deepest index is where the notes actually are, so it is the only
    // level at which "do these in order" means anything.
    default: (ctx) => !ctx.hasSubContainers,
    // 3.18 §3. The override has been honoured since it existed; this is the
    // control for it.
    questions: () => [
      {
        kind: "title",
        key: "label",
        label: "this section's title",
        directive: "header",
        settled: TITLE_SETTLED,
        placeholder: "🧭 Task Manager",
      },
    ],
    claims: ["header", "path"],
    locate: (t) => probe(t, /^path:/m),
    render: (_ctx, opts) => {
      // One key for every type. `key` was an override here until 2.41, set by
      // Study alone so its composed template kept emitting `learning-path` —
      // the region existing Topic notes already stored their text in. That is
      // compatibility, not expressiveness, and there are no notes to be
      // compatible with.
      const key = "path";
      return [
        headerBar(opts?.label ?? "🧭 Task Manager", `path:${key}`),
        region(key),
      ];
    },
  },

  {
    id: "resources",
    icon: "📚",
    label: "Resources",
    blurb: "Attached files and links, as a row of tiles.",
    surface: "both",
    default: (ctx) => ctx.noteKind === "index" && !ctx.hasSubContainers,
    questions: () => [
      {
        kind: "title",
        key: "label",
        label: "this section's title",
        directive: "header",
        settled: TITLE_SETTLED,
        placeholder: "📚 Resources",
      },
    ],
    claims: ["header", "attach"],
    locate: (t) => probe(t, /^attach:/m),
    render: (_ctx, opts) => {
      const fields = opts?.fields ?? [{ key: "resources", label: "Files" }];
      return [
        headerBar(
          opts?.label ?? "📚 Resources",
          ...fields.map((f) => `attach:${f.key}|${f.label}`)
        ),
        ...fields.map((f) => region(f.key)),
      ];
    },
  },

  {
    id: "headings",
    icon: "📝",
    label: "Prose skeleton",
    blurb: "The markdown headings a note of this kind opens with.",
    surface: "leaf",
    // On by default, and PLAIN MARKDOWN rather than a widget. Until 2.42 the
    // catalogue could not express a heading at all, so Study's Lesson and
    // Practice stayed hand-written assets while every custom journal's notes
    // were composed — which meant a custom journal's leaf note arrived with a
    // banner and nothing else, and nobody reading the code would notice.
    //
    // Headings rather than `note:` fields (the `prose` section below) because
    // they survive the plugin being uninstalled and stay editable in any
    // editor. A field is for prose you want to look like a field; this is for
    // the shape of the document.
    default: always,
    // Emits no directive — it is markdown — so there is nothing to claim. See
    // the catalogue shape test, which exempts it by name.
    claims: [],
    // "Does this note already have prose headings?" is the question that
    // matters to both callers: the equivalence test asking what a template
    // contains, and "add a section" declining to append a second skeleton.
    locate: (t) => probe(t, /^##\s+\S/m),
    render: (ctx, opts) => {
      const headings = opts?.headings ?? defaultHeadings(ctx);
      // One markdown block per heading, which is what makes the whole section
      // unremovable: the plugin cannot tell these from the reader's own prose,
      // and that is the price of headings that survive it being uninstalled.
      return headings.map((h) =>
        markdown([`## ${h.title}`, "", ...(h.body ?? [""])])
      );
    },
  },

  {
    id: "bridge",
    icon: "🌉",
    label: "From the diary",
    blurb: "A tracker's diary readings, over a period this note picks.",
    surface: "leaf",
    // OFF BY DEFAULT, and the only section here that is off for a reason other
    // than taste. Every other default answers "does this arrangement suit this
    // note"; this one answers "has the reader got a tracker worth pulling
    // across", which the catalogue cannot see — it has a JournalType and no
    // plugin, so it cannot read the tracker registry. Pre-ticking would emit
    // `bridge-readings:` naming a tracker that may not exist, and a refusal on
    // every leaf note of a fresh journal is exactly the state `confidence-trend`
    // stays silent to avoid.
    default: never,

    // NOT OFFERED ON A PAGE. A page has no frontmatter of its own worth
    // anchoring — it names its parent instead of a date — so a period property
    // on one would be a window nothing else on the page agrees with. This is
    // the §2.3 move: a bridge that cannot work is not offered, rather than
    // offered and then refused in the note.
    applies: (ctx) => ctx.noteKind !== "page",

    claims: ["period-nav", "bridge-readings"],
    locate: (t) => probe(t, /^bridge-readings\b/m),

    // THE ANCHOR SHIPS WITH THE BRIDGE, and that pairing is the whole section.
    //
    // A journal note has no period of its own: the four `*-start` properties
    // live only on the diary's own dashboards, so until 2.57.0 a
    // `bridge-readings:` written on a leaf note could only ever refuse. The fix
    // is not to invent a second kind of window — it is to let the note say
    // which period it means, using the property every chart and summary in the
    // plugin already reads, written by the widget that already writes it.
    //
    // `period-nav:month` rather than `:week` because a journal leaf is revisited
    // over weeks; a week-scoped bridge on a routine note would be empty more
    // often than not.
    //
    // SCOPED TO THE BRIDGE ON PURPOSE. The property this writes is the same
    // `month-start` a diary dashboard carries, so anything period-scoped would
    // read it — but nothing period-scoped is offered on a leaf, and a test
    // pins that. Widening it later is a decision to make once, out loud;
    // arriving at it because a widget quietly started counting differently is
    // how a scope rule stops being one.
    render: (_ctx, opts) => {
      // Mood by default, and only because it is the one tracker a fresh vault
      // is guaranteed to have: it ships enabled, it is diary-surfaced, and it
      // is numeric. Emitting `bridge-readings:` with no tracker would write a
      // directive that refuses the moment it renders, which is the state §2.3
      // exists to make impossible — a section is offered because it works.
      const tracker = opts?.tracker ?? DEFAULT_BRIDGE_TRACKER;
      // NO `header:` LINE. A bridge draws its own section frame as of 2.57.7 —
      // it is a section, not a thing that sits in one — so a header directive
      // above it would be a bar inside a bar. The period navigator rides in the
      // same fence and lands above it.
      return [fence(["period-nav:month", `bridge-readings:${tracker}`])];
    },
  },

  {
    id: "recall",
    icon: "🧠",
    label: "Recall cards",
    blurb: "Question-and-answer cards; grading writes this note's rating.",
    surface: "leaf",
    // Long-form enough to be worth drilling: a note that can be split across
    // pages, or one of those pages. An exercise set is already the drill.
    default: (ctx) => ctx.documentLike,
    claims: ["recall"],
    locate: (t) => probe(t, /^recall:/m),
    render: () => [fence(["recall:recall|🧠 Recall"]), region("recall")],
  },

  {
    id: "checklist",
    icon: "✅",
    label: "Tasks",
    blurb: "A checklist on this note, counted by the rollups above it.",
    surface: "leaf",
    // Not on a page: the tasks of a document belong to the document, and
    // spreading them across its parts is how a rollup starts double-counting.
    default: (ctx) => ctx.noteKind !== "page",
    claims: ["tasks"],
    locate: (t) => probe(t, /^tasks:/m),
    render: () => [fence(["tasks:tasks|✅ Tasks"]), region("tasks")],
  },

  {
    id: "prose",
    icon: "📝",
    label: "Notes field",
    blurb: "A free-text box that saves into the note body.",
    surface: "both",
    // Off by default: the shipped templates write their prose as ordinary
    // markdown headings, which stay editable in any editor and survive the
    // plugin being uninstalled. The widget is for a field you want to look
    // like a field.
    default: never,
    claims: ["note", "list"],
    locate: (t) => probe(t, /^(note|list):/m),
    render: (_ctx, opts) => {
      const fields = opts?.fields ?? [
        { key: "notes", label: "Notes and reflections…|Notes" },
      ];
      return [
        fence(fields.map((f) => `note:${f.key}:${f.label}`)),
        ...fields.map((f) => region(f.key)),
      ];
    },
  },
];

// The skeleton a leaf note opens with when its type hasn't said otherwise.
//
// DELIBERATELY GENERIC. A page is one part of a longer document, so it gets a
// single Notes heading and nothing that would duplicate its parent's framing.
// Everything else gets Overview / Notes / Next steps — which is the most a
// catalogue can honestly assume, because the headings are the one part of a
// template that is about what the journal is FOR, and the catalogue does not
// know. Study says otherwise in its layout; so may any type, and the wizard's
// checklist can untick the section entirely.
function defaultHeadings(ctx: SectionContext): { title: string; body?: string[] }[] {
  if (ctx.noteKind === "page") return [{ title: "Notes" }];
  return [{ title: "Overview" }, { title: "Notes" }, { title: "Next steps" }];
}

// ── derived helpers ───────────────────────────────────────────────────────

// A crude plural for a header bar or a column heading. Deliberately crude: a
// real pluralizer is a dependency to get "Practice" wrong in a new way, and
// every place this is used is a label the reader can overrule (a template they
// edit, a column above numbers that speak for themselves).
// A kind's plural: its own if it declared one, else the crude rule.
export function kindPlural(kind: JournalKind): string {
  return kind.plural ?? plural(kind.label);
}

// Re-exported from util.ts, where it moved in 2.44 — tables.ts and the tests
// know it by this name, and it is still the catalogue's own pluraliser for
// kindPlural above.
export { plural } from "../core/util";

// Where the deepest index's note tables begin.
//
// Probes for `kind-table:<id>` — the directive the section now emits. Until
// 2.54 this matched `type == "<id>"`, the filter line inside the ```base block
// that widget replaced; the section is the same section, and this is the same
// question asked of its current output.
//
// Any of the type's kinds counts, because the section is one block carrying
// every kind: a reader who deleted one kind's table by hand still has the
// section, and offering to append a second copy of the whole thing would be
// worse than leaving it alone.
// The pieces the deepest index's children table is built from — one per note
// kind. 3.18 §1.
//
// Empty above the deepest level, where the section is a single folder rollup
// and has nothing repeatable in it: a level has one child level, not a list of
// them, so there is no piece for a journal to gain. Empty means all-or-nothing,
// which is what the section was everywhere before 3.18.
export function childrenParts(
  ctx: SectionContext,
  opts?: SectionOverrides
): SectionPart[] {
  if (ctx.hasSubContainers) return [];
  // Per-kind headings, keyed by kind id — the same `fields` shape `resources`
  // uses for its shelves, because it is the same decision: a section that emits
  // several of one thing names them individually or not at all.
  const named = new Map((opts?.fields ?? []).map((f) => [f.key, f.label]));
  return ctx.type.kinds.map((kind) => {
    const heading = named.get(kind.id) ?? `${kind.emoji} ${kindPlural(kind)}`;
    return {
      id: kind.id,
      label: kindPlural(kind),
      // Last of the three, which is the rule SectionPart states and the reason
      // an inserted part lands after the group before it rather than inside it.
      probe: `kind-table:${kind.id}`,
      lines: [
        `header:${heading}`,
        `button:${ctx.type.id}:new-${kind.id}`,
        `kind-table:${kind.id}`,
      ],
    };
  });
}

function kindTableProbe(ctx: SectionContext): RegExp {
  const ids = ctx.type.kinds.map((k) =>
    k.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(`^\\s*kind-table:(${ids.join("|")})\\s*$`, "m");
}

// The rating an index note's charts should plot: the first one any kind of
// this type declares. An index is not itself graded, so it has no rating of
// its own; what it can chart is whatever the notes beneath it are rated on.
// First-declared rather than most-common because the order of `kinds` is the
// order the user wrote them, and the first is the type's primary kind
// everywhere else too (it is the one whose create button is `primary`).
export function typeRating(type: JournalType): string | null {
  return type.kinds.find((k) => k.rating)?.rating ?? null;
}

// Build the context for one surface of one type. The single place a
// JournalType is taken apart, so a section never has to.
export function sectionContext(
  type: JournalType,
  target:
    | { depth: number }
    // variantId names which of the kind's saved layouts this is. Optional, so
    // every existing caller keeps working and gets the default one.
    | { kind: JournalKind; variantId?: string }
    | { page: JournalKind }
): SectionContext {
  if ("depth" in target) {
    const { depth } = target;
    const level = type.levels[depth];
    return {
      type,
      noteKind: "index",
      depth,
      level,
      kind: null,
      typeValue: level.id,
      ownNoun: level.noun,
      hasSubContainers: depth < type.levels.length - 1,
      hasPages: false,
      documentLike: false,
      rating: typeRating(type),
    };
  }
  const isPage = "page" in target;
  const kind = isPage ? target.page : target.kind;
  const variantId = isPage ? undefined : target.variantId;
  const hasPages = !isPage && kind.pages != null;
  return {
    type,
    noteKind: isPage ? "page" : "leaf",
    depth: null,
    level: null,
    kind,
    // A page has no variant: every paged kind shares one page template (see
    // buildJournalType), so there is nothing for a variant to distinguish.
    ...(variantId ? { variantId } : {}),
    typeValue: isPage ? (kind.pages?.id ?? "page") : kind.id,
    ownNoun: isPage ? (kind.pages?.label ?? "Page") : kind.label,
    hasSubContainers: false,
    hasPages,
    documentLike: hasPages || isPage,
    rating: kind.rating ?? null,
  };
}

// Does this section belong on this surface at all?
export function sectionApplies(
  section: JournalSection,
  ctx: SectionContext
): boolean {
  // A SECTION'S `surface` STAYS TWO-VALUED, AND CORRECTLY SO. It says where a
  // section may be written — an index, or a note with a body — and a page is
  // the second of those for that purpose. The three-valued fact is what the
  // NOTE is; the two-valued one is what the section accepts. Collapsing them
  // would make every section state an opinion about pages when almost none has
  // one; the few that do use `applies`.
  const accepts = ctx.noteKind === "index" ? "index" : "leaf";
  if (section.surface !== "both" && section.surface !== accepts) {
    return false;
  }
  return section.applies ? section.applies(ctx) : true;
}

// The sections offered for a surface, in catalogue order — or in the order a
// template's layout asks for, with anything it doesn't name following behind.
export function sectionsFor(
  ctx: SectionContext,
  layout?: TemplateLayout
): JournalSection[] {
  const offered = JOURNAL_SECTIONS.filter((s) => sectionApplies(s, ctx));
  // A saved layout's `sections` list is already in the order it wants, so it
  // doubles as `order` — see TemplateLayout. `order` still wins when both are
  // set, on the general rule that the more specific field does.
  const order = layout?.order ?? layout?.sections;
  if (!order?.length) return offered;
  const rank = new Map(order.map((id, i) => [id, i]));
  return offered
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      // A REQUIRED SECTION LEADS, WHATEVER THE LAYOUT SAYS (3.18 §2).
      //
      // Not taste, and not a second spelling of `required`'s existing job. The
      // banner's first block is `chronoanvil:spacer`, documented as sitting on LINE
      // 0 OF THE BODY so a click at the top of a note lands on it rather than
      // inside the banner fence — which renders the fence as raw source. A
      // layout that named another section first would compose a template whose
      // spacer is halfway down, and the defect surfaces as a note that
      // sometimes shows its own markup.
      //
      // Enforced HERE rather than trusted from the caller, which is exactly the
      // argument composeTemplate already makes about `required` and inclusion:
      // the wizard cannot produce this order, and this function is also what a
      // preset, a saved variant and any future caller reach.
      const pa = a.s.required ? 0 : 1;
      const pb = b.s.required ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ra = rank.get(a.s.id) ?? Infinity;
      const rb = rank.get(b.s.id) ?? Infinity;
      // Catalogue order breaks ties, so an unlisted section keeps its relative
      // position rather than being reshuffled by sort instability.
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map((e) => e.s);
}

// The ids a fresh journal starts with — the arrangement every step of the
// wizard opens pre-ticked, and the set the generator writes with no GUI at
// all. One function so the two can never offer different things.
export function defaultSectionIds(
  ctx: SectionContext,
  layout?: TemplateLayout
): string[] {
  return sectionsFor(ctx, layout)
    .filter((s) => s.required || s.default(ctx))
    .map((s) => s.id);
}

// WHAT A LAYOUT ACTUALLY ASKS FOR — one precedence, in one place.
//
// `defaultSectionIds` filters on `required || default(ctx)` REGARDLESS of the
// layout, so a layout can reorder what the catalogue already turns on and
// cannot turn anything on itself. A `sections` list is the field that can:
// it is a complete answer, not a preference, and it wins outright.
//
// This exists so the composer and the wizard read ONE derivation rather than
// two that happen to agree. `composeTemplate` had this precedence inline and
// the wizard had none of it at all — it seeded from `defaultSectionIds(ctx)`
// with no layout, so installing a preset through the Presets button replaced
// the arrangement the preset exists to ship with catalogue order.
export function chosenSectionIds(
  ctx: SectionContext,
  layout?: TemplateLayout
): string[] {
  return layout?.sections ? [...layout.sections] : defaultSectionIds(ctx, layout);
}

// Every template a type owns, paired with the surface context that template is
// written against. The wizard's left rail is a map over this, and so is the
// generator's file loop — which is the point: a rail that listed different
// templates from the ones the generator writes is the "offer set drifts from
// what is emitted" failure the one-catalogue rule exists to prevent.
export interface TemplateTarget {
  // Stable across a redraw of the wizard, so the rail's selection survives one.
  key: string;
  // The file this template is written to, relative to the templates folder.
  file: string;
  // Shown on the rail ("Subject Index", "Lesson").
  label: string;
  ctx: SectionContext;
}

// The layout key for the template a given surface is written into.
//
// `templateTargets` composed these inline and was the only thing that knew the
// spelling, which meant a caller holding a SectionContext — "add a section to
// this note" — had no way to find the type's overrides for it and rendered
// every section with the catalogue's defaults instead. On a Study Topic index
// that turned the three resource shelves the template ships with into one.
//
// One derivation, so a key produced here and a key looked up in `type.layout`
// cannot drift.
export function templateKeyFor(ctx: SectionContext): string {
  if (ctx.noteKind === "index") return `index:${ctx.depth ?? 0}`;
  if (ctx.noteKind === "page") return "page";
  // A variant is a template of its own, so it needs a key of its own — this is
  // what lets the launcher rail list it, the designer edit it and the repair
  // path write it. The default variant keeps the bare `kind:<id>` key it has
  // always had, so nothing that already reads a layout has to change.
  const variant =
    ctx.variantId && ctx.variantId !== "default" ? `:${ctx.variantId}` : "";
  return `kind:${ctx.kind?.id ?? ""}${variant}`;
}

// ── Where a saved layout may be offered (4.33) ───────────────────────────
//
// A saved layout used to be offered on KINDS and nothing else, because a kind
// was the only surface a note is created FROM A CHOICE of template: `newNote`
// prompts with `kind.templates` and `promptNewNote` draws the dropdown. An
// index note and a page have exactly one template each — `newTopLevel` and
// `newContainer` always read `level.indexTemplate`, `newPage` always reads the
// shared `page.md` — so a layout there could never have been picked at
// creation.
//
// THAT IS STILL TRUE, AND IT IS WHY THESE TWO ARE NOT KINDS. A front-page or
// page layout is a RECIPE: something to reload onto a note, or to press into
// that surface's default. It mints no template file and appears in no dropdown,
// and `templateKeyFor` above enforces it — the `index:` and `page:` arms carry
// no variant slot, so two named front-page layouts would both fold to
// `index:1` and the second would silently win. They are therefore resolved
// straight off `cfg.variants` and never folded into `type.layout`.
//
// ONE TAG FOR EVERY FRONT PAGE, regardless of depth. A two-level journal has a
// Subject Index and a Topic Index, and a `surface:index:<depth>` enumeration
// would be a checkbox per level for a question the reader answers by choosing
// which page to stand on: reload is per-note, and "save as the default" keys
// off `templateKeyFor` of the note in front of them.
export const LAYOUT_SURFACE_INDEX = "surface:index";
export const LAYOUT_SURFACE_PAGE = "surface:page";

// PREFIXED, SO A KIND CANNOT COLLIDE WITH A SURFACE. A journal's kind ids are
// the reader's — `freshCustomJournal` alone ships `entry`, and nothing stops
// someone naming one `index` or `page`. Bare ids would make the two
// indistinguishable in a ticked-target list, which is the class of collision
// the single filename allocator in `buildJournalType` exists to prevent one
// layer down.
export function targetIdFor(ctx: SectionContext): string {
  if (ctx.noteKind === "index") return LAYOUT_SURFACE_INDEX;
  if (ctx.noteKind === "page") return LAYOUT_SURFACE_PAGE;
  return ctx.kind?.id ?? "";
}

// Everywhere an arrangement saved here may be offered: this journal's kinds,
// then the two surfaces.
//
// KINDS FIRST because they are the common case and the origin in all but two
// of them, and a reader scanning for the note type they are on should find it
// before the two general ones.
// AND `Page` IS NOT OFFERED WHERE THERE ARE NO PAGES. `templateTargets` emits a
// `page` target only when some kind declares `pages`, so on a journal without
// one the checkbox would tick a surface the journal does not have and produce a
// layout nothing could ever reload. Every index has a front page, so that one
// is unconditional.
export function layoutTargetsFor(
  type: JournalType
): { id: string; label: string }[] {
  return [
    ...type.kinds.map((k) => ({ id: k.id, label: k.label })),
    { id: LAYOUT_SURFACE_INDEX, label: "Front page" },
    ...(type.kinds.some((k) => k.pages)
      ? [{ id: LAYOUT_SURFACE_PAGE, label: "Page" }]
      : []),
  ];
}

// A window's flat list of ticked target ids, split into the two things storage
// keeps them as.
//
// HERE RATHER THAN IN `saveVariant`, and the reason is a module cycle rather
// than taste: `journal-sections.ts` already imports `kindAllowsTracker` from
// `journal.ts` as a VALUE, so a value import back the other way would be a real
// runtime cycle — and the thing being imported is a module-level const, which
// is exactly what a cycle leaves in its temporal dead zone. Types cross that
// edge; functions do not. Same rule `variantKinds`' own comment states one
// module over.
//
// TWO CALLERS, ONE SPLIT: the banner's door (`section-insert.ts`) and the
// settings rail's (`settings-editors.ts`). The window itself never learns that
// a target can be anything but an opaque id, which is `ArrangementSink`'s
// contract.
export function splitLayoutTargets(
  kindIds: readonly string[],
  targets: readonly string[]
): { kinds: string[]; surfaces: ("index" | "page")[] } {
  const have = new Set(kindIds);
  const surfaces: ("index" | "page")[] = [];
  if (targets.includes(LAYOUT_SURFACE_INDEX)) surfaces.push("index");
  if (targets.includes(LAYOUT_SURFACE_PAGE)) surfaces.push("page");
  return { kinds: targets.filter((t) => have.has(t)), surfaces };
}

// The overrides a type declares for one section of one template, if any.
export function sectionOverrides(
  ctx: SectionContext,
  sectionId: string
): SectionOverrides | undefined {
  return ctx.type.layout?.[templateKeyFor(ctx)]?.options?.[sectionId];
}

export function templateTargets(type: JournalType): TemplateTarget[] {
  const out: TemplateTarget[] = type.levels.map((lvl, depth) => {
    const ctx = sectionContext(type, { depth });
    return {
      key: templateKeyFor(ctx),
      file: lvl.indexTemplate,
      label: lvl.indexTemplate.replace(/\.md$/, ""),
      ctx,
    };
  });
  for (const kind of type.kinds) {
    // One target per SAVED LAYOUT, not one per kind. A variant is a real
    // template file, so the launcher rail lists it, the template editor edits
    // it, ensureJournalTemplates writes it and refreshJournalTemplates reports
    // on it — all of which took `templates[0]` and were blind to variants
    // until 2.54.7, which is why the old one-entry list could never have been
    // extended "with no new plumbing".
    const variants = kind.templates.length
      ? kind.templates
      : [{ id: "default", label: kind.label, template: `${kind.id}.md` }];
    for (const variant of variants) {
      const ctx = sectionContext(type, { kind, variantId: variant.id });
      out.push({
        key: templateKeyFor(ctx),
        file: variant.template,
        // The kind alone for the default, "Lesson — Math" for a variant, so a
        // rail of five rows says which is which without reading paths.
        label:
          variant.id === "default"
            ? kind.label
            : `${kind.label} — ${variant.label}`,
        ctx,
      });
    }
  }
  // One page template for the whole type, from the first kind that has pages.
  // Every paged kind shares it (see journal.ts::buildJournalType), so emitting
  // one per kind would write the same file two or three times and give the
  // wizard a rail of identical rows.
  const paged = type.kinds.find((k) => k.pages);
  if (paged?.pages) {
    const ctx = sectionContext(type, { page: paged });
    out.push({
      key: templateKeyFor(ctx),
      file: paged.pages.template,
      label: paged.pages.label,
      ctx,
    });
  }
  return out;
}

export function findSection(id: string): JournalSection | undefined {
  return JOURNAL_SECTIONS.find((s) => s.id === id);
}

// Which catalogue sections a piece of markdown already contains, in the order
// they appear in the file. Used by the Study-equivalence test and by the "add
// a section" picker.
export function detectSections(text: string, ctx: SectionContext): string[] {
  return JOURNAL_SECTIONS.filter((s) => sectionApplies(s, ctx))
    .map((s) => ({ id: s.id, at: s.locate(text, ctx) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.id);
}
