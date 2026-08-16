// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { ROOT_JOURNALS, TEMPLATES_ROOT } from "../core/constants";
import { buildJournalType, deriveLevelId } from "./journal";
import type { JournalType } from "./journal";
// Re-exported from their new homes so the many importers of these two — every
// test, scaffold.ts, settings-editors.ts — keep the import site that reads
// naturally. `buildJournalType` moved into journal.ts to break a module-init
// cycle and `slugify` into util.ts to keep it broken; neither move is about
// this file's job, which is still "config in, templates out".
export { buildJournalType, PAGE_TEMPLATE } from "./journal";
export { slugify } from "../core/util";
import {
  SectionContext,
  TemplateLayout,
  chosenSectionIds,
  kindPlural,
  renderSection,
  sectionsFor,
  templateTargets,
} from "./journal-sections";
import type { SectionOverrides } from "./journal-sections";
import { journalSurface } from "../trackers/trackers";
import type { TrackerDef } from "../trackers/trackers";

// ── Custom Journals: user-defined journal types stored in settings ────────
//
// A JournalType (see journal.ts) carries functions (the per-level emoji
// resolvers) that can't be JSON-serialized. So settings store this plain-data
// shape instead, and buildJournalType() reconstructs a live JournalType from it,
// supplying a name-keyed emoji map per level. Study stays a hand-written
// built-in; everything the user creates flows through here.
//
// Until 2.13.9 this file also carried buildGenericSection — a depth-aware
// *markdown* renderer that emitted a custom type's home-page block as a header
// bar plus a run of callouts. journals-section.ts renders every type from the
// same DOM code path now, reading depth and kinds off the JournalType directly,
// so a custom type needs no rendering code of its own at all.

export interface JournalLevelConfig {
  // Stable id, slugified from the noun when the level is created and preserved
  // across every later relabel. See JournalLevel.id for what depended on this
  // being re-derived, and broke.
  //
  // Optional only so a config saved before 2.43 still parses;
  // normalizeJournalConfigs fills it in on load.
  id?: string;
  // Singular noun for one folder at this level ("Section", "Project").
  noun: string;
  // Fallback emoji for a folder at this level whose name isn't in the vault's
  // folder-emoji pool. The pool itself is global (journal.ts::folderEmoji) —
  // there was a per-level `emojis` map here until 2.39, with identical lookup
  // semantics to Study's and no UI that ever wrote to it.
  fallbackEmoji: string;
}

export interface JournalKindConfig {
  // Frontmatter `type` value + action suffix. Slugified, unique within a type.
  id: string;
  emoji: string;
  // Human label ("Entry", "Meeting").
  label: string;
  // Which tracker a Recall sitting grades notes of this kind into. Optional and
  // permissive when absent — see JournalKind for the "unmentioned is universal"
  // rule. A custom journal that says nothing behaves exactly as it did before
  // this existed.
  //
  // A `trackers` list sat beside this until 3.18 (§7) and is gone. A stored one
  // is DROPPED on load rather than migrated: it had one writer, that writer is
  // gone, and a field read by nothing but `kindsCarrying` would be exactly the
  // invisible state journal-plan.ts rules against.
  rating?: string;
  // Whether notes of this kind can be split across pages, as Study's Lesson
  // can. A boolean rather than the JournalKind shape it becomes: the id,
  // label and template file are the same for every paged kind, so asking for
  // them would be three fields to get wrong in exchange for nothing a reader
  // would ever want to vary.
  pages?: boolean;
  // Plural label, when the crude pluraliser would get it wrong.
  plural?: string;
  // Saved layouts this kind can be created from, beyond the default one.
  //
  // MOVED UP TO THE JOURNAL IN 3.18 follow-ups §5, and kept here only to be
  // migrated off. `normalizeJournalConfigs` lifts a stored list into
  // `JournalConfig.variants` on load, tagged with this kind's id, so nothing a
  // reader saved is lost and nothing downstream reads it here any more.
  //
  // WHY IT COULD NOT STAY. A layout is `{sections, options}` keyed by nothing
  // kind-specific — what was kind-specific was only where it was STORED — so
  // "my two-column Lesson" could not be reused on Practice for no better reason
  // than the shape of the settings file. Worse, the location was one nothing
  // guarded: `normaliseKinds` rebuilds every kind row from the fields the
  // editor knows about, so a reader who saved a layout and then edited the
  // journal in Settings had it silently discarded. Moving it out is what makes
  // both problems go away at once, and the second is why the migration is not
  // optional.
  variants?: JournalVariantConfig[];
}

