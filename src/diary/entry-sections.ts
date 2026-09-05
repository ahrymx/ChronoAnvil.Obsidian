// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on a diary ENTRY, as data.
//
// The companion to diary-sections.ts, and not the same shape. On a dashboard
// one section is one fence. On an entry the editable things are several
// directives inside ONE fence, each paired with an `<!--chronoanvil:key-->` body
// region holding the reader's writing — so an entry section is a **widget and
// its region**, and its identity is the region key.
//
// The key is the id because it already has to be unique within a note, is
// already what `readNoteRegion` looks up, and is already what binds the
// directive to the text. A separate id beside it would be a second name for one
// thing, and the two would drift the first time someone renamed a label.
//
// WHAT THIS PATCH MUST NOT DO. Patch 1 of the 2.60 plan generates markdown and
// changes nothing: `composeEntryTemplate` reproduces the five shipped templates
// BYTE FOR BYTE and a test diffs them. Scaffold still copies the files. That
// diff is the gate — 2.59.2's caught the dashboard composer reading the wrong
// property while three of four dashboards passed anyway, and these templates
// have more moving parts than those did.
//
// THE VARIANCE IS DATA, NOT A PATTERN. A daily focus asks "what are you
// focusing on today?" and a monthly one asks for a theme; a daily task list is
// "Tasks" and a weekly one is "Goals this week". None of that derives from
// `periodNoun`, and deriving four of five and special-casing the fifth would be
// a rule with an exception rather than a table. So each grain names its own
// strings, and the places they genuinely coincide are visible as repetition
// rather than hidden behind a helper.

import { CLASS_DEFS, TRACKER_CLASSES } from "../trackers/trackers";
import {
  SectionModel,
  SectionOp,
  SectionView,
  SectionWant,
  describeAnswers,
  desiredOrder,
  idsOf,
  optionsFor,
  reconfigured,
  withAnswers,
} from "../core/section-model";
import { regionHasContent } from "../core/notestore";
import { TRACKER_MARK_END, TRACKER_MARK_START } from "../core/constants";
import { BANNER_ID, rowRuns } from "../core/note-sections";
import {
  addOps,
  fenceBlock,
  foreignOp,
  moveOpsFor,
  plannedWrites,
  regionSpans,
  rowOf,
  soleFence,
  soloBarOf,
  viewOf,
} from "../core/sections";
import type { Section } from "../core/sections";
import { bindSection } from "../core/sections";
import type { FlatSection } from "../core/note-sections";
import { WIDGETS } from "../core/widget-registry";
import type { VaultLists } from "../core/widget-registry";
import {
  instanceId,
  isPageWidgetId,
  pageWidgetKeywords,
  widgetLine,
  widgetQuestions,
} from "../core/widget-sections";
import {
  MODIFIER_KEYWORDS,
  isCellLine,
  isRowLine,
  splitDirective,
} from "../core/directive-grammar";
import type { TrackerClass } from "../trackers/trackers";

export interface EntrySectionContext {
  grain: TrackerClass;
  // Sections this vault has added to the grain, beyond what ships.
  //
  // THE TEMPLATE HALF OF "ADD TO EVERY ENTRY OF THIS GRAIN". Since 2.60.1 a
  // template is composed rather than copied, so adding a section to future
  // entries is not a file edit — there is no file. It is a setting the composer
  // reads, which is the same shape `showInTemplate` already has for trackers:
  // one place that decides what a new entry starts with.
  //
  // An ADDITIVE list rather than a full ordering. A stored ordering would
  // silently freeze the shipped set at the moment someone first added
  // something, so a later release adding a section to daily entries would never
  // reach anyone who had customised theirs.
  extra?: readonly string[];
  // What the reader chose for the sections in `extra`, keyed by section id.
  //
  // BESIDE `extra` RATHER THAN INSIDE IT, and the two are read together. A
  // `SectionChoice` binds an id to its options, which is the right shape for a
  // list a caller passes once; a CONTEXT is asked the same question repeatedly
  // and from several places (`sectionsForEntry`, `directiveFor`, the borrow
  // walk), so it holds the lookup rather than the list. `composeEntryTemplate`
  // takes choices and splits them into these two fields, so the storage format
  // and the context are allowed to differ without either being converted at a
  // call site.
  options?: Record<string, Record<string, unknown>>;
  // What the OTHER surface currently defines, for the one section here whose
  // directive names something outside the diary.
  //
  // THE ANSWERS, NOT THE QUESTION. `bridge` declares that it needs a journal
  // kind (see `questions` below); only a caller holding the plugin can say
  // which kinds this vault actually has, and this is where that list arrives.
  // Assembled by `bridgeCatalogue` at the one call site that has it, so the
  // list the editor offers and the list a refusal prints cannot disagree —
  // which is the same reason `diaryFolders` was named once.
  //
  // OPTIONAL, AND ABSENT MEANS "NOBODY ASKED". Every context built for
  // composition — `composeEntryTemplate`, the scaffold, forty tests — passes
  // `{ grain }` and is untouched: a section's DIRECTIVE never reads this, only
  // its question does, and a template being composed has its answer already.
  journalKinds?: readonly { id: string; label: string; dated: boolean }[];
  // ── THE TWO FIELDS A WIDGET'S QUESTION READS (5.26) ──────────────────
  //
  // THE SAME WIDENING 4.58.0 MADE FOR THE PERIOD DASHBOARDS, one surface later
  // and for the same reason in the same words: they were threaded to the four
  // flat surfaces in 4.15 and dropped at this branch of `modelForSurface`,
  // *"because a period dashboard had no widget to ask a question of. It has
  // thirty now."* An entry had none either, until this release gave it the
  // widget door.
  //
  // OPTIONAL, AND ABSENT MEANS "NOBODY ASKED" — `journalKinds`' posture one
  // line up, and it has the same consequence: every context built for
  // composition passes `{ grain }` and is untouched, because a section's
  // DIRECTIVE never reads either of these and only its question does.
  hostFolder?: string | null;
  vault?: VaultLists;
}

export interface EntrySection extends Section<EntrySectionContext> {
  // THREE FIELDS THIS CATALOGUE ADDS AND ONE IT NARROWS, and the arrangement is
  // the one `JournalSection` and `DiarySection` already take: the shared type
  // carries what the shared machinery reads, and a catalogue may say more about
  // itself than the machinery needs.
  //
  // `render`, `applies` AND `locate` ARE NOT WRITTEN HERE — `entrySection`
  // below derives all three from `directive`, `above` and `below`, which is why
  // the literals in `ENTRY_SECTIONS` are declarations rather than closures. The
  // pieces are the honest unit for an entry: a section says what its LINE is,
  // and the composer decides which fence the lines are welded into.
  // Which fence this section's directive belongs in.
  //
  // `own` means the banner's fence, above the rule; `shared` means the single
  // fence below it that every editable widget lives in. This is the structural
  // difference between the two halves of an entry, and it is a property rather
  // than a position so that reordering within a half cannot accidentally move a
  // section across the rule.
  //
  // ── AND `trackers` IS A THIRD FENCE AS OF 4.20 ────────────────────
  //
  // The logging grid used to be lines inside the banner's fence, which made it
  // part of the banner: one card holding the note's name, its navigation and
  // every rating you keep. 4.20 settles what a banner IS — the file's name, its
  // navigation and the control that edits it, and nothing else — so the grid
  // had to leave, and a section cannot leave a card it shares a fence with.
  //
  // ABOVE THE RULE STILL. The rule separates what the plugin arranges from what
  // the reader writes, and a rating is not writing: it is answered by clicking
  // a cell, it belongs to the day rather than to a paragraph, and putting it
  // below would file it with Highlights and Notes. So an entry has three fences
  // above the rule's two, and the third is the one this field adds.
  band: "own" | "trackers" | "shared";
  // The directive line for this grain, or null when the grain does not have it.
  //
  // `opts` is what the reader chose for THIS instance of the section, carried
  // from the editor as a `SectionChoice` and opaque to everything between. It
  // arrived in 3.8 for the same reason the journal catalogue's `SectionOverrides`
  // exists — a section whose one interesting decision the catalogue cannot make
  // — and it is deliberately the second parameter rather than a field on
  // `EntrySectionContext`: the context describes the NOTE, and two sections in
  // one note may be configured differently.
  //
  // Almost every section ignores it, and that is the healthy state. A section
  // that reads it is a section whose directive cannot be written without asking
  // the reader something.
  directive: (
    ctx: EntrySectionContext,
    opts?: Record<string, unknown>
  ) => string | null;
  // Extra lines this section writes into its own fence, above and below its
  // directive. 4.19.
  //
  // WHAT THESE CLOSE. `composeEntryTemplate` used to carry a branch on a
  // section's NAME — `sec.id === "entry-header" ? trackerBlock(...) : []` — and
  // it carried its own apology beside it: *"a composer that special-cased a
  // section by name would be the catalogue with a hole in it"*. It was written
  // when the tracker markers were the only thing that did not fit; 4.19's banner
  // needs a second such line (the navigation row it absorbed), and adding a
  // second name to that branch would have been the hole twice.
  //
  // So the composer asks instead of knowing, and the catalogue answers. That is
  // the same seam `render` already is on the other three section shapes — a
  // section says what it composes, and the composer only decides how the pieces
  // are joined.
  //
  // NOT PART OF THE SECTION'S IDENTITY. `probeFor` and `detectEntrySections`
  // still key on `directive`, so a banner is found by its `entry-header` line
  // and not by the row above it. That matters for the same reason `locate`
  // matches a directive rather than a header everywhere else: these lines can
  // change, and a section found by them would go missing when they did.
  above?: (ctx: EntrySectionContext) => string[];
  below?: (ctx: EntrySectionContext) => string[];
}

// THE ONE FENCE AN ENTRY COMPOSES. Every band of an entry is a `chronoanvil`
// fence — the bands differ in which sections are welded into them and where the
// rule falls, never in the info string — so the composer wrote the word four
// times and `render` needs it once.
const ENTRY_FENCE = "chronoanvil";

// A catalogue entry as it is WRITTEN, before `entrySection` gives it the three
// members the shared machinery asks for.
type EntryDecl = Omit<EntrySection, "render" | "applies" | "locate">;

// One declaration as a `Section`.
//
// THE THREE DERIVATIONS, AND EACH IS A RESTATEMENT RATHER THAN A DECISION:
//
//   `applies` is `directive(ctx) != null` — `sectionsForEntry`'s own filter,
//   which is the question "does this section exist at this grain" and has been
//   asked in exactly those words since the catalogue existed.
//
//   `render` is `above` + the directive + `below`, wrapped in the entry's one
//   fence info string. `composeEntryTemplate`'s `ownLines` was this expression,
//   and the shared band composed the directive alone — which is the same list,
//   because no `shared` section declares either edge.
//
//   `locate` is `probeFor`'s regex searched in the text, or -1 where there is
//   no probe. Nothing in this file calls it: an entry is read line by line
//   inside its fences, not by offset. It is here because a `Section` promises
//   it, and because the answer is not in doubt.
//
// `directiveFor` RATHER THAN `directive`, deliberately, so a section rendered
// on a grain it does not ship on borrows the nearest grain's wording — the
// fallback that makes "add challenges to my weekly entries" possible at all.
const entrySection = (decl: EntryDecl): EntrySection => {
  const built: EntrySection = {
    ...decl,
    applies: (ctx) => decl.directive(ctx) != null,
    render: (ctx, opts) =>
      fenceBlock({
        fence: ENTRY_FENCE,
        lines: [
          ...(decl.above?.(ctx) ?? []),
          directiveFor(built, ctx, opts) as string,
          ...(decl.below?.(ctx) ?? []),
        ],
      }),
    locate: (text, ctx) => {
      const re = probeFor(built, ctx);
      return re ? text.search(re) : -1;
    },
  };
  return built;
};

