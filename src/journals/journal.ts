// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import type { TemplateLayout , SectionOverrides } from "./journal-sections";
import { only, promptText, promptSuggester, promptNewNote } from "../ui/modals";
import {
  DEFAULT_ENERGY_FACES,
  DEFAULT_PAGE_EMOJI,
  DEFAULT_SUBJECT_EMOJI,
  DEFAULT_TOPIC_EMOJI,
  JOURNALS_DIRECTIVE,
  isJournalsDirective,
  ROOT_JOURNALS,
  ROOT_STUDY,
  TEMPLATES_ROOT,
  FENCE_OPEN,
  FENCE_CLOSE,
} from "../core/constants";
import { activeMarkdownFile, childFolders, childNotes, createFileEnsuringFolders, ensureFolder, fillTemplate, folderNotePath, frontmatterOf, getFile, getFolder, normaliseTypeValue, noteTypeOf, nowTimestamp, openFile, plural, readTemplate, slugify, today } from "../core/util";
// TYPE-ONLY, and load-bearing. `buildJournalType` used to be imported from
// custom-journal.ts as a value and called at module scope (STUDY_JOURNAL,
// below), while custom-journal.ts imports back from here — so whether that
// initialiser found a function or `undefined` depended on which module the
// loader entered first. It threw `TypeError: buildJournalType is not a
// function` for any importer that reached custom-journal.ts first; esbuild
// happened to order the real bundle acceptably from main.ts, so nothing
// caught it. The constructor now lives in this file and this import is erased
// at compile time, so there is no runtime edge from here to custom-journal.ts
// at all. See test/type-integrity.test.ts, which imports in the failing order.
import type {
  JournalConfig,
  JournalKindConfig,
  JournalPreset,
  JournalVariantConfig,
} from "./custom-journal";
import { insertBelowBanner, noteHasDirective } from "../trackers/entry-trackers";
import { splitGlyph } from "../ui/section-frame";
import { paintRung, pageIconOf, type RungMark } from "../ui/rung";
import { journalTypeOfPath } from "../trackers/trackers";
import { SCOPE_JOURNAL } from "../core/directive-grammar";
import { notify } from "../core/notify";
import { repaintOpenNotes } from "../ui/livewidget";
import {
  PAGE_LAYOUT_DEFAULT,
  PAGE_LAYOUT_KEY,
  configOfJournal,
  nextPageOrder,
  pageLayoutChoices,
  pageLayoutOf,
  pageLayoutShown,
  pageOrderOf,
} from "./page-default";
import {
  KIND_TABLES_KEY,
  PAGE_TYPES_KEY,
  pageTypesIn,
  storedKindTables,
  withKindTable,
  withPageType,
  withoutPageType,
  type KindTableOverride,
} from "./kind-tables";

// ── Who owns a template ──────────────────────────────────────────────────
//
// The plugin holds TWO OPPOSITE OWNERSHIP RULES, and naming the seam here is
// cheaper than rediscovering which side a new feature falls on:
//
//   THE DIARY'S TEMPLATES ARE THE PLUGIN'S. A daily/monthly template carries a
//   managed `# chronoanvil:trackers:start/end` region, and trackers.ts::syncTemplates
//   rewrites it whenever the registry changes. That is what `showInTemplate`
//   means: seed this onto every new entry of its class.
//
//   A JOURNAL TYPE'S TEMPLATES ARE THE USER'S. composeTemplate writes one, once,
//   and nothing regenerates it — see journal-sections.ts, which spends its
//   header on why. "Generates, never regenerates" is the rule, and
//   section-insert.ts is append-only by construction so that it cannot break it.
//
// Most of the awkwardness in both subsystems is a field trying to span both.
// `TrackerDef.showInTemplate` and `.showInBase` are diary-only and forced false
// for a journal surface, because a journal has several templates (one
// index per level, one per kind) and nothing rewrites any of them. Trackers
// still reach a journal note — the `banner` section seeds them at compose time
// from the kind's own declarations — but by a different route, at a different
// moment, from a different source of truth.
//
// So: before adding a field to either model, ask which side of this line it
// lives on. A field that wants to be on both is usually two fields.

// ── JournalType: everything that used to be hard-coded about Study ────────
//
// A journal type is a folder of notes arranged in a fixed hierarchy of
// container levels (Study: Subject → Topic), with leaf "kinds" of note
// (Study: lesson, practice) created inside the deepest container. Study is
// now just the first registered instance of this shape; a Custom Journal is
// another instance with a different depth, different nouns, and its own note
// kinds and templates.

// One container level in the hierarchy (a folder that holds sub-folders
// and/or notes). Study has two: Subject then Topic.
export interface JournalLevel {
  // Stable id for this level. The `type:` frontmatter value an index note at
  // this depth carries, the key its leaf notes name it by, and the stem of its
  // index template's filename.
  //
  // DERIVED FROM THE NOUN ONCE, AT CREATION, and never again — which is the
  // whole of 2.43 at this layer. It was computed on the fly as
  // `levelTypeValue(noun, depth)` until then, so renaming a level's noun on an
  // existing journal silently changed the value: `recognisedTypeValues` lost
  // the old spelling, so every index note already on disk stopped being
  // recognised as one of its journal's notes. The banner fell back to Study's
  // property names, the tracker surface went unclassified, and "Add a section"
  // refused with "this note isn't one a journal recognises" — all from
  // correcting a word in a settings field.
  //
  // A noun is a label. A label is decoration; the id is the identity.
  id: string;
  // Singular noun for one item at this level: "Subject", "Topic", "Section".
  // Used in prompts and empty-state copy.
  noun: string;
  // Template (relative to the type's templates folder) for the index note
  // created at the root of each folder at this level, e.g. "Subject Index.md".
  indexTemplate: string;
  // Glyph for a folder at this level whose name isn't in the vault's global
  // folder-emoji pool (journal.ts::folderEmoji). A STRING, not a resolver: it
  // was `(plugin, name) => string` until 2.42, which is what made a
  // JournalType un-serialisable and so forced Study to be a hand-written
  // object while every other type was rebuilt from config. The pool lookup is
  // the same for every type, so the only per-level fact is this fallback.
  fallbackEmoji: string;
}

// One template a note kind can be created from — a SAVED LAYOUT with a file of
// its own.
//
// A kind carries a list of these so the "Template type" field in the New
// Lesson/New Practice popup has something to offer. Until 2.54.7 the list was
// always exactly one entry labelled "Generic", manufactured in buildJournalType
// with no config surface behind it: a required dropdown with one option, which
// looks like a decision and is not. The comment here used to promise that a
// subject-specific variant was "just another entry in this list, no new
// plumbing", and that stopped being true when templates became composed —
// templateTargets took `templates[0]`, so a second entry would have been
// invisible to the section designer, the launcher rail and the repair path.
//
// A VARIANT IS A LAYOUT, NOT A SEPARATE KIND. "Math Lesson" is a Lesson: same
// `type:` value, same trackers, same review queue, same tables. What differs is
// which sections its template starts with and how they are labelled. So a
// variant carries no identity of its own — nothing about it reaches a note's
// frontmatter — and removing one declassifies nothing, which is exactly why it
// is not a kind.
//
// THE LAYOUT IS A SEED, NOT A SECOND RECORD. This is the line that keeps
// journal-plan.ts honest. The stored `sections`/`options` are what the
// variant's template file is COMPOSED FROM when it is first written; after
// that the file is the truth, and the template editor edits the file. Exactly
// the relationship the wizard's section ticks already have. A layout that
// claimed to describe an existing file would be a second record of one
// arrangement, and the two would drift the first time anyone edited the
// markdown.
export interface JournalTemplateVariant {
  // Stable id, selected via the popup's "Template type" field.
  id: string;
  // Shown in that field.
  label: string;
  // Template file name relative to the type's templates folder.
  template: string;
  // The saved layout: section ids in order, and per-section overrides. Absent
  // on the default variant, which means "the catalogue's own defaults" — the
  // same thing `chosen` being absent means to journalTemplateFiles.
  sections?: string[];
  options?: Record<string, SectionOverrides>;
}

// A kind's sub-notes: the pages a long note can be split across.
//
// A note of a kind that has this can be *promoted* — `Algebra/Quadratics.md`
// becomes `Algebra/Quadratics/Quadratics.md` with pages beside it — turning it
// into a folder note, which every part of the plugin already understands as a
// dashboard (`isIndex = basename === parent.name`, the same test study-header
// and links.ts::resolveUp use). So the promoted note gets its banner, its
// tracker grid and its confidence trend for free.
//
// Promotion is per note, not per type. Adding a third *level* to JournalType
// would be the model's own vocabulary for "a container that holds notes", and
// it is the wrong answer: levels are fixed for the whole type, so every lesson
// would have to be a folder, and most lessons are one file and should stay one
// file.
//
// ── EVERY KIND HAS THIS, AS OF 1.0.23 ──────────────────────────────────
//
// It was opt-in per kind — `pages?: boolean` on the config, a tick in the
// settings rail, and `applies: (ctx) => ctx.hasPages` gating the 📄 Pages
// section on the answer. What that gate actually decided was whether a note
// could EVER be split, which is not a fact about a kind: a Practice note that
// grows too long to read is the same note a Lesson becomes, and the reader who
// wanted it split had to open Settings, find the journal, find the kind, and
// tick a box whose consequence is a section they could otherwise have ticked on
// the note in front of them.
//
// SO THE CAPABILITY IS UNIVERSAL AND THE SECTION IS THE CHOICE. Every kind of
// every journal can hold pages; whether a given note or template CARRIES the
// 📄 Pages index is an ordinary section tick, on the same list as every other
// section. What is gone with the gate: `JournalKindConfig.pages`, the settings
// tick that wrote it, `diffKinds`' `paged` row, and `StructuralSink` — the seam
// in the section editor that existed so one row could write config before it
// wrote the file. A stored `pages: true` is dropped on the next save, the way
// `trackers` was in 3.18: nothing reads it, so it does not survive.
//
// WHAT STAYS PER-TYPE is this object — one page id, one label, one shared
// template per journal — because that is what a page IS here, and the fields
// were never per-kind in practice: `buildJournalType` has written the same
// three values for every paged kind since the constructor existed.
//
// AND A PAGE STILL HOLDS NO PAGES. `sectionContext`'s `{ page }` branch answers
// `hasPages: false`, which is the one refusal left and the only one that was
// ever structural: a page's pages would be a second level of splitting with no
// folder to put them in and no note to promote.
//
// `id` is the `type` value a page's frontmatter carries, and it is
// DELIBERATELY NOT one of the type's `kinds`. Everything that asks "is this
// note one of this journal's notes?" filters by kinds — the review queue's
// leafNotes, confidenceKinds, metaFor's activity check, the topic template's
// `base` blocks. Leaving pages out of that list excludes them from all of it
// by construction, so a page is never queued for review, never counted in a
// confidence average, and never listed as a lesson. Only code that means to
// display pages has to know they exist.
export interface JournalPages {
  // Frontmatter `type` value for a page. Not a member of `kinds`.
  id: string;
  // Human label for the button and the table ("Page").
  label: string;
  // Template file name relative to the type's templates folder.
  template: string;
}

// One leaf note kind offered inside the deepest container of a type.
// Study offers two: lesson and practice.
export interface JournalKind {
  // Stable id, also the frontmatter `type` value written by the template
  // and read by the topics/confidence widgets ("lesson", "practice").
  id: string;
  // Human label + emoji for buttons and prompts.
  emoji: string;
  label: string;
  // Plural label, when the crude pluraliser would get it wrong. "Practice" is
  // uncountable; `plural()` makes it "Practices". A field on the kind rather
  // than a per-template override because it is a fact about the noun, true
  // everywhere the noun is used.
  plural?: string;
  // Template variants offered when creating a note of this kind. Never
  // empty — newNote() falls back to the first entry if a stale id is passed.
  templates: JournalTemplateVariant[];
  // The pages notes of this kind can be split across. REQUIRED, and that is the
  // whole of 1.0.23 on this line: `kind.pages` was read as "may this kind be
  // split" in nine places, and making it non-optional is what turned every one
  // of those into a compile error to be answered rather than a check that
  // quietly always says yes. See JournalPages.
  pages: JournalPages;

  // ── What notes of this kind measure (2.36) ──────────────────────────────
  //
  // Which trackers notes of this kind carry. The declaration lives HERE rather
  // than on TrackerDef, and that is what makes it decidable: a kind belongs to
  // exactly one type, so `cooking.recipe` naming `confidence` is unambiguous
  // even though `confidence` is a `typeId: null` singleton. Putting a kind
  // list on the *tracker* would have left a global tracker naming a kind with
  // no way to say whose — the ambiguity that kept per-kind scoping deferred
  // through four roadmap revisions. It also puts the statement where the
  // knowledge is: "a Practice note isn't rated for recall" is a fact about
  // Practice notes, not a fact about Confidence.
  //
  // UNMENTIONED IS UNIVERSAL, and this is the rule that makes the field safe
  // to ship on an existing preset. A tracker no kind of this type names at all
  // is offered on every kind — so declaring `confidence` on `lesson` removes
  // it from `practice` without also removing a custom tracker the reader added
  // and never listed anywhere. Restriction is opt-in per *tracker*, not per
  // kind, so an omission can never take something away.
  //
  // FILTERS, NEVER REFUSES. This narrows what the "+ Add tracker" picker
  // offers; it is not consulted by `directiveAllowedOn`, so a note may still
  // hold any tracker on its type's surface. The asymmetry is deliberate: a
  // refusal asserts a value is illegitimate, and the plugin cannot know that —
  // 2.34 shipped specifically to delete two wrong refusals, and a restriction
  // system able to manufacture a third would be worse than none.
  //
  // THE LIST IS GONE AS OF 3.18 (§7) and this paragraph is about `rating`,
  // which now carries the whole of it. A kind used to declare `trackers` as
  // well, and on Study — the preset the field was written for — that list
  // restated the rating and then added the two trackers every kind had. A
  // field whose commonest failure was disagreeing with `rating`, and whose
  // repair was to make it agree (normaliseKinds unshifted the rating in), is a
  // second spelling of `rating`.

  // Which tracker a Recall sitting grades into for notes of this kind, and —
  // since 3.18 — the whole of what this kind declares about trackers at all.
  // One designated tracker rather than list membership, because what a grade
  // MEANS is one question with one answer: grading a Lesson deck asks "did I
  // remember this", grading a Practice deck asks "did I get these right".
  // Absent falls back to the confidence built-in, which is what every note
  // written before this existed already does.
  rating?: string;

  // What this kind's TABLE calls its columns, keyed by role. 1.0.32.
  //
  // A fact about the table and not about the trackers it reads, which is the
  // whole reason the field exists — see `kind-columns.ts`. Absent, and an
  // absent key, both mean the derived word.
  headings?: Record<string, string>;

  // NOT ONE OF THE JOURNAL'S DEFAULTS — a note type that lives on one index
  // page. 1.0.33.
  //
  // ── THE READER'S ASK ──────────────────────────────────────────────────
  //
  // *"test!!! was added directly into Web Design index page, but its appearing
  // on the settings page (where only the defaults should be, Lesson &
  // Cheatsheet)"* — after: *"adding a new note-type to a table should not add
  // this type to all index pages. The only place the defaults should be
  // configured like this is from chronanvil's journal settings."*
  //
  // ── WHY THE KIND STILL EXISTS AT THE JOURNAL ──────────────────────────
  //
  // A kind is what a note's `type:` names, what a template file is written for
  // and what a create button resolves to. There is no such thing as one that
  // exists on a page: the group on Web Design has to find it, and so does every
  // note filed under it. So the journal owns it, and this flag says it is not
  // part of what the journal OFFERS — `childrenParts` composes a group per
  // default kind, and Settings' NOTE TYPES step lists the defaults.
  //
  // WHICH PAGES LIST IT IS THE PAGE'S OWN ANSWER, in its frontmatter under
  // `notetypes` — see `kind-tables.ts`, where the same argument was already made
  // for a page's column headings. The flag alone would make the group a stray
  // everywhere; the pair is what makes it belong somewhere.
  local?: boolean;
}