// A saved layout: which sections a variant's template starts with, in order,
// and how they are labelled.
//
// `sections` absent means the catalogue's defaults, the same thing it means
// everywhere else. `options` is SectionOverrides per section id, which is
// already a plain JSON shape — labels, field lists, heading lists — so nothing
// here needs a serialiser.
export interface JournalVariantConfig {
  id: string;
  label: string;
  sections?: string[];
  options?: Record<string, SectionOverrides>;
  // Which of this journal's kinds may be created from this layout. 3.18
  // follow-ups §5.
  //
  // ABSENT MEANS EVERY KIND, which is what makes the cross-kind half a storage
  // move with no new semantics rather than a feature with a default to argue
  // about: a layout that says nothing is offered wherever it can be composed,
  // and a reader who wants it on one kind names that kind.
  //
  // THE VARIANT NAMES THE KINDS, RATHER THAN EACH KIND NAMING ITS VARIANTS.
  // Both spellings express "a kind opts in", and only one of them has a single
  // source of truth. A `uses: string[]` on every kind would be a second list to
  // keep in step with this one, and the failure mode — a kind naming a layout
  // that no longer exists, or a layout no kind names — is exactly the
  // two-sided drift `preserveIds` and the id-stability rule exist to prevent.
  kinds?: string[];
  // Surfaces beyond this journal's kinds that this layout is offered on. 4.33.
  //
  // ABSENT MEANS NONE — deliberately the OPPOSITE of `kinds` above, and the
  // asymmetry is the honest one rather than the tidy one. "Absent means all"
  // works for kinds because every kind can compose every layout, so a layout
  // that says nothing is offered wherever it fits. It cannot work here: these
  // two surfaces are not kinds, a layout saved from a Lesson has no business
  // being offered on a Subject Index by default, and every layout saved before
  // this field existed was saved from a kind.
  //
  // A SEPARATE FIELD RATHER THAN TWO MORE ENTRIES IN `kinds`. `variantKinds`
  // filters names against real kind ids and DROPS what it does not recognise,
  // so `kinds: ["index"]` would be silently discarded; and a journal whose kind
  // id is literally `index` or `page` would be indistinguishable from the
  // surface. See `LAYOUT_SURFACE_INDEX` in journal-sections.ts for why these
  // are recipes rather than template files.
  surfaces?: ("index" | "page")[];
}

export interface JournalConfig {
  // Stable slug, unique across all types (including the built-in "study").
  id: string;
  // Display name ("Recipes", "Meeting Notes").
  name: string;
  // Emoji shown on the home-section heading.
  emoji: string;
  // Vault folder holding this type's top-level containers.
  root: string;
  // Folder holding this type's templates.
  templatesFolder: string;
  // 1 = flat (notes live directly in each top-level folder),
  // 2 = two-level (top-level folders contain sub-folders that hold notes).
  levels: JournalLevelConfig[];
  // Leaf note kinds offered in the deepest container.
  kinds: JournalKindConfig[];
  // How this type's generated templates depart from the catalogue's own
  // arrangement, keyed by template target ("index:0", "kind:lesson", "page").
  //
  // Here rather than only on the built JournalType since 2.42, because the
  // alternative was Study being the one type that could express an
  // arrangement — which is exactly the asymmetry the single constructor exists
  // to remove. Compose-time only: nothing here is written beside a note.
  // Absent means the catalogue's arrangement, which is every custom type until
  // one wants otherwise.
  layout?: Record<string, TemplateLayout>;
  // Saved layouts this journal offers, and which of its kinds each applies to.
  // 3.18 follow-ups §5.
  //
  // ONE LIST FOR THE JOURNAL, where there used to be one per kind. The stored
  // shape did not change at all — `{sections, options}`, keyed by nothing
  // kind-specific — because it never was kind-specific; only its address was.
  // What that address cost was reuse: "my two-column Lesson" could not be
  // offered on Practice, for no reason a reader could see or state.
  //
  // NOT CROSS-JOURNAL, DELIBERATELY. A layout names SECTION IDS, and which
  // sections exist is a function of the surface — `sectionApplies` filters by
  // surface, by `applies(ctx)` and by the type's own shape. Within one journal
  // the only such variation is `pages`, which is small, knowable and reported
  // (`unresolvableFor`). Across journals it is unbounded, and `options` are
  // worse than `sections` there: a `children` override keyed by KIND ID cannot
  // survive a journey to a journal whose kind ids are different by
  // construction. That half stays a copy rather than a reference, and is not
  // this change.
  variants?: JournalVariantConfig[];
}