const on = (
  map: Partial<Record<TrackerClass, string>>
): ((ctx: EntrySectionContext) => string | null) => {
  return (ctx) => map[ctx.grain] ?? null;
};

// ── SINGLE COLUMN ENTRIES ────────────────────────────────────────────────
//
// Entries stack each section in a single column rather than multi-column rows.
// Multi-column rows squeeze multi-line textareas and task lists, leading to
// cramped inputs and border collision anomalies against outer containers.
// Keeping entries strictly single-column gives each field (Focus, Tasks,
// Highlights, Challenges, Notes, Attachments, Captured) full width and
// consistent visual hierarchy.

const ENTRY_DECLS: EntryDecl[] = [
  {
    id: BANNER_ID,
    label: "Banner",
    // WHAT THIS SENTENCE USED TO SAY, AND WHY IT IS WORTH A NOTE. It listed the
    // date navigator and the tracker grid — one left in 4.20 and the other in
    // 4.21 — so the editor described this row by naming two blocks that are now
    // the row below it. A blurb is the only description of a section a reader
    // ever sees, and it is the part of a catalogue entry that a change to the
    // RENDERER cannot break loudly.
    blurb:
      "The note's own name, the row back to Home and today, and the control that renames it and edits its sections.",
    // 🏷️ RATHER THAN 🗓 (4.21.1): the same glyph the other three catalogues'
    // banners carry. A calendar page said "diary entry", which the note's own
    // name already says, and made one section look like four in the one place
    // they are drawn the same way.
    icon: "🏷️",
    category: "structure",
    // LOCKED, and the one that most obviously has to be: without it the note
    // has no date navigation, no trackers and no title editing — it stops being
    // a ChronoAnvil entry rather than losing a feature. The navigation row it
    // absorbed in 4.19 was locked for its own reason, which survives unchanged
    // inside this one: a vault where some entries can get home and others
    // cannot is worse than one with no links at all.
    locked: true,
    // PINNED, as of 3.2 §4 — the flag arrives here with the row that carried it.
    pinned: true,
    band: "own",
    // ── WHAT 4.19 CHANGED HERE, AND WHAT IT DID NOT ──────────────────
    //
    // NOT THE MARKDOWN. `composeEntryTemplate` has welded every `band: "own"`
    // section into ONE fence since 3.2 patch 2, so `links:` and `entry-header`
    // were already one block on screen — an entry has been showing a banner and
    // reporting two sections for eight releases. What merges is the CATALOGUE
    // ENTRY, and the composed template comes out byte-identical; the test asserts
    // that rather than trusting it.
    //
    // AND NOT THE DIRECTIVE, which is still `entry-header` alone. That is the
    // keyword `probeFor`, `detectEntrySections` and the renderer all key on, and
    // the thing that makes a note an entry. Only the section's ID changed, to the
    // one every other catalogue's banner now uses.
    //
    // NO `title:` LINE, WHICH IS THE ONE ASYMMETRY WORTH STATING. Seven surfaces
    // compose their banner as `title:` + `links:`; an entry composes
    // `links:` + `entry-header`, because `entry-header` ALREADY draws an editable
    // name — a `title:` line above it would be the note's name twice, which is
    // the doubling this release removes rather than a shape it should copy.
    // `masthead.test.ts` pins the consequence: an entry's row keeps `home` where
    // a dashboard's dropped it, because on an entry nothing else offers it.
    above: () => [],
    directive: () => "entry-header",
  },
  {
    id: "trackers",
    label: "Trackers",
    // THE STRIP IS NAMED TOO, because it is the half of this block a reader is
    // most likely to be looking for: 4.21 moved the entry's alias and its date
    // navigator here out of the banner, and a blurb that mentions only the grid
    // sends someone hunting for them in the row above.
    blurb:
      "The title you give this entry, the navigator between entries, and the grid of ratings and logs you fill in.",
    icon: "📊",
    category: "trackers",
    // ── ITS OWN SECTION AS OF 4.20, WHERE IT WAS LINES IN THE BANNER ───
    //
    // WHY IT HAD TO MOVE. `EntrySection.fence` states the argument: a banner is
    // the file's name, its navigation and the control that edits it. The grid is
    // none of those — it is the note's most-used CONTENT — and it was in the
    // banner for a reason that had nothing to do with what it is: the markers
    // needed somewhere above the rule to live, and the banner's fence was the only fence
    // there.
    //
    // LOCKED, WHICH IS NOT INHERITED FROM THE BANNER BUT ARGUED FOR ITSELF. A
    // daily entry with no tracker grid cannot record a mood, a sleep time or
    // anything else the diary charts read — every chart on every dashboard is a
    // view over these cells, so removing the section silently empties the pages
    // above it. That is `entry-header`'s argument in a different currency: the
    // note stops being a ChronoAnvil entry rather than losing a feature.
    //
    // NOT PINNED. It has one neighbour above the rule and nowhere to go, so
    // `isMovable` answers false by arithmetic — the state `entry-header` was in
    // before 4.19, and the reason nobody writes the flag by hand.
    locked: true,
    band: "trackers",
    // NO DIRECTIVE OF ITS OWN. The section IS the marked region, and the
    // directives inside it are the reader's trackers rather than the
    // catalogue's — `entryTrackers.addTracker` writes them and this composes the
    // pair of markers it writes between. `below` is what puts them there, for
    // the same reason the banner uses `above` for its links row: the composer
    // joins pieces and does not know any section's name.
    //
    // AND THE PROBE HAS TO FIND THE MARKER, not a directive, because a note
    // whose trackers a reader has all removed still HAS this section — an empty
    // marked region is the section waiting to be filled, and reporting it absent
    // would offer to add a second one.
    directive: () => TRACKER_MARK_START,
    below: (ctx) => [...trackerLines(ctx), TRACKER_MARK_END],
    // The OPENING marker only — see `EntrySection.probe`. Anchored whole so the
    // closing one, which shares every character up to the last token, cannot
    // match and report the section a second time.
    probe: new RegExp(`^${TRACKER_MARK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    // Nothing of the reader's PROSE lives here, so there is no region to keep.
    ownsRegion: false,
  },
  {
    id: "focus",
    label: "Focus",
    blurb: "One line: what this period is about.",
    icon: "🎯",
    category: "writing",
    locked: false,
    band: "shared",
    directive: on({
      daily: "note:focus#line:What are you focusing on today?|Today's focus",
      weekly: "note:focus#line:What's the theme for this week?|Focus",
      monthly: "note:focus#line:What's the theme for this month?|Monthly focus",
      quarterly: "note:focus#line:What's the theme for this quarter?|Focus",
      yearly: "note:focus#line:What's the theme for this year?|Focus",
    }),
  },
  {
    id: "highlights",
    label: "Highlights",
    blurb: "A list of what went well.",
    icon: "✨",
    category: "writing",
    locked: false,
    band: "shared",
    // ALL FIVE GRAINS AS OF 3.11 §4.1. Daily was the omission, and it carried
    // no comment — which in this catalogue has meant age rather than argument
    // every time one has been checked (the yearly charts header in 3.9, the
    // monthly note's missing button in 3.3, `bridgeCatalogue` three grains
    // stale in 3.8). A day has highlights.
    //
    // ONE WORDING FOR ALL FIVE, unlike `focus`, which asks a different question
    // per grain because "what is this period about" genuinely changes shape
    // between a day and a year. "What went well?" does not.
    directive: on({
      daily: "list:highlights:What went well?|Highlights",
      weekly: "list:highlights:What went well?|Highlights",
      monthly: "list:highlights:What went well?|Highlights",
      quarterly: "list:highlights:What went well?|Highlights",
      yearly: "list:highlights:What went well?|Highlights",
    }),
  },
  {
    id: "challenges",
    label: "Challenges",
    blurb: "A list of what got in the way.",
    icon: "⛰",
    category: "writing",
    locked: false,
    band: "shared",
    // ALL FIVE GRAINS AS OF 3.11 §4.1. This read "Monthly alone, today.
    // Whether a week or a quarter wants one is a question for a patch allowed
    // to change behaviour." This is that patch.
    //
    // THE PAIR IS THE ARGUMENT. `highlights` and `challenges` are one question
    // asked twice — what went well, what got in the way — and they shipped on
    // four grains and one respectively. That is not a design, it is two ages:
    // nothing anywhere said a week has highlights but no challenges. Fixing
    // one without the other would have left the asymmetry pointing the other
    // way.
    directive: on({
      daily: "list:challenges:What got in the way?|Challenges",
      weekly: "list:challenges:What got in the way?|Challenges",
      monthly: "list:challenges:What got in the way?|Challenges",
      quarterly: "list:challenges:What got in the way?|Challenges",
      yearly: "list:challenges:What got in the way?|Challenges",
    }),
  },
  {
    id: "log",
    label: "Notes",
    blurb: "The long-form field: reflections and learnings.",
    icon: "📝",
    category: "writing",
    locked: false,
    band: "shared",
    directive: on({
      daily: "note:log:Notes, reflections & learnings…|Notes, reflections & learnings",
      weekly: "note:log:Notes, reflections & learnings…|Notes",
      monthly:
        "note:log:Notes, reflections & learnings…|Notes, reflections & learnings",
      quarterly: "note:log:Notes, reflections & learnings…|Notes",
      yearly: "note:log:Notes, reflections & learnings…|Notes",
    }),
  },
  {
    id: "attachments",
    label: "Attachments",
    blurb: "Images, files and links for this entry.",
    icon: "📎",
    category: "writing",
    locked: false,
    band: "shared",
    // ALL FIVE GRAINS AS OF 3.11 §4.2. Daily and monthly, with no comment
    // explaining the other three — the same shape as `highlights` above and
    // answered the same way. A weekly entry can have a photo.
    directive: on({
      daily: "attach:attachments|Attachments",
      weekly: "attach:attachments|Attachments",
      monthly: "attach:attachments|Attachments",
      quarterly: "attach:attachments|Attachments",
      yearly: "attach:attachments|Attachments",
    }),
  },
  {
    id: "bridge",
    label: "From the journals",
    blurb: "Journal notes dated inside this entry's period.",
    icon: "🌉",
    category: "journals",
    locked: false,
    band: "shared",
    // It reads the other surface; there is nothing of the reader's to persist.
    // A frozen snapshot does live in a region, but one keyed by
    // `snapshotKeyFor(direction, target)` rather than by this id, and it has
    // its own thaw control — so the removal refusal has nothing to guard here.
    ownsRegion: false,
    // OFF BY DEFAULT, AND OFF BY RETURNING NULL rather than by a flag. Every
    // other section here answers "does this grain have wording for this"; this
    // one answers "has the reader asked for it", which is what `ctx.extra`
    // means. Unticked it is not in the template at all; ticked it renders.
    //
    // THE MIRROR THAT WAS MISSING SINCE 2.57. `core/bridge.ts` has always
    // resolved its target as `otherSurface(host.surface)` and
    // `buildBridgeNotesRegion` has always branched on it, so the diary → journal
    // direction was written, tested, and reachable from no composed note in the
    // vault: `bridge` existed once, on a journal leaf. The comment on
    // `BridgeWindow.unit` names the host it could not serve — *"a daily entry is
    // a period of one day, and it is the single most obvious host for a bridge
    // — the reader who prompted this release wants their Meals journal on
    // today's entry"*. A unit was added for a section that did not exist.
    //
    // NO `period-nav:` BESIDE IT, and that is the one place this differs from
    // its mirror rather than copying it. The journal-side bridge ships a period
    // navigator because a leaf note has no period of its own and the anchor has
    // to come from somewhere. An entry IS a period — it declares the very
    // property `bridgeHostFacts` reads — so a navigator here would offer to
    // re-scope a note whose scope is its identity.
    //
    // NOT ON A YEARLY ENTRY. A year of journal notes is a page-long list, which
    // is the same judgement `open-tasks` makes one catalogue over ("a year of
    // open tasks grouped by source note is a page-long list nobody reads").
    //
    // THE ONE SECTION IN EITHER DIARY CATALOGUE THAT ASKS THE READER ANYTHING,
    // and the comment inside `directive` below is the argument for why it has
    // to: there is no safe default for a target, because no journal KIND is
    // guaranteed to exist. So the editor asks, and the answer arrives as
    // `opts.target`.
    //
    // ONLY THE DATED KINDS ARE OFFERED. `planBridge` refuses an undated target
    // outright — a `page` carries no `date`, and joining on ctime would be
    // confidently wrong — so offering one here would be a picker whose entries
    // are known in advance to produce a refusal. The catalogue still LISTS the
    // undated kind in that refusal, which is the right place for it: naming why
    // a thing the reader typed cannot work is not the same job as offering
    // them something that can.
    questions: (ctx) => [
      {
        kind: "choice",
        key: "target",
        label: "a journal to pull from",
        // WHERE THE ANSWER ALREADY IS, which is the only new fact 3.15 patch 1
        // needed from this catalogue. The directive this section writes is
        // `bridge-notes:<target>|From the journals`, so the answer is that
        // line's argument and the label is not — which is why the editor
        // splices a span rather than re-composing the line. A reader who
        // retitled theirs to `|My journals` keeps it.
        directive: "bridge-notes",
        values: (ctx.journalKinds ?? [])
          .filter((k) => k.dated)
          .map((k) => ({ value: k.id, label: k.label })),
        empty:
          "This vault has no dated journal kinds yet — make a journal first, " +
          "and this can pull from it.",
      },
    ],
    directive: (ctx, opts) => {
      if (!(ctx.extra ?? []).includes("bridge")) return null;
      if (ctx.grain === "yearly") return null;
      // THE READER'S KIND, OR A REFUSAL THAT NAMES THE ALTERNATIVES. There is
      // no safe default here and this is deliberately not given one: the
      // journal-side bridge can fall back to `Mood` because a fresh vault is
      // guaranteed to have that tracker, and no journal KIND has the same
      // guarantee — Study is a preset a reader can turn off, and a custom
      // journal names its own. So an unconfigured bridge writes a target that
      // cannot resolve, and `bridgeCatalogue` answers it by listing every kind
      // the vault actually defines. That is a worse first render than a working
      // one and a better one than a silently wrong one: `lesson` on a vault
      // with no Study journal would draw an empty block that looks broken.
      const target =
        typeof opts?.target === "string" && opts.target.trim()
          ? opts.target.trim()
          : "";
      return `bridge-notes:${target}|From the journals`;
    },
  },
  {
    id: "todo",
    label: "Tasks",
    blurb: "ChronoAnvil tasks belonging to this entry.",
    icon: "✅",
    category: "writing",
    locked: false,
    band: "shared",
    directive: on({
      daily: "tasks:todo|Tasks",
      weekly: "tasks:todo|Goals this week",
      monthly: "tasks:todo|Goals this month",
      quarterly: "tasks:todo|Goals this quarter",
      yearly: "tasks:todo|Goals this year",
    }),
  },
  {
    id: "capture",
    label: "Captured",
    blurb: "Where the capture command drops thoughts.",
    icon: "⚡",
    category: "writing",
    locked: false,
    band: "shared",
    // SHIPPED ON DAILY, OFFERED ON ALL FIVE — and until 4.27 that asymmetry was
    // defended here as structural: "capture writes to the day you are on", so a
    // Captured field on a weekly entry could never be filled. That is no longer
    // true. The capture box asks which entry it is writing to, and its list is
    // the grains whose template declares this section — so ticking Captured for
    // weekly in Settings → Diary entries is what puts "This week" in the box.
    //
    // Daily still SHIPS it because a day is the grain a passing thought belongs
    // to by default; the other four are opt-in because most vaults do not want
    // four more places for one to land.
    directive: on({
      daily: "note:capture#collapse:Captured thoughts land here…|Captured",
    }),
  },
];

// The catalogue, as `Section`s.
//
// ONE MAP RATHER THAN A `render` ON EVERY LITERAL, which is the shape stage D
// of this plan is aiming at everywhere: a catalogue is a list of declarations
// and one function that knows what a declaration means on this surface. The
// entry catalogue is the first that could be written that way, because its
// sections were already declarations — `directive`, `above`, `below` — with the
// composer holding the only closure.
export const ENTRY_SECTIONS: EntrySection[] = ENTRY_DECLS.map(entrySection);

export function sectionsForEntry(ctx: EntrySectionContext): EntrySection[] {
  return [
    ...ENTRY_SECTIONS.filter(
      (s) => s.directive(ctx) != null || (ctx.extra ?? []).includes(s.id)
    ),
    // ── AND ANY WIDGET THE SETTING NAMES (5.26) ────────────────────────
    //
    // NAMED ONLY, NEVER BY DEFAULT. A catalogue section can arrive here two
    // ways — its own grain wording, or a tick in `extra` — and a widget has
    // only the second, so no shipped grain's template gains a line and
    // `test/golden/`'s five entry fixtures are untouched by construction.
    //
    // WHY THE SETTING CAN HOLD ONE AT ALL. `EntryTemplates.saveDefault` turns
    // the note a reader is looking at INTO the grain's default: it reads the
    // page's present sections and writes their ids to `entrySections[grain]`.
    // Add Open tasks to today's entry, save it as the daily default, and the
    // id in that list is `w:tasks-table#1`. Without this clause the template
    // would quietly compose everything the reader kept except the thing they
    // had just added, which is the failure mode `composedFrom`'s `drops`
    // report exists to make loud.
    //
    // AT THE END, which is where an added widget already sits: the shared band
    // is composed in catalogue order and an add appends, so a template built
    // from the setting and the note it was saved from agree.
    ...entryWidgets(ctx).filter((s) => (ctx.extra ?? []).includes(s.id)),
  ];
}

// The directive a section writes on this grain.
//
// Falls back to the section's text for another grain when this grain has none
// of its own — which is what makes "add challenges to my weekly entries"
// possible at all, since `challenges` ships on monthly alone. The fallback is
// ordered rather than arbitrary: the nearest grain that has one, walking the
// class table, so a weekly entry borrows monthly's wording rather than daily's.
export function directiveFor(
  section: EntrySection,
  ctx: EntrySectionContext,
  opts?: Record<string, unknown>
): string | null {
  // The caller's own choice first, then the template's. A single-section render
  // (the editor adding one block to one note) passes `opts`; a whole-template
  // compose puts every section's options in the context and passes none.
  const chosen = opts ?? ctx.options?.[section.id];
  const own = section.directive(ctx, chosen);
  if (own != null) return own;
  if (!(ctx.extra ?? []).includes(section.id)) return null;
  for (const g of TRACKER_CLASSES) {
    // The borrowed wording is another grain's; the OPTIONS are still this
    // reader's, so they are carried into the borrow rather than dropped. A
    // weekly entry borrowing monthly's phrasing should not also borrow
    // monthly's idea of which journal to pull.
    const borrowed = section.directive({ grain: g }, chosen);
    if (borrowed != null) return borrowed;
  }
  return null;
}

// The frontmatter each grain's template ships with.
//
// Byte-preserved, including two oddities: a daily entry writes `journal-date`
// FIRST and quoted, and a monthly one carries both `month` and an empty
// `journal-date`. Neither is corrected here — this patch changes nothing — and
// both are pinned by tests so a patch that does change them cannot do it
// quietly.
function frontmatter(ctx: EntrySectionContext): string[] {
  const def = CLASS_DEFS[ctx.grain];
  const head =
    ctx.grain === "daily"
      ? [`${def.dateProperty}: ""`, `journal: ${def.journalProperty}`]
      : ctx.grain === "monthly"
        ? [
            `${def.dateProperty}:`,
            `journal: ${def.journalProperty}`,
            'journal-date: ""',
          ]
        : [`${def.dateProperty}:`, `journal: ${def.journalProperty}`];
  return ["---", ...head, ...trackerBlock(ctx, "frontmatter"), "---"];
}

// The `# chronoanvil:trackers:start` … `:end` pair, and what the shipped template
// seeds inside it.
//
// MACHINE-OWNED, in both places it appears. The tracker system rewrites between
// these markers on every settings change, so what is here is a starting state
// rather than a section anyone edits — which is why they are not in
// ENTRY_SECTIONS and why 2.60 §2 counts them as locked.
function trackerBlock(
  ctx: EntrySectionContext,
  where: "frontmatter" | "header"
): string[] {
  return [TRACKER_MARK_START, ...trackerLines(ctx, where), TRACKER_MARK_END];
}

// What a fresh entry of this grain is seeded with, between the markers.
//
// SPLIT OUT OF `trackerBlock` IN 4.20, because the section now composes the
// markers itself — `directive` is the opening one and `below` is the rest — and
// the frontmatter caller still wants the whole block in one string. One list of
// seeds, two wrappers around it, rather than two lists that would drift the
// first time a grain gained a default.
//
// ONLY A DAILY ENTRY IS SEEDED. Mood and sleep are things you record once a day;
// a weekly or monthly entry gets the markers and an empty region, which is the
// section present and waiting rather than the section missing.
function trackerLines(
  ctx: EntrySectionContext,
  where: "frontmatter" | "header" = "header"
): string[] {
  if (ctx.grain !== "daily") return [];
  return where === "frontmatter"
    ? ["Mood:", "Wake-Up:", "Bedtime:", "Sleep:"]
    : ["tracker:Mood", "sleep"];
}

// A body region, empty. The blank line between the markers is not decoration:
// `readNoteRegion` reads what is between them, and a region written as one line
// leaves nowhere for the reader's first keystroke to go.
function region(id: string): string {
  return `<!--chronoanvil:${id}\n-->`;
}

// A whole entry template.
//
// Reproduces the shipped assets exactly as of 2.60.0: the spacer, the two
// fences with no blank line between them, the `---` rule, the widget fence, and
// the regions each separated by a blank line.
export function composeEntryTemplate(
  grain: TrackerClass,
  extra: readonly SectionWant[] = [],
  // THE GRAIN'S SAVED SHARED BAND, WHERE THERE IS ONE (4.29).
  //
  // AUTHORITATIVE WHEN PRESENT: these ids ARE the shared band, in this order.
  // Not an ordering laid over the catalogue's membership — that was the first
  // design and it cannot express the gesture the feature exists for. A reader
  // who deletes Challenges from their page and presses "Save this page as the
  // default" is saying their entries do not have Challenges; a store that could
  // only add would put it back on tomorrow's entry and say nothing.
  //
  // WHICH MEANS IT FREEZES, AND THAT IS THE DELIBERATE PART. The comment at
  // `EntrySectionContext.extra` argues the opposite case and is still right for
  // what it describes: an additive list means a later release adding a section
  // to daily entries reaches a reader who once ticked a checkbox. A band is
  // written by a different gesture — a full-page save behind a confirmation
  // that says *"every new entry will be built from this page's sections, in
  // this page's order"* — and a reader who has said that has chosen to freeze.
  // `refreshTemplates` still shows them the diff, so a section a later release
  // would have added is visible rather than silent.
  //
  // THE TWO STORES CANNOT DISAGREE, because the settings table keeps this in
  // step: ticking a section for a grain that has a band appends the id to it,
  // and unticking removes it. See `renderEntrySectionCell`.
  //
  // BYTE-INERT WHEN ABSENT. Every existing caller passes nothing and composes
  // exactly what it composed before, which is what makes this safe to add to a
  // function five template files are written from.
  //
  // SHARED BAND ONLY. The structural band holds `links`, pinned by 3.2 §4, and
  // `entry-header`, which `isMovable` therefore derives to be alone among its
  // band's movable members — every permutation of that band is the identity, so
  // there is nothing there for a band to say.
  band: readonly string[] = []
): string {
  // WHERE THE SETTING BECOMES A TEMPLATE, as of 3.8 patch 6. `extra` has been
  // documented since 2.60.1 as "a setting the composer reads" and was a
  // parameter nothing supplied; `ChronoAnvilSettings.entrySections` is now that
  // setting, and `shippedNotes` / `refreshTemplates` hand it in here.
  const options: Record<string, Record<string, unknown>> = {};
  for (const want of extra) {
    if (typeof want !== "string" && want.options) options[want.id] = want.options;
  }
  // THE BAND JOINS `extra`, which is what lets it name a section this grain
  // does not ship: `directiveFor`'s borrowing rule only fires for an id the
  // context asks for, so a band naming `challenges` on a weekly entry has to
  // arrive here as a request rather than as an ordering hint.
  const ctx: EntrySectionContext = {
    grain,
    extra: [...idsOf(extra), ...band],
    options,
  };
  // A SECTION WITH NO DIRECTIVE TO WRITE IS NOT COMPOSED (4.29).
  //
  // DEFENSIVE AND CURRENTLY UNREACHABLE, which is worth writing down because it
  // reads as load-bearing and is not — the same honesty `entrySectionMatrix`'s
  // fence test was given in 4.27, and for the same reason: deleting this leaves
  // the suite green, and a mutation proved it rather than a reading.
  //
  // What it encodes is real. `ownLines` and the shared map both end in
  // `directiveFor(...) as string`, so a section admitted here that cannot
  // render would put the literal string "null" into five template files. Today
  // nothing is: every member of `ENTRY_SECTIONS` renders on every grain once
  // borrowing is allowed, which is exactly what `offerableEntrySections`
  // asserts. An id that is not in the catalogue at all never becomes a section
  // object, so it is stopped one line down instead, where `byId.get` misses —
  // and THAT filter is covered.
  //
  // A future section returning null for one grain would make this the only
  // thing between a reader and a broken template, and it would arrive with no
  // test to notice.
  const all = sectionsForEntry(ctx).filter((s) => directiveFor(s, ctx) != null);
  const own = all.filter((s) => s.band === "own");
  const trackers = all.filter((s) => s.band === "trackers");
  // A SAVED BAND REPLACES THE CATALOGUE'S, rather than reordering it. An id the
  // grain cannot compose has already been filtered out of `all` above, so a
  // band naming one composes the rest — the manager reports which, because
  // silently meaning something different on each grain is the failure
  // `layout-transfer.ts` names.
  //
  // Deduplicated: two of one section is one region shared by two widgets, which
  // `addableEntrySections` refuses to create for the same reason.
  const sharedAll = all.filter((s) => s.band === "shared");
  const byId = new Map(sharedAll.map((s) => [s.id, s]));
  const shared = band.length
    ? [...new Set(band)]
        .map((id) => byId.get(id))
        .filter((s): s is EntrySection => s != null)
    : sharedAll;

  // Built from the catalogue rather than from a hardcoded skeleton as of
  // 2.60.2, and written into ONE fence per band as of 3.2 patch 2.
  //
  // WHY ONE. Obsidian renders each ```chronoanvil fence as its own block with the
  // note's spacing between, so two fences above the rule can be made to
  // resemble one card and cannot be made into one — the limit
  // journals-section.ts documents and 2.18.4 already fixed one fence lower
  // down, when the nav strip and the tracker grid merged. The `links:` row is
  // the piece that merge left behind. One fence is one container, so the card
  // is real rather than a resemblance.
  //
  // ── AND IT IS ONE FENCE PER ROW RUN AS OF 4.70 ──────────────────────
  //
  // THE RULE ABOVE IS NOT WITHDRAWN; IT IS GIVEN ITS EXCEPTION IN WRITING, which
  // is this file's convention and the reason 3.2 patch 2's paragraph is left
  // standing above rather than deleted.
  //
  // What that paragraph establishes is that sections which are to look like one
  // card must share one fence. What it did not have to consider is a section
  // that wants to sit BESIDE another rather than under it — `row` did not exist
  // for another eight releases — and a row divides ONE fence into columns. So an
  // entry that wants Focus beside Tasks and Highlights beside Challenges cannot
  // express it inside a single block: two independent rows are two fences,
  // necessarily, because a fence has one `row` line.
  //
  // THE COST IS PAID ONLY WHERE IT IS ASKED FOR. `rowRuns` welds every section
  // that declares no row into the block beside it, so a band whose catalogue
  // names no rows composes exactly the one fence it composed in 4.69 — which is
  // what `entry-template.test.ts` pins, byte for byte, and what makes this
  // landable on five shipped templates at once.
  //
  // WHAT DID NOT CHANGE: the directives, their order, the tracker markers, and
  // every line below the rule. What moves is one pair of fence lines — the same
  // sentence `mergeEntryFences` uses about the merge it performs, because it is
  // the same merge one row up.
  //
  // AND THE HOLE THAT SENTENCE NAMED IS CLOSED (4.19). This read
  // `sec.id === "entry-header" ? trackerBlock(ctx, "header") : []` and said so
  // itself: *"a composer that special-cased a section by name would be the
  // catalogue with a hole in it"*. `EntrySection.above`/`below` are that
  // property moved onto the section it belongs to, so the composer joins pieces
  // and no longer knows any section's name.
  // AND `ownLines` IS GONE (5.22). It was `above` + the directive + `below`,
  // which is what `EntrySection.render` returns now — and the shared band's
  // lambda beside it was the same list with the two edges left out, which no
  // `shared` section declares. Two expressions for one thing, and the composer
  // was the only reader of either.

  // One band's sections as the fences they compose to.
  //
  // `weld: true` IS THE BAND RULE, and it is the one thing that differs from the
  // three other catalogues — see the paragraph above and `rowRuns`' parameter.
  const bandFences = (members: readonly EntrySection[]): string[] =>
    rowRuns(
      // `RowMember` IS THE RESOLVED SHAPE. Nothing in this catalogue writes the
      // function form of `row` or `bar` — see `rowOf` — so this reads them once
      // and the shared row rule never learns they could have been closures.
      members.map((sec) => ({
        ...sec,
        row: rowOf(sec, ctx),
        bar: soloBarOf(sec, ctx),
      })),
      (sec) => soleFence(sec.render(ctx)),
      true
    ).flatMap((run) => ["```" + ENTRY_FENCE, ...run.lines, "```", ""]);

  // THE TRACKER FENCE, BETWEEN THE BANNER AND THE RULE (4.20).
  //
  // A BLOCK OF ITS OWN, WHICH IS THE WHOLE CHANGE. It sat inside the banner's
  // fence, so it was inside the banner's card; the grid is the note's most-used
  // content and the banner is meant to be the file's name, its navigation and
  // its cog. One fence is one card, so the only way out of the card is out of
  // the fence.
  //
  // OMITTED ENTIRELY WHEN NOTHING WANTS IT, rather than composed empty. A reader
  // who removes the section gets no fence, and an empty ```chronoanvil block renders
  // as a bordered gap where a card used to be.
  const trackerFence = trackers.length ? bandFences(trackers) : [];

  // WHERE THIS ENTRY SITS, for the graph. Four of these five were the folder
  // names the diary had BEFORE 2.57 — `02 - Weekly`, `03 - Monthly`,
  // `04 - Quarterly`, `05 - Yearly` — and nothing has been called any of them
  // since. They were not dead text: an unresolved wikilink draws a node, so
  // every vault's graph carried four phantom notes named after folders it does
  // not have, one per grain, for eleven releases.
  //
  // The real parent is the grain's DASHBOARD, which is its folder's own note
  // (`02 - Diary/Weekly/Weekly.md`, so `Weekly` by basename) — the same
  // convention `quarterOverviewPath` has returned since 2.57 and the same one
  // the vault map's quarterly node got wrong in its own way. Daily is the
  // exception and always was: there is no daily dashboard, so a daily entry's
  // parent is the diary root itself.
  //
  return (
    [
      ...frontmatter(ctx),
      "`chronoanvil:spacer`",
      ...bandFences(own),
      ...trackerFence,
      "---",
      "",
      ...bandFences(shared),
      "",
    ].join("\n") +
    shared
      .filter((s) => s.ownsRegion !== false)
      .map((s) => region(s.id))
      .join("\n\n") +
    "\n"
  );
}

// Whether this section may be removed from an entry.
export function isRemovable(section: EntrySection): boolean {
  return !section.locked;
}

// Whether this section has anywhere to go.
//
// TWO WAYS TO HAVE NOWHERE, AND BOTH ARE HERE. A pinned section is fixed by
// decision (3.2 §4). A section alone among the movable members of its band is
// fixed by arithmetic — there is no second slot for it to occupy — and after
// the pin `entry-header` is exactly that: the structural band holds `links`,
// which will not move, and itself.
//
// DERIVED RATHER THAN DECLARED, because the arithmetic case is a consequence of
// the catalogue's contents and would go stale the moment a third structural
// section arrived. A `movable: false` written by hand on `entry-header` would
// still be there, wrong, on the release that gave it a neighbour.
export function isMovable(section: EntrySection): boolean {
  if (section.pinned) return false;
  return (
    ENTRY_SECTIONS.filter((s) => s.band === section.band && !s.pinned).length >
    1
  );
}

// Why this section cannot be removed from this note, or null if it can.
//
// TWO REASONS, IN THIS ORDER. Locked first, because "this is part of what an
// entry is" is true regardless of what the reader has written in it, and
// telling someone to clear their notes before removing a banner that was never
// going anywhere would send them to do pointless work.
//
// The refusal NAMES THE FIX. A refusal that only says no sends someone looking
// for a setting that does not exist — the same reason 2.59.6 stopped telling
// diary notes they were unrecognised.
//
// AND IT NO LONGER OFFERS A MOVE IT WILL NOT PERFORM. Up to 3.1 every locked
// section was told "You can move it, though." 3.2 §4 pins `links`, which leaves
// `entry-header` alone in its band, which leaves neither structural section
// with anywhere to go. Repeating the sentence would recreate the exact defect
// 3.0 patch 1 was built to fix — a message asserting a capability that is not
// there — except deliberately, which is worse. So the sentence is asked for
// rather than assumed, and the pinned section says what fixes it: nothing, and
// here is why.
// ── ONE SHAPE FOR EVERY REFUSAL, ON EVERY SURFACE (4.21) ─────────────
//
// THE SENTENCE NO LONGER OPENS WITH THE LABEL, and that fixes two things at
// once. It read `${label} is part of every entry`, which put a singular verb
// after whatever the section happened to be called — so the tracker section,
// added in 4.20, produced *"Trackers is part of every entry"* in the window.
// Every label is a candidate for that; the plural one just arrived first.
//
// AND THE LABEL WAS REDUNDANT ANYWAY. The refusal is drawn as the row's
// subtitle, directly under the row's own title, so it repeated the word
// immediately above it in order to break its own grammar.
//
// FOUR CATALOGUES, ONE SHAPE: what it is part of, then what that costs, then —
// only when it is true — what the reader can still do. The four used to say it
// four ways ("is required and cannot be removed", "is the first thing on every
// dashboard", "is part of what the homepage is"), which read as four rules.
export function entryRemovalRefusal(
  section: EntrySection,
  fileText: string
): string | null {
  if (section.locked) {
    return isMovable(section)
      ? "Part of every entry, so it can't be removed. You can still move it."
      : "Part of every entry, so it can't be removed or moved.";
  }
  if (section.ownsRegion !== false && regionHasContent(fileText, section.id)) {
    return "Holds your writing. Clear it first, then remove the section.";
  }
  return null;
}

// What an editor may offer to remove from THIS note, as opposed to from the
// grain in general: `removableEntrySections` answers the second, this the
// first. A section holding writing is removable in principle and refused here.
export function removableFrom(
  ctx: EntrySectionContext,
  fileText: string
): EntrySection[] {
  return sectionsForEntry(ctx).filter(
    (s) => entryRemovalRefusal(s, fileText) == null
  );
}

// What an editor may offer to remove here.
export function removableEntrySections(
  ctx: EntrySectionContext
): EntrySection[] {
  return sectionsForEntry(ctx).filter(isRemovable);
}


// ── adding a section to a note that already exists ────────────────────

// Add one section to an entry, or return null if there is nothing to do.
//
// THE OTHER HALF OF THE TRACKER FLOW. A tracker can be added to one entry with
// "+ Add tracker" or carried by the grain's template; a section wants exactly
// that choice, so it gets the same pair rather than a second mechanism spelled
// differently. This is "this note"; `extra` on the context is "every entry of
// this grain".
//
// NULL FOR NO CHANGE, which is `applyLayout`'s and `applySections`' convention
// and matters for the same reason it did in 2.59.7: a rewrite that changes
// nothing still bumps mtime, and on the diary side mtime is the source of truth
// for what is stale.
//
// WRITTEN AT THE END OF THE SHARED FENCE, and the region at the end of the
// note. Not "in the catalogue's order": a reader who rearranged their entry
// arranged it, and inserting into the middle of their arrangement to satisfy a
// canonical order would be undoing a customisation in the name of adding one.
// The end is where a reader who has not thought about position is least
// surprised, and moving it is a drag away.
export function addSectionToNote(
  text: string,
  ctx: EntrySectionContext,
  section: EntrySection
): string | null {
  if (section.band !== "shared") return null;
  const directive = directiveFor(section, { ...ctx, extra: [section.id] });
  if (directive == null) return null;
  // Already there — by directive, not by region. A region can outlive its
  // directive if someone deleted the line by hand, and re-adding the directive
  // is exactly what that reader wants; a region test would refuse them.
  if (new RegExp(`^${escapeForLine(directive.split(":")[0])}:${section.id}\\b`, "m").test(text)) {
    return null;
  }

  const lines = text.split("\n");
  const close = lastSharedFenceClose(lines);
  if (close === -1) return null;

  const withDirective = [
    ...lines.slice(0, close),
    directive,
    ...lines.slice(close),
  ];
  const body = withDirective.join("\n");
  if (section.ownsRegion === false) return body;
  const sep = body.endsWith("\n") ? "\n" : "\n\n";
  return `${body}${sep}${region(section.id)}\n`;
}

// A literal for use inside a line-anchored RegExp.
function escapeForLine(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The closing ``` of the fence the editable widgets live in: the LAST chronoanvil
// fence in the note, since the structural ones sit above the rule and the body
// regions below carry no fence at all.
function lastSharedFenceClose(lines: string[]): number {
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```chronoanvil") open = i;
  }
  if (open === -1) return -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === "```") return i;
  }
  return -1;
}