export interface JournalType {
  // Stable id used in button actions and command ids ("study").
  id: string;
  // Human display name ("Study").
  name: string;
  // The type's identity glyph, shown on its row in the Journals banner.
  emoji: string;
  // Root folder holding this type's top-level containers, and the folder
  // holding its templates. Both resolved when the type is BUILT rather than
  // carried as closures over the plugin — see registeredJournalTypes, which is
  // where Study's two settings paths are read.
  root: string;
  templatesFolder: string;
  // The hierarchy, outermost first. length 1 = flat, 2 = Study's two-level.
  levels: JournalLevel[];
  // Leaf note kinds created in the deepest container.
  kinds: JournalKind[];
  // How this type's generated templates depart from the catalogue's own
  // arrangement, keyed by template target ("index:0", "kind:lesson", "page").
  // Compose-time only — nothing here is written beside a note. Absent means
  // "the catalogue's arrangement, unmodified", which is every custom type.
  layout?: Record<string, TemplateLayout>;
  // What this journal's CARD shows in its fourth cell. 4.47.
  //
  // Carried onto the built type rather than looked up from settings at draw
  // time, on this interface's own rule — every field here is resolved when the
  // type is BUILT, so a widget holds a journal rather than a way of finding one.
  // See `JournalConfig.cardStat` for what absent means.
  cardStat?: string;
}

// ── Built-in: Study ──────────────────────────────────────────────────────

// ── A journal's hue ──────────────────────────────────────────────────────
//
// A stable colour for a journal, worn by `journals:cards`' banner since 4.15 and
// by the level-cards head since 4.37.
//
// DERIVED FROM THE ID, NOT ASSIGNED. Two journals must not swap colours when a
// third is added or one is renamed, and an assigned palette index would do
// exactly that — it is the same argument `foldKey` makes for keying a fold on
// the type's id rather than on its position. The arithmetic is a sum of code
// points because it has to agree with itself across sessions and nothing here
// is worth a hash function.
//
// IT LIVES HERE RATHER THAN IN `journals-cards.ts`, WHERE IT WAS WRITTEN, because
// two surfaces read it now and that file cannot be imported by the other one — it
// depends on `journals-section.ts`, which depends on `tables.ts`. See the note it
// left behind. A stable hue for a journal id is a fact about the journal model
// either way, which is what makes this the right home and not merely the
// reachable one.
//
// ── AND THE SUM IS AN INDEX, NOT THE ANGLE (4.42) ──────────────────────
//
// MEASURED ON THE SHIPPED PRESETS: study summed to 359 and media to 32 — **33°
// apart** — so on `20260818_20h59m08s_grim.png` two of the four journal bands
// were near-identical warm reds. Nothing in a sum of code points spreads its
// outputs; ids that differ by one character differ by ~31, which on a 360° wheel
// is the same colour twice.
//
// **THE STEP TURNS NEARNESS INTO DISTANCE.** Multiplying the index by a stride
// coprime to 360 maps consecutive sums far apart, so two ids differing by one
// character no longer land on one colour.
//
// 59 AND NOT 137, AND THE CORRECTION IS THE INTERESTING PART (4.42.1). 4.42 used
// 137 — the golden angle, the sunflower's own stride — and checked it against
// `"exercise"`. **The preset's id is `exercise-diet`.** On the ids that actually
// exist, 137 puts Projects at 278° and Exercise & Diet at 261°: **17° apart,
// where the un-stepped sums had been 26°.** The change made the shipped vault
// worse and its test passed, because the test measured an id no vault has.
//
// SO THE STRIDE IS FITTED, AND THAT IS SAID OUT LOUD RATHER THAN DRESSED UP. 59
// is coprime to 360, like 137, and puts the four presets at 88°, 146°, 207° and
// 301° — 58° minimum. It was chosen by trying every coprime stride against the
// four real ids and taking the best. **A hash cannot promise separation**: this
// is four ids arranged well, not a guarantee, and a fifth preset or a custom
// journal can still land on top of one. The alternative that WOULD guarantee it
// — fixed hues for the shipped presets — was offered and declined, so a reader
// who finds two custom journals clashing should rename one rather than expect
// this to have prevented it.
//
// COPRIME IS THE PART THAT IS NOT FITTED. Any stride sharing a factor with 360
// visits only 360/gcd hues and collides in cycles — 138 would reach sixty. 59 is
// prime, so the map is a BIJECTION over 0…359: every hue stays reachable and no
// two sums are pushed onto one that were not already equal. Integer arithmetic
// throughout, because the number has to agree with itself across sessions and a
// float stride invites a rounding difference nobody would look for.
//
// ANAGRAMS STILL COLLIDE EXACTLY, since the index is a sum. That is inherent and
// left alone: "Recipes" and "Precise" are not a case worth a hash function, and
// the reader can rename one.
//
// EVERY EXISTING VAULT'S COLOURS CHANGE ONCE. That is the cost and it was
// accepted: the hue is decoration derived from an id, nothing is stored, and the
// alternative is keeping a spread that was never there.
export function hueOf(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i) * 31) % 360;
  return (sum * 59) % 360;
}

// The journal's accent, in both the forms the stylesheet needs.
//
// TWO TOKENS, ONE COLOUR, AND THE SECOND ONE WAS NOT BEING SET. The sheet binds
// `--ca-grain-accent` and `--ca-grain-spine` off `--ca-journal-accent`, and
// `--ca-grain-tint` off `--ca-journal-accent-rgb` — an `rgba()` needs channels,
// not a colour. Both callers set only the first, so the spine and the label took
// the journal's own hue while the WASH behind them fell through to
// `--interactive-accent-rgb`: every journal in the vault washing the same
// purple, on the one surface whose job is to say which journal this is.
//
// AND THE 65/55 WAS WRITTEN TWICE, which is how the two would have drifted the
// first time either was tuned. One function, two readers — `page-head.ts` for
// the note's own head and `vault-banner.ts` for the view around it.
const ACCENT_S = 0.65;
const ACCENT_L = 0.55;

// ── AND IT STEPS PER RUNG NOW (1.0.42) ──────────────────────────────────
//
// *"Journal levels (and pages) look too similar which makes it easy to lose
// which index table you're looking at."*
//
// One accent for a whole journal is what made every note in Study the same
// magenta: `hueOf` hashes the journal's ID, so a Subject index, a Topic index, a
// Cheatsheet and a page differed in nothing but the rail's dots. The hue is the
// JOURNAL'S IDENTITY and stays fixed; what a rung changes is saturation and
// lightness.
//
// HUE ROTATION IS RULED OUT BY ARITHMETIC RATHER THAN BY TASTE, which is worth
// recording because it is the obvious move. `hueOf("study")` is 301°, and
// twenty degrees a rung puts the third at 1° and the fourth at 21° — on top of
// `--ca-grain-quarterly` (17°) and `--ca-grain-daily` (34°). A Study page would
// read as a period dashboard, which is a worse confusion than the one being
// fixed.
//
// THE RAMP STRADDLES THE OLD VALUE, deliberately. 0.65/0.55 sits close to the
// middle of both ranges, so a vault's middle rungs move least and the ends move
// most — the opposite of anchoring at one end, where every note but one shifts.
//
// SATURATION CARRIES MORE OF IT THAN LIGHTNESS, and that is the light-theme
// answer. There is no theme twin for this: `journalAccent` is pure and the head
// reads one token. A wide lightness ramp would put the outer rungs at 68% — fine
// on the reader's dark ground and washed out on a light one — so lightness moves
// 14 points and saturation moves 42.
const RAMP_S = [0.72, 0.3];
const RAMP_L = [0.62, 0.48];

/** `t` in 0..1, outermost rung to innermost. */
function rampAt(t: number): { s: number; l: number } {
  const at = ([a, b]: number[]) => a + (b - a) * t;
  return { s: at(RAMP_S), l: at(RAMP_L) };
}

export function journalAccent(
  id: string,
  // WHERE THIS NOTE SITS, 0..1, AND OPTIONAL ON PURPOSE. A stray note under a
  // journal root declares no `type:` this journal recognises, so `journalRungOf`
  // answers null for it and there is no rung to ramp — it keeps the journal's
  // own accent, which is what every note here had before this release.
  t?: number
): { css: string; rgb: string } {
  const h = hueOf(id);
  const { s, l } = t == null ? { s: ACCENT_S, l: ACCENT_L } : rampAt(t);
  return {
    css: `hsl(${h}, ${Math.round(s * 1000) / 10}%, ${Math.round(l * 1000) / 10}%)`,
    rgb: hslChannels(h, s, l),
  };
}

// `h` in degrees, `s`/`l` in 0..1, out as the `r, g, b` an `rgba()` takes.
//
// Written out rather than reached for through a colour library: this is the
// plugin's only conversion, it is six lines, and a dependency has to be declared
// in `NOTICE` and in the esbuild banner in the same commit.
function hslChannels(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return [r, g, b].map((v) => Math.round((v + m) * 255)).join(", ");
}

// ── Folder emoji ─────────────────────────────────────────────────────────
//
// ONE POOL FOR THE WHOLE VAULT, as of 2.39. Subject and Topic had shared a map
// since 1.8.0 on the grounds that "a folder name only needs one emoji
// regardless of which level it sits at" — and that argument never had anything
// to do with Study. A folder called Chemistry wants ⚗️ whether it is a Study
// subject, a Cooking cuisine or a section of a project journal, and one pool is
// also one place to edit, one thing to explain, and no question about which
// list a name should go in.
//
// What stays per-level is the FALLBACK: the glyph for a name the pool has
// never heard of. That genuinely is level-specific — an unknown top-level
// folder reads as 📚 and an unknown sub-folder as 📂 — and it is one character
// stored beside the level that needs it rather than a second lookup table.
export function folderEmoji(
  plugin: ChronoAnvilPlugin,
  name: string,
  fallback: string
): string {
  const map = plugin.settings.folderEmojis;
  if (map[name]) return map[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(map)) {
    if (key.toLowerCase() === lower) return map[key];
  }
  return fallback;
}

// Study, stated in the same shape a user's journal is stated in.
//
// A PRESET, NOT A SEEDED CONFIG: this literal is canonical, lives in source and
// is never written to data.json, so there is exactly one Study and a snapshot
// test of it means something. What changed in 2.42 is that it goes through the
// same constructor as everything else, which is what makes the guarantee worth
// having — anything Study can express, a user's journal can express too. It
// used to be a hand-written JournalType carrying closures, and the equivalence
// test existed to police the gap that created.
//
// The two folders are defaults. registeredJournalTypes overrides them with the
// user's configured paths, which is the one way Study is still special: its
// folders are settings keys because they predate custom journals having any.
export const STUDY_CONFIG: JournalConfig = {
  id: "study",
  name: "Study",
  emoji: "🎓",
  root: ROOT_STUDY,
  templatesFolder: `${TEMPLATES_ROOT}/Studies`,
  // The ids are what `slugify` would derive from these nouns anyway, so Study's
  // notes are unchanged. Stated rather than derived because a preset that
  // relied on the derivation would be relying on nobody ever editing the noun,
  // which is exactly the assumption 2.43 removed.
  levels: [
    { id: "subject", noun: "Subject", fallbackEmoji: DEFAULT_SUBJECT_EMOJI },
    { id: "topic", noun: "Topic", fallbackEmoji: DEFAULT_TOPIC_EMOJI },
  ],
  kinds: [
    {
      id: "lesson",
      emoji: "📖",
      label: "Lesson",
      // `pages: true` stood here until 1.0.23 and is gone with the field: every
      // kind of every journal can be split across pages now, so Practice can be
      // too. See JournalPages.
      //
      // A preset is allowed opinions, and these two are the whole point of the
      // split: grading a Lesson deck asks "did I remember this", grading a
      // Practice deck asks "did I get these right". Two questions, two
      // properties, so a topic's average of either means one thing.
      rating: "confidence",
    },
    {
      id: "practice",
      emoji: "🛠️",
      label: "Practice",
      rating: "accuracy",
      plural: "Practice",
    },
  ],
  // Study's dashboards are composed from the catalogue (2.40) rather than
  // shipped as assets.
  //
  // ── THE ARRANGEMENT PINS ARE GONE (5.20) ─────────────────────────────
  //
  // Study named the sections on both of its indexes, in order. It no longer
  // names any: the catalogue's four defaults are what a Subject index and a
  // Topic index open with, the same as every other preset and every journal a
  // reader makes. See the note above `JOURNAL_SECTIONS`.
  //
  // WHAT REMAINS HERE IS `options`, AND THAT IS DELIBERATE. An override applies
  // only to a section that is actually composed, so Study's three resource
  // shelves and its "🧭 Learning Path" label now sit here waiting: the day a
  // reader ticks Resources on a Topic index they get Docs, Tutorials and
  // Practice rather than the catalogue's single "Files" shelf. Deleting them
  // with the order would have thrown away an arrangement opinion that costs
  // nothing to keep and cannot be recovered from the catalogue.
  //
  // (The `key` override that sat here until 2.41 was a compatibility shim of a
  // different sort: it pinned `learning-path` for notes already holding that
  // region. This is not that.)
  layout: {
    // The three leaf templates' prose. Assets until 2.42 — `assets/template-
    // lesson.md` and friends — on the reasoning that "prose belongs in a
    // markdown file, not a string literal in a .ts". True as far as it went,
    // and it left every custom journal's notes with no prose at all, because
    // the catalogue had no way to express a heading. Now it does, so these are
    // Study's opinions stated where its other opinions live rather than in a
    // second place the catalogue can't see.
    //
    // ONE PROSE BLOCK, NOT TWO. The shipped Lesson interleaved its headings
    // with its widgets — Overview, Key Concepts, the Recall deck, Key
    // Takeaways, Connected Ideas, the review checklist. The catalogue orders
    // sections and cannot place two instances of one section at two depths, so
    // the prose is consolidated and the widgets follow it. Practice and Page
    // compose byte-identically to the assets they replace; only the Lesson's
    // ordering moves, and a template is a file the reader edits anyway.
    "kind:lesson": {
      options: {
        headings: {
          headings: [
            {
              title: "Overview",
              body: ["What is this lesson about, and why does it matter?"],
            },
            {
              title: "Key Concepts",
              body: ["- **Definition:** ", "- **Example:** "],
            },
            { title: "Key Takeaways", body: ["- ", "- ", "- "] },
            { title: "Connected Ideas", body: ["- [[]] — "] },
            { title: "Next", body: ["- [[]]"] },
          ],
        },
      },
    },
    "kind:practice": {
      options: {
        headings: {
          headings: [
            { title: "Related Lessons", body: ["- [[]] — "] },
            {
              title: "Exercise 1",
              body: ["**Prompt:** ", "", "**Your work:**", "", "", "**Notes:** "],
            },
            {
              title: "Summary",
              body: [
                "- **What clicked:** ",
                "- **Still tricky:** ",
                "- **Next challenge:** [[]]",
              ],
            },
          ],
        },
      },
    },
    page: { options: { headings: { headings: [{ title: "Notes" }] } } },
    // A SUBJECT INDEX HAS NO ENTRY AT ALL NOW. It pinned eight sections in
    // order and overrode nothing, so with the order gone there is nothing left
    // to say about it, and an empty `{}` would be a pin the next reader has to
    // work out is vacuous.
    //
    // 5.18's headline — "what is below comes first, on both indexes" — is
    // reversed here, and on purpose. It moved `children` above `trackers` when
    // an index opened with eight sections and the tables were buried under a
    // block of numbers. An index now opens with three, the numbers are one
    // tracker card, and the catalogue's own order (banner, trackers, children)
    // puts the tables one card down rather than one screen down.
    "index:1": {
      options: {
        path: { label: "🧭 Learning Path" },
        resources: {
          fields: [
            { key: "res-docs", label: "Docs" },
            { key: "res-tutorials", label: "Tutorials" },
            { key: "res-practice", label: "Practice" },
          ],
        },
      },
    },
  },
};

// Derive a level's id from its noun. CREATION ONLY.
//
// This used to be the live answer to "what `type` value does this level
// write?", called wherever that value was needed. It is now the derivation
// that produces `JournalLevel.id` once, when a level is first created, and
// every reader goes to the id instead. The distinction is the fix: a
// derivation re-run on every read turns a relabel into a silent data change.
//
// Kept as a function rather than inlined because two callers need it and they
// must agree — normaliseLevels (a new level, or one migrated from a config
// saved before ids existed) and the level editor's preview.
export function deriveLevelId(noun: string, depth: number): string {
  return slugify(noun) || `level-${depth}`;
}