// ── Normalising stored config ─────────────────────────────────────────────
//
// Levels gained an `id` in 2.43 and configs written before then don't carry
// one. Filling it in at load rather than at every read is the point: a
// fallback evaluated on each read is the re-derivation this release removed,
// wearing a defensive face. One pass on load, and from then on the id is
// simply there.
export function normaliseLevels(
  rows: JournalLevelConfig[],
  opts: { preserveIds: boolean }
): JournalLevelConfig[] {
  const seen = new Set<string>();
  return rows.map((row, depth) => {
    const base =
      (opts.preserveIds && row.id) || deriveLevelId(row.noun, depth);
    // Two levels of one journal sharing an id would give them one `type:`
    // value, one index template and one column key — the depth suffix is what
    // "Section → Section" resolves to rather than refusing outright, since the
    // nouns are the reader's to repeat if they want to.
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    return { ...row, id };
  });
}

// Every stored journal config in its current shape. Called once from
// loadSettings, so nothing downstream has to cope with a level that has no id.
// ── Presets ───────────────────────────────────────────────────────────────
//
// A journal a reader can start from, rather than one the plugin ships turned on.
//
// WHY STUDY STOPPED BEING BUILT IN. It was a `JournalConfig` literal built into
// a live `JournalType` at module load, which made it the one journal that could
// not be edited: `saveVariant` refused on it, it could not gain a kind, be
// relabelled, or have its levels changed — all for the same reason, that there
// was nowhere to store the change. Three features had to carve out an exception
// for it, and a fourth (renaming a note type from its heading) could not work on
// it at all.
//
// As a preset it is an ordinary `customJournals` entry the moment it is
// installed, so every one of those exceptions goes away and nothing has to be
// written twice. The literal stays exactly where it is — what changes is that
// it is a RECIPE rather than a registration.
//
// A FRESH VAULT INSTALLS NOTHING. A reader who wants a diary and no journals
// should not have to turn one off, and one who wants Study is two clicks from
// it. Presets are offered where journals are added, which is the only place a
// reader is already thinking about the question.
// A TRACKER A PRESET SHIPS, MINUS THE THREE FIELDS IT MAY NOT CHOOSE. 4.35 §1.1.
//
// A preset could not ship a measurement at all before this. `JournalKindConfig.
// rating` is an id into the global registry and nothing more, so naming an id
// the vault does not define renders *"Unknown tracker: X"* on every note —
// Study is safe only because `confidence` and `accuracy` are built-ins scoped
// to every journal. A fitness journal that cannot ship Distance is a folder
// tree.
//
// `surface` IS OMITTED BECAUSE IT IS NOT A PRESET'S TO KNOW. `applyNameChange`
// re-slugs a new journal's id from its name, so a preset declaring
// `surface: journalSurface("media")` that the reader renames to "Watchlist" on
// the Identity step would seed trackers scoped to a journal that never exists,
// and every chart on it would refuse with *"Stars is a media tracker; this note
// is in Watchlist."* It is attached at SEED time from the config the reader
// actually saved, because the id they saved is the id their notes are
// classified through. This makes the wrong thing unrepresentable rather than
// documenting it.
//
// `showInTemplate` and `showInBase` are omitted because both are diary-only and
// `normalizeTrackers` forces them false on a journal surface — asking for them
// would be two fields whose only legal answer is the one the loader overwrites.
export type PresetTracker = Omit<
  TrackerDef,
  "surface" | "showInTemplate" | "showInBase"
>;