// ── editing an entry that already exists ──────────────────────────────
//
// PATCH 1 OF THE 3.0 PLAN, and the half of it this file owes — the one the
// promise was actually made in.
//
// 2.60.2 put `links` and `entry-header` in this catalogue as locked, and argued
// that the lock is on EXISTENCE, NOT POSITION. `entryRemovalRefusal` says so to
// the reader in as many words: "You can move it, though." There was no move.
// So a reader who followed that message found nothing, and the comment above
// `locked`, the changelog entry and the refusal string all asserted a
// capability that did not exist. An unbuilt feature is absent; that one was
// promised, which is worse, and it is why this is the first thing 3.0 builds.
//
// WHAT MAKES AN ENTRY HARDER THAN A DASHBOARD. On a dashboard one section is
// one fence, so a reorder is a permutation of blocks. On an entry every section
// is a DIRECTIVE LINE INSIDE A FENCE — as of 3.2 patch 2 that is true of the
// structural half too, which used to be a fence apiece. So there is one shape
// here rather than two, and the block-permutation path that read the other one
// went with 3.2 patch 1.
//
// THE RULE THAT DOES NOT CHANGE: `fence` is a property rather than a position
// so that a reorder cannot move a section between the structural half and the
// personal one. It is now genuinely a property of the DIRECTIVE rather than of
// its container — two directives in one fence can belong to different halves —
// and the partition in `planEntrySections` is what enforces it, exactly as
// before.
//
// AND THE PARSER READS BOTH SHAPES, DELIBERATELY. Patch 2 changes what a NEW
// entry is composed as; every entry already on disk still has `links` and
// `entry-header` in a fence apiece until patch 7's migration runs, and a
// parser that only understood the new shape would make the editor blind to
// every note somebody already has. Locating structural sections by their
// directive line rather than by their fence costs nothing and reads both.
//
// REGIONS ARE NOT REORDERED, AND THAT IS DELIBERATE. A region is storage: it
// renders as nothing, and the widget draws where its DIRECTIVE is, not where
// its region is. So moving regions to match a directive order would rewrite
// lines of the reader's own writing to no visible effect — the definition of
// the formatting `layout.ts` keeps a list about. The directives move; the
// reader's text stays exactly where it is.