// ── Constructing a JournalType ────────────────────────────────────────────
//
// Lives here rather than in custom-journal.ts, where it sat until 2.43, for
// one reason: STUDY_JOURNAL below is a module-scope call to it, and calling
// across a circular import at module-evaluation time only works if the loader
// happens to enter the modules in the right order. See the type-only import at
// the top of this file.
//
// The template filename for every paged kind of every type. A page's content
// is the same shape whatever it is a page of, and its `type:` comes from a
// token rather than the file, so a second template would differ only in name.
export const PAGE_TEMPLATE = "page.md";

// Reconstruct a live JournalType from stored config.
//
// EVERY GENERATED FILENAME BINDS TO AN ID. Both derivations here read from a
// display string until 2.43 — `${lvl.noun} Index.md` and `${k.label}.md` — and
// both broke the same way: `normaliseKinds` and `normaliseLevels` deliberately
// *preserve* ids across a relabel, so the id and the filename came apart the
// moment anyone corrected a word. The kind kept its id and pointed at a
// template that was never written; `newNote` then failed with "missing — run
// 'Set up / repair vault'", and repair wrote a fresh catalogue template under
// the new name, leaving the file the reader had actually edited on disk and
// unreachable.
//
// The cost is that a templates folder reads `lesson.md` and `field-notes.md`
// rather than `Lesson.md` and `Field Notes.md`. That is the right trade: the
// filename is machinery, the label is what the reader sees everywhere it
// matters (the wizard's rail, the create button, the note's own title), and a
// slug cannot contain a path separator — which `${k.label}.md` cheerfully did,
// filing a kind called "Field/Notes" into a subfolder nobody asked for.

// Which of a journal's kinds a saved layout applies to, as ids.
//
// ABSENT `kinds` MEANS ALL OF THEM, resolved in one place rather than at each
// call site that asks, because "absent means all" is the sort of default that
// gets spelled three ways and then disagrees once.
//
// IN THIS FILE RATHER THAN BESIDE THE TYPE IT READS. `custom-journal.ts` is
// where `JournalVariantConfig` is declared and would be the obvious home, and
// it cannot be: this is called from `buildJournalType`, and a VALUE import from
// here into custom-journal.ts is exactly the runtime cycle the note above
// `import type { JournalConfig }` describes and test/type-integrity.test.ts
// guards. Types cross that edge; functions do not.
// AND ABSENT MEANS *NONE* ONCE A LAYOUT NAMES A SURFACE (4.33). A front-page or
// page layout is written with `kinds: []`, which this already handles — but
// leaving `kinds` off such a layout would offer it on every kind, put a row in
// every create dropdown and `claim()` a template file per kind, which is a
// silent multiplication rather than a visible mistake. Making the trap
// unrepresentable here is one line and costs nothing: a layout that names a
// surface and says nothing about kinds is a surface layout.
export function variantKinds(
  cfg: { kinds: JournalKindConfig[] },
  variant: JournalVariantConfig
): string[] {
  if (!variant.kinds) {
    return variant.surfaces?.length ? [] : cfg.kinds.map((k) => k.id);
  }
  // A named kind that no longer exists is dropped rather than carried: a kind
  // id is what `preserveIds` protects precisely because it is the handle
  // everything else hangs off, and a layout naming a deleted one would compose
  // a template for a kind with no notes and no create-action.
  const have = new Set(cfg.kinds.map((k) => k.id));
  return variant.kinds.filter((id) => have.has(id));
}