export interface JournalPreset {
  id: string;
  name: string;
  emoji: string;
  // What it is, in the words the catalogue would use. One line.
  blurb: string;
  config: JournalConfig;
  // The measurements this journal is kept for. Seeded into the registry when
  // the preset is installed, never overwriting an id the vault already has.
  //
  // ON THE PRESET, NOT ON `JournalConfig`. A config is stored in `data.json`
  // per journal; the registry has one home, and a tracker written into both
  // would be two records of one definition with nothing keeping them equal.
  trackers?: PresetTracker[];
}

// Installed as an ORDINARY config, at the paths the reader has configured.
//
// THE ID IS THE PRESET'S OWN AND IS NOT RE-SLUGGED. `type: lesson`, `practice`,
// `subject` and `topic` in a reader's existing notes are matched through the
// journal that declares them, so installing Study under a fresh id would leave
// every Study note in the vault classified by nothing. This is the same hazard
// `preserveIds` exists for, one level up.
//
// COPIED DEEPLY, AND THAT IS THE WHOLE OF IT (4.33). `preset.config` IS the
// module-level literal — `STUDY_PRESET.config` is `STUDY_CONFIG` itself — so
// anything this function shares by reference is shared with the shipped
// default for the life of the process.
//
// It used to spread and then hand-copy two fields, which covered `kinds` and
// `levels` and left `layout` and `variants` aliased. That was invisible while
// nothing wrote them: `saveVariant` and `addVariant` both ASSIGN a new array
// (`cfg.variants = [...]`) rather than mutating in place, so they were safe by
// accident rather than by design. 4.33 gives a reader a way to write
// `cfg.layout`, and a property write through an aliased object would edit the
// shipped preset — so a second Study, or the wizard's "Start from Study",
// would hand out the first reader's arrangement as the plugin's default.
//
// `structuredClone` rather than two more `.map` lines, because the hand-copy
// was already one field behind the type when this was found and a third
// nested field would put it behind again. It is the same call and the same
// argument `startFrom` makes in settings.ts, where the comment reads "copied
// deeply, so editing the new draft cannot reach back into the journal it was
// started from" — this is that sentence, about the shipped literal.
export function presetConfig(
  preset: JournalPreset,
  paths?: { root?: string; templatesFolder?: string }
): JournalConfig {
  return {
    ...structuredClone(preset.config),
    ...(paths?.root ? { root: paths.root } : {}),
    ...(paths?.templatesFolder
      ? { templatesFolder: paths.templatesFolder }
      : {}),
  };
}

// A preset as a NEW journal: its arrangement, at folders derived from its name.
// 3.20.1.
//
// WHY THIS IS NOT `presetConfig` WITH DIFFERENT ARGUMENTS. The two callers want
// opposite things from the same recipe, and conflating them loses a vault's
// notes:
//
//   `presetConfig` takes the folders it is GIVEN, so a caller holding a root
//   that already classifies notes — the Study migration did, until 3.21 —
//   passes it through untouched rather than having one derived under it.
//
//   `presetAsNewJournal` DERIVES them, like every other new journal's, because
//   there are no notes yet and the only thing a path can be wrong about is
//   consistency with what the reader is about to name it.
//
// The shipped literal carries `Templates/Studies` — a plural predating journals
// having derived folders at all — so installing the preset produced a
// journal called "Study" whose templates lived under "Studies", and the
// mismatch only resolved itself if the reader happened to edit the name.
// Derived from the name, it is "Study" from the start and stays whatever the
// reader renames it to.
export function presetAsNewJournal(
  preset: JournalPreset,
  paths: { journalsRoot: string; templates: string }
): JournalConfig {
  const base = presetConfig(preset);
  return { ...base, ...deriveJournalFolders(base.name, paths) };
}

