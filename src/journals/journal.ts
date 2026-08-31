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
import { activeMarkdownFile, childFiles, childFolders, createFileEnsuringFolders, ensureFolder, fillTemplate, frontmatterOf, getFile, getFolder, normaliseTypeValue, noteTypeOf, nowTimestamp, openFile, plural, readTemplate, slugify, today } from "../core/util";
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
import { journalTypeOfPath } from "../trackers/trackers";
import { SCOPE_JOURNAL } from "../core/directive-grammar";
import { notify } from "../core/notify";
import { repaintOpenNotes } from "../ui/livewidget";
import {
  PAGE_LAYOUT_DEFAULT,
  PAGE_LAYOUT_KEY,
  configOfJournal,
  pageLayoutChoices,
  pageLayoutOf,
  pageLayoutShown,
} from "./page-default";

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

// A kind's optional sub-notes: the pages a long note can be split across.
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
  // Set when notes of this kind can be split across pages. Study's lesson has
  // it; practice doesn't, because a practice note is a set of exercises rather
  // than a document that grows.
  pages?: JournalPages;

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
      pages: true,
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
  // shipped as assets. These are the two places its arrangement differs from
  // the catalogue's defaults, and both are load-bearing:
  //
  //   ORDER — a Topic index puts its note tables *below* the learning path,
  //   because the path is the curated route through them and the tables are
  //   the fallback. The Subject index above it puts its children first. One
  //   global order cannot be both.
  //
  //   FIELDS — a Topic index carries three resource shelves rather than the
  //   catalogue's single one, which is a real arrangement difference and not a
  //   compatibility shim. (The `key` override that sat here until 2.41 *was*
  //   one: it pinned `learning-path` for notes already holding that region.)
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
    "index:1": {
      order: [
        "banner",
        "trackers",
        "stats",
        "review",
        "charts",
        "path",
        "children",
        "resources",
      ],
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

  const kinds: JournalKind[] = cfg.kinds.map((k) => ({
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
  }));

  // One page template for the whole type, claimed once and shared by every
  // paged kind — so it takes one name from the allocator rather than one per
  // kind, and a kind called "Page" cannot quietly take it.
  const pageTemplate = cfg.kinds.some((k) => k.pages)
    ? claim(PAGE_TEMPLATE.replace(/\.md$/, ""))
    : null;
  if (pageTemplate) {
    cfg.kinds.forEach((k, i) => {
      if (k.pages) {
        kinds[i].pages = { id: "page", label: "Page", template: pageTemplate };
      }
    });
  }

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
  layout: {
    // The Area index counts the PROJECTS beneath it, which is the sentence this
    // journal is kept to be able to say. `sections` rather than `order`,
    // because that is the only field that can turn a `default: never` section
    // on — see the `tally` section for why it must default off.
    "index:0": {
      sections: [
        "banner",
        "trackers",
        "children",
        "tally",
        "find",
        "charts",
        "tasks",
      ],
    },
    // AND `index:1` SHIPS `order` DELIBERATELY, TO SHOW THE DIFFERENCE. A
    // Project index wants its updates first and its tasks high, which is an
    // arrangement — so it says only that, and gains a section the day the
    // catalogue adds one. A layout that shipped `sections` here would be frozen
    // for every later reader, which is what `sections` means and is a price
    // worth paying only where a widget has to be turned on.
    "index:1": {
      order: ["banner", "trackers", "tasks", "children", "charts", "find"],
    },
  },
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
    // The Block index bands what its workouts and meals add up to. Turned on
    // through `sections` for the reason the catalogue entry gives.
    //
    // ONE SECTION AND A PRESET AS OF 4.46. This named `totals`, which was its own
    // section emitting `journal-totals`; that widget is now the `totals` preset
    // of the merged stats band, and the layout says so here rather than by
    // naming a second section.
    "index:0": {
      sections: [
        "banner",
        "trackers",
        "stats",
        "children",
        "charts",
        "find",
        "tasks",
      ],
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
    // `pages: true` is the shape no other preset has — a long read splits into
    // chapters, a season into episodes — and the shared page template and the
    // 📄 Pages section already do it.
    {
      id: "title",
      emoji: "🎬",
      label: "Title",
      pages: true,
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
    "index:0": {
      sections: [
        "banner",
        "trackers",
        "stats",
        "children",
        "charts",
        "find",
      ],
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
    if (kind.pages) out.add(kind.pages.id);
  }
  for (const level of type.levels) out.add(level.id);
  return out;
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
    for (const kind of type.kinds) {
      if (kind.pages) out.add(kind.pages.id);
    }
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
  // The cap is the type's own depth, plus one when any of its kinds can hold
  // pages. A promoted note is a container the type's `levels` doesn't describe
  // — Study has two levels but a page sits three folders deep — so capping at
  // levels.length alone would drop the lesson from its own page's trail,
  // leaving a crumb trail that skips the note the page belongs to. The extra
  // is conditional rather than unconditional so a stray note filed far too
  // deep in a type that has no pages still can't invent crumbs for folders the
  // type has no noun for.
  const depth = type.levels.length + (type.kinds.some((k) => k.pages) ? 1 : 0);
  const folders = parts.slice(0, -1).slice(0, depth);
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
    // The pages half is absent, not empty, for a kind that cannot hold pages.
    const pageRows = kind.pages
      ? pageLayoutChoices(this.configOf(type), kind.pages.label)
      : null;
    const details = await promptNewNote(this.app, {
      heading: `${kind.emoji} New ${kind.label.toLowerCase()}`,
      titlePlaceholder: `${kind.label} title`,
      layoutLabel: "Layout",
      templates: kind.templates.map((t) => ({ id: t.id, label: t.label })),
      ...(pageRows && kind.pages
        ? {
            pages: {
              label: `${kind.pages.label} layout`,
              templates: pageRows,
              templateId: PAGE_LAYOUT_DEFAULT,
            },
          }
        : {}),
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

  // ── Pages: splitting one note across several ────────────────────────────
  //
  // The kind a note belongs to, and its page config, resolved from the note's
  // own `type` frontmatter rather than from where it sits — the same reason
  // the banner reads `type` for its own index test.
  private pageKindOf(
    type: JournalType,
    fm: Record<string, unknown>
  ): JournalKind | null {
    const t = typeof fm["type"] === "string" ? fm["type"] : "";
    const kind = type.kinds.find((k) => k.id === t);
    return kind?.pages ? kind : null;
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
  async promoteToDashboard(
    type: JournalType,
    file: TFile,
    kind: JournalKind
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

    const label = kind.pages?.label ?? "Page";
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
    let kind = this.pageKindOf(type, fm);
    if (!kind?.pages) {
      // Fallback: if metadataCache is momentarily behind after a save, parse type from text
      try {
        const text = await this.app.vault.read(file);
        const match = /^type:\s*["']?([^"'\n\r]+)["']?/m.exec(text);
        if (match && match[1]) {
          const directType = match[1].trim();
          const fallbackKind = type.kinds.find(
            (k) => k.id.toLowerCase() === directType.toLowerCase()
          );
          if (fallbackKind?.pages) {
            kind = fallbackKind;
            fm = { ...fm, type: directType };
          }
        }
      } catch {
        // Fall back to empty frontmatter if unreadable
      }
    }

    if (!kind?.pages) {
      const which = type.kinds
        .filter((k) => k.pages)
        .map((k) => k.label)
        .join(" or ");
      new Notice(
        which
          ? `❌ Only a ${which} can hold pages.`
          : `❌ ${type.name} notes can't hold pages.`
      );
      return;
    }

    const host = await this.promoteToDashboard(type, file, kind);
    if (!host?.parent) return;

    const pages = kind.pages;

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
    const cfg = this.configOf(type);
    const rows = pageLayoutChoices(cfg, pages.label);
    const details = await promptNewNote(this.app, {
      heading: `${pages.label} in ${host.basename}`,
      titlePlaceholder: `${pages.label} title`,
      layoutLabel: "Layout",
      templates: rows,
      templateId: pageLayoutShown(cfg, pageLayoutOf(fm)),
    });
    if (!details?.title.trim()) return;
    const safeTitle = details.title.trim().replace(/[\\/:"*?<>|]/g, "-");

    const notePathNew = `${host.parent.path}/${safeTitle}.md`;
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
    // count is recomputable, and a counter on the dashboard would drift the
    // first time a page was deleted by hand.
    const order =
      childFiles(host.parent).filter((f) => f.path !== host.path).length + 1;

    const content = fillTemplate(tpl, {
      title: safeTitle,
      type: pages.id,
      parent: host.basename,
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

  // The explicit command: convert without creating a page. Useful when the
  // reason to promote is "this is getting long" rather than "I want to write
  // the next bit now".
  async convertToDashboard(type: JournalType, notePath?: string): Promise<void> {
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
    let kind = this.pageKindOf(type, fm);
    if (!kind) {
      try {
        const text = await this.app.vault.read(file);
        const match = /^type:\s*["']?([^"'\n\r]+)["']?/m.exec(text);
        if (match && match[1]) {
          const directType = match[1].trim();
          const fallbackKind = type.kinds.find(
            (k) => k.id.toLowerCase() === directType.toLowerCase()
          );
          if (fallbackKind?.pages) {
            kind = fallbackKind;
            fm = { ...fm, type: directType };
          }
        }
      } catch {
        // Fall back to empty frontmatter if unreadable
      }
    }
    if (!kind) {
      notify.fail("This note isn't a kind that can hold pages.");
      return;
    }
    if (this.isPromoted(file)) {
      new Notice("This note is already a dashboard.");
      return;
    }
    const moved = await this.promoteToDashboard(type, file, kind);
    if (moved) {
      await openFile(this.app, moved);
      notify.ok(`"${moved.basename}" can now hold pages.`);
    }
  }

  private async pickContainerFolder(
    type: JournalType
  ): Promise<string | null> {
    const root = getFolder(this.app, type.root);
    if (!root) {
      notify.fail("Journals folder not found");
      return null;
    }
    // Offer every container folder down the hierarchy so a note can be
    // created at any level that can hold one.
    const options: string[] = [];
    const walk = (folder: TFolder, depth: number) => {
      if (depth >= type.levels.length) return;
      for (const child of journalChildFolders(this.plugin, type, folder)) {
        options.push(child.path);
        walk(child, depth + 1);
      }
    };
    walk(root, 0);
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

  async convertHere(): Promise<void> {
    const hit = this.typeOfActive();
    if (hit) await this.convertToDashboard(hit.type, hit.path);
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