// Where each of this entry's parts is, by line index.
interface EntryShape {
  // Structural directives above the rule, in file order, by the line each one
  // sits on.
  //
  // A LINE RATHER THAN A FENCE, as of 3.2 patch 2. It used to be `{ from, to }`
  // over a whole fence block, which was accurate while each structural section
  // had a fence to itself and became wrong the moment they shared one — a fence
  // holding both resolved to whichever directive matched first, and the other
  // section vanished from the editor about to rewrite around it.
  //
  // The line index is the smaller fact and the one that is true of both shapes,
  // so this reads a merged entry and a not-yet-migrated one identically. It is
  // also all that is left to want: nothing splices the structural half any more
  // (patch 1), so its extent stopped mattering when its permutation did.
  own: { id: string; at: number }[];
  // The widget fences below the rule, in file order, and what is in each.
  // `id` is null for a line the catalogue did not write — those keep their
  // index and are never touched.
  //
  // ── A LIST AS OF 4.70, WHERE IT WAS ONE FENCE OR NULL ────────────────
  //
  // 3.2 patch 2 welded the shared band into one fence, so "the widget fence"
  // was a thing there was exactly one of and every reader of this field said
  // `shape.shared` in the singular. `composeEntryTemplate` now writes ONE FENCE
  // PER ROW RUN — the rule is stated there in full — so a daily entry has
  // three: Focus beside Tasks, Highlights beside Challenges, and the prose
  // welded underneath.
  //
  // THE BAND IS THE CONCATENATION, IN FILE ORDER, which is what `sharedBody`
  // below returns and what every consumer wants. A reorder still permutes the
  // whole band and a section still cannot cross the rule; what changed is that
  // the slots a permutation fills are spread over several fences instead of
  // one, so a section moved from the second row into the third crosses a fence
  // boundary and stays inside its band.
  //
  // EVERY SHARING FENCE, NOT THE LAST ONE. The narrowing at 3.0 §9 picked "the
  // last fence that holds a shared directive and no structural one" to keep the
  // editor out of a reader's pasted example block. That choice is no longer
  // available — a composed entry's first shared fence is as real as its last —
  // and the ambiguity it was hedging against was already acknowledged as
  // genuine rather than merely unhandled: "a fence holding a real `note:log:`
  // line is still indistinguishable from the real one". So all of them are
  // taken, which is right for every note the plugin composes and no worse than
  // before for the one it does not.
  shared: {
    open: number;
    close: number;
    body: { id: string | null; line: string }[];
  }[];
  // Body regions, by section id.
  regions: Map<string, { from: number; to: number }>;
}