// A preset's trackers as registry entries, scoped to the journal as SAVED.
// 4.35 §1.1.
//
// `cfg` is the config the reader actually committed, not `preset.config` — so
// a Media preset renamed to "Watchlist" on the Identity step seeds trackers
// scoped to `watchlist`, which is the id its notes are classified through.
// Taking the id from the preset would scope them to a journal that never
// exists, and every chart would refuse with a message naming a journal the
// reader has never seen.
//
// COPIED DEEPLY, for the reason 4.33 paid for once already: `preset.trackers`
// IS the module-level literal, so anything shared by reference here is shared
// with the shipped default for the life of the process — and a reader editing
// a seeded tracker's faces or options would be editing the preset.
//
// The two forced fields are written rather than asked for: `normalizeTrackers`
// sets both false on a journal surface anyway, so this is stating the answer
// the loader would give instead of leaving a gap the type has to allow.
export function presetTrackerDefs(
  preset: JournalPreset,
  cfg: JournalConfig
): TrackerDef[] {
  return (preset.trackers ?? []).map((t) => ({
    ...structuredClone(t),
    surface: journalSurface(cfg.id),
    showInTemplate: false,
    showInBase: false,
  }));
}

// THE STUDY MIGRATION HAS BEEN REMOVED (3.21).
//
// `migrateStudyToPreset` ran once per vault, reading `settings.studyEnabled`
// and the two `paths` fields to hand an existing vault the Study journal it
// already had as an ordinary `customJournals` entry. It has done its job, and
// the fields it read were kept alive solely so it could — an unmigrated vault
// being the only thing they could still tell you about.
//
// WHAT THIS COSTS, STATED PLAINLY: a vault that has never opened 3.20.x does
// not get Study migrated. Its notes are untouched — they keep their folders and
// their `type:` frontmatter — but nothing classifies them until the reader adds
// Study from *Presets* and points it at the folder they are already in. That is
// a real consequence and the reason this was deliberately deferred for a
// release rather than done alongside the migration that made it possible.
//
export function normalizeJournalConfigs(
  configs: JournalConfig[]
): JournalConfig[] {
  return configs.map((cfg) => ({
    ...cfg,
    levels: normaliseLevels(cfg.levels ?? [], { preserveIds: true }),
    ...liftKindVariants(cfg),
  }));
}

// Move any kind-level saved layouts up to the journal, once, on load.
// 3.18 follow-ups §5.
//
// ID STABILITY IS THE THING NOT TO LOSE, and it is preserved verbatim: a
// variant keeps the id it was saved under and gains only the kind it was
// already stored on. That matters because the id is half of the template key
// (`kind:<kindId>:<variantId>`) and half of the template FILENAME
// (`${kind.id}-${variant.id}`), so a variant that came back with a different id
// would orphan the file it had already written and compose a second one beside
// it.
//
// A COLLISION KEEPS BOTH. Two kinds could each hold a layout the reader named
// "Two column", and after the lift those are two entries with one id. Suffixed
// rather than merged, on `saveVariant`'s own reasoning — a reader naming two
// layouts "Math" wants two layouts, not an error — and the kind tag is what
// keeps each pointed where it already worked.
//
// IDEMPOTENT, because it is keyed on the presence of the old field rather than
// on a version marker. A config that has already been lifted has no
// `kind.variants` left to lift, so a second load is a no-op, and there is no
// marker to get out of step with the data it describes.
function liftKindVariants(
  cfg: JournalConfig
): { kinds: JournalKindConfig[]; variants: JournalVariantConfig[] } | object {
  const kinds = cfg.kinds ?? [];
  if (!kinds.some((k) => k.variants?.length)) return {};

  const lifted: JournalVariantConfig[] = [...(cfg.variants ?? [])];
  const taken = new Set(lifted.map((v) => v.id));
  for (const kind of kinds) {
    for (const v of kind.variants ?? []) {
      let id = v.id;
      let n = 2;
      while (taken.has(id)) id = `${v.id}-${n++}`;
      taken.add(id);
      lifted.push({ ...v, id, kinds: [kind.id] });
    }
  }
  return {
    kinds: kinds.map(({ variants: _dropped, ...rest }) => rest),
    variants: lifted,
  };
}

// ── Default templates for custom types ────────────────────────────────────
//
// Study ships hand-crafted template assets. Custom types have no bundled
// assets, so scaffold.ts asks here for a default template per level index and
// per note kind. Users can edit these freely afterward — setup never
// overwrites an existing file, and nothing ever regenerates one.
//
// Since 2.37 the content is COMPOSED FROM THE CATALOGUE (journal-sections.ts)
// rather than written here as two string literals. That is the whole of item 2
// of the designer roadmap, and it is mostly deletion: the literals had been
// read off Study's templates in 2.28 and never re-derived, so a custom journal
// arrived with a bare `base` table while Study had grown six widgets around
// it. Composing means a custom journal now arrives with the same arrangement
// Study has — topics-table, search, review queue, charts, activity and tasks —
// and it required no GUI to get there.