export function buildJournalType(cfg: JournalConfig): JournalType {
  // ONE ALLOCATOR FOR THE WHOLE TYPE. Levels and kinds derive their filenames
  // from separate id spaces — `normaliseLevels` and `normaliseKinds` each keep
  // their own list unique and neither can see the other — so a kind called
  // "Section Index" alongside a level called "Section" produces
  // `section-index.md` twice. The generator writes files in this order, so the
  // second silently overwrote the first and the wizard's rail showed two rows
  // for one file.
  //
  // Suffixing the later claimant is the same repair normaliseKinds already
  // makes for a duplicate id, applied one layer down where the two spaces
  // meet. Allocation order is declaration order — levels, then kinds, then the
  // page template — so a given config always produces the same names.
  const used = new Set<string>();
  const claim = (stem: string): string => {
    let name = `${stem}.md`;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${stem}-${n++}.md`;
    used.add(name.toLowerCase());
    return name;
  };

  const levels: JournalLevel[] = cfg.levels.map((lvl, depth) => {
    // Tolerated rather than required, because a config written before levels
    // had ids is still on disk in a dev vault. normalizeJournalConfigs fixes
    // it on load; this keeps the type buildable in between.
    const id = lvl.id || deriveLevelId(lvl.noun, depth);
    return {
      id,
      noun: lvl.noun,
      indexTemplate: claim(`${id}-index`),
      fallbackEmoji: lvl.fallbackEmoji,
    };
  });

  // `pages` is added below rather than here, because the template it names is
  // claimed after every kind has taken its own filename — so what this map
  // produces is a kind less its pages, and the list below is the kind.
  const stems: Omit<JournalKind, "pages">[] = cfg.kinds.map((k) => ({
    id: k.id,
    emoji: k.emoji,
    label: k.label,
    // The default variant first, named after the kind rather than "Generic":
    // with one entry the dropdown is hidden, and with several "Lesson" reads
    // as the plain one where "Generic" read as a category nobody chose.
    //
    // THE LAYOUTS COME FROM THE JOURNAL SINCE 3.18 follow-ups §5, filtered to
    // the ones this kind is named by. That filter is the only thing here that
    // changed: a variant listing two kinds produces an entry in each of their
    // dropdowns and a template file for each, which is what "reuse my
    // two-column Lesson on Practice" means concretely.
    templates: [
      { id: "default", label: k.label, template: claim(k.id) },
      ...(cfg.variants ?? [])
        .filter((v) => variantKinds(cfg, v).includes(k.id))
        .map((v) => ({
          id: v.id,
          label: v.label,
          // Named from the kind and the variant so the file is identifiable on
          // disk. Through the same allocator as everything else, so a variant
          // called "index" cannot quietly take a level's template — and so a
          // shared variant's two files cannot collide with one another.
          template: claim(`${k.id}-${v.id}`),
          ...(v.sections ? { sections: [...v.sections] } : {}),
          ...(v.options ? { options: { ...v.options } } : {}),
        })),
    ],
    ...(k.rating ? { rating: k.rating } : {}),
    ...(k.plural ? { plural: k.plural } : {}),
    // COPIED, NOT REFERENCED, on this map's own rule two comments down: a type
    // handed out of this constructor is somebody else's to hold, and a shared
    // map would make a relabelled column on one journal a relabelled column on
    // every journal built from the same config object.
    ...(k.headings ? { headings: { ...k.headings } } : {}),
    // CARRIED, LIKE EVERY OTHER STORED FIELD ON THIS MAP. A kind that lost its
    // `local` on the way through here would be composed onto every index note
    // in the journal the next time one was reconciled, which is the whole of
    // what the flag exists to stop.
    ...(k.local ? { local: true } : {}),
  }));

  // One page template for the whole type, claimed once and shared by every
  // kind — so it takes one name from the allocator rather than one per kind,
  // and a kind called "Page" cannot quietly take it.
  //
  // UNCONDITIONAL SINCE 1.0.23. It was claimed only when some kind said
  // `pages: true`, and the three values below were written onto those kinds
  // alone; every kind can hold pages now, so every journal has the template and
  // every kind names it. The allocator still runs LAST, after levels and kinds,
  // so the filenames a given config produces are the ones it always produced.
  const pageTemplate = claim(PAGE_TEMPLATE.replace(/\.md$/, ""));
  // ONE OBJECT PER KIND RATHER THAN ONE SHARED BETWEEN THEM, on the same
  // reasoning `layout` is spread rather than referenced below: a type handed
  // out of this constructor is somebody else's to hold, and two kinds sharing
  // one `pages` would make a relabel of either a relabel of both.
  const kinds: JournalKind[] = stems.map((k) => ({
    ...k,
    pages: { id: "page", label: "Page", template: pageTemplate },
  }));

  return {
    id: cfg.id,
    name: cfg.name,
    emoji: cfg.emoji,
    root: cfg.root,
    templatesFolder: cfg.templatesFolder,
    levels,
    kinds,
    // OMITTED RATHER THAN COPIED AS `undefined` (4.47), on the idiom the layout
    // fold below uses: an absent field is the card's own derivation, and a key
    // present with no value is a third state nothing wants to reason about.
    ...(cfg.cardStat ? { cardStat: cfg.cardStat } : {}),
    // A variant's saved layout is folded into the type's layout map under the
    // variant's own template key, rather than being read from the variant at
    // compose time. That is what makes the whole feature nearly free:
    // composeTemplate, sectionOverrides, journalTemplateFiles, the launcher
    // rail and refreshJournalTemplates all read `type.layout[key]` already, so
    // none of them needed to learn what a variant is.
    ...(() => {
      const layout: Record<string, TemplateLayout> = { ...(cfg.layout ?? {}) };
      // ONE LIST FOR THE JOURNAL SINCE 3.18 follow-ups §5, folded into a key per
      // (kind, variant) pair rather than per variant. That pairing is the whole
      // of the cross-kind half: a layout naming two kinds becomes two template
      // keys and two template files, and every reader downstream —
      // composeTemplate, sectionOverrides, journalTemplateFiles, the launcher
      // rail, refreshJournalTemplates — goes on reading `type.layout[key]`
      // without learning that a variant can now be shared.
      for (const v of cfg.variants ?? []) {
        for (const kindId of variantKinds(cfg, v)) {
          layout[`kind:${kindId}:${v.id}`] = {
            ...(v.sections ? { sections: [...v.sections] } : {}),
            ...(v.options ? { options: { ...v.options } } : {}),
          };
        }
      }
      return Object.keys(layout).length ? { layout } : {};
    })(),
  };
}

// The registry of active journal types: the Study preset (when enabled) plus
// every custom journal the user has defined in settings, reconstructed from
// stored config. All the mechanics below are type-agnostic, so custom types
// need no special casing — they just show up in this list.
//
// Study ships enabled by default but is not required — Settings → Journal
// types can turn it off for anyone who doesn't use it. Turning it off only
// stops it from being registered (no section, no buttons, no fresh notes
// through the plugin); it never touches Study notes already on disk.
// Study with the user's configured folders, or the defaults if unset.
//
// STUDY IS BUILT FROM ITS STORED CONFIG LIKE EVERY OTHER JOURNAL (3.21), so
// `studyType(plugin)` — which read `paths.studyRoot` at the moment of use,
// because a preset had no config of its own to hold a root — has gone with the
// settings fields it read. `STUDY_JOURNAL` below is Study with the SHIPPED
// defaults, which is what tests and template composition want and all they ever
// wanted.
export const STUDY_JOURNAL: JournalType = buildJournalType(STUDY_CONFIG);

// The journals a reader can start from. 3.20.
//
// STUDY IS ONE OF THESE NOW, not a registration. `STUDY_JOURNAL` above stays,
// because Study-with-shipped-defaults is a real object that tests, template
// composition and the equivalence suite all legitimately want — 3.19.1 removed
// its second job of standing in for journals it is not, and this removes its
// third of being a journal the vault has whether or not anyone asked.
export const STUDY_PRESET: JournalPreset = {
  id: "study",
  name: "Study",
  emoji: "🎓",
  blurb: "Subject → Topic → Lesson / Practice, with recall and confidence.",
  config: STUDY_CONFIG,
};

// ── Three more to start from (4.35 §2) ──────────────────────────────────
//
// ONE PRESET IS NOT A PRESET SYSTEM. 3.20 stopped Study being built in and made
// it a recipe, and `JOURNAL_PRESETS` has had exactly one entry ever since — so
// the machinery (recipe, wizard, scaffold, manifest) has never had a second
// instance to prove it generalises. These three are that proof, and each is a
// different SHAPE, which is what actually tests it rather than three journals
// that differ only in their nouns.
//
// EVERY KIND ID IS `slugify(label)` AND EVERY LEVEL ID IS `slugify(noun)`, and
// that is a correctness rule rather than a convention. `commit` calls
// `normaliseKinds(..., { preserveIds: this.isEstablished })` and `isEstablished`
// is `mode !== "create"` — so on an INSTALL the id becomes `slugify(label)`.
// A preset naming a kind `log` and labelling it "Update" would have its id
// change at commit, and every `layout["kind:<id>"]` key would silently address
// a template that no longer exists. Study satisfies this by accident; these
// satisfy it deliberately, and a test over every preset pins it.

// ── Projects 🚀 ─────────────────────────────────────────────────────────
//
// THE ONE THAT PROVES A JOURNAL NEED NOT BE SCORED. `typeRating` is null, no
// rating line is written, the notes base grows no rating column, and the charts
// region ships as the bare managed region the catalogue already documents for a
// type that measures nothing. If anything in the plugin still assumes a rating,
// this is what finds it.
export const PROJECTS_CONFIG: JournalConfig = {
  id: "projects",
  name: "Projects",
  emoji: "🚀",
  root: `${ROOT_JOURNALS}/Projects`,
  templatesFolder: `${TEMPLATES_ROOT}/Projects`,
  // TWO LEVELS because a Project needs a page of its own — its plan, its tally,
  // its files — and the notes inside it need somewhere that is not the whole
  // journal.
  levels: [
    { id: "area", noun: "Area", fallbackEmoji: "🗂️" },
    { id: "project", noun: "Project", fallbackEmoji: "🚀" },
  ],
  kinds: [
    // An Update is the dated *what happened*; a Decision is the undated record
    // you go back to. Different searches, different lifetimes — which is the
    // whole argument for two kinds rather than one with a tag on it.
    { id: "update", emoji: "📝", label: "Update" },
    { id: "decision", emoji: "⚖️", label: "Decision", plural: "Decisions" },
  ],
  // IT SHIPS NO TRACKERS AND DECLARES NO RATING. The only thing a project
  // tracks is `status`, which every journal already has, and a second
  // vocabulary for it is the split `status` was unified to end.
  // AND IT DECLARES NO `layout` AT ALL (5.20), which is the shortest statement
  // of what changed. It shipped two: an Area index pinned with `sections` so it
  // would draw a Projects tally, and a Project index pinned with `order` so its
  // updates came before its tasks. Both are now what the catalogue gives every
  // journal — banner, trackers, the table of what is below — and neither key
  // overrode a single option, so with the arrangement gone there was nothing
  // left inside them. An `index:0: {}` would be a pin that says nothing while
  // looking like it says something.
  //
  // THE TALLY IS THE ONE REAL LOSS, and it is the trade the reader asked for: a
  // fresh Area index no longer counts the projects under it until somebody ticks
  // Project tally in *Edit sections…*. The section still exists, still defaults
  // off for the reason its own entry gives, and is one checkbox away.
};

export const PROJECTS_PRESET: JournalPreset = {
  id: "projects",
  name: "Projects",
  emoji: "🚀",
  blurb: "Area → Project, with dated updates and the decisions behind them.",
  config: PROJECTS_CONFIG,
};

// ── Exercise & Diet 🏋️ ──────────────────────────────────────────────────
//
// ONE LEVEL, because the whole point is that a day's food and its training sit
// in one folder. A second level is the split the reader asked not to have.
//
// TWO KINDS, because a Workout and a Meal carry different numbers.
// `kindAllowsTracker` already keeps a Meal out of an average of Intensity.
export const EXERCISE_CONFIG: JournalConfig = {
  id: "exercise-diet",
  name: "Exercise & Diet",
  emoji: "🏋️",
  root: `${ROOT_JOURNALS}/Exercise & Diet`,
  templatesFolder: `${TEMPLATES_ROOT}/Exercise & Diet`,
  // A Block is a month, a training block — the stretch you plan as one.
  levels: [{ id: "block", noun: "Block", fallbackEmoji: "🗓️" }],
  kinds: [
    { id: "workout", emoji: "🏋️", label: "Workout", rating: "intensity" },
    { id: "meal", emoji: "🍽️", label: "Meal" },
  ],
  layout: {
    // ONE SECTION AND A PRESET AS OF 4.46. This named `totals`, which was its own
    // section emitting `journal-totals`; that widget is now the `totals` preset
    // of the merged stats band, and the layout says so here rather than by
    // naming a second section.
    //
    // AND IT SHIPS NO BAND AS OF 5.18: a Block index is a month of workouts and
    // meals, and what the reader opens it for is the two tables. The band's four
    // sums are the same four numbers the charts region draws over time, and one
    // page does not need both.
    //
    // SO WHAT IS LEFT HERE IN 5.20 IS THE PRESET AND NOTHING ELSE — the key no
    // longer lists a section, because listing them was how it also un-listed
    // Stats, and the catalogue's defaults now do that for every journal. The
    // override waits: tick Stats back on in *Edit sections…* and the band that
    // appears is the four sums this journal was built to add up, not the
    // generic one.
    "index:0": {
      options: { stats: { preset: "totals" } },
    },
    // THE QUANTITIES EACH NOTE STARTS WITH. Without this a Workout would open
    // with Intensity and nothing else, and Duration would be added by hand from
    // the cog on every note ever written — see `SectionOverrides.trackers`.
    "kind:workout": {
      options: { trackers: { trackers: ["duration", "distance"] } },
    },
    "kind:meal": {
      options: { trackers: { trackers: ["calories", "protein"] } },
    },
  },
};

export const EXERCISE_PRESET: JournalPreset = {
  id: "exercise-diet",
  name: "Exercise & Diet",
  emoji: "🏋️",
  blurb: "One folder per training block, with workouts and meals read together.",
  config: EXERCISE_CONFIG,
  // THE FOUR QUANTITIES EACH DECLARE `reduce: "sum"`, WHICH IS WHAT PUTS THEM
  // IN THE BAND'S `totals` PRESET. Drop any one and the band has a cell missing
  // from it.
  // Intensity does NOT: five workouts at 4/5 do not make 20 of anything, which
  // is exactly why `reduce` defaults to mean.
  trackers: [
    {
      id: "intensity",
      label: "🔥 Intensity",
      type: "scale",
      min: 1,
      max: 5,
      step: 1,
      faces: [...DEFAULT_ENERGY_FACES],
    },
    { id: "duration", label: "⏱️ Duration", type: "number", min: 0, step: 5, unit: "min", reduce: "sum" },
    { id: "distance", label: "📏 Distance", type: "number", min: 0, step: 0.5, unit: "km", reduce: "sum" },
    { id: "calories", label: "🔥 Calories", type: "number", min: 0, step: 10, unit: "kcal", reduce: "sum" },
    { id: "protein", label: "🥩 Protein", type: "number", min: 0, step: 1, unit: "g", reduce: "sum" },
  ],
};

// ── Media 🍿 ────────────────────────────────────────────────────────────
//
// ONE KIND, NOT FIVE. Kinds are journal-wide, so a Book kind and a Film kind
// would put five create buttons on every shelf. A book, a film, a season and a
// match are all *a thing I got through and rated*, which is why the ratings are
// shared: one Stars, one status, one table.
//
// Books, Film, TV, Games and Sport are folders the reader makes with + Medium.
export const MEDIA_CONFIG: JournalConfig = {
  id: "media",
  name: "Media",
  emoji: "🍿",
  root: `${ROOT_JOURNALS}/Media`,
  templatesFolder: `${TEMPLATES_ROOT}/Media`,
  levels: [{ id: "medium", noun: "Medium", fallbackEmoji: "🍿" }],
  kinds: [
    // THE KIND IS `Title`, NOT `Review`. `journalSubActionSpec` builds
    // `New ${kind.label}`, and *"new review"* is a retired phrase that the
    // source-literal scan cannot see, because the string is composed at
    // runtime rather than written down.
    //
    // A long read splits into chapters, a season into episodes, and the shared
    // page template and the 📄 Pages section do it. This was `pages: true` — the
    // shape no other preset had — until 1.0.23 made the capability universal;
    // what Media keeps is the arrangement, which is every kind's now. See
    // JournalPages.
    {
      id: "title",
      emoji: "🎬",
      label: "Title",
      rating: "stars",
    },
  ],
  layout: {
    // Books shows *Pages read* and Film shows *Minutes* out of THIS ONE
    // DIRECTIVE, because the band omits a quantity with no readings in scope.
    // That is the concrete answer to "shared ratings, per-medium quantities".
    //
    // ── THIS LAYOUT IS WHAT 4.46 WAS WRITTEN FROM ─────────────────────
    //
    // It named `stats` AND `totals`, and a Media shelf drew both: *3 titles ·
    // 4.7/5 avg stars · 1 open tasks* in one band, and *753 pages read* in a
    // second band directly beneath it. Two objects, two markup families, two
    // collapse rules, one question. The `summary` preset is those four cells in
    // one band — see `stats-band.ts`, which cites this shelf.
    //
    // THE SHELF NO LONGER SHIPS THE BAND EITHER (5.20). A shelf opens with its
    // banner, its trackers and its titles, like every other index in every other
    // journal; the preset stays because it is the answer to *which* band, not to
    // *whether*, and a reader who ticks Stats on a Media shelf should get the
    // four cells this preset was written for rather than the generic three.
    "index:0": {
      options: { stats: { preset: "summary" } },
    },
    "kind:title": {
      options: { trackers: { trackers: ["pagesRead", "minutes"] } },
    },
  },
};

export const MEDIA_PRESET: JournalPreset = {
  id: "media",
  name: "Media",
  emoji: "🍿",
  blurb: "One shelf per medium — books, film, TV, games — rated the same way.",
  config: MEDIA_CONFIG,
  trackers: [
    {
      id: "stars",
      label: "⭐ Stars",
      type: "scale",
      min: 1,
      max: 5,
      step: 1,
      faces: ["★", "★", "★", "★", "★"],
    },
    { id: "pagesRead", label: "📖 Pages read", type: "number", min: 0, step: 10, unit: "pages", reduce: "sum" },
    { id: "minutes", label: "⏱️ Minutes", type: "number", min: 0, step: 5, unit: "min", reduce: "sum" },
  ],
};

export const JOURNAL_PRESETS: JournalPreset[] = [
  STUDY_PRESET,
  PROJECTS_PRESET,
  EXERCISE_PRESET,
  MEDIA_PRESET,
];

// EVERY JOURNAL IS A CONFIGURED ONE SINCE 3.20. This used to prepend Study when
// a settings toggle said so, which is why Study was the one journal that could
// not be edited, deleted or reordered. There is no branch left: a vault has the
// journals it has.
export function registeredJournalTypes(plugin: ChronoAnvilPlugin): JournalType[] {
  return (plugin.settings.customJournals ?? []).map(buildJournalType);
}

export function getJournalType(
  plugin: ChronoAnvilPlugin,
  id: string
): JournalType | undefined {
  return registeredJournalTypes(plugin).find((t) => t.id === id);
}

// The journal type a note belongs to, by path. The same longest-root-wins rule
// the tracker surface uses (trackers.ts::journalTypeOfPath) rather than a
// second implementation, because "which journal is this note in?" must have
// one answer: the banner and the tracker picker disagreeing about it would
// show a note one type's crumbs and another type's trackers.

// The child folders of `folder` that are containers OF THIS TYPE.
//
// A bare childFolders() is wrong here, and the screenshot of it being wrong is
// a Study section listing "Cook Book" as one of its subjects. Until 2.45 that
// was the DEFAULT arrangement: Study's root was `paths.journalsRoot` — the
// whole journals tree — while a custom journal's derived root is
// `${journalsRoot}/${name}`, so every custom type's root folder was a direct
// child of Study's root and indistinguishable, by shape alone, from a Subject.
// Study read it as a subject and its containers as topics, and each custom
// journal appeared twice on the homepage: once as itself and once inside
// Study.
//
// 2.45 moved Study down a level, so the two roots are now siblings and the
// common case can no longer produce that. This filter stays, because a custom
// journal's root is a settings value and nothing stops one being pointed at a
// folder inside another type's root — the difference is that it is now a thing
// a user has to go out of their way to arrange, rather than what they get by
// default.
//
// The rule is the same one journalFolderScope already applies when it dedupes
// roots by prefix ("Study's root is the journals root itself and a custom
// journal's sits inside it, so listing both would count every custom note
// twice"). That rule existed for the READ side — what a widget aggregates —
// and never reached the ENUMERATION side, which is what the homepage, the
// parent pickers and the note-folder picker all use. Same rule, one more
// place, named once so a third caller cannot forget it.
//
// Filtered at every depth rather than only under the root, because a custom
// journal's root is a settings value: pointing one at
// `03 - Journals/Maths/Cooking` would otherwise make it look like a Study
// *topic* instead of a Study subject, which is the same bug one level down.
// NULL IS A REAL ARGUMENT, not a missing one (3.19.1). A folder outside every
// registered root belongs to no journal, so there is no journal whose siblings
// should be spared — every registered root is foreign to it, which is exactly
// what `t.id !== type?.id` says when `type` is null. Callers used to pass
// `?? STUDY_JOURNAL` here and thereby borrow Study's identity to enumerate
// with: on a vault where Study is off, or its root moved, that spared a root
// that was not the host's and was not Study's either.
export function journalChildFolders(
  plugin: ChronoAnvilPlugin,
  type: JournalType | null,
  folder: TFolder | null
): TFolder[] {
  const foreign = new Set(
    registeredJournalTypes(plugin)
      .filter((t) => t.id !== type?.id)
      .map((t) => normalizePath(t.root))
      .filter((r) => r !== "")
  );
  return childFolders(folder).filter(
    (f) => !foreign.has(normalizePath(f.path))
  );
}

// Every `type` frontmatter value a journal type recognises as one of its own
// notes: its kinds, its pages, and its container levels.
//
// This is what turns "is this note under the root?" into "is this one of this
// journal's notes?", which are different questions and have been silently
// conflated since journal surfaces existed. See journalTypeOfNote.
export function recognisedTypeValues(type: JournalType): Set<string> {
  const out = new Set<string>();
  for (const kind of type.kinds) {
    out.add(kind.id);
    // Every kind has pages since 1.0.23, and every kind of one journal names the
    // same page id — so this adds one value however many kinds there are.
    out.add(kind.pages.id);
  }
  for (const level of type.levels) out.add(level.id);
  return out;
}

// What this journal CALLS a note carrying that `type:` value — "Lesson",
// "Topic", "Page". 5.20.
//
// ── THE LABELLED HALF OF `recognisedTypeValues` ────────────────────────
//
// That function walks kinds, then each paged kind's `pages`, then levels, and
// answers whether a value is one of this journal's own. This walks the same
// three lists and answers what the value is called. They are one question asked
// for two purposes, and the reason this is a function rather than three lines
// at the call site is that the caller which had those three lines HAD ONLY TWO
// OF THEM: `pageHeadText` looked at kinds and levels, and never at pages.
//
// The eyebrow over a page therefore fell through to naming the journal alone,
// so every page in the vault wore `STUDY` where its lesson wore `STUDY ·
// LESSON` — the one note kind whose head could not say what it was, on the
// surface where a reader is most likely to have forgotten. Nothing failed,
// because a shorter eyebrow is a legal eyebrow.
//
// ORDER IS KINDS, LEVELS, PAGES, and it does not matter today: the four sets of
// ids are disjoint by construction — `buildJournalType` writes `page` for every
// journal's pages and refuses a kind id that collides with a level's. It is
// written in the order a reader would guess anyway, so that if that ever stops
// being true the more specific answer is the one that wins.
export function journalNounOf(type: JournalType, value: string): string | null {
  const id = normaliseTypeValue(value);
  if (id == null) return null;
  return (
    type.kinds.find((k) => k.id === id)?.label ??
    type.levels.find((l) => l.id === id)?.noun ??
    type.kinds.find((k) => k.pages.id === id)?.pages.label ??
    null
  );
}

// ── WHICH RUNG OF THE JOURNAL A NOTE IS (1.0.42) ────────────────────────
//
// The labelled half of `recognisedTypeValues` answers what a `type:` is CALLED;
// this answers WHERE IT SITS, which is the fact the page head needs and the one
// nothing in the tree computed. `railFor` comes closest and deliberately stops
// short: it returns null for a leaf, a page and a stray, because *"an Update is
// not a layer of the journal, it is what the layers hold"*. That scope call
// stands — the rail is still the journal's LAYERS. A rung is the wider ladder
// the head paints with, and a leaf is on it.
//
// ── IT WALKS IN DEPTH ORDER, WHICH `journalNounOf` DOES NOT ─────────────
//
// That function walks kinds, then levels, then pages, and says in as many words
// that the order *"does not matter today: the four sets of ids are disjoint by
// construction"*. Here the order IS the answer, so this walks levels, then
// kinds, then pages — outermost first. The disjointness is what makes the two
// safe to differ: they can disagree about which list answered, never about which
// rung.
//
// ── THE HOME NOTE IS RUNG 0 ────────────────────────────────────────────
//
// A journal's own folder note declares no `type:` at all, so it cannot be found
// by lookup — `railFor` takes the same fact as an argument for the same reason.
// It is the outermost rung and the caller is the only thing that knows.
//
// ── PAGES ARE ONE RUNG, NOT ONE PER KIND ───────────────────────────────
//
// `recognisedTypeValues` states it: *"every kind of one journal names the same
// page id — so this adds one value however many kinds there are."* A ladder with
// one page rung per kind would count rungs a reader cannot reach.
//
// AND IT IS A `RungMark`, WHICH IS THE DIARY'S TYPE TOO (`src/ui/rung.ts`).
// Declaring the shape twice is what would let the two domains' ramps disagree
// about what `t` means, and `t` is read by one `calc()` serving both. The alias
// is here so `journalRungOf`'s signature still names the journal's rung.
export type JournalRung = RungMark;

export function journalRungOf(
  type: JournalType,
  isJournalHome: boolean,
  typeValue: unknown
): JournalRung | null {
  // LEVELS + KINDS + THE PAGE + THE HOME NOTE. Computed rather than tabled,
  // because `JournalType.levels` has no cap: the settings dropdown offers one or
  // two, and `journal-infer.ts` can recover three from a folder tree nobody
  // created through the UI. A four-step table would fall off the end of one.
  const of = type.levels.length + type.kinds.length + 2;
  const rung = (step: number, emoji: string): JournalRung => ({
    step,
    of,
    t: of > 1 ? step / (of - 1) : 0,
    emoji,
  });

  if (isJournalHome) return rung(0, type.emoji);

  const id = normaliseTypeValue(typeValue);
  if (id == null) return null;

  const level = type.levels.findIndex((l) => l.id === id);
  if (level >= 0) return rung(level + 1, type.levels[level].fallbackEmoji);

  const kind = type.kinds.findIndex((k) => k.id === id);
  if (kind >= 0) return rung(type.levels.length + 1 + kind, type.kinds[kind].emoji);

  if (type.kinds.some((k) => k.pages.id === id)) {
    return rung(of - 1, DEFAULT_PAGE_EMOJI);
  }
  return null;
}

// Which rung of `type` this file is, asked without drawing anything.
//
// SEPARATE FROM THE PAINTER because two callers now need the answer and only
// one of them is painting: the banner's *Change the page icon* action has to
// know the glyph a note would draw BY DEFAULT, so that choosing that same glyph
// stores no override. `kind-columns.ts` states the rule this is in service of —
// a value equal to its default is deliberately not written, or a reader's
// frontmatter fills up with records of them agreeing with us.
export function journalRungFor(
  app: App,
  file: TFile,
  type: JournalType
): JournalRung | null {
  return journalRungOf(
    type,
    file.path === folderNotePath(type.root),
    noteTypeOf(app, file)
  );
}

// ── ONE PAINTER FOR BOTH STAMPING SITES (1.0.42) ────────────────────────
//
// `page-head.ts` and `vault-banner.ts` are the only two callers `journalAccent`
// has ever had, and until this release each wrote the two accent properties out
// by hand. The comment on `journalAccent` records what that cost the first time:
// *"AND THE 65/55 WAS WRITTEN TWICE, which is how the two would have drifted the
// first time either was tuned."* Four properties and an attribute is past the
// point where writing it twice is defensible, so the stamping is one function.
//
// IT REMOVES WHAT IT DOES NOT SET, which is `vault-banner.ts`' rule rather than
// this file's: a leaf is REUSED across file switches, so a glyph left on the
// view is one that outlives the note that caused it — a stray note under a
// journal root would wear the last Cheatsheet's texture. `page-head.ts` builds a
// fresh element every time and the removals are no-ops there.
export function paintJournalRung(
  app: App,
  file: TFile,
  type: JournalType,
  els: readonly HTMLElement[]
): JournalRung | null {
  const rung = journalRungFor(app, file, type);
  const accent = journalAccent(type.id, rung?.t);
  const icon = pageIconOf(frontmatterOf(app, file));
  for (const el of els) {
    el.setAttr("data-ca-journal", type.id);
    el.style.setProperty("--ca-journal-accent", accent.css);
    el.style.setProperty("--ca-journal-accent-rgb", accent.rgb);
  }
  // THE DEPTH CHANNEL ITSELF IS `paintRung`'s, and it is shared with the diary
  // (`src/ui/rung.ts`). This function owns the COLOUR — a journal's hue and the
  // rung's tone — because that is the half the diary does not need: its five
  // period hues have been hand-tuned since 4.80.
  paintRung(els, rung, icon);
  // RETURNED SO THE HEAD CAN DECIDE WHETHER TO DRAW A FILM. The glyph layer is a
  // CHILD rather than the head's `::before`, and that is not a style preference:
  // inside a `stack` the head's `::before` is already taken — it is the CARD's
  // full-height spine (`30-header-bars.css`), positioned against the card
  // because the head goes `position: static` there. An unconditional film on the
  // same pseudo would have greyscaled that spine, faded it to a quarter and
  // masked it away from its own left edge, which is a colour the reader chose
  // turned into a grey smudge.
  return rung;
}

// The journal type a note belongs to, or undefined.
//
// Path first, by the same longest-root-wins rule the tracker surface uses
// (trackers.ts::journalTypeOfPath) rather than a second implementation,
// because "which journal is this note in?" must have one answer: the banner
// and the tracker picker disagreeing about it would show a note one type's
// crumbs and another type's trackers.
//
// THEN the note's own `type`, since 2.34. Study's root is `paths.journalsRoot`
// itself, so the path test alone classified *every* note anywhere under the
// journals tree as Study — a scratch file, a stray attachment note, anything.
// That was recorded as harmless and deferred, on the condition that it be
// revisited if a journal surface ever gained a refusal of its own. The
// condition had already been met when it was written: `describeSurfaceMismatch`
// has refused misplaced `tracker:` directives on the strength of this
// classification since 2.27, and `journalChartRefusal` became the second such
// refusal in 2.32. Both told a stray note that a Cooking tracker didn't belong
// because "this note is in Study", and it was in Study only because Study's
// root is the whole tree.
//
// Unrecognised means *unclassified*, not "belongs to nobody's journal but we
// will guess" — and unclassified stays deliberately permissive everywhere it
// is consulted, which is the existing rule for a homepage or a scratch file.
// So the guard can only ever remove a wrong refusal; it cannot add one.
export function journalTypeOfNote(
  plugin: ChronoAnvilPlugin,
  notePath: string
): JournalType | undefined {
  const types = registeredJournalTypes(plugin);
  const id = journalTypeOfPath(
    types.map((t) => ({ typeId: t.id, root: t.root })),
    notePath
  );
  if (id == null) return undefined;
  const type = types.find((t) => t.id === id);
  if (!type) return undefined;
  const file = getFile(plugin.app, notePath);
  const raw = file
    ? noteTypeOf(plugin.app, file)
    : undefined;
  return typeRecognised(type, raw) ? type : undefined;
}

// The journal a note SITS IN, whatever the note says about itself. 4.51.7.
//
// ── TWO QUESTIONS, AND THEY ARE NOT THE SAME ONE ────────────────────────
//
// `journalTypeOfNote` above answers *"is this one of this journal's notes"* —
// path AND a recognised `type:` — because the callers that ask it REFUSE things:
// a misplaced `tracker:`, a chart on the wrong surface. A stray note under a
// journal's root must not be adopted by those.
//
// This answers *"which journal's folders is this note under"*, and nothing it
// feeds refuses anything. It exists because a journal's own DASHBOARD carries no
// `type:` at all — so the strict answer is "no journal", and the first vault
// render of 4.51.6 duly showed `Study/Study.md` labelled *Journal* in the bar
// and drawing no eyebrow at all, on the one page in that folder whose whole
// subject is the journal.
//
// LABELS ASK THIS ONE; REFUSALS ASK THE OTHER. Written down here because the
// two names are one word apart.
// Every folder of a journal that may hold a note. 1.0.14.
//
// EXTRACTED FROM `pickContainerFolder`, WHICH IS A DIALOGUE. That method asks the
// reader where to create a note; *What's below*'s edit mode asks where to move
// several. Two different questions over one fact — and the fact is the part that
// must not be written twice, which is `folderActivity`'s extraction argument
// exactly: two copies of "which folders may hold a note" is how a move comes to
// offer a folder the create path refuses.
//
// ── THE DEEPEST LEVEL, AND ONLY THE DEEPEST ──────────────────────────────
//
// This walked every level and offered all of them, which is how it read when the
// extraction was made and is not what it should have said. The reader asked what
// moving a note up to an intermediate level actually did. Traced:
//
// `buildLevelIndex` branches on `hasLevelBelow` — `containerDepth + 1 <
// levels.length`, a question about the LEVEL rather than about today's contents —
// so a Subject index draws `folderRollup`, which lists FOLDERS. A note sitting
// directly in `Study/Maths/` is not a folder, and the Topic-level `kind-table`s
// are scoped to folders below it. Nothing lists it.
//
// It is not gone: `journals-cards.ts` counts by `type:` over `pagesUnder(root)`,
// a recursive sweep, so it still counts on the journal's card and still feeds the
// rating average, and trackers still classify it. The outcome is worse than
// disappearing — a note that exists, still counts, and is reachable only by link
// or search, having quietly left the hierarchy that displays it.
//
// So an intermediate folder is not a place a note may be. Both callers get the
// rule, which is the whole reason there is one list: the edit mode cannot offer a
// destination the create path refuses, and the create path can no longer put a
// note somewhere nothing will show it.
//
// TWO BOUNDS, NOT ONE, AND THEY ARE DIFFERENT QUESTIONS. `depth >= deepest` stops
// the WALK — the folders below the deepest level are a promoted note's own folder,
// holding pages rather than notes, and descending would offer a reader the inside
// of a dashboard. `depth + 1 === deepest` decides what is COLLECTED on the way
// down. The walk still has to pass through the intermediate levels to reach the
// bottom; it just no longer writes them down.
//
// A PLAIN `string[]`, IN WALK ORDER, so a caller may filter it — the edit mode
// drops the folder the notes are already in — without re-deriving it. Nothing here
// notifies or refuses: the two callers have genuinely different things to say when
// the answer is empty.
export function containerFoldersOf(
  plugin: ChronoAnvilPlugin,
  type: JournalType
): string[] {
  const root = getFolder(plugin.app, type.root);
  if (!root) return [];
  const deepest = type.levels.length;
  const options: string[] = [];
  const walk = (folder: TFolder, depth: number) => {
    if (depth >= deepest) return;
    for (const child of journalChildFolders(plugin, type, folder)) {
      if (depth + 1 === deepest) options.push(child.path);
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return options;
}

export function journalTypeAtPath(
  plugin: ChronoAnvilPlugin,
  notePath: string
): JournalType | undefined {
  const types = registeredJournalTypes(plugin);
  const id = journalTypeOfPath(
    types.map((t) => ({ typeId: t.id, root: t.root })),
    notePath
  );
  return id == null ? undefined : types.find((t) => t.id === id);
}

// Shared by the resolver above and by classifyNote, so the surface layer and
// the type layer cannot disagree about what counts as one of a journal's notes.
export function typeRecognised(type: JournalType, raw: unknown): boolean {
  const value = normaliseTypeValue(raw);
  return value != null && recognisedTypeValues(type).has(value);
}

// The folders a folder-scoped journal widget reads.
//
//   ""         the host note's own folder — on an index note that means the
//              container and everything under it
//   "all"      every registered journal's root at once
//   "journal"  the root of the journal the host note is in (3.18 §5)
//   "<folder>" an explicit path, for a hand-built dashboard
//
// Shared by `review-queue` and `journal-search` rather than written twice. The
// review queue got here first and owned this as `queueScope`; a second copy in
// the search widget is precisely the drift this codebase keeps arguing against,
// and the two must agree — a queue and a search over "the same" subject that
// disagreed about what that meant would be a genuinely confusing pair.
export function journalFolderScope(
  plugin: ChronoAnvilPlugin,
  arg: string,
  hostFolder: string | null
): string[] {
  const a = arg.trim();
  if (a === SCOPE_JOURNAL) {
    // The host's own journal, whole. Resolved from the note's PATH rather than
    // from the folder argument, because "which journal is this note in" already
    // has one answer everywhere else and this must not be a second.
    //
    // Nothing when the note is outside every registered root — the widget draws
    // its existing empty state rather than falling back to the vault, which
    // would silently scope a broken directive to everything.
    if (!hostFolder) return [];
    const id = journalTypeOfPath(
      registeredJournalTypes(plugin).map((t) => ({ typeId: t.id, root: t.root })),
      hostFolder
    );
    const root = registeredJournalTypes(plugin).find((t) => t.id === id)?.root;
    return root ? [root] : [];
  }
  if (a === "all") {
    // Deduped by prefix, so a type whose root sits inside another's is not
    // counted twice. Every root is a sibling under the journals root by
    // default since 2.45, but a custom journal's root is a settings value and
    // may still be pointed anywhere.
    const roots = registeredJournalTypes(plugin).map((t) => t.root);
    return roots.filter(
      (r) => !roots.some((other) => other !== r && r.startsWith(`${other}/`))
    );
  }
  if (a) return [a];
  // `!= null`, NOT TRUTHY (4.44.0). The vault ROOT is a folder, and it is the
  // one folder whose path can be the empty string — `hostFolderOf` derives a
  // path by cutting at the last slash, and a note at the top of the vault has
  // no slash to cut at. Read as falsy, that answer became "this note is
  // nowhere", and a bare folder-scoped directive on a top-level note resolved
  // to no folder at all rather than to the vault.
  //
  // ABSENT IS STILL ABSENT. `null` is the one value that means the caller has
  // no host to offer — a journal TEMPLATE, which is composed once and used in
  // every folder of its level — and it still resolves to nothing here.
  return hostFolder != null ? [hostFolder] : [];
}

// Every `type` value that means "this note is a page", across all registered
// types. The complement of the kinds set: everything that filters journal notes
// asks `kinds.has(type)` and so excludes pages by construction, and this is the
// one place that wants the other side of that line — code which *displays*
// pages, or which has to send a page's writes to the note it belongs to.
//
// A set rather than a per-type lookup because the caller usually has a note and
// not a type in hand, and because two journals both calling their pages `page`
// is fine: the answer to "is this note a page?" is the same either way.
// ── Per-kind tracker declarations (2.36) ────────────────────────────────
//
// Four small pure functions over JournalKind.rating. Pure so the
// picker, the recall writer and the aggregates all decide identically — three
// answers to "does this kind carry that tracker?" is how a rule like this rots,
// which is the same reason classifyNote is pure.

// Every tracker id any kind of this type names. The set that "unmentioned is
// universal" is measured against.
//
// DERIVED FROM `rating` SINCE 3.18 (§7.2), where it was collected from a
// per-kind `trackers` list. On Study the two produce the same set — the list
// was `["confidence", "status", "reviewed"]` against `rating: "confidence"`,
// and the two entries the list added beyond the rating were declared by BOTH
// kinds, so neither was ever restricted by it. A tracker every kind names is
// indistinguishable from one no kind names, which is why dropping them changes
// no answer.
export function declaredTrackerIds(type: JournalType): Set<string> {
  const out = new Set<string>();
  for (const kind of type.kinds) {
    if (kind.rating) out.add(kind.rating);
  }
  return out;
}

// Whether a note of kind `kindId` should be offered `trackerId`.
//
// Permissive in three separate ways, each on purpose:
//   • an unknown kind — an index note, or a page, neither of which is a kind —
//     gets everything, because the declarations describe leaf notes and an
//     index legitimately holds a current value of anything;
//   • a kind that declares nothing gets everything, so the field is opt-in;
//   • a tracker no kind names gets offered everywhere, so adding a declaration
//     for one tracker never silently withdraws another.
export function kindAllowsTracker(
  type: JournalType,
  kindId: string | null,
  trackerId: string
): boolean {
  const kind = type.kinds.find((k) => k.id === kindId);
  if (!kind) return true;
  if (!declaredTrackerIds(type).has(trackerId)) return true;
  // The tracker is SOME kind's rating. It belongs to the kinds it grades and
  // to nobody else — which is the sentence the `trackers` list was written to
  // express and only ever expressed by being kept in step with this field.
  return kind.rating === trackerId;
}

// The kinds whose notes an average of `trackerId` should count. The read-side
// counterpart of kindAllowsTracker, and the thing that stops a topic's
// Confidence column from quietly including Practice notes rated for accuracy.
export function kindsCarrying(type: JournalType, trackerId: string): string[] {
  return type.kinds
    .filter((k) => kindAllowsTracker(type, k.id, trackerId))
    .map((k) => k.id);
}

// How many notes in a journal's tree carry one kind's id.
//
// THE COUNT A REMOVAL IS WEIGHED AGAINST, and there is one of it. It was a
// private method on the journal editor, where it fed the declassification
// sentence in `confirmKindChange`; 1.0.24 gives the *What's below* card a
// removal of its own, and a second walk deciding the same question is how two
// doors come to disagree about whether a note type is empty — with one of them
// then deleting a classification off notes the other could see.
//
// `noteTypeOf` RATHER THAN A RAW FRONTMATTER READ, which is the trim and the
// lowercase: a note written `type: Lesson` by hand is a Lesson, and a counter
// that missed it would report a kind empty that is not. 5.2 made this repair in
// `isContainerFolder` and 5.20 made it in `buildPagesTable`, for this reason.
//
// A WHOLE-VAULT WALK, so it is asked at the moment of ACTING and never on a
// render. Both callers are behind a confirmation.
export function countNotesOfKind(
  app: App,
  root: string,
  kindId: string
): number {
  let n = 0;
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(`${root}/`)) continue;
    if (noteTypeOf(app, file) === kindId) n++;
  }
  return n;
}

// Which tracker a Recall sitting on a note of this kind grades into, or null
// to fall back to the confidence built-in — which is what every note written
// before the declaration existed does, so an undeclared kind is unchanged.
export function ratingTrackerFor(
  type: JournalType | undefined,
  kindId: string | null
): string | null {
  if (!type) return null;
  return type.kinds.find((k) => k.id === kindId)?.rating ?? null;
}

export function pageTypeIds(plugin: ChronoAnvilPlugin): Set<string> {
  const out = new Set<string>();
  for (const type of registeredJournalTypes(plugin)) {
    for (const kind of type.kinds) out.add(kind.pages.id);
  }
  return out;
}

// ── The Pages section a note is still missing ─────────────────────────────
//
// Promotion inserts a page index below the banner, and used to insert it
// unconditionally. That was wrong for the commonest case there is: the shipped
// Lesson template ALREADY CARRIES ONE, so the first `New page` on a lesson
// promoted it, spliced in a second `📄 Pages` bar, a second `New page` button
// and a second `pages-table`, and left the note with the section twice over.
// Two identical tables, and two buttons either of which promotes nothing and
// adds another page.
//
// So the block is composed from what is absent rather than assumed. The two
// halves are asked about separately because they are separately losable — a
// note may have been hand-edited down to just the table, or (having been
// promoted before this fix) just the bar — and an all-or-nothing check would
// then either duplicate the half that is there or skip the half that isn't.
//
// PROBED BY DIRECTIVE, NOT BY TITLE. `📄 Pages` is a label the reader may
// retitle, exactly as journal-charts.ts preserves a retitled charts header;
// `button:<type>:new-page` and `pages-table` are what the widgets actually
// key off, so they are what "already has a page index" means.
//
// Returns [] when the note has both, and the caller then writes nothing at
// all — promotion still moves the note into its folder, which is the part it
// exists to do.
export function pagesSectionBlock(
  lines: string[],
  typeId: string,
  label: string
): string[] {
  const hasBar = noteHasDirective(lines, (l) =>
    /^button:[^:]+:new-page$/.test(l.trim())
  );
  const hasTable = noteHasDirective(lines, (l) => l.trim() === "pages-table");

  const parts: string[][] = [];
  if (!hasBar) {
    parts.push([
      FENCE_OPEN,
      `header:📄 ${label}s`,
      `button:${typeId}:new-page`,
      FENCE_CLOSE,
    ]);
  }
  if (!hasTable) parts.push([FENCE_OPEN, "pages-table", FENCE_CLOSE]);

  // A blank line between the two fences, none before the first — the block is
  // handed to insertBelowBanner, which supplies its own leading separator.
  return parts.flatMap((part, i) => (i === 0 ? part : ["", ...part]));
}

// A note's ancestor folder names within its type, outermost first, and the
// containing folders they name. `Maths/Algebra/Quadratics.md` under Study is
// [Maths, Algebra]; the topic index `Maths/Algebra/Algebra.md` is the same
// list, because a folder note *is* its folder rather than a note inside it.
//
// Path-derived rather than frontmatter-derived, which is the change that makes
// the banner type-agnostic: `subject` and `topic` are Study's property names,
// and a journal with a `Section` level has neither.
export function journalAncestors(
  type: JournalType,
  notePath: string
): { name: string; folder: string }[] {
  const root = normalizePath(type.root);
  const full = normalizePath(notePath);
  // A blind slice() invents a trail for a note that isn't under this root:
  // "99 - Elsewhere/Random/Note.md" against Study's 13-character root returned
  // crumbs named "e" and "Random", pointing at folders that don't exist. Both
  // present callers resolve the type from the path first so they cannot reach
  // it, but this is exported and pure, and the failure is silent rather than
  // loud — the trail looks plausible and goes nowhere.
  if (root === "" || !full.startsWith(`${root}/`)) return [];
  const rel = full.slice(root.length).replace(/^\//, "");
  const parts = rel.split("/").filter(Boolean);
  // The last segment is the file itself; a folder note repeats its folder's
  // name, so dropping the filename leaves the containers either way.
  //
  // ── AND THERE IS NO CAP ANY MORE (1.0.38) ──────────────────────────────
  //
  // This read `.slice(0, type.levels.length + 1)`: the type's own depth, plus
  // one for the promotion any note may make. The +1 was itself a repair — Study
  // has two levels while a page sits three folders deep, so capping at
  // `levels.length` dropped the lesson from its own page's trail — and the
  // moment pages nest, the same argument asks for +2, then +3, which is a cap
  // chasing a tree.
  //
  // WHAT THE CAP WAS PROTECTING is a note filed deeper than the journal puts
  // one, inventing crumbs for folders the type has no noun for. That protection
  // is gone and it is right that it is gone: a promoted page is a folder the
  // type's `levels` does not describe either, and the reader has just asked for
  // as many of them as they like. A folder under the root is now a note that can
  // hold pages, so every one of them is an ancestor worth naming.
  //
  // THE GUARD THAT MATTERS IS STILL ABOVE, and it is the one that was load-
  // bearing all along: a path outside this root returns `[]` rather than slicing
  // a trail out of somebody else's folders.
  const folders = parts.slice(0, -1);
  return folders.map((name, i) => ({
    name,
    folder: [root, ...folders.slice(0, i + 1)].join("/"),
  }));
}

// ── JournalManager: the generic engine (was the Study class) ──────────────
//
// Everything here operates on a JournalType passed in, so the same code path
// serves Study and every Custom Journal. The old Study public methods are
// preserved as thin wrappers that bind the Study type, so main.ts / widgets.ts
// keep working unchanged during the transition.

// Ensure the homepage carries the Journals block.
//
// REPAIR, NOT MIGRATION. Until 2.41 this was `migrateJournalsSection`: a
// one-shot upgrade from the old generated-markdown container (a header bar, a
// hero widget, a per-type bar and a run of subject callouts) to the single
// `journals` directive, complete with boundary detection delicate enough to
// need a `knownTitles` set — because the legacy container's own body opened
// with `header:2:` bars, so a naive "stop at the next header fence" ended the
// section on Study rather than on Trends and silently ate the user's charts.
//
// No note in existence carries the old form, so all of that went with the rest
// of the pre-userbase compatibility surface. What is left is the half that
// still earns its keep: a homepage that has lost its Journals block — deleted
// by hand, or scaffolded from an older asset — gets one back, appended at the
// end. Anything else is left exactly as it is.
//
// Matched on the directive rather than on the fence, so a hand-added
// `journals` line inside a longer block still counts: the widget renders
// wherever it appears, and adding a second copy above it would be worse than
// leaving the note alone.
//
// ── AND IT COMPARED THE LINE EXACTLY, WHICH BROKE A CLEAN VAULT (4.38.3) ──
//
// This read `l.trim() === JOURNALS_DIRECTIVE`, and the sentence above states
// precisely why that was wrong the moment 4.37 shipped `journals:cards`: the
// homepage composes the ARGUMENT form, this saw no line equal to `journals`,
// concluded the section was missing, and appended a second copy — *"worse than
// leaving the note alone"*, by its own rule.
//
// It is reached from `rebuildJournalHome`, which runs when a journal is created.
// So the reported sequence was: fresh vault, add Study, and the homepage already
// had two Journals sections before repair had been opened once. Every later
// symptom — the duplicate render, the migration offering to delete five lines —
// was downstream of this line.
//
// `isJournalsDirective` is the one place that question is answered now; see
// `constants.ts` for why there were four.
export function ensureJournalsBlock(source: string): string {
  const has = source.split("\n").some((l) => isJournalsDirective(l));
  if (has) return source;
  const block = [FENCE_OPEN, "frame: section", JOURNALS_DIRECTIVE, FENCE_CLOSE].join("\n");
  return `${source.trimEnd()}\n\n${block}\n`;
}

export class JournalManager {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  // ── What this journal's card shows in its fourth cell (4.47) ───────────
  //
  // STORED ON THE JOURNAL, so every surface that draws its card agrees — the
  // homepage grid, a `journal-card:<id>` on any page, and any future one. A per-
  // note answer would make the same journal say different things on two pages,
  // which is what a card is for NOT doing.
  //
  // A STUDY THAT IS NOT IN `customJournals` IS TOLD, NOT SWALLOWED — the rule
  // `saveVariant` above states in its own words: a bare return on an
  // unrecognised journal is indistinguishable from a save that worked.
  //
  // NO SCAFFOLD PASS AND NO TEMPLATE WRITE. Nothing about this reaches a note,
  // and that is exactly why the last line is here.
  //
  // ── THE REPAINT, AND 4.47 SHIPPED WITHOUT IT (4.48) ────────────────────
  //
  // This comment used to end *"the cards are re-rendered from settings, which is
  // what `saveSettings` already triggers"*, and that sentence was false.
  // `saveSettings` writes `data.json`, schedules the registry mirror and
  // re-registers commands; it re-renders nothing. So the menu ticked the new
  // row, the file on disk changed, and the card under it went on showing the
  // old number until the note was reopened — **a silent no-op**, reported from
  // a vault.
  //
  // `settings-editors.ts` had already written the finding down: *"A LABEL CHANGE
  // IS INVISIBLE TO EVERY FILE WATCHER (3.20.1). Renaming a note type here
  // rewrites no note, so nothing in an open dashboard was told."* A journal's
  // `cardStat` is the same species of change and takes the same line.
  async setCardStat(type: JournalType, measure: string): Promise<void> {
    const cfg = configOfJournal(this.plugin.settings.customJournals, type.id);
    if (!cfg) {
      new Notice(
        "A card's fourth number is stored on a journal you defined, and this journal is not one of them."
      );
      return;
    }
    // TOGGLED OFF BY PICKING WHAT IS ALREADY THERE, which costs nothing and is
    // the only way back to the card's own derivation once a reader has chosen.
    // Deleted rather than written empty: absent is the state every journal
    // starts in, and a key present with no value is a third state.
    if (cfg.cardStat === measure) delete cfg.cardStat;
    else cfg.cardStat = measure;
    await this.plugin.saveSettings();
    repaintOpenNotes(this.plugin.app);
  }

  // ── Create a top-level container (Study: a subject) ─────────────────────
  async newTopLevel(type: JournalType): Promise<void> {
    const level = type.levels[0];
    const root = type.root;
    const name = await promptText(
      this.app,
      `📚 New ${type.name} ${level.noun} name`
    );
    if (!name?.trim()) return;
    const item = name.trim();
    const folderPath = `${root}/${item}`;

    if (getFolder(this.app, folderPath)) {
      notify.fail(`"${folderPath}" already exists`);
      return;
    }
    await ensureFolder(this.app, folderPath);

    const tpl = await readTemplate(
      this.app,
      `${type.templatesFolder}/${level.indexTemplate}`
    );
    if (tpl == null) {
      new Notice(
        `${level.noun} template missing — run 'Set up / repair vault'.`
      );
      return;
    }
    const content = fillTemplate(tpl, {
      emoji: this.levelEmoji(level, item),
      name: item,
      // Backwards-compatible token aliases so existing Study templates
      // ({{subject}}, {{folder}}) keep resolving.
      subject: item,
      folder: folderPath,
      created: nowTimestamp(),
    });
    const indexFile = await createFileEnsuringFolders(
      this.app,
      `${folderPath}/${item}.md`,
      content
    );

    await this.rebuildJournalHome();
    await openFile(this.app, indexFile);
    notify.ok(`${type.name} ${level.noun} "${item}" created!`);
  }

  // ── Create a nested container at levels[depth] (Study: a topic) ──────────
  async newContainer(
    type: JournalType,
    depth: number,
    parentArg?: string
  ): Promise<void> {
    if (depth <= 0 || depth >= type.levels.length) {
      notify.fail(`${type.name} has no sub-level to add here.`);
      return;
    }
    const level = type.levels[depth];
    const parentLevel = type.levels[depth - 1];
    const root = getFolder(this.app, type.root);
    if (!root) {
      notify.fail("Journals folder not found");
      return;
    }
    const parents = journalChildFolders(this.plugin, type, root).map(
      (f) => f.name
    );
    if (parents.length === 0) {
      // `splitGlyph`, because a journal type's name is "🎓 Study" and
      // lowercasing it produces "No 🎓 study subjects yet". Found by the
      // assertion in empty-states.test.ts written for the identical bug in
      // tables.ts — two files, one construction, and the second had been there
      // long enough that nobody was going to spot it by reading. A glyph is a
      // slot; it stops being one the moment a string operation treats it as a
      // word.
      notify.fail(
        `No ${splitGlyph(type.name).text.toLowerCase()} ${plural(parentLevel.noun).toLowerCase()} yet — create one first.`
      );
      return;
    }

    let parent = parentArg;
    if (!parent) {
      // Incidental, so the only answer is taken rather than asked for. The
      // reader asked to create a folder; which parent it goes under is
      // bookkeeping when there is one parent. See modals.ts::only for why this
      // is not the rule everywhere.
      parent =
        only(parents) ??
        ((await promptSuggester(
          this.app,
          parents,
          `📂 Add ${level.noun.toLowerCase()} to which ${parentLevel.noun.toLowerCase()}?`
        )) as string | undefined);
    }
    if (!parent) return;

    const itemName = await promptText(
      this.app,
      `📂 New ${level.noun.toLowerCase()} in ${parent}`
    );
    if (!itemName?.trim()) return;
    const item = itemName.trim();

    const itemPath = `${type.root}/${parent}/${item}`;
    if (getFolder(this.app, itemPath)) {
      notify.fail(`"${itemPath}" already exists`);
      return;
    }
    await ensureFolder(this.app, itemPath);

    const tpl = await readTemplate(
      this.app,
      `${type.templatesFolder}/${level.indexTemplate}`
    );
    if (tpl == null) {
      new Notice(
        `${level.noun} template missing — run 'Set up / repair vault'.`
      );
      return;
    }
    const content = fillTemplate(tpl, {
      emoji: this.levelEmoji(level, item),
      name: item,
      subject: parent,
      topic: item,
      // Index notes carry a creation stamp like leaf notes do. Deliberately
      // no `date`: buildTopicsTable derives a topic's last activity from the
      // dates of the notes *under* it, so giving the index one of its own
      // would report the day the topic was made as study activity.
      created: nowTimestamp(),
    });
    const indexFile = await createFileEnsuringFolders(
      this.app,
      `${itemPath}/${item}.md`,
      content
    );

    await this.rebuildJournalHome();
    await openFile(this.app, indexFile);
    notify.ok(`${level.noun} "${item}" added to ${parent}!`);
  }

  // ── Create a leaf note of a given kind (Study: lesson / practice) ───────
  async newNote(
    type: JournalType,
    kindId: string,
    folderArg?: string
  ): Promise<void> {
    const kind = type.kinds.find((k) => k.id === kindId);
    if (!kind) {
      notify.fail(`Unknown ${type.name} note type: ${kindId}`);
      return;
    }
    const root = type.root;
    let folderPath = folderArg;

    // No explicit folder (command palette): infer from the active file's
    // folder if it sits under this type's root; otherwise offer a picker.
    if (!folderPath) {
      const active = activeMarkdownFile(this.app);
      const activeFolder = active?.parent?.path;
      if (activeFolder && activeFolder.startsWith(root + "/")) {
        folderPath = activeFolder;
      } else {
        folderPath = (await this.pickContainerFolder(type)) ?? undefined;
      }
    }
    if (!folderPath) return;

    // BOTH FIELDS, ALWAYS (4.50 §1). `kind.templates` always holds at least the
    // default variant, and `pageLayoutChoices` always holds at least the page
    // default — so neither list is ever empty and neither field is ever hidden.
    //
    // AND THE PAGES HALF IS NO LONGER CONDITIONAL. It was absent, not empty, for
    // a kind that could not hold pages; every kind can (1.0.23), so every kind's
    // create dialogue asks which layout its pages open with.
    const pageRows = pageLayoutChoices(this.configOf(type), kind.pages.label);
    const details = await promptNewNote(this.app, {
      heading: `${kind.emoji} New ${kind.label.toLowerCase()}`,
      titlePlaceholder: `${kind.label} title`,
      layoutLabel: "Layout",
      templates: kind.templates.map((t) => ({ id: t.id, label: t.label })),
      pages: {
        label: `${kind.pages.label} layout`,
        templates: pageRows,
        templateId: PAGE_LAYOUT_DEFAULT,
      },
    });
    if (!details?.title.trim()) return;
    const safeTitle = details.title.trim().replace(/[\\/:"*?<>|]/g, "-");
    const variant =
      kind.templates.find((t) => t.id === details.templateId) ??
      kind.templates[0];
    if (!variant) {
      notify.fail(`No template configured for ${kind.label}`);
      return;
    }

    // Derive one token per hierarchy level from the folder path, keeping the
    // Study aliases {{subject}}/{{topic}}/{{parent}} for template compat.
    const rel = normalizePath(folderPath)
      .slice(normalizePath(root).length)
      .replace(/^\//, "");
    const parts = rel.split("/").filter(Boolean);
    const subject = parts[0] ?? "";
    const topic = parts[1] ?? "";
    const parent = parts[parts.length - 1] ?? subject;

    const notePath = `${folderPath}/${safeTitle}.md`;
    if (getFile(this.app, notePath)) {
      notify.fail(`"${safeTitle}" already exists in this folder`);
      await openFile(this.app, getFile(this.app, notePath) as TFile);
      return;
    }

    const tpl = await readTemplate(
      this.app,
      `${type.templatesFolder}/${variant.template}`
    );
    if (tpl == null) {
      new Notice(`${variant.template} missing — run 'Set up / repair vault'.`);
      return;
    }
    const content = fillTemplate(tpl, {
      title: safeTitle,
      subject,
      topic,
      parent,
      date: today(),
      created: nowTimestamp(),
    });
    const file = await createFileEnsuringFolders(this.app, notePath, content);
    await this.setPageLayout(file, details.pageTemplateId);
    await openFile(this.app, file);
    notify.ok(`${kind.label} created!`);
  }

  // The stored config a built type came from, or null.
  //
  // BY ID, on `JournalTemplates.configFor`'s rule: `JournalType` is rebuilt on
  // every read and the thing that persists is the `JournalConfig` in settings,
  // which is where saved layouts live.
  configOf(type: JournalType): JournalConfig | null {
    return configOfJournal(this.plugin.settings.customJournals, type.id);
  }

  // What a title's pages are built from, written onto the title itself.
  //
  // THE DEFAULT CLEARS THE PROPERTY RATHER THAN STORING A WORD FOR IT. Absent
  // means the journal's page default — that is `page-default.ts`'s whole
  // contract and `cardStat`'s shape before it — so writing an id meaning "no
  // id" would give one state two spellings and leave every note in every vault
  // in the other one.
  async setPageLayout(file: TFile, layoutId: string): Promise<void> {
    const id = layoutId.trim();
    const fm = frontmatterOf(this.app, file);
    if (!id && !(PAGE_LAYOUT_KEY in fm)) return;
    await this.app.fileManager.processFrontMatter(file, (front) => {
      if (id) front[PAGE_LAYOUT_KEY] = id;
      else delete front[PAGE_LAYOUT_KEY];
    });
  }

  // What ONE INDEX NOTE says about one of its note types' tables. 1.0.33.
  //
  // `setPageLayout`'S SHAPE, AND ITS DELETE. An entry that has become blank is
  // taken out and a property with nothing left in it goes with it, because
  // absent is what "the journal's own answer" already spells — see
  // `kind-tables.ts`, which holds the whole argument and the merge.
  //
  // THE FLATTENING IS THE MODULE'S, NOT THIS FUNCTION'S. `storedKindTables` is
  // the one place that knows the shape on disk differs from the shape callers
  // hold, so a writer here cannot invent a third one.
  async setKindTable(
    file: TFile,
    kindId: string,
    over: KindTableOverride
  ): Promise<void> {
    const fm = frontmatterOf(this.app, file);
    const next = withKindTable(fm, kindId, over);
    if (!next && !(KIND_TABLES_KEY in fm)) return;
    await this.app.fileManager.processFrontMatter(file, (front) => {
      if (next) front[KIND_TABLES_KEY] = storedKindTables(next);
      else delete front[KIND_TABLES_KEY];
    });
  }

  // The other half of a page-added note type: this index note says it lists it.
  // 1.0.33.
  //
  // WRITTEN BEFORE THE SECTIONS ARE RECONCILED, never after — `childrenParts`
  // composes a group for a `local` kind only where `ctx.localKinds` names it,
  // and `indexSurfaces` reads that off this frontmatter. Reconcile first and the
  // planner is asked about a kind this page has not yet claimed, so it composes
  // nothing and the reader presses a button that does nothing visible.
  //
  // A SECOND PRESS MOVES NO BYTES, which is `withPageType` returning null —
  // `setPageLayout`'s posture, and the reason listing a type a page already
  // lists is not a modification of the file.
  // RESOLVES TO THE LIST THE FILE NOW CARRIES, which is not a convenience.
  // `frontmatterOf` reads Obsidian's metadata cache, and the cache is updated
  // from a file event AFTER this returns — so a caller that wrote the claim and
  // then re-read it through `pageTypesOf` would get the list as it was BEFORE
  // the write. That is exactly what *"adding a new-note type no longer
  // automatically updates the table (the user has to repair vault for it to
  // show)"* was: the planner was asked about a page that had already claimed the
  // kind and was told, by a stale cache, that it had not.
  async listKindOnPage(file: TFile, kindId: string): Promise<string[]> {
    const now = frontmatterOf(this.app, file);
    const next = withPageType(now, kindId);
    if (!next) return pageTypesIn(now);
    await this.app.fileManager.processFrontMatter(file, (front) => {
      front[PAGE_TYPES_KEY] = next;
    });
    return next;
  }

  // And off again — this card stops listing it. The kind is untouched: whether
  // it also leaves the journal is `promptRemoveKind`'s question, and the answer
  // is "only if no other card still lists it".
  //
  // THE KEY IS DELETED RATHER THAN LEFT EMPTY, because an empty list in a
  // reader's property editor is a row saying nothing that they then have to
  // decide about.
  async unlistKindOnPage(file: TFile, kindId: string): Promise<string[]> {
    const now = frontmatterOf(this.app, file);
    const next = withoutPageType(now, kindId);
    if (!next) return pageTypesIn(now);
    await this.app.fileManager.processFrontMatter(file, (front) => {
      if (next.length) front[PAGE_TYPES_KEY] = next;
      else delete front[PAGE_TYPES_KEY];
    });
    return next;
  }

  // Which kind a note is, read off its own `type:`.
  //
  // NORMALISED, LIKE EVERY OTHER READ OF THIS PROPERTY (5.20). `type: Lesson`
  // against a lowercase id matched nothing, and the two callers that got it wrong
  // fell through to a text-reading fallback that lowercases — so the bug was a
  // file read per New Page for anybody who had ever capitalised a `type:` by hand,
  // not a visible failure. There is one normaliser and everything goes through it.
  //
  // THE ID, NOT THE KIND, because the caller that wants this wants to compare it
  // against the destination it is about to offer — and a kind object would make
  // "is this already what they picked" a question about identity.
  noteKindOf(file: TFile): string | null {
    const fm = frontmatterOf(this.app, file);
    return normaliseTypeValue(fm["type"]) ?? null;
  }

  // Change which kind a note is. 1.0.14.
  //
  // A FRONTMATTER WRITE AND NOTHING ELSE, because **a kind is not a folder**.
  // `JournalKind` has no folder field, every kind at one journal level shares a
  // folder, and `kind-table` selects its rows by frontmatter — so re-filing a note
  // as another kind moves no bytes and the row reappears under a different head at
  // the next repaint, which the live widget does by itself.
  //
  // `setPageLayout`'S SHAPE, WITH ONE DIFFERENCE. That one DELETES its key for the
  // default, because absent means "the journal's page default" there and one state
  // must not have two spellings. A kind has no default — absent means the note is
  // not one of the journal's at all — so this always writes.
  //
  // AND IT WRITES THE ID, NEVER THE LABEL. That is the whole of 5.20's scar:
  // `type: Lesson` where a lowercase `lesson` was expected matched nothing and the
  // pages vanished from their own index. One writer is what keeps `noteKindOf` and
  // `normaliseTypeValue` honest.
  async setNoteKind(file: TFile, kindId: string): Promise<void> {
    const id = kindId.trim();
    if (!id) return;
    await this.app.fileManager.processFrontMatter(file, (front) => {
      front["type"] = id;
    });
  }

  // ── Pages: splitting one note across several ────────────────────────────
  //
  // `pageKindOf` and `pagesHostOf` are free functions below the class. They were
  // private methods until 1.0.38, when `buildPagesTable` came to need the same
  // answer and had no manager to ask: the question is *"given this journal and
  // this note, what are its pages built from"* and nothing in it is about the
  // manager's state. The prose that was here is on the functions themselves.
  private pagesHostOf(
    type: JournalType,
    file: TFile,
    fm: Record<string, unknown>
  ): PagesHost | null {
    return pagesHostOf(this.app, type, file, fm);
  }

  // Whether a note has already been promoted: a folder note is one whose
  // basename matches its folder. The same test study-header and resolveUp use,
  // so "is this a dashboard?" has one answer across the plugin.
  private isPromoted(file: TFile): boolean {
    return !!file.parent && file.basename === file.parent.name;
  }

  // Turn a leaf note into a folder note holding pages, and give it somewhere to
  // list them. Returns the note's new TFile, or null if it couldn't move.
  //
  // Two things this must get right:
  //
  //   • fileManager.renameFile, not vault.rename — the former updates every
  //     wikilink pointing at this note across the vault. A lesson is exactly
  //     the kind of note other notes link to, so moving it with the raw vault
  //     API would break the links that make it worth having.
  //   • append, never rewrite. The Pages section is spliced in below the
  //     banner and nothing else in the note is touched.
  //
  // ── AND IT TAKES THE PAGE CONFIG, NOT THE KIND (1.0.38) ────────────────
  //
  // `kind.pages.label` was all it ever read, and asking for a whole `JournalKind`
  // is what made "promote a PAGE" unaskable: a page has no kind of its own.
  // `pagesHostOf` answers for both surfaces, so this takes what it returns.
  async promoteToDashboard(
    type: JournalType,
    file: TFile,
    pages: JournalPages
  ): Promise<TFile | null> {
    if (this.isPromoted(file)) return file;
    const parent = file.parent?.path;
    if (!parent) return null;

    const folder = `${parent}/${file.basename}`;
    if (getFolder(this.app, folder)) {
      notify.fail(`"${folder}" already exists`);
      return null;
    }
    await ensureFolder(this.app, folder);

    const target = `${folder}/${file.basename}.md`;
    try {
      await this.app.fileManager.renameFile(file, target);
    } catch (err) {
      new Notice(`Couldn't convert this note: ${String(err)}`);
      return null;
    }

    const moved = getFile(this.app, target);
    if (!moved) return null;

    const label = pages.label;
    const original = await this.app.vault.read(moved);
    const lines = original.split("\n");
    // Only the half (or halves) the note doesn't already have. A lesson written
    // from the shipped template has the whole section already, and gets nothing
    // — the move into its own folder is the promotion.
    const block = pagesSectionBlock(lines, type.id, label);
    if (block.length === 0) return moved;
    const updated = insertBelowBanner(lines, block).join("\n");
    if (updated !== original) await this.app.vault.modify(moved, updated);
    return moved;
  }

  // Create one page inside a note, promoting that note first if it is still a
  // single file. `notePath` defaults to the active file, so the button on a
  // lesson's own dashboard needs no argument.
  async newPage(type: JournalType, notePath?: string): Promise<void> {
    const path = notePath ?? activeMarkdownFile(this.app)?.path;
    let file = path ? getFile(this.app, path) : null;
    if (!file && path) {
      const base = path.replace(/\.md$/, "");
      const leafName = path.split("/").pop();
      if (leafName) {
        file = getFile(this.app, `${base}/${leafName}`);
      }
    }
    if (!file) {
      file = activeMarkdownFile(this.app);
    }
    if (!file) {
      notify.fail("Open a note first.");
      return;
    }

    let fm = frontmatterOf(this.app, file);
    let host = this.pagesHostOf(type, file, fm);
    if (!host) {
      // Fallback: if metadataCache is momentarily behind after a save, parse type from text
      try {
        const text = await this.app.vault.read(file);
        const match = /^type:\s*["']?([^"'\n\r]+)["']?/m.exec(text);
        if (match && match[1]) {
          const directType = match[1].trim();
          // THE FALLBACK READS THE PAGE ID TOO (1.0.38). It matched `kinds`
          // alone, which was correct while only a leaf could host a page; a page
          // created moments ago is exactly the note whose `type: page` the cache
          // has not seen yet, and that is the note a reader presses New page on
          // when they split it further.
          const retry = { ...fm, type: directType };
          const found = this.pagesHostOf(type, file, retry);
          if (found) {
            host = found;
            fm = retry;
          }
        }
      } catch {
        // Fall back to empty frontmatter if unreadable
      }
    }

    // ── THE REFUSAL THAT IS LEFT, AND WHAT IT USED TO BE (1.0.23) ────────
    //
    // *"❌ Only a Lesson can hold pages."* — composed from the kinds that had
    // been ticked as paged, and shown on a Practice note, on a Topic index, and
    // on a page of a lesson alike. Two of those three were the capability tick
    // talking, and the tick is gone: every kind of this journal holds pages.
    //
    // WHAT REACHES HERE NOW IS A NOTE THAT IS NOT A LEAF OF THIS JOURNAL, and
    // the two ways in want different sentences, because the reader's next move
    // differs. A PAGE is the interesting one: the reader is standing inside the
    // very note whose pages they want another of, so the message names it rather
    // than saying no twice. Anything else — an index, a note with no `type`, a
    // stray file under the root — is not one of this journal's notes at all.
    //
    // ── AND THE PAGE ARM IS GONE (1.0.38) ────────────────────────────────
    //
    // *"A page holds no pages — open X to add another."* was the third of the
    // three refusals, and the only one a reader ever read. It was true because
    // `pageKindOf` made it true; the reader's ask was that it stop being. What
    // is left refuses a note this journal does not own, which is the sentence
    // this block was reduced to in 1.0.23 with one arm still attached.
    //
    // STILL A BACKSTOP RATHER THAN THE PATH. `newPageHere` is gated on
    // `canHoldPages` (`core/actions.ts`), so the palette does not offer the
    // command on an index, and the button only exists inside a 📄 Pages section.
    // This is what a hand-typed `button:<type>:new-page` on the wrong note gets.
    if (!host) {
      notify.fail(`This isn't one of ${type.name}'s notes.`);
      return;
    }

    const { pages, kind } = host;

    // THE PAGE DIALOGUE IS THE TITLE DIALOGUE (4.50 §4). It was a bare
    // `promptText` — a title and nothing else — which is the other half of what
    // the reader called *"the new title/page dialogue"*. One window, both
    // fields, the same modal.
    //
    // AND IT OPENS ON WHAT THE TITLE STORES. A page default nothing ever shows
    // is a setting the reader has to remember making; this is where it becomes
    // visible, and a reader who wants this one page built differently overrides
    // it here without disturbing the next one.
    //
    // A PAGE HAS NO PAGES, so no third field — §1's argument for drawing a
    // one-option field is an argument about a pair.
    //
    // ── AND IT IS ASKED BEFORE THE NOTE IS MOVED (5.20) ─────────────────
    //
    // `promoteToDashboard` ran three lines above this window. It creates a
    // folder, `fileManager.renameFile`s the note into it — rewriting every
    // wikilink in the vault that pointed at it — and splices a Pages section
    // into the body. Then the dialogue opened, and pressing **Cancel** returned
    // from here having done all of that.
    //
    // A CANCELLED ACTION THAT RESTRUCTURES THE VAULT IS NOT A CANCELLED ACTION.
    // Nothing warned, nothing was reversible from inside the plugin, and the
    // reader's own undo does not reach a rename plus a folder plus an edit. It
    // was invisible from the promoted side, too — the reader who says OK gets
    // exactly the same result either way, which is why the ordering read as an
    // implementation detail for four releases.
    //
    // THE WINDOW NEEDS NOTHING FROM THE PROMOTION. It named the promoted note,
    // and promotion moves a note's PATH, never its basename — so `file` answers
    // the same string before the move as after it. That was the whole of the
    // dependency, and stating it is what keeps someone from restoring the old
    // order to "have the host handy".
    const cfg = this.configOf(type);
    const rows = pageLayoutChoices(cfg, pages.label);
    const details = await promptNewNote(this.app, {
      heading: `${pages.label} in ${file.basename}`,
      titlePlaceholder: `${pages.label} title`,
      layoutLabel: "Layout",
      templates: rows,
      templateId: pageLayoutShown(cfg, pageLayoutOf(fm)),
    });
    if (!details?.title.trim()) return;
    const safeTitle = details.title.trim().replace(/[\\/:"*?<>|]/g, "-");

    const folderNote = await this.promoteToDashboard(type, file, pages);
    if (!folderNote?.parent) return;

    // AFTER THE PROMOTION, AND IT STILL CANNOT FIRE ON AN UNPROMOTED NOTE. The
    // folder this path is in either did not exist a moment ago — in which case
    // nothing can be in it — or the note was already a dashboard, in which case
    // `promoteToDashboard` returned it untouched and the check is the same
    // check it always was. So moving the window up did not buy a collision that
    // costs a promotion.
    const notePathNew = `${folderNote.parent.path}/${safeTitle}.md`;
    if (getFile(this.app, notePathNew)) {
      notify.fail(`"${safeTitle}" already exists in this note`);
      return;
    }

    // A saved layout is COMPOSED; the default is the file on disk. Both are
    // templates carrying `{{tokens}}`, so `fillTemplate` below cannot tell them
    // apart — see `JournalTemplates.pageLayoutText`, which is the only thing
    // that knows a layout exists.
    const tpl =
      this.plugin.journalTemplates.pageLayoutText(
        type,
        kind,
        details.templateId
      ) ??
      (await readTemplate(
        this.app,
        `${type.templatesFolder}/${pages.template}`
      ));
    if (tpl == null) {
      new Notice(`${pages.template} missing — run 'Set up / repair vault'.`);
      return;
    }

    // Pages are read in order, so each one gets its position at creation.
    // Derived from what is already there rather than stored on the parent: a
    // counter on the dashboard would drift the first time a page was deleted by
    // hand. So does a COUNT of the files beside it, which is what stood here —
    // see `nextPageOrder`, which owns the rule and states the deletion that
    // breaks both.
    //
    // `childNotes` SINCE 1.0.38, AND IT IS THE ALLOCATOR'S CORRECTNESS. A page
    // promoted to hold pages of its own moves into a folder, so `childFiles`
    // stopped seeing it and stopped seeing its `order` — max+1 over a run with
    // the largest ordinal missing hands that ordinal out a second time, and two
    // pages then sort by basename at the same position.
    const order = nextPageOrder(
      childNotes(folderNote.parent)
        .filter((f) => f.path !== folderNote.path)
        .map((f) => pageOrderOf(frontmatterOf(this.app, f)))
    );

    const content = fillTemplate(tpl, {
      title: safeTitle,
      type: pages.id,
      parent: folderNote.basename,
      subject: typeof fm["subject"] === "string" ? fm["subject"] : "",
      topic: typeof fm["topic"] === "string" ? fm["topic"] : "",
      order: String(order),
      date: today(),
      created: nowTimestamp(),
    });
    const created = await createFileEnsuringFolders(
      this.app,
      notePathNew,
      content
    );
    await openFile(this.app, created);
    notify.ok(`${pages.label} created!`);
  }

  // ── A `convertToDashboard` STOOD HERE UNTIL 1.0.23 ──────────────────────
  //
  // *"Convert to a dashboard"* — a command and a banner-menu row that called
  // `promoteToDashboard` and stopped there, described in its own comment as
  // *"useful when the reason to promote is 'this is getting long' rather than
  // 'I want to write the next bit now'"*.
  //
  // THAT DISTINCTION DIED WITH THE PAGES TICK. Promotion used to be how a note
  // GOT its Pages section — `promoteToDashboard` splices one in below the banner
  // when it finds none — so there was a real state to reach before writing a
  // page. Every leaf template ships the section now, so the splice finds nothing
  // missing and the command reduced to moving a note into a folder named after
  // itself: step one of `newPage`, and a drag in Obsidian's own file explorer.
  //
  // IT IS NOT REPLACED, AND `newPage` IS STILL THE ONLY ROAD TO A PROMOTION.
  // `newPage` promotes on the way past and there is no other caller of
  // `promoteToDashboard` left, so the only way a note becomes a folder note is
  // by being asked for a page.
  //
  // ── AND THE SECOND HALF OF THIS PARAGRAPH IS REVERSED (1.0.38) ───────
  //
  // It read *"AND PAGES DO NOT NEST… a page cannot be turned into a dashboard
  // to hold pages of its own, from any surface. That is the reader's call, in
  // those words."* It was the reader's call and they have made the opposite one,
  // on the evidence of their own vault: a page that grows too long to read is
  // the same note a lesson was when it grew too long, and the answer it got was
  // no. `pagesHostOf` replaced the `pageKindOf` refusal this sentence named, so
  // **New page** on a page promotes it exactly as it does a lesson — by this
  // same function, which needed nothing added to it.
  //
  // WHAT WENT WITH IT: a second `when` gate, a second refusal sentence, the
  // `isIndex` argument on `journalBannerMenu` (its only reader), and a fallback
  // this path alone carried — a raw read of the file plus a regex over `type:`
  // for when the metadata cache had not caught up, which `newPage` never needed
  // and which was the tell that this was the road less walked.

  private async pickContainerFolder(
    type: JournalType
  ): Promise<string | null> {
    if (!getFolder(this.app, type.root)) {
      notify.fail("Journals folder not found");
      return null;
    }
    const options = containerFoldersOf(this.plugin, type);
    if (options.length === 0) {
      notify.fail("No folders yet — create one first.");
      return null;
    }
    // Same reading as the parent picker above: the reader asked to create a
    // note, and one candidate folder is not a question.
    return (
      only(options) ??
      promptSuggester(this.app, options, "Create note in which folder?")
    );
  }

  private levelEmoji(level: JournalLevel, name: string): string {
    return folderEmoji(this.plugin, name, level.fallbackEmoji);
  }

  // ── Keep the homepage's Journals block on the current layout ───────────
  //
  // The Journals section used to be *generated markdown*: a `📚 Journals`
  // header bar, then one `header:2:` bar plus a run of `[!study]` callouts per
  // registered type, rewritten in full on every subject/topic change. That is
  // what made the section a stack of separate boxes — Obsidian renders each
  // markdown block as its own sibling element, so no amount of styling could
  // close the gaps between the container bar, the hero, the type bar and the
  // cards. 2.13.9 replaces the whole run with a single `journals` directive
  // that renders the section as one widget (journals-section.ts), which is a
  // single DOM subtree and therefore genuinely one continuous card.
  //
  // So there is no longer any body to generate, and this method's whole job is
  // migration: get an older homepage onto the one-fence form. It is a no-op
  // on a note already there — which, after the first run, is every note. The
  // section's *contents* are live now (see the `journals` widget's scope), so
  // nothing here has to run when a subject is created any more; the calls that
  // remain in newTopLevel/newContainer are cheap no-ops kept for vaults still
  // being migrated.
  async rebuildJournalHome(): Promise<boolean> {
    const home = getFile(this.app, this.plugin.settings.paths.home);
    if (!home) {
      notify.fail("Homepage not found — run 'Set up / repair vault'.");
      return false;
    }

    const original = await this.app.vault.read(home);
    const updated = ensureJournalsBlock(original);
    if (updated !== original) await this.app.vault.modify(home, updated);
    return true;
  }


  // ── Command entry points ────────────────────────────────────────────────
  // The page commands take no type argument: a page belongs to the note it is
  // created in, and that note's type is resolved from its path. One pair of
  // commands for every journal type, rather than a pair per type cluttering
  // the palette.
  private typeOfActive(): { type: JournalType; path: string } | null {
    const file = activeMarkdownFile(this.app);
    if (!file) {
      notify.fail("Open a note first.");
      return null;
    }
    const type = journalTypeOfNote(this.plugin, file.path);
    if (!type) {
      notify.fail("This note isn't inside a journal.");
      return null;
    }
    return { type, path: file.path };
  }

  async newPageHere(): Promise<void> {
    const hit = this.typeOfActive();
    if (hit) await this.newPage(hit.type, hit.path);
  }


  // Store an arrangement as one of a kind's saved layouts. 3.18 §6.
  //
  // MOVED OFF THE SETTINGS MODAL, unchanged in what it does. It lived on
  // `JournalEditModal` and wrote into that window's draft config, which meant
  // the only way to save a layout was to have the settings window open — while
  // the button that calls it, "Save as layout…", is rendered by the section
  // editor, which is also reachable from the banner on any note. The feature
  // was built and the door was a fourth argument (`onSaveVariant`) that one
  // caller in two passed.
  //
  // WRITTEN AND SCAFFOLDED IN ONE STEP, which is the part that must not be
  // split: a half-saved variant — config without a file, or a file the config
  // does not know about — is the state `ensureJournalTemplates` exists to
  // prevent rather than to create.
  //
  // REFUSES ON STUDY, and that is a real limit rather than an oversight. A
  // saved layout is stored on a journal in `settings.customJournals`; Study is
  // a preset built from `STUDY_CONFIG` in code and has no stored config to
  // write one into. Saying so is better than writing a layout that vanishes on
  // reload.
  //
  // STORED ON THE JOURNAL SINCE 3.18 follow-ups §5, not on the kind. `kinds`
  // records which kinds may be created from it — the kind it was saved from by
  // default, and more once something asks. That is a storage move with no new
  // semantics: the layout itself is byte-for-byte what it always was.
  //
  // IT ALSO STOPS A LOSS. `normaliseKinds` rebuilds every kind row from the
  // fields the journal editor knows about, and `variants` was not one of them —
  // so a reader who saved a layout and then edited that journal in Settings had
  // it silently discarded. Nothing guarded the old address; the new one is not
  // in that routine's path at all.
  // TAKES THE SPLIT LISTS SINCE 4.33, AND NO LONGER A `kindId`. That parameter
  // did two jobs — the default membership, and a guard that returned SILENTLY
  // when the id was not a real kind — and the second is a Save button that does
  // nothing on two of the three surfaces the window can now be opened from.
  // `splitLayoutTargets` does the splitting, in one place, for both doors; the
  // origin is not a parameter at all because `promptLayoutSave` already
  // guarantees the surface it was saved from is ticked.
  async saveVariant(
    typeId: string,
    label: string,
    sections: string[],
    options: Record<string, SectionOverrides>,
    kinds: string[],
    surfaces: ("index" | "page")[] = []
  ): Promise<void> {
    const cfg = configOfJournal(this.plugin.settings.customJournals, typeId);
    if (!cfg) {
      new Notice(
        "Saved layouts are stored on a journal you defined, and this journal is not one of them."
      );
      return;
    }
    if (!kinds.length && !surfaces.length) {
      // SAID, NOT SWALLOWED. The old spelling was a bare `return` on an
      // unrecognised kind, which a reader cannot tell from a save that worked.
      new Notice(
        "ChronoAnvil: pick at least one note type or surface to offer this layout on."
      );
      return;
    }

    // Ids unique within the JOURNAL now rather than within the kind, which is
    // the one consequence of the move that is not invisible: two kinds could
    // previously hold a "Two column" each. Suffixed rather than rejected, the
    // same repair `normaliseKinds` makes and for the same reason — a reader
    // naming two layouts "Math" wants two layouts, not an error.
    const taken = new Set((cfg.variants ?? []).map((v) => v.id));
    const stem = slugify(label) || "variant";
    let id = stem;
    let n = 2;
    while (taken.has(id)) id = `${stem}-${n++}`;

    cfg.variants = [
      ...(cfg.variants ?? []),
      {
        id,
        label,
        sections: [...sections],
        ...(Object.keys(options).length ? { options } : {}),
        // ALWAYS WRITTEN, EVEN EMPTY. `variantKinds` reads an absent `kinds` as
        // "every kind", so a surface-only layout that left it off would appear
        // in every create dropdown and claim a template file per kind. That
        // trap is closed in `variantKinds` too; writing it explicitly means the
        // stored shape says what it means without needing the reader of it to
        // know the rule.
        kinds: [...kinds],
        ...(surfaces.length ? { surfaces } : {}),
      },
    ];

    await this.plugin.saveSettings();
    const written = await this.plugin.scaffold.ensureJournalTemplates(cfg);
    new Notice(
      written.length
        ? `ChronoAnvil: saved “${label}” — wrote ${written.join(", ")} ✅`
        : `ChronoAnvil: saved “${label}” ✅`
    );
  }

  // ── Study entry points ──────────────────────────────────────────────────
  // Study's "new …" commands and ribbon actions. They exist because Study's
  // four actions are registered by id in `ACTIONS` rather than derived per
  // journal, which is a separate piece of work from this one.
  //
  // NOT ENABLED-CHECKED ANY MORE (3.20). Study used to be registered by a
  // settings toggle rather than stored, so it could be "on" as a concept and
  // absent as a journal, and every entry point had to say so. It is an ordinary
  // journal now: `studyOn` in actions.ts asks whether the vault HAS it, so a
  // vault without it does not show these commands at all and there is no state
  // left for a notice to describe.
  //
  // `studyJournal()` returns null when it has been removed — a command left
  // over in a hotkey binding, or a race with the settings tab — and the callers
  // bail. That is a genuinely missing journal rather than a disabled one, so it
  // says so in those words.
  private studyJournal(): JournalType | null {
    return (
      registeredJournalTypes(this.plugin).find((t) => t.id === "study") ?? null
    );
  }

  private studyMissingNotice(): boolean {
    if (this.studyJournal()) return false;
    new Notice(
      "🎓 There's no Study journal in this vault — add one from Settings → ChronoAnvil → Journals → Add journal → Start from Study."
    );
    return true;
  }

  newStudyJournal(): Promise<void> {
    if (this.studyMissingNotice()) return Promise.resolve();
    // `studyType`, NOT `STUDY_JOURNAL` (3.19.1). The constant is Study built
    // from the SHIPPED DEFAULTS, and `studyType` exists precisely because
    // `root` and `templatesFolder` are plain strings that have to be read from
    // settings at the moment the type is used. This call had the constant, so a
    // reader who moved `paths.studyRoot` got their new Study journal created at
    // the default location — under a folder they had deliberately stopped
    // using, where nothing else would look for it.
    //
    // ALL THREE ENTRY POINTS NOW (3.20). 3.19.1 fixed this one and left the
    // other two carrying the constant, which was half a fix: `newTopic` and
    // `newStudyNote` created a topic and a lesson under the shipped default
    // root just as surely. Read from the registered journal, which is where the
    // reader's root and their renames both live.
    return this.newTopLevel(this.studyJournal()!);
  }
  newTopic(subjectArg?: string): Promise<void> {
    if (this.studyMissingNotice()) return Promise.resolve();
    return this.newContainer(this.studyJournal()!, 1, subjectArg);
  }
  newStudyNote(
    type: "lesson" | "practice",
    folderArg?: string
  ): Promise<void> {
    if (this.studyMissingNotice()) return Promise.resolve();
    return this.newNote(this.studyJournal()!, type, folderArg);
  }
}

/** What a note's pages are built from: the config, and the leaf kind that owns it. */
export interface PagesHost {
  pages: JournalPages;
  kind: JournalKind;
}

// Which of this journal's LEAF kinds a note is, from its frontmatter.
//
// WHAT IT REFUSES, SINCE 1.0.23. It ended `return kind?.pages ? kind : null`,
// where the second half was the per-kind capability tick; every kind has pages
// now, so what is left is the only question there ever was — is this note one of
// THIS journal's leaf notes. A page answers no (its `type` is the page id, which
// is deliberately not a kind), and so does an index note, a note of another
// journal, and a note with no `type` at all.
export function pageKindOf(
  type: JournalType,
  fm: Record<string, unknown>
): JournalKind | null {
  const t = normaliseTypeValue(fm["type"]);
  return (t == null ? undefined : type.kinds.find((k) => k.id === t)) ?? null;
}

// ── WHAT A NOTE'S PAGES ARE BUILT FROM, LEAF OR PAGE (1.0.38) ────────────
//
// The second of the three refusals that kept pages flat. `pageKindOf` answers
// "which of this journal's LEAF kinds is this", and `newPage` treated a `null`
// as "this note holds no pages" — so a page, whose `type` is deliberately not
// a kind, could never be the host of one.
//
// WHAT THE CALLERS ACTUALLY WANT IS `kind.pages`, and every kind of a journal
// shares one object: `buildJournalType` builds `{ id, label, template }` once
// and hands the same value to every kind, which is the fact that makes a page
// answerable at all. So for a page the config is the journal's, full stop.
//
// THE KIND IS STILL RESOLVED, by walking up. `pageLayoutText` composes a page
// against `sectionContext(type, { page: kind })`, which reads the kind's rating
// and noun — so a sub-page of a Lesson must compose as a Lesson's page and not
// as an arbitrary one. The walk asks each folder above for its folder note and
// stops at the first one whose `type:` is a kind, which is the owning leaf at
// any depth. It stops at the journal root, so it cannot climb out.
//
// NULL IS STILL "NOT ONE OF THIS JOURNAL'S NOTES", and an index still answers
// it: an index's `type` is a level id, which is neither a kind nor the page id.
export function pagesHostOf(
  app: App,
  type: JournalType,
  file: TFile,
  fm: Record<string, unknown>
): PagesHost | null {
  const own = pageKindOf(type, fm);
  if (own) return { pages: own.pages, kind: own };

  const value = normaliseTypeValue(fm["type"]);
  if (!value || !type.kinds.some((k) => k.pages.id === value)) return null;

  const root = normalizePath(type.root);
  for (
    let folder = file.parent;
    folder && normalizePath(folder.path).startsWith(root);
    folder = folder.parent
  ) {
    const note = getFile(app, folderNotePath(folder.path));
    const kind = note ? pageKindOf(type, frontmatterOf(app, note)) : null;
    if (kind) return { pages: kind.pages, kind };
  }

  // A PAGE WHOSE OWNER CANNOT BE READ IS STILL A PAGE. The folder note may be
  // missing, or its `type:` may have been hand-edited away; the page config is
  // the journal's either way, so the only thing lost is which kind's layout a
  // new page composes from. Falling back to the first kind keeps New page
  // working on a note the vault has damaged, rather than refusing with a
  // sentence about a file the reader is not looking at.
  const first = type.kinds[0];
  return first ? { pages: first.pages, kind: first } : null;
}