// How a section is recognised in a file.
//
// TWO RULES, AND WHICH ONE APPLIES IS ALREADY IN THE CATALOGUE. A section that
// owns a region is found by `keyword:regionkey` — `note:focus`, `tasks:todo` —
// because the region key is its identity (see the header of this file). A
// section that owns no region is structure and is found by its keyword alone:
// `links`, `entry-header`.
//
// Those two cases are exactly `band: "shared"` and `band: "own"`, and exactly
// `locked: false` and `locked: true`, which is not a coincidence — it is §4 of
// the 3.0 plan stated as code: a section that owns a region owns the reader's
// writing, and one that does not is structure.
//
// MATCHES THE DIRECTIVE'S HEAD, NOT THE WHOLE LINE. Everything after it is
// arguments — a prompt, a `|Title` the reader retitled — and matching on those
// would make a renamed section invisible and then offer to add a second copy.
function probeFor(section: EntrySection, ctx: EntrySectionContext): RegExp | null {
  if (section.probe) return section.probe;
  const directive = directiveFor(section, { ...ctx, extra: [section.id] });
  if (directive == null) return null;
  const keyword = escapeForLine(directive.split(":")[0]);
  // Head only for a structural section (no second token to key on) and for one
  // that owns no region (its second token is an argument, not its id).
  return section.band === "own" || section.ownsRegion === false
    ? new RegExp(`^${keyword}\\b`)
    : new RegExp(`^${keyword}:${escapeForLine(section.id)}\\b`);
}