// Files a custom type needs in its templates folder: one index per level, one
// per kind. Returns { relativePath, content } pairs.
export function customTemplateFiles(
  cfg: JournalConfig
): { name: string; content: string }[] {
  return journalTemplateFiles(buildJournalType(cfg));
}

// The same composition over a live JournalType.
//
// A JournalType rather than a JournalConfig, and that is load-bearing
// rather than tidiness: the config cannot express pages, and STUDY_JOURNAL is
// not a config at all. Composing from the type is what lets the equivalence
// test feed Study's own definition through this function and compare the
// result against Study's shipped assets — the check that keeps the catalogue
// and the templates two expressions of one arrangement instead of two
// arrangements that agreed once, in 2.28.
export function journalTemplateFiles(
  type: JournalType,
  // Chosen section ids per template key, from the wizard. Absent — every
  // non-GUI caller — means the catalogue's own defaults, which is why items 0
  // to 2 are useful with no wizard at all.
  chosen?: Map<string, string[]>
): { name: string; content: string }[] {
  return templateTargets(type).map((t) => ({
    name: t.file,
    content: composeTemplate(t.ctx, chosen?.get(t.key), type.layout?.[t.key]),
  }));
}

// One template file: frontmatter, then the chosen sections in catalogue order.
//
// Frontmatter is NOT a section, and the temptation to make it one is worth
// resisting. A section is a block of body markdown that can be ticked off,
// appended to an existing note, or cut and pasted elsewhere; frontmatter is
// none of those — it is one block, it must come first, and removing it would
// leave a note its own journal no longer recognises as one of its own
// (journal.ts::recognisedTypeValues reads `type`). Making it a section would
// have put an untickable box in the wizard purely to keep one list.
export function composeTemplate(
  ctx: SectionContext,
  sectionIds?: string[],
  layout?: TemplateLayout
): string {
  // An explicit argument wins, then a saved layout's own list, then the
  // catalogue's defaults. The middle one is what makes a variant a variant:
  // journalTemplateFiles passes no ids for a non-wizard caller, so without it
  // every variant of a kind would compose identically.
  const ids = new Set(sectionIds ?? chosenSectionIds(ctx, layout));
  const body = sectionsFor(ctx, layout)
    // `required` is enforced here rather than trusted from the caller. The
    // wizard cannot untick the banner, but this function is also the one item
    // 4 and any future caller reach, and a note with no banner is the defect
    // 2.28 shipped to end.
    .filter((s) => ids.has(s.id) || s.required)
    .map((s) => renderSection(s, ctx, layout?.options?.[s.id]))
    .filter(Boolean);
  // Frontmatter abuts what follows it with no blank line, matching every
  // shipped asset. That matters for exactly one line: `almanac:spacer` is
  // documented as sitting on line 0 of the body so a click at the top of the
  // note lands on it rather than inside the banner fence, which would render
  // the fence as raw source.
  return [`${templateFrontmatter(ctx)}\n${body[0] ?? ""}`, ...body.slice(1)]
    .join("\n\n")
    .replace(/\n+$/, "") + "\n";
}

