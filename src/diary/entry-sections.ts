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
// directives inside ONE fence, each paired with an `<!--almanac:key-->` body
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
  SectionQuestion,
  SectionView,
  SectionWant,
  describeAnswers,
  desiredOrder,
  idsOf,
  moveOps,
  optionsFor,
  reconfigured,
  withAnswers,
} from "../core/section-model";
import { regionHasContent } from "../core/notestore";
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
}

export interface EntrySection {
  // The region key, for a section that owns one. Also the section's identity —
  // see the header. A LOCKED section owns no region: `links` and `entry-header`
  // are structure, so the id is just a name.
  id: string;
  label: string;
  blurb: string;
  // The glyph a row is tokened with. Added in 3.0 with the shared interface,
  // for the reason journal sections have carried one since their catalogue
  // existed: a list drawn without them reads as a different list from the one
  // two clicks away.
  icon: string;
  // LOCKED sections cannot be removed.
  //
  // `links` and `entry-header` are locked; everything below the rule is not.
  //
  // THEY ARE IN THE CATALOGUE AS OF 2.60.2, where 2.60.0 left them out on the
  // grounds that they own no region. That was true and was the wrong reason to
  // exclude them: a section an editor cannot SEE cannot be reordered either,
  // and leaving them out would have enforced a layout nobody argued for under
  // cover of enforcing a feature that was.
  //
  // 2.60.2 ALSO SAID "the lock is on existence, not order", AND 3.2 §4 TAKES
  // PART OF THAT BACK. See `pinned` below for what was retracted and why. The
  // sentence is removed from here rather than left standing beside a field that
  // contradicts it.
  locked: boolean;
  // PINNED sections cannot be MOVED either.
  //
  // A RETRACTION, AND IT IS NAMED AS ONE. 2.60.2 argued that a lock on
  // existence must not become a lock on position, and 3.0 patch 1 was built
  // because `entryRemovalRefusal` had been promising a move that did not exist.
  // 3.2 §4 decides that navigation is the top row of every diary surface, which
  // makes that promise false again for `links` — deliberately this time, which
  // is worse and is why it is written down here rather than in a changelog
  // line.
  //
  // THE ARGUMENT FOR THE PIN: an entry whose route home sits underneath the
  // card, or an overview whose route home sits underneath a seven-row table, is
  // not a preference being expressed. It is the one control on the page that
  // has to be findable before the reader knows what the page is.
  //
  // THE PIN DOES NOT RELOCATE ANYTHING. It is a rule about what the editor will
  // do, not about what a file should look like — see `holdPinned` in
  // section-model.ts, which keeps a pinned section at the index the file
  // already gives it rather than dragging it to the front.
  pinned?: boolean;
  // Which fence this section's directive belongs in.
  //
  // `own` means a fence of its own, above the rule; `shared` means the single
  // fence below it that every editable widget lives in. This is the structural
  // difference between the two halves of an entry, and it is a property rather
  // than a position so that reordering within a half cannot accidentally move a
  // section across the rule.
  fence: "own" | "shared";
  // Whether this section persists into a note region of its own, keyed by its
  // id. True for every section that ships, and the assumption three separate
  // pieces of machinery were written on before 3.8 made one that isn't.
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
  //
  // Absent means true, so no shipped section had to declare it.
  ownsRegion?: boolean;
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
  // What this section cannot write a directive without being told.
  //
  // THE OTHER HALF OF `opts`. 3.8 patch 5 gave a section's directive somewhere
  // to READ an answer from and left it with nowhere to ASK: the editor could
  // add `bridge` and had no way to know it wanted anything, so it wrote
  // `bridge-notes:` with an empty target and the block rendered a refusal. The
  // plumbing ran end to end and had no mouth at one end of it.
  //
  // A FUNCTION OF THE CONTEXT rather than a literal list, because the answers
  // are what THIS VAULT defines and not what the catalogue ships. A hardcoded
  // list of journal kinds here would be the `bridgeCatalogue` staleness bug one
  // file over — two grains hardcoded under a comment claiming there were only
  // two — waiting to happen again with kinds.
  //
  // Absent on every section but one, and that is the healthy state, exactly as
  // it is for `opts`: a section that declares a question is a section whose
  // directive cannot be written without asking the reader something.
  questions?: (ctx: EntrySectionContext) => SectionQuestion[];
}