// Read an entry into the parts an edit can act on.
//
// CONSERVATIVE, in the way parseSections is: a section is present iff its own
// directive is present. Anything unrecognised is foreign and is reported rather
// than adopted.
//
// ── AND IT IS NOT `parseSectionRuns`, WHICH IS WORTH SAYING (5.23) ───────
//
// The 5.23 plan expected this to shrink to a wrapper: the shared band from the
// common walk, the structural lines and the regions from its own probes. Only
// the regions came out that way. The rest cannot, and the reason is not
// stubbornness:
//
//   THE COMMON WALK ATTRIBUTES A SEGMENT, THIS ONE ATTRIBUTES A LINE. A
//   dashboard section owns a fence; an entry section owns one directive INSIDE
//   a fence its whole band shares, so what `EntryShape.shared` records is a
//   per-line `{ id, line }` list and not a run.
//
//   WHICH FENCE IS THE WIDGET FENCE IS A JUDGEMENT NO OTHER SURFACE MAKES.
//   `candidates`, `sharing` and the last-non-structural fallback below are 3.0
//   §9's narrowing, and they exist because an entry is the one surface where a
//   reader's own ```chronoanvil block could otherwise be written into.
//
// So the shared pieces are shared — `regionSpans`, and `probeFor` through
// `Section.locate` — and the walk stays. A parser parameterised until it could
// be both would be two implementations behind one name, which is the thing this
// release exists to remove rather than to create.
export function parseEntry(
  text: string,
  ctx: EntrySectionContext
): EntryShape {
  const lines = text.split("\n");
  const probes = offerableEntrySections(ctx)
    .map((s) => ({ s, re: probeFor(s, ctx) }))
    .filter((p): p is { s: EntrySection; re: RegExp } => p.re !== null);
  const ownerOf = (line: string, half: EntrySection["band"]): string | null =>
    probes.find((p) => p.s.band === half && p.re.test(line.trim()))?.s.id ??
    null;
  // ANY SECTION ABOVE THE RULE, WHICH IS TWO FENCES AS OF 4.20 (the banner's and
  // the tracker grid's) where it was one.
  //
  // WHY THIS IS ASKED AS "NOT SHARED" RATHER THAN AS A LIST. What every reader
  // of it wants to know is whether a fence is the READER'S widget fence or one
  // the catalogue arranges — `candidates` below picks the widget fence by
  // elimination — and the answer is "everything that is not below the rule". A
  // list of two fence names would need a third entry the next time a structural
  // fence is added, in a function whose whole job is to not care.
  const structuralOwner = (line: string): string | null =>
    probes.find((p) => p.s.band !== "shared" && p.re.test(line.trim()))?.s.id ??
    null;

  // WHETHER A FENCE IS THE READER'S WIDGET FENCE IS THE CATALOGUE'S QUESTION,
  // AND THE WIDGET TAIL DOES NOT GET A VOTE IN IT.
  //
  // `shares` below picks the fence the editor writes into, and 3.0 §9 narrowed
  // it on purpose: a fence holding a real `note:log:` line is indistinguishable
  // from the real one, and everything else — a pasted example, a scratch block,
  // a pre-3.2 entry's separate `links:` fence — is left alone. Every page
  // widget offered on this surface adds a probe as broad as its keyword, so
  // asking the tail this question would hand ~30 new ways for a fence the
  // reader wrote to be adopted as the band the editor rewrites. A pre-3.2
  // entry is the proof rather than the hypothetical: its `links:` fence sits
  // above the rule with no structural directive in it, and `links` is a page
  // widget this catalogue no longer claims.
  //
  // A widget is still FOUND inside the chosen fence — `ownerOf` attributes its
  // line like any other — it just cannot be what chose it.
  const sharesCatalogue = (line: string): boolean =>
    probes.some(
      (p) =>
        p.s.band === "shared" &&
        !isPageWidgetId(p.s.id) &&
        p.re.test(line.trim())
    );

  const shape: EntryShape = { own: [], shared: [], regions: new Map() };

  // Fences, classified by what is in them.
  //
  // WHICH FENCE IS THE WIDGET FENCE. `addSectionToNote` has always taken the
  // LAST chronoanvil fence in the note, on the reasoning that the structural ones
  // sit above the rule and the regions below carry no fence at all. That is
  // right for a note the plugin composed and it is the scan §9 of the 3.0 plan
  // names as the release's unmitigated risk — so it is narrowed here, because
  // 3.0 reaches it with removals and reorders where 2.60 reached it only with
  // an append.
  //
  // Narrowed to: the last fence that HOLDS A SHARED DIRECTIVE and holds no
  // structural one. A reader who pasted a fenced example into their notes, or
  // who keeps a scratch ```chronoanvil block at the bottom of the entry, no longer
  // has the editor write into it — where "the last one" would have. A fence
  // holding a real `note:log:` line is still indistinguishable from the real
  // one, and that is genuinely ambiguous rather than merely unhandled.
  //
  // The fallback is the last fence that is not structural, which is what makes
  // an entry whose directives someone deleted by hand still addable to.
  const fences: { open: number; close: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "```chronoanvil") continue;
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "```") {
        close = j;
        break;
      }
    }
    // An unterminated fence is left alone: the note is malformed and guessing
    // where it ends is how a reconciler eats the rest of a file.
    if (close === -1) continue;
    fences.push({ open: i, close });
    i = close;
  }

  // EVERY structural directive a fence holds, not the first one it happens to
  // contain. `.find()` was correct while one fence meant one section and is the
  // exact line 3.2 patch 2 would have broken silently: a merged fence returns
  // `links`, `entry-header` is never recorded, and the editor offers to
  // rearrange a note it cannot fully see.
  const classified = fences.map((f) => {
    const body = lines.slice(f.open + 1, f.close);
    return {
      ...f,
      owns: body
        .map((l, n) => ({ id: structuralOwner(l), at: f.open + 1 + n }))
        .filter((o): o is { id: string; at: number } => o.id !== null),
      shares: body.some(sharesCatalogue),
    };
  });

  const candidates = classified.filter((f) => !f.owns.length);
  // EVERY SHARING FENCE, AND THE LAST NON-STRUCTURAL ONE WHEN NONE SHARES —
  // see `EntryShape.shared`. The fallback is unchanged and is what makes an
  // entry whose directives someone deleted by hand still addable to; it is a
  // list of one because there is one place for an add to go.
  const sharing = candidates.filter((f) => f.shares);
  const chosen = sharing.length
    ? sharing
    : candidates.length
    ? [candidates[candidates.length - 1]]
    : [];

  for (const f of classified) shape.own.push(...f.owns);
  shape.shared = chosen.map((f) => ({
    open: f.open,
    close: f.close,
    body: lines
      .slice(f.open + 1, f.close)
      .map((line) => ({ id: ownerOf(line, "shared"), line })),
  }));

  // Regions. `regionSpans` since 5.23 — this scan and `journal-plan.ts`'
  // `regionsIn` were the same walk over the same marker, wanting a span and a
  // count respectively, and the span is what answers both.
  shape.regions = regionSpans(lines);

  return shape;
}

// Every section this grain can be OFFERED, which is not the same set as the
// one its template ships with.
//
// `sectionsForEntry` answers "what does a new entry of this grain start with",
// and it is right to exclude `challenges` from a weekly entry: no weekly
// template has ever written one. But an editor asking the same function would
// then be unable to offer one either — and "add challenges to my weekly
// entries" is exactly the case `directiveFor`'s borrowing rule was written for,
// so a catalogue that can supply the wording and an editor that cannot ask for
// it would be two halves of a feature that never meet.
//
// So the editor's universe is "every section that can produce a directive here,
// borrowing if it must". For the five shipped grains that is all nine sections,
// and the difference from `sectionsForEntry` is entirely in what a grain does
// not ship with.
//
// The parser uses this set too, deliberately: a `list:highlights` somebody
// hand-added to a daily entry is the catalogue's section in the catalogue's
// spelling, and calling it foreign would leave the editor rewriting around a
// line it could have understood.
export function offerableEntrySections(
  ctx: EntrySectionContext
): EntrySection[] {
  return [...entryCatalogueSections(ctx), ...entryWidgets(ctx)];
}

// The same question asked of the CATALOGUE alone — every hand-written section
// that can word a directive at this grain, with no widget tail behind it.
//
// SEPARATE BECAUSE TWO CALLERS NEED THE LINE DRAWN THERE, and both would be
// wrong to draw it themselves: the model's `sections()` with no text (see
// below), and the widget probe, which must not be handed the tail it is
// computing.
const entryCatalogueSections = (ctx: EntrySectionContext): EntrySection[] =>
  ENTRY_SECTIONS.filter(
    (s) => directiveFor(s, { ...ctx, extra: [s.id] }) != null
  );

// ── THE WIDGET DOOR, ON THE LEAF SURFACE (5.26) ─────────────────────────────
//
// AN ENTRY WAS HALF-OPEN ALREADY, and that is the argument for opening it
// rather than a nicety. The shared band IS a widget fence — one ```chronoanvil
// block below the rule, holding one directive per section — and
// `planEntrySections` has always counted a directive somebody typed into it as
// foreign and LEFT IT ALONE. So a page widget written into an entry by hand
// already renders, already survives a save, and already survives a reorder.
// The only thing missing was a way to ask for one.
//
// ONE INSTANCE PER KEYWORD, AND THE REASON IS THE PARSER RATHER THAN THE
// WIDGET. `addableEntrySections`' existing rule — two of one section share one
// region and overwrite each other — does not reach here: a page widget owns no
// keyed region, which is the structural rule the whole of `WIDGETS` is built on
// (see `NOT_PAGE_WIDGETS`' `reason: "region"`). What does reach here is
// `parseEntry`: it attributes a LINE inside the shared fence by probe, with no
// instance tally, so a second `logbook` line would be found by the first
// section's probe and the first section alone. The limit is stated where it is
// true, and a reader who wants two still gets two — the second is foreign, and
// foreign in this fence means left alone.
//
// NO BAR, WHERE THE FLAT SURFACES COMPOSE ONE FOR `logbook`. A `header:` line
// in the shared fence titles THE BAND, not the widget under it — every section
// of an entry shares that fence — so the one widget that wears a title
// elsewhere writes only its directive here. That is why this builds from the
// keyword rather than projecting `widgetSection`'s output: the flat section is
// right about the homepage and would be wrong about this fence.
const entryWidgetSection = (keyword: string): EntrySection => {
  const spec = WIDGETS[keyword];
  const asks = widgetQuestions(keyword).length > 0;
  return entrySection({
    id: instanceId(keyword, 1),
    label: spec.label,
    blurb: spec.blurb,
    icon: spec.glyph,
    // THE REGISTRY'S, LIKE THE THREE FIELDS ABOVE IT. This builder deliberately
    // does not project `widgetSection`, and the subject is one of the things it
    // still has no reason to differ about.
    category: spec.category,
    // NOTHING A WIDGET DOES HERE IS LOCKED. It is on the entry because a reader
    // put it there, so it is theirs to move and theirs to remove —
    // `widgetSection`'s call, unchanged by the surface.
    locked: false,
    optIn: true,
    // BELOW THE RULE, WHICH IS THE ONLY BAND IT COULD BE IN. `own` is the
    // banner's fence and `trackers` is the logging grid; both are what the
    // plugin arranges. `shared` is what the reader arranges, and that is what
    // an added widget is.
    band: "shared",
    // ITS SECOND TOKEN IS AN ARGUMENT, NOT ITS ID — `probeFor`'s exact words
    // for this flag, and a widget is the case they were written about. Without
    // it the probe would look for `logbook:w:logbook#1` and find nothing.
    ownsRegion: false,
    directive: (_ctx, opts) =>
      widgetLine(keyword, opts as Record<string, unknown> | undefined),
    ...(asks
      ? {
          questions: (c: EntrySectionContext) =>
            widgetQuestions(keyword, c.hostFolder ?? null, c.vault),
        }
      : {}),
  });
};