// The properties a generated note carries.
//
// Both derivations here replaced hardcoded Study nouns, and the two were the
// same mistake made twice — a generator read off Study's Lesson template once
// and never re-derived:
//
//   • `subject:`/`topic:` were written into every custom type's notes. Those
//     are Study's level nouns, so a Cooking journal with a Section level got a
//     `subject` property nothing would ever write and nothing would ever read.
//     The keys now come from the type's own levels' ids — the same value that
//     decides the `type:` line — so a leaf note cannot name a container the
//     index note calls something else, and neither of them changes when the
//     level's noun is relabelled.
//   • `confidence: 1` was seeded regardless of what the kind measures. Since
//     2.36 a kind declares its own `rating`, so a kind rated on `accuracy` got
//     a Confidence it is not graded on, and a kind rated on nothing got one it
//     has no use for at all. Seed the declared rating, or nothing.
export function templateFrontmatter(ctx: SectionContext): string {
  // A page's `type` is a token rather than a value: one Page template serves
  // every paged kind, and newPage fills in which page id this one is.
  const lines = [`type: ${ctx.noteKind === "page" ? "{{type}}" : ctx.typeValue}`];
  // `parent` leads on a page, ahead of the containers: the note it is a page
  // of is the thing it belongs to, and the folders are context for that.
  if (ctx.noteKind === "page") lines.push("parent: {{parent}}");
  const depth = ctx.depth ?? ctx.type.levels.length;
  ctx.type.levels.slice(0, depth).forEach((lvl, d) => {
    const token = LEVEL_TOKENS[d];
    if (!token) return;
    const key = lvl.id;
    if (RESERVED_KEYS.has(key)) return;
    lines.push(`${key}: {{${token}}}`);
  });
  if (ctx.noteKind === "page") {
    // A page names the note it belongs to and its position in it, and carries
    // neither a date nor a rating: both belong to the parent, which is the
    // whole reason a long note splits into pages rather than into more notes.
    lines.push("order: {{order}}", "created: {{created}}");
  } else if (ctx.noteKind === "leaf") {
    lines.push("date: {{date}}", "created: {{created}}");
    if (ctx.rating && !RESERVED_KEYS.has(ctx.rating)) {
      lines.push(`${ctx.rating}: 1`);
    }
    lines.push("status: in-progress");
  } else {
    lines.push("status: in-progress", "created: {{created}}");
  }
  return ["---", ...lines, "---"].join("\n");
}

// The template tokens journal.ts::newNote fills with a note's ancestor folder
// names, by container depth. Positional aliases rather than per-type names —
// `subject` is simply "the name of the depth-0 folder this note is in" — which
// is why a type with different nouns still reads them. A type deeper than this
// has no token for its innermost containers, so the derivation stops rather
// than emitting a `{{...}}` that would survive into the finished note.
const LEVEL_TOKENS = ["subject", "topic"];

// Keys the frontmatter writes itself. A level noun that slugifies onto one of
// them ("Status", "Date") must not emit a second line with the same key: YAML
// keeps one of two and which one is a parser detail. The level line loses,
// because the reserved key is the one the plugin reads.
const RESERVED_KEYS = new Set(["type", "date", "created", "status"]);


// A journal name reduced to something safe to use as a folder name.
//
// The name is typed freely and the folders are derived from it, so this is the
// only thing standing between "Cook Book: Vol/2" and a journal whose root
// silently becomes two nested folders. Path separators and the characters
// Obsidian reserves for link syntax are replaced rather than stripped, so
// "Recipes/Bakes" reads as "Recipes Bakes" instead of "RecipesBakes".
export function journalFolderName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // A leading or trailing dot makes a hidden or malformed folder on some
    // platforms, and neither is what anyone meant by typing one.
    .replace(/^\.+|\.+$/g, "")
    .trim();
}

// Where a journal type's notes and templates live, derived from its name.
//
// DERIVED RATHER THAN TYPED. Two free-text folder fields sitting beside the
// name were three chances to disagree with each other: the shipped default
// named the folder after the placeholder ("Custom Journal"), so renaming the
// journal in the field above left the folder behind, and the only way to get
// a Cook Book whose folder said "Cook Book" was to notice and fix both fields
// by hand. Nobody asked to name a folder; they asked to name a journal.
//
// This is the same rule Settings → Paths already follows — the four roots are
// editable and every path that follows one is shown read-only beneath it — so
// a journal's folders are now a derived path like every other derived path,
// and moving one is what it is everywhere else: rename the folder in the file
// explorer and pathwatch.ts retargets the setting.
export function deriveJournalFolders(
  name: string,
  paths: { journalsRoot: string; templates: string }
): { root: string; templatesFolder: string } {
  const folder = journalFolderName(name);
  return {
    root: `${paths.journalsRoot}/${folder}`,
    templatesFolder: `${paths.templates}/${folder}`,
  };
}