const on = (
  map: Partial<Record<TrackerClass, string>>
): ((ctx: EntrySectionContext) => string | null) => {
  return (ctx) => map[ctx.grain] ?? null;
};

// Ordered as they appear in the fence, which is the order on screen.
export const ENTRY_SECTIONS: EntrySection[] = [
  {
    id: "links",
    label: "Navigation",
    blurb: "Home, today, and the scope switcher.",
    icon: "🧭",
    // LOCKED. A vault where some entries can get home and others cannot is
    // worse than one with no links at all.
    locked: true,
    // PINNED, as of 3.2 §4. The only section in either diary catalogue that is.
    pinned: true,
    fence: "own",
    directive: () => "links:home,today,scopes#diary",
  },
  {
    id: "entry-header",
    label: "Banner",
    blurb: "The date navigator, the title, and this entry's tracker grid.",
    icon: "🗓",
    // LOCKED, and the one that most obviously has to be: without it the note
    // has no date navigation, no trackers and no title editing — it stops being
    // an Almanac entry rather than losing a feature.
    locked: true,
    fence: "own",
    directive: () => "entry-header",
  },
  {
    id: "focus",
    label: "Focus",
    blurb: "One line: what this period is about.",
    icon: "🎯",
    locked: false,
    fence: "shared",
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
    locked: false,
    fence: "shared",
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
    locked: false,
    fence: "shared",
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
    locked: false,
    fence: "shared",
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
    locked: false,
    fence: "shared",
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
    id: "todo",
    label: "Tasks",
    blurb: "Almanac tasks belonging to this entry.",
    icon: "✅",
    locked: false,
    fence: "shared",
    directive: on({
      daily: "tasks:todo|Tasks",
      weekly: "tasks:todo|Goals this week",
      monthly: "tasks:todo|Goals this month",
      quarterly: "tasks:todo|Goals this quarter",
      yearly: "tasks:todo|Goals this year",
    }),
  },
  {
    id: "bridge",
    label: "From the journals",
    blurb: "Journal notes dated inside this entry's period.",
    icon: "🌉",
    locked: false,
    fence: "shared",
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
    id: "capture",
    label: "Captured",
    blurb: "Where the capture command drops thoughts.",
    icon: "⚡",
    locked: false,
    fence: "shared",
    // Daily alone, and structurally so: capture writes to the day you are on.
    directive: on({
      daily: "note:capture#collapse:Captured thoughts land here…|Captured",
    }),
  },
];

export function sectionsForEntry(ctx: EntrySectionContext): EntrySection[] {
  return ENTRY_SECTIONS.filter(
    (s) => s.directive(ctx) != null || (ctx.extra ?? []).includes(s.id)
  );
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

// The `# almanac:trackers:start` … `:end` pair, and what the shipped template
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
  const seeded =
    ctx.grain !== "daily"
      ? []
      : where === "frontmatter"
        ? ["Mood:", "Wake-Up:", "Bedtime:", "Sleep:"]
        : ["tracker:Mood", "sleep"];
  return ["# almanac:trackers:start", ...seeded, "# almanac:trackers:end"];
}

// A body region, empty. The blank line between the markers is not decoration:
// `readNoteRegion` reads what is between them, and a region written as one line
// leaves nowhere for the reader's first keystroke to go.
function region(id: string): string {
  return `<!--almanac:${id}\n-->`;
}