// Which keywords this grain's catalogue leaves free, probed once per grain.
//
// CACHED ON THE GRAIN, which is `diary-sections.ts`' arrangement and is sound
// here for the same reason: the probe reads what the catalogue COMPOSES and
// what its `locate` matches, and both vary by grain and by nothing else. The
// reader's `extra` list is deliberately not part of the key — it can add a
// section the catalogue already has, never a keyword it does not.
const ENTRY_KEYWORDS = new Map<TrackerClass, string[]>();
const entryWidgetKeywords = (ctx: EntrySectionContext): string[] => {
  const hit = ENTRY_KEYWORDS.get(ctx.grain);
  if (hit) return hit;
  const catalogue: FlatSection[] = entryCatalogueSections(ctx).map((s) =>
    bindSection(s, { grain: ctx.grain, extra: [s.id] })
  );
  // SUPPLIES NOTHING, and this is the surface the field was added for. A daily
  // entry carries `journal-date`, never `week-start` — so `entry-rollup` would
  // draw its own refusal here and `period-nav` would write the property that
  // makes `diaryKindOf` call this day a week.
  const out = pageWidgetKeywords(catalogue, []);
  ENTRY_KEYWORDS.set(ctx.grain, out);
  return out;
};

const entryWidgets = (ctx: EntrySectionContext): EntrySection[] =>
  entryWidgetKeywords(ctx).map(entryWidgetSection);

// ── the offer, as a grid (4.27 §3) ────────────────────────────────────
//
// What a section is to a grain: already written by its template, offerable, or
// impossible.
export type EntrySectionOffer = "ships" | "offer" | "absent";

export interface EntrySectionMatrix {
  grains: TrackerClass[];
  // Only sections some grain can be offered — the ones a settings table would
  // have a control for. A row every grain ships is a row of "Ships" five times
  // over, which says nothing the group's own subtitle ("beyond what its grain
  // ships") has not already said.
  rows: EntrySection[];
  cell(sectionId: string, grain: TrackerClass): EntrySectionOffer;
}
// The settings tab renders one table from this rather than a headed stack per
// grain, and it renders NOTHING it decides for itself.
//
// WHY THE DECISIONS ARE HERE AND NOT THERE. The suite has no DOM, so anything
// computed inside a renderer is untestable — and what a grain may be offered is
// exactly the kind of rule that rots quietly, because a wrong cell looks like a
// deliberate blank. Hoisting the two calls the renderer already made turns
// "which controls appear" into a value a test can hold.
//
// `grains` is a parameter so the derivation can be tested with a list that is
// not five long. `test/tracker-grains.test.ts` records the standing claim — "a
// sixth grain is a table edit away; a layout that only works at five breaks
// silently the moment the table grows" — and a default of `TRACKER_CLASSES`
// keeps every real caller reading bare.
export function entrySectionMatrix(
  journalKinds?: EntrySectionContext["journalKinds"],
  grains: TrackerClass[] = [...TRACKER_CLASSES]
): EntrySectionMatrix {
  const per = new Map<TrackerClass, { ships: Set<string>; offer: Set<string> }>();
  for (const grain of grains) {
    const ships = new Set(sectionsForEntry({ grain }).map((s) => s.id));
    // THE FENCE TEST IS DEFENSIVE AND CURRENTLY UNREACHABLE, which is worth
    // writing down because it reads as load-bearing and is not. The only two
    // sections that are not `shared` — `banner` and `trackers` — ship on all
    // five grains, so `!ships.has` has already removed them by the time the
    // fence is asked about. Deleting the clause leaves every test green, and it
    // was carried over from the code this replaced rather than proven here.
    //
    // It stays because the condition it encodes is real: a section in its own
    // fence is not something a settings toggle can add to a shared one. A
    // future `band: "own"` section that does NOT ship everywhere would make
    // this the only thing standing between the reader and a broken template,
    // and it would arrive with no test to notice.
    const offer = new Set(
      offerableEntrySections({ grain, journalKinds })
        .filter((s) => !ships.has(s.id) && s.band === "shared")
        .map((s) => s.id)
    );
    per.set(grain, { ships, offer });
  }
  const cell = (sectionId: string, grain: TrackerClass): EntrySectionOffer => {
    const g = per.get(grain);
    if (!g) return "absent";
    if (g.ships.has(sectionId)) return "ships";
    return g.offer.has(sectionId) ? "offer" : "absent";
  };
  return {
    grains,
    // Catalogue order, so the table reads in the order an entry is composed.
    rows: ENTRY_SECTIONS.filter((s) =>
      grains.some((grain) => cell(s.id, grain) === "offer")
    ),
    cell,
  };
}

// Which of this entry's sections the note already has, in the order they
// appear in it. The entry half of `detectSections`.
export function detectEntrySections(
  text: string,
  ctx: EntrySectionContext
): string[] {
  const shape = parseEntry(text, ctx);
  return [
    ...shape.own.map((o) => o.id),
    ...sharedBody(shape)
      .map((b) => b.id)
      .filter((id): id is string => id !== null),
  ];
}

// The whole shared band, in file order, however many fences hold it.
//
// ONE ACCESSOR RATHER THAN A LOOP AT EVERY CALLER, because "the band" is what
// every reader of `EntryShape.shared` actually wants — which order the reader's
// sections are in — and the fence a line happens to sit in matters only to the
// one function that writes lines back. That function keeps the fences; everybody
// else asks this.
export function sharedBody(
  shape: EntryShape
): { id: string | null; line: string }[] {
  return shape.shared.flatMap((f) => f.body);
}

// A MODIFIER IS NOT A FOREIGN DIRECTIVE (4.70). `row`, `cell`, `header:` and the
// rest are the catalogue's own furniture — `composeEntryTemplate` writes the
// `row` lines — so a band scan that called them unrecognised would report the
// plugin's own layout to the reader as lines it did not write, and an
// entry-template reload would refuse itself over them.
const isModifierLine = (line: string): boolean =>
  MODIFIER_KEYWORDS.has(splitDirective(line.trim()).keyword);

// One fence body, with its `row` line made true of what the fence now holds.
//
// A fence that HAD a `row` line keeps it while it holds two or more widgets,
// and loses it when removals drop it to one — `rowRuns`' rule, applied to a
// fence being REWRITTEN. A fence that never had a `row` line is an unrowed
// stack (like an entry's shared band) and does NOT gain one.
function tidyRowLine(body: readonly string[]): string[] {
  const hasRow = body.some((l) => isRowLine(l.trim()));
  if (!hasRow) return [...body];
  const widgets = body.filter((l) => l.trim() && !isModifierLine(l)).length;
  if (widgets > 1) {
    return [...body];
  }
  return body.filter((l) => !isRowLine(l.trim()) && !isCellLine(l.trim()));
}

// A band line that is the reader's own: not the catalogue's, not blank, and not
// one of the layout modifiers above.
export function isForeignBandLine(b: {
  id: string | null;
  line: string;
}): boolean {
  return b.id === null && b.line.trim() !== "" && !isModifierLine(b.line);
}

// What could still be added here: applies to this grain, and is not already in
// the note.
//
// Already-present sections are withheld rather than offered and refused, and
// that is correctness rather than tidiness: every section persists into a
// region keyed by name, so a second `note:log` would give two widgets one
// region and they would overwrite each other. Wanting two of something means
// two keys, which is a hand edit.
export function addableEntrySections(
  ctx: EntrySectionContext,
  text: string
): EntrySection[] {
  const present = new Set(detectEntrySections(text, ctx));
  return offerableEntrySections(ctx).filter(
    (s) => !present.has(s.id) && s.band === "shared"
  );
}

// What changing this entry's sections to `want` would do.
//
// `want` is one ordered list across both halves, and this partitions it. A
// cross-half move is not refused with a message because it is not
// REPRESENTABLE: each half is reordered against the part of `want` that belongs
// to it, so a `want` that interleaves them resolves to the same two
// permutations as one that does not. That is the rule from the header made
// structural rather than checked — a validation could be forgotten at one call
// site, where a partition cannot be.
export function planEntrySections(
  text: string,
  ctx: EntrySectionContext,
  want: readonly SectionWant[]
): SectionOp[] {
  const wantIds = idsOf(want);
  const shape = parseEntry(text, ctx);
  const byId = new Map(offerableEntrySections(ctx).map((s) => [s.id, s]));
  const present = detectEntrySections(text, ctx);
  const rewriting = new Set(reconfigured(present, want));
  const ops: SectionOp[] = [];

  // Removals, keeps and reconfigures, in file order, so the plan reads down the
  // file.
  for (const id of present) {
    const section = byId.get(id);
    if (!section) continue;
    if (wantIds.includes(id)) {
      ops.push(
        rewriting.has(id)
          ? {
              kind: "reconfigure",
              sectionId: id,
              label: section.label,
              detail: describeAnswers(
                section.questions?.(ctx) ?? [],
                optionsFor(want, id)
              ),
            }
          : { kind: "keep", sectionId: id, label: section.label, detail: "unchanged" }
      );
      continue;
    }
    const refusal = entryRemovalRefusal(section, text);
    if (refusal) {
      // ASKED FOR AND REFUSED, AND SAID SO. Silently keeping a section the
      // reader unticked would be the editor lying, which is the thing the whole
      // feature exists not to do.
      ops.push({ kind: "keep", sectionId: id, label: section.label, detail: refusal });
      continue;
    }
    ops.push({
      kind: "remove",
      sectionId: id,
      label: section.label,
      detail: `removes ${section.label.toLowerCase()}`,
    });
  }

  // Only the shared half can be added to. The two structural sections are
  // locked, which means they can neither leave nor arrive: an entry that never
  // had a banner is not an entry this catalogue wrote. That is `addOps`'
  // `admits` gate, and this is its only caller.
  const added = addOps(
    wantIds,
    (id) => present.includes(id),
    byId,
    (s) => `adds ${s.label.toLowerCase()}`,
    (s) =>
      s.band === "shared" &&
      directiveFor(s, { ...ctx, extra: [s.id] }) != null
  );
  const adding = added.adding;
  ops.push(...added.ops);

  // Moves, over the personal half only.
  //
  // THE STRUCTURAL HALF NO LONGER HAS ANY. It holds `links`, pinned by 3.2 §4,
  // and `entry-header`, which is therefore alone among its band's movable
  // members — so every permutation of that band is the identity, and a loop
  // over it could only ever produce an empty list. `isMovable` states the same
  // fact for the refusal message; this is where it stops costing code.
  //
  // A `want` that interleaves the two halves is still not a cross-half move,
  // and for the same structural reason as before: the shared half is reordered
  // against the part of `want` that belongs to it, so the rest of the list
  // cannot reach it.
  ops.push(...moveOpsFor(present, wantIds, adding, byId, ["shared"]));

  // Anything in the widget fence the catalogue did not write, counted rather
  // than named: the reader knows what their own directives are, and the useful
  // fact is that the plan is not going to touch them.
  const foreign = foreignOp(
    sharedBody(shape).filter(isForeignBandLine).length,
    "line",
    "in this entry's widget fence"
  );
  if (foreign) ops.push(foreign);

  return ops;
}