// A sensible starter config for the "Add custom journal" button. `paths` is
// the live settings object, so a new journal lands under whatever the vault's
// journals/templates roots actually are — a vault that renamed or moved them
// no longer gets a journal defaulted into a folder that doesn't exist.
export function freshCustomJournal(
  existingIds: Set<string>,
  paths: { journalsRoot: string; templates: string } = {
    journalsRoot: ROOT_JOURNALS,
    templates: TEMPLATES_ROOT,
  }
): JournalConfig {
  const base = "custom-journal";
  let id = base;
  let n = 2;
  while (existingIds.has(id)) id = `${base}-${n++}`;
  const name = n === 2 ? "Custom Journal" : `Custom Journal ${n - 1}`;
  return {
    id,
    name,
    emoji: "📔",
    ...deriveJournalFolders(name, paths),
    levels: [{ id: "section", noun: "Section", fallbackEmoji: "📂" }],
    // The starter kind declares Confidence rather than being handed one.
    //
    // kindTemplate used to seed `confidence: 1` into every custom kind whether
    // or not it measured anything, and fixing that would otherwise have left
    // the default journal's notes with a bare Status. The rating is worth
    // having by default — it is what the review queue, the trend chart and a
    // Recall sitting all read — so the fix is to *say so* in the config, where
    // the wizard can show it and a reader can change it, rather than to have
    // the generator assume it. Same outcome as before; no longer a secret.
    kinds: [{ id: "entry", emoji: "📝", label: "Entry", rating: "confidence" }],
  };
}

// ── The all-notes .base for a journal type ────────────────────────────────
//
// `study-notes.base` shipped as an asset and hardcoded three Study facts: the
// folder `03 - Journals`, the columns `subject`/`topic`, and one view per
// Study kind. So the vault-wide "every journal note" table existed for Study
// and for nothing else — the last of the Study-shaped readers, and the same
// species as the four widget leaks closed in 2.39.
//
// Everything it needs is on the JournalType: the root to filter on, the level
// nouns to name the container columns, the kinds to make a view each, and the
// ratings to give those views a score column. So it is generated, once per
// registered type, and a custom journal gets the table Study always had.
export function journalNotesBase(type: JournalType, root: string): string {
  const levelKeys = type.levels.map((lvl) => ({
    key: lvl.id,
    label: lvl.noun,
  }));
  // Distinct ratings across the type's kinds, in declaration order. Two kinds
  // rated on the same tracker share one column; a kind rated on nothing adds
  // none.
  const ratings: string[] = [];
  for (const k of type.kinds) {
    if (k.rating && !ratings.includes(k.rating)) ratings.push(k.rating);
  }

  const props = [
    "  file.name:",
    "    displayName: Title",
    "  type:",
    "    displayName: Type",
    ...levelKeys.flatMap((l) => [`  ${l.key}:`, `    displayName: ${l.label}`]),
    "  date:",
    "    displayName: Date",
    ...ratings.flatMap((r) => [`  ${r}:`, `    displayName: ${titleCase(r)}`]),
    "  status:",
    "    displayName: Status",
  ];

  // The innermost container is the useful column in a flat list of notes —
  // "which topic is this lesson in" — so views order by that rather than
  // repeating every level.
  const innermost = levelKeys[levelKeys.length - 1]?.key;
  const view = (name: string, filter: string | null, cols: string[]): string[] => [
    "  - type: table",
    `    name: ${name}`,
    ...(filter ? [`    filters: ${filter}`] : []),
    "    order:",
    ...cols.map((c) => `      - ${c}`),
  ];

  return [
    "filters:",
    "  and:",
    `    - file.inFolder("${root}")`,
    '    - file.ext == "md"',
    "    - type != null",
    "properties:",
    ...props,
    "views:",
    ...type.kinds.flatMap((k) =>
      view(kindPlural(k), `type == "${k.id}"`, [
        "file.name",
        ...(innermost ? [innermost] : []),
        "date",
        ...(k.rating ? [k.rating] : []),
        "status",
      ])
    ),
    ...view(`All ${type.name} Notes`, null, [
      "file.name",
      "type",
      ...(innermost ? [innermost] : []),
      "date",
      "status",
    ]),
    "",
  ].join("\n");
}

function titleCase(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