// A whole entry template.
//
// Reproduces the shipped assets exactly as of 2.60.0: the spacer, the two
// fences with no blank line between them, the `---` rule, the widget fence, and
// the regions each separated by a blank line.
export function composeEntryTemplate(
  grain: TrackerClass,
  extra: readonly SectionWant[] = []
): string {
  // WHERE THE SETTING BECOMES A TEMPLATE, as of 3.8 patch 6. `extra` has been
  // documented since 2.60.1 as "a setting the composer reads" and was a
  // parameter nothing supplied; `AlmanacSettings.entrySections` is now that
  // setting, and `shippedNotes` / `refreshTemplates` hand it in here.
  const options: Record<string, Record<string, unknown>> = {};
  for (const want of extra) {
    if (typeof want !== "string" && want.options) options[want.id] = want.options;
  }
  const ctx: EntrySectionContext = { grain, extra: idsOf(extra), options };
  const all = sectionsForEntry(ctx);
  const own = all.filter((s) => s.fence === "own");
  const shared = all.filter((s) => s.fence === "shared");

  // Built from the catalogue rather than from a hardcoded skeleton as of
  // 2.60.2, and written into ONE fence as of 3.2 patch 2.
  //
  // WHY ONE. Obsidian renders each ```almanac fence as its own block with the
  // note's spacing between, so two fences above the rule can be made to
  // resemble one card and cannot be made into one — the limit
  // journals-section.ts documents and 2.18.4 already fixed one fence lower
  // down, when the nav strip and the tracker grid merged. The `links:` row is
  // the piece that merge left behind. One fence is one container, so the card
  // is real rather than a resemblance.
  //
  // WHAT DID NOT CHANGE: the directives, their order, the tracker markers, and
  // every line below the rule. What moves is one pair of fence lines — the same
  // sentence `mergeEntryFences` uses about the merge it performs, because it is
  // the same merge one row up.
  //
  // `entry-header` carries the header's tracker block. That is a property of
  // that section rather than of the composer: no other section has one, and a
  // composer that special-cased a section by name would be the catalogue with a
  // hole in it.
  const ownLines = (sec: EntrySection): string[] => [
    directiveFor(sec, ctx) as string,
    ...(sec.id === "entry-header" ? trackerBlock(ctx, "header") : []),
  ];

  return (
    [
      ...frontmatter(ctx),
      "`almanac:spacer`",
      "```almanac",
      ...own.flatMap(ownLines),
      "```",
      "",
      "---",
      "",
      "```almanac",
      ...shared.map((s) => directiveFor(s, ctx) as string),
      "```",
      "",
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
    ENTRY_SECTIONS.filter((s) => s.fence === section.fence && !s.pinned).length >
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
export function entryRemovalRefusal(
  section: EntrySection,
  fileText: string
): string | null {
  if (section.pinned) {
    return `${section.label} is the first thing on every entry. It can't be removed or moved.`;
  }
  if (section.locked) {
    return isMovable(section)
      ? `${section.label} is part of every entry and cannot be removed. You can move it, though.`
      : `${section.label} is part of every entry and cannot be removed.`;
  }
  if (section.ownsRegion !== false && regionHasContent(fileText, section.id)) {
    return `${section.label} has your writing in it. Clear it first, then remove the section.`;
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
  if (section.fence !== "shared") return null;
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

// The closing ``` of the fence the editable widgets live in: the LAST almanac
// fence in the note, since the structural ones sit above the rule and the body
// regions below carry no fence at all.
function lastSharedFenceClose(lines: string[]): number {
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```almanac") open = i;
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
  // The single widget fence below the rule, and what is in it. `id` is null for
  // a line the catalogue did not write — those keep their index and are never
  // touched.
  shared: {
    open: number;
    close: number;
    body: { id: string | null; line: string }[];
  } | null;
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
// Those two cases are exactly `fence: "shared"` and `fence: "own"`, and exactly
// `locked: false` and `locked: true`, which is not a coincidence — it is §4 of
// the 3.0 plan stated as code: a section that owns a region owns the reader's
// writing, and one that does not is structure.
//
// MATCHES THE DIRECTIVE'S HEAD, NOT THE WHOLE LINE. Everything after it is
// arguments — a prompt, a `|Title` the reader retitled — and matching on those
// would make a renamed section invisible and then offer to add a second copy.
function probeFor(section: EntrySection, ctx: EntrySectionContext): RegExp | null {
  const directive = directiveFor(section, { ...ctx, extra: [section.id] });
  if (directive == null) return null;
  const keyword = escapeForLine(directive.split(":")[0]);
  // Head only for a structural section (no second token to key on) and for one
  // that owns no region (its second token is an argument, not its id).
  return section.fence === "own" || section.ownsRegion === false
    ? new RegExp(`^${keyword}\\b`)
    : new RegExp(`^${keyword}:${escapeForLine(section.id)}\\b`);
}

// Read an entry into the parts an edit can act on.
//
// CONSERVATIVE, in the way parseSections is: a section is present iff its own
// directive is present. Anything unrecognised is foreign and is reported rather
// than adopted.
export function parseEntry(
  text: string,
  ctx: EntrySectionContext
): EntryShape {
  const lines = text.split("\n");
  const probes = offerableEntrySections(ctx)
    .map((s) => ({ s, re: probeFor(s, ctx) }))
    .filter((p): p is { s: EntrySection; re: RegExp } => p.re !== null);
  const ownerOf = (line: string, half: "own" | "shared"): string | null =>
    probes.find((p) => p.s.fence === half && p.re.test(line.trim()))?.s.id ??
    null;

  const shape: EntryShape = { own: [], shared: null, regions: new Map() };

  // Fences, classified by what is in them.
  //
  // WHICH FENCE IS THE WIDGET FENCE. `addSectionToNote` has always taken the
  // LAST almanac fence in the note, on the reasoning that the structural ones
  // sit above the rule and the regions below carry no fence at all. That is
  // right for a note the plugin composed and it is the scan §9 of the 3.0 plan
  // names as the release's unmitigated risk — so it is narrowed here, because
  // 3.0 reaches it with removals and reorders where 2.60 reached it only with
  // an append.
  //
  // Narrowed to: the last fence that HOLDS A SHARED DIRECTIVE and holds no
  // structural one. A reader who pasted a fenced example into their notes, or
  // who keeps a scratch ```almanac block at the bottom of the entry, no longer
  // has the editor write into it — where "the last one" would have. A fence
  // holding a real `note:log:` line is still indistinguishable from the real
  // one, and that is genuinely ambiguous rather than merely unhandled.
  //
  // The fallback is the last fence that is not structural, which is what makes
  // an entry whose directives someone deleted by hand still addable to.
  const fences: { open: number; close: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "```almanac") continue;
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
        .map((l, n) => ({ id: ownerOf(l, "own"), at: f.open + 1 + n }))
        .filter((o): o is { id: string; at: number } => o.id !== null),
      shares: body.some((l) => ownerOf(l, "shared") !== null),
    };
  });

  const candidates = classified.filter((f) => !f.owns.length);
  const last =
    [...candidates].reverse().find((f) => f.shares) ??
    candidates[candidates.length - 1];

  for (const f of classified) shape.own.push(...f.owns);
  if (last) {
    shape.shared = {
      open: last.open,
      close: last.close,
      body: lines
        .slice(last.open + 1, last.close)
        .map((line) => ({ id: ownerOf(line, "shared"), line })),
    };
  }

  // Regions. Located by their own markers rather than by position, because
  // `readNoteRegion` locates one by a whole-file scan and a region a reader
  // moved is still theirs.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^<!--almanac:([A-Za-z0-9_-]+)\s*$/);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() !== "-->") continue;
      shape.regions.set(m[1], { from: i, to: j });
      i = j;
      break;
    }
  }

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
  return ENTRY_SECTIONS.filter(
    (s) => directiveFor(s, { ...ctx, extra: [s.id] }) != null
  );
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
    ...(shape.shared?.body.map((b) => b.id).filter((id): id is string => id !== null) ?? []),
  ];
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
    (s) => !present.has(s.id) && s.fence === "shared"
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

  const adding: string[] = [];
  for (const id of wantIds) {
    if (present.includes(id)) continue;
    const section = byId.get(id);
    // Only the shared half can be added to. The two structural sections are
    // locked, which means they can neither leave nor arrive: an entry that
    // never had a banner is not an entry this catalogue wrote.
    if (!section || section.fence !== "shared") continue;
    if (directiveFor(section, { ...ctx, extra: [section.id] }) == null) continue;
    adding.push(id);
    ops.push({
      kind: "add",
      sectionId: id,
      label: section.label,
      detail: `adds ${section.label.toLowerCase()}`,
    });
  }

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
  const isShared = (id: string): boolean => byId.get(id)?.fence === "shared";
  const surviving = present.filter((id) => isShared(id) && wantIds.includes(id));
  const target = wantIds.filter(
    (id) => isShared(id) && (surviving.includes(id) || adding.includes(id))
  );
  ops.push(...moveOps(surviving, target, (id) => byId.get(id)?.label));

  // Anything in the widget fence the catalogue did not write, counted rather
  // than named: the reader knows what their own directives are, and the useful
  // fact is that the plan is not going to touch them.
  const foreign = shape.shared?.body.filter(
    (b) => b.id === null && b.line.trim() !== ""
  ).length ?? 0;
  if (foreign) {
    ops.push({
      kind: "foreign",
      sectionId: null,
      label: "—",
      detail: `${foreign} line${
        foreign === 1 ? "" : "s"
      } in this entry's widget fence aren't the catalogue's; left alone`,
    });
  }

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
  const removing = new Set(
    ops.filter((o) => o.kind === "remove").map((o) => o.sectionId as string)
  );
  const adding = ops
    .filter((o) => o.kind === "add")
    .map((o) => o.sectionId as string);
  const moving = ops.some((o) => o.kind === "move");
  const rewriting = new Set(
    ops
      .filter((o) => o.kind === "reconfigure")
      .map((o) => o.sectionId as string)
  );
  if (!removing.size && !adding.length && !moving && !rewriting.size) {
    return null;
  }

  const shape = parseEntry(text, ctx);
  const byId = new Map(offerableEntrySections(ctx).map((s) => [s.id, s]));
  const lines = text.split("\n");

  // A note with no widget fence is DECLINED, not repaired. Adding one would be
  // composing a structure into a file whose author may have removed it on
  // purpose, and the plan's §9 risk is precisely notes that have been
  // rearranged by hand.
  if (!shape.shared && (removing.size || adding.length)) return null;

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
  let sharedBody: string[] = [];
  if (shape.shared) {
    const kept = shape.shared.body
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
      kept.push({ id, line: directive });
    }
    const slots: number[] = [];
    kept.forEach((b, i) => {
      if (b.id !== null) slots.push(i);
    });
    const occupants = slots.map((i) => kept[i].id as string);
    const desired = desiredOrder(
      occupants,
      idsOf(want).filter((id) => byId.get(id)?.fence === "shared")
    );
    const byLine = new Map(slots.map((i) => [kept[i].id as string, kept[i]]));
    slots.forEach((slot, n) => {
      const wanted = byLine.get(desired[n]);
      if (wanted) kept[slot] = wanted;
    });
    sharedBody = kept.map((b) => b.line);
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
    if (shape.shared && i === shape.shared.open) {
      out.push(lines[i], ...sharedBody, lines[shape.shared.close]);
      i = shape.shared.close;
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
// `fence: "own" | "shared"` is a fact about which fence a directive is written
// into; what the reader sees is a horizontal rule with structure above it and
// their own writing below. The editor groups rows by this string and permits a
// reorder only within one — so the rule that a section cannot cross the rule is
// enforced by the model, stated in the UI, and needs no surface test in either.
const BANDS: Record<EntrySection["fence"], string> = {
  own: "Above the rule",
  shared: "Below the rule",
};

// TAKES THE CONTEXT, as of 3.8 patch 7, where it used to take a section alone.
//
// Everything else on a row is a property of the section: its label, its lock,
// its band. A QUESTION's answers are a property of the vault — which journal
// kinds exist right now — so this is the first field on the projection that
// cannot be computed from the catalogue entry, and the context is where the
// vault's half of it already lives.
const viewOf =
  (ctx: EntrySectionContext) =>
  (s: EntrySection): SectionView => {
    // SPREAD RATHER THAN SET-TO-UNDEFINED, so a section that asks nothing
    // carries no `questions` key at all rather than an empty one. The
    // difference is invisible to the editor — `?? []` reads both the same way —
    // and it is the whole of what `section-model.test.ts` can see: that suite
    // asserts the exact key set of every row, deliberately, so that a field
    // added to this projection without an argument fails a test. A key present
    // and undefined on all nine sections would have said "every section here
    // asks something" in the one place written to catch that claim.
    const questions = s.questions?.(ctx);
    return {
      id: s.id,
      label: s.label,
      blurb: s.blurb,
      icon: s.icon,
      removable: !s.locked,
      movable: isMovable(s),
      group: BANDS[s.fence],
      ...(questions?.length ? { questions } : {}),
    };
  };

// This entry, as the editor sees it.
export function entrySectionModel(ctx: EntrySectionContext): SectionModel {
  const find = (id: string): EntrySection | undefined =>
    offerableEntrySections(ctx).find((s) => s.id === id);
  return {
    sections: () => offerableEntrySections(ctx).map(viewOf(ctx)),
    present: (text) => detectEntrySections(text, ctx),
    addable: (text) => addableEntrySections(ctx, text).map(viewOf(ctx)),
    refusal: (id, text) => {
      const s = find(id);
      return s ? entryRemovalRefusal(s, text) : null;
    },
    plan: (text, want) => planEntrySections(text, ctx, want),
    apply: (text, want) => applyEntrySections(text, ctx, want),
  };
}