// The entry with `want`'s sections, or null if nothing would change.
//
// REBUILT BY SPLICE, NOT BY COMPOSITION. `composeEntryTemplate` exists two
// hundred lines above and is the wrong tool here by exactly the margin that
// matters: it writes the file the catalogue would write, and this file is the
// reader's. Everything not named by the plan is re-emitted as the line it was
// read as — their frontmatter, their prose, their extra fences, the blank lines
// they left, and every byte of their writing.
//
// §9 of the 3.0 plan names this as the release's risk: the entry surface is the
// one where a mistake writes into notes someone has been keeping for months.
// The mitigations are that nothing is deleted that the plan did not name, that
// no region with writing in it is deletable at all (`entryRemovalRefusal`
// refuses first), and that a file with no widget fence is declined rather than
// guessed at.
export function applyEntrySections(
  text: string,
  ctx: EntrySectionContext,
  want: readonly SectionWant[]
): string | null {
  const ops = planEntrySections(text, ctx, want);
  // NO `extend` OP REACHES THIS SURFACE — an entry composes no solo bar and has
  // no missing parts — so `plannedWrites`' fifth set is always empty here and
  // `any` reads exactly as the four-way test it replaced.
  const { removing, adding, rewriting, any } = plannedWrites(ops);
  if (!any) return null;

  const shape = parseEntry(text, ctx);
  const byId = new Map(offerableEntrySections(ctx).map((s) => [s.id, s]));
  const lines = text.split("\n");

  // A note with no widget fence is DECLINED, not repaired. Adding one would be
  // composing a structure into a file whose author may have removed it on
  // purpose, and the plan's §9 risk is precisely notes that have been
  // rearranged by hand.
  if (!shape.shared.length && (removing.size || adding.length)) return null;

  // ── the structural half: nothing happens to it ──
  //
  // 3.1 permuted these blocks against `want`. 3.2 §4 pins `links` and thereby
  // strands `entry-header` alone among its band's movable members, so the
  // permutation is always the identity and the code that computed it was
  // fifteen lines producing a copy of its input. `planEntrySections` no longer
  // emits a structural move, so nothing downstream is expecting one either.
  //
  // The blocks fall through to the verbatim re-emit at the bottom of this
  // function, which is what every other untouched line of the reader's file
  // gets — a stronger guarantee than the one they had, since it cannot rewrite
  // them even in principle.

  // ── the personal half: directive lines trade slots ──
  //
  // ACROSS EVERY FENCE OF THE BAND (4.70), which is what makes a permutation of
  // the band still a permutation now that the band is several fences. The lines
  // are flattened with the fence each came from remembered, edited as one list
  // exactly as they were edited when there was one fence, and dealt back into
  // the fences afterwards by that remembered index. So a section moved from the
  // first row to the third lands in the third row's fence, and the number of
  // widgets in each row is whatever the reader's order makes it.
  //
  // A ROW THAT FALLS TO ONE WIDGET LOSES ITS `row` LINE, and one that gains a
  // second gets it back — `rowRuns`' rule, applied to a fence that is being
  // rewritten rather than composed. Without it, removing Challenges leaves
  // `row` over Highlights alone: a full-width block that renders correctly and
  // reports itself to the editor as a group over a section grouped with
  // nothing.
  const fenceOf = new Map<{ id: string | null; line: string }, number>();
  const flat: { id: string | null; line: string }[] = [];
  shape.shared.forEach((f, n) => {
    for (const b of f.body) {
      fenceOf.set(b, n);
      flat.push(b);
    }
  });
  const bodies: string[][] = shape.shared.map(() => []);
  if (shape.shared.length) {
    const lastFence = shape.shared.length - 1;
    const kept = flat
      .filter((b) => b.id === null || !removing.has(b.id))
      // A SETTLED SECTION'S ANSWER, CHANGED IN PLACE — 3.15 patch 5, and the
      // one property of this function that changed. The line is still the
      // reader's: `withAnswers` replaces the span the answer occupies and
      // nothing else, so a `|From the journals` they retitled survives a Save
      // that repoints the bridge. A block not named by a `reconfigure` op is
      // copied out exactly as it was, which is what it always was.
      .map((b) => {
        if (b.id === null || !rewriting.has(b.id)) return b;
        const section = byId.get(b.id);
        if (!section) return b;
        const [line] = withAnswers(
          [b.line],
          section.questions?.(ctx) ?? [],
          optionsFor(want, b.id)
        );
        return { ...b, line };
      });
    // Added at the END of the fence, not in catalogue order. A reader who
    // rearranged their entry arranged it, and inserting into the middle of
    // their arrangement to satisfy a canonical order would be undoing a
    // customisation in the name of adding one — `addSectionToNote`'s rule since
    // 2.60.4, and the same one applies when the add arrives from the editor.
    for (const id of adding) {
      const section = byId.get(id);
      if (!section) continue;
      // OPTIONS COMPOSED, HERE, ON AN ADD. A section already in the file is no
      // longer remove-then-add — 3.15 gave the editor a way to read an answer
      // back, so changing one is a `reconfigure` and is spliced above — but the
      // two writes stay different in kind and deliberately so. There is no line
      // yet here, so the catalogue composes one; there, a line exists and is
      // the reader's, so only the answer's own span is touched.
      const directive = directiveFor(
        section,
        { ...ctx, extra: [id] },
        optionsFor(want, id)
      );
      if (directive == null) continue;
      const line = { id, line: directive };
      fenceOf.set(line, lastFence);
      kept.push(line);
    }
    const slots: number[] = [];
    kept.forEach((b, i) => {
      if (b.id !== null) slots.push(i);
    });
    const occupants = slots.map((i) => kept[i].id as string);
    const desired = desiredOrder(
      occupants,
      idsOf(want).filter((id) => byId.get(id)?.band === "shared")
    );
    const byLine = new Map(slots.map((i) => [kept[i].id as string, kept[i]]));
    // THE SLOT KEEPS ITS FENCE, NOT THE LINE. A permutation moves ids between
    // positions and the positions are what the fences are made of — so the
    // arrival takes over the slot's fence rather than carrying its old one
    // along, which is the same rule as "a section moved into the second row is
    // in the second row".
    const homes = slots.map((i) => fenceOf.get(kept[i]) ?? lastFence);
    slots.forEach((slot, n) => {
      const wanted = byLine.get(desired[n]);
      if (wanted) {
        kept[slot] = wanted;
        fenceOf.set(wanted, homes[n]);
      }
    });
    for (const b of kept) bodies[fenceOf.get(b) ?? lastFence].push(b.line);
    for (let n = 0; n < bodies.length; n++) {
      bodies[n] = tidyRowLine(bodies[n]);
    }
  }

  // ── removed regions ──
  //
  // Only ever EMPTY ones reach here: `entryRemovalRefusal` refuses a removal
  // while the region holds the reader's writing, and `planEntrySections` turns
  // that refusal into a `keep`. The blank separator that followed the region
  // goes with it, or the one before it when it was the last in the file —
  // otherwise every removal leaves a widening gap behind.
  const regionSkip = new Set<number>();
  for (const id of removing) {
    const at = shape.regions.get(id);
    if (!at) continue;
    for (let i = at.from; i <= at.to; i++) regionSkip.add(i);
    if (lines[at.to + 1]?.trim() === "") regionSkip.add(at.to + 1);
    else if (lines[at.from - 1]?.trim() === "") regionSkip.add(at.from - 1);
  }

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (regionSkip.has(i)) continue;
    const fence = shape.shared.findIndex((f) => f.open === i);
    if (fence >= 0) {
      // A FENCE EMPTIED BY THE REMOVALS GOES WITH THEM, and its blank separator
      // with it. An empty ```chronoanvil block renders as a bordered gap where a
      // card used to be — `trackerFence`'s own reason for composing nothing
      // rather than composing empty, one band up.
      if (bodies[fence].some((l) => l.trim() && !isModifierLine(l))) {
        out.push(lines[i], ...bodies[fence], lines[shape.shared[fence].close]);
      } else if (lines[shape.shared[fence].close + 1]?.trim() === "") {
        i += 1;
      }
      i = Math.max(i, shape.shared[fence].close);
      continue;
    }
    out.push(lines[i]);
  }

  // New regions, at the end, each after a blank line — the arrangement every
  // shipped template already has and the one `addSectionToNote` writes.
  let next = out.join("\n");
  for (const id of adding) {
    if (shape.regions.has(id)) continue;
    if (byId.get(id)?.ownsRegion === false) continue;
    const sep = next.endsWith("\n") ? "\n" : "\n\n";
    next = `${next}${sep}${region(id)}\n`;
  }

  return next === text ? null : next;
}

// ── the shared interface ──────────────────────────────────────────────

// The two bands of an entry, named for the reader rather than for the code.
//
// `band: "own" | "shared"` is a fact about which fence a directive is written
// into; what the reader sees is a horizontal rule with structure above it and
// their own writing below. The editor groups rows by this string and permits a
// reorder only within one — so the rule that a section cannot cross the rule is
// enforced by the model, stated in the UI, and needs no surface test in either.
const BANDS: Record<EntrySection["band"], string> = {
  own: "The banner",
  // ITS OWN BAND, NOT THE BANNER'S (4.20). Three bands where there were two, and
  // the third exists for the reason `fence` gives: the grid is above the rule
  // and is not part of the banner, so it cannot share a band with it — a band is
  // what the editor lets a row move WITHIN, and one band would let the grid be
  // dragged back into the card it was just taken out of.
  trackers: "The trackers",
  // "THE PAGE BELOW", NOT "BELOW THE RULE" (4.21). Every band on every surface
  // is named for WHAT IT HOLDS — the banner, the trackers, the overview — and
  // this one was named for where it sits relative to a horizontal rule the
  // reader may not have thought of as a landmark. `DIARY_SECTIONS`' third band
  // has read "The page below" since 4.19; this is the same band on the other
  // diary surface and now says so.
  shared: "The page below",
};

// TAKES THE CONTEXT, as of 3.8 patch 7, where it used to take a section alone.
//
// Everything else on a row is a property of the section: its label, its lock,
// its band. A QUESTION's answers are a property of the vault — which journal
// kinds exist right now — so this is the first field on the projection that
// cannot be computed from the catalogue entry, and the context is where the
// vault's half of it already lives.
const rowFor =
  (ctx: EntrySectionContext) =>
  (s: EntrySection): SectionView =>
    // THE SHAPE IS `viewOf`'s, IN `core/sections.ts` (5.22). The argument this
    // file used to keep beside its own copy is that function's now, and it is
    // the reason `questions` is spread conditionally rather than set: a key
    // present and undefined on all nine sections of an entry would have said
    // "every section here asks something" in the one place written to catch
    // that claim.
    viewOf(s, {
      questions: s.questions?.(ctx),
      movable: isMovable(s),
      group: BANDS[s.band],
    });

// This entry, as the editor sees it.
export function entrySectionModel(ctx: EntrySectionContext): SectionModel {
  const find = (id: string): EntrySection | undefined =>
    offerableEntrySections(ctx).find((s) => s.id === id);
  return {
    // NO TEXT MEANS NO WIDGETS, WHICH IS `flatNoteModel`'s RULE AND ARRIVES
    // HERE WITH THE DOOR (5.26). A widget section is not something this grain
    // HAS — it is something this note could be given — and the caller with no
    // note in hand is asking about the catalogue. Every caller in the UI passes
    // the text; this keeps `sections()` meaning the same thing on all four
    // surfaces, which is what `test/section-model.test.ts`' cross-surface
    // sweeps are counting.
    sections: (text) =>
      (text === undefined
        ? entryCatalogueSections(ctx)
        : offerableEntrySections(ctx)
      ).map(rowFor(ctx)),
    present: (text) => detectEntrySections(text, ctx),
    addable: (text) => addableEntrySections(ctx, text).map(rowFor(ctx)),
    refusal: (id, text) => {
      const s = find(id);
      return s ? entryRemovalRefusal(s, text) : null;
    },
    plan: (text, want) => planEntrySections(text, ctx, want),
    apply: (text, want) => applyEntrySections(text, ctx, want),
  };
}
