// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  addableDiarySections,
  diarySectionModel,
} from "../diary/diary-sections";
import { entrySectionModel } from "../diary/entry-sections";
import { homeSectionModel } from "../diary/home-sections";
import { diaryDashboardSectionModel } from "../diary/diary-dashboard-sections";
import { journalsDashboardSectionModel } from "../journals/journals-dashboard-sections";
import { journalDashboardSectionModel } from "../journals/journal-dashboard-sections";
import { searchSectionModel } from "../diary/search-sections";
import type { EntrySectionContext } from "../diary/entry-sections";
import { isManagedTemplate } from "../trackers/entry-trackers";
import { openSectionEditor } from "./section-editor";
import { journalSectionModel } from "../journals/journal-plan";
import type { SectionModel, SectionWant } from "../core/section-model";
import type { VaultLists } from "../core/widget-registry";
import { logbookChoices } from "../diary/logbooks";
import {
  logbookSectionModel,
  logbooksFolderSectionModel,
} from "../diary/logbook-sections";
import type { LogbookDef } from "../core/constants";
import type {
  DiaryDashboardContext,
  DiarySection,
} from "../diary/diary-sections";
import { CLASS_DEFS, TRACKER_CLASSES, noteKindOf } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { wantFromEntry } from "../diary/entry-template";
import { surfacePathConfig } from "../trackers/entry-trackers";
import { JournalType, registeredJournalTypes } from "../journals/journal";
import {
  JournalSection,
  SectionContext,
  detectSections,
  sectionContext,
  sectionsFor,
} from "../journals/journal-sections";
import { promptChoice, promptDetailedSuggester, promptText } from "./modals";
import { ArgSuggest } from "./arg-suggest";
import { bridgeCatalogue } from "./widgets/bridge-widgets";
import { otherSurface } from "../core/bridge";
import { folderNotePath, getFile, openFile } from "../core/util";
import { openTemplateEditor } from "./template-editor";
import { splitLayoutTargets } from "../journals/journal-sections";
import { toPlainMarkdown } from "../core/plain-markdown";
import { notify } from "../core/notify";

// ── Add a section to this note ────────────────────────────────────────────
//
// The re-runnable half of the journal designer, and APPEND-ONLY BY
// CONSTRUCTION. That is the whole reason it can exist beside "a journal type's
// templates are the user's; nothing regenerates them": an operation that only
// ever adds cannot destroy a hand edit, so it does not reopen the constraint
// the wizard resolved by writing once.
//
// What that rules out is worth naming, because each of them looks like a small
// convenience and each is the constraint through a side door:
//
//   • inserting at a position — implies knowing where the other sections are,
//     which means parsing a file this code does not own;
//   • removing or reordering — implies rewriting around what it found;
//   • remembering what it added — implies a stored model of the note, and a
//     second representation of one artifact is a second thing to keep in sync.
//
// Moving the appended block is a cut and paste, and that is the correct amount
// of ceremony for something the plugin should not be managing.
//
// Works on a template or on a note directly, because both are just markdown
// and the directives do not care which they are in.

// One registered type with its two folders already resolved from settings, so
// the resolver below stays pure and testable.
export interface JournalHostRef {
  type: JournalType;
  root: string;
  templatesFolder: string;
}

// Which journal surface a note presents, or null for "don't know".
//
// Two passes, and both are needed. The PATH pass says which type's vocabulary
// to render with — a section has to name the type's own nouns and kinds, and
// there is nowhere else to learn them. Templates are matched as well as notes
// because a type's templates folder sits outside its root, so the root test
// alone would decline on exactly the files this command is most useful on.
//
// The `type` FRONTMATTER pass then says which surface: a level noun makes it
// an index at that depth, a kind makes it a leaf. Frontmatter rather than the
// folder-note rule (`basename === parent.name`) because a template is not in
// the folder it describes and would fail that test every time.
//
// Unrecognised returns null rather than guessing. Everywhere else in the
// plugin unclassified is permissive; here it cannot be, because the answer
// decides which sections get offered and a wrong guess writes a widget into
// someone's note.
export function resolveSectionHost(
  refs: JournalHostRef[],
  notePath: string,
  typeValue: unknown
): SectionContext | null {
  const value = typeof typeValue === "string" ? typeValue.trim().toLowerCase() : "";
  if (!value) return null;

  // Longest folder wins, the same rule journalTypeOfPath uses — a custom
  // journal's root sits inside the journals root that Study claims, so
  // registration order would resolve every custom note to Study.
  const owners = refs
    .flatMap((r) => [
      { ref: r, folder: r.root },
      { ref: r, folder: r.templatesFolder },
    ])
    .filter((o) => o.folder !== "" && notePath.startsWith(`${o.folder}/`))
    .sort((a, b) => b.folder.length - a.folder.length);

  for (const { ref } of owners) {
    const ctx = surfaceOf(ref.type, value);
    if (ctx) return ctx;
  }
  return null;
}

function surfaceOf(type: JournalType, value: string): SectionContext | null {
  const depth = type.levels.findIndex((lvl) => lvl.id === value);
  if (depth >= 0) return sectionContext(type, { depth });

  const kind = type.kinds.find((k) => k.id.toLowerCase() === value);
  if (kind) return sectionContext(type, { kind });

  // A page is a note with a body, so the sections that suit its parent mostly
  // suit it — but it is NOT its parent, and building its context with
  // `{ kind: owner }` said it was. That gave a page `hasPages: true` and
  // `isPage: false`, so this command offered a page the **Pages** section: a
  // second `pages-table` and a `button:new-page` spliced into a note that is
  // itself a page. `isPage: false` also meant the banner would seed a rating
  // grid there, against the catalogue's own rule that a page's ratings belong
  // to the note it is a page of — a per-page Confidence is how a note's
  // average starts counting its own parts as peers.
  //
  // sectionContext has had a `{ page }` branch since the catalogue existed and
  // templateTargets uses it correctly; this was the one caller that didn't.
  const owner = type.kinds.find((k) => k.pages?.id.toLowerCase() === value);
  if (owner) return sectionContext(type, { page: owner });

  return null;
}

// Append a rendered section to a note's markdown.
//
// One blank line between the existing content and the new block, and the file
// ends with exactly one newline. Nothing else is touched: no reflow, no
// reordering, no normalising of what was already there. A user who has
// hand-indented a fence or left three blank lines somewhere gets their file
// back with a block on the end of it.
export function appendSectionMarkdown(existing: string, block: string): string {
  const body = existing.replace(/\s+$/, "");
  const added = block.replace(/\s+$/, "");
  return body === "" ? `${added}\n` : `${body}\n\n${added}\n`;
}

// The sections this note can still be given: applicable to its surface, and
// not already on it.
//
// Already-present sections are withheld rather than offered and refused, and
// that is a correctness rule rather than tidiness. Every content field
// persists into a `<!--almanac:key-->` region keyed by name, so a second
// `recall:recall` would give two widgets one region and they would overwrite
// each other. Wanting two of something means two keys, which is a hand edit.
export function addableSections(
  ctx: SectionContext,
  text: string
): JournalSection[] {
  const present = new Set(detectSections(text, ctx));
  return sectionsFor(ctx).filter((s) => !present.has(s.id));
}

// What a note turned out to be, once.
//
// A DISCRIMINATED UNION rather than three nullable getters read in sequence at
// each call site, because reading them in sequence is what the two commands
// were doing and only one of them read all three. "managed" is a surface with
// no editor rather than an absence: an entry template is recognised perfectly
// well and refused for a reason worth stating.
export type ResolvedSurface =
  | { kind: "journal"; ctx: SectionContext }
  | { kind: "dashboard"; ctx: DiaryDashboardContext }
  | { kind: "entry"; ctx: EntrySectionContext }
  // THE HOMEPAGE, AS OF 3.11 §1. It carries no context at all — there is one
  // homepage, it has the sections it has, and nothing about it varies by
  // grain, kind or depth. That is why the variant has no `ctx` where the other
  // three do, and it is the shape of the note rather than an omission.
  // Carries the configured diary root, which is the one thing the homepage's
  // catalogue needs from outside itself — see `homeSections`.
  | { kind: "home"; diaryRoot: string }
  // AND THE SEARCH NOTE, on the same argument and with the same shape: one
  // configured file, no context, nothing about it that varies.
  | { kind: "search" }
  // THE TWO FOLDER-NOTE DASHBOARDS, AS OF 4.1 §2. Same shape as `search` and
  // for the same reason — one note each, no context, nothing that varies by
  // grain, kind or depth.
  //
  // NOT EVEN A ROOT, where `home` carries one. The homepage needs its diary
  // root because it sits at the vault root and its `tag-index` has to say which
  // folder it means; these two ARE the folder note of the root in question, so
  // every folder-scoped directive on them defaults to the right place by
  // sitting where it sits. That is the same property §2.5 uses to justify
  // deriving their paths, showing up a second time.
  | { kind: "diary-dashboard" }
  | { kind: "journals-dashboard" }
  // ONE JOURNAL'S OWN FOLDER NOTE, AS OF 4.36 §0.4 — and it carries a `ctx`
  // where the two above carry nothing.
  //
  // THE RESEMBLANCE IS THE MISLEADING PART, which is why this says so rather
  // than sitting quietly beside them. Those two are ONE note each: there is one
  // diary and one journals root, and nothing about either page varies. There are
  // N of these, and the catalogue is a function of the journal — its name is the
  // window's noun, and two of its sections name the journal in their directives.
  // So the shape here is `dashboard`'s, not `search`'s.
  | { kind: "journal-dashboard"; ctx: { type: JournalType } }
  // ONE LOGBOOK'S NOTE, AND THE NOTE ABOUT ALL OF THEM (4.52). The same pair of
  // shapes the journals half of the vault already has, one level down: N notes
  // whose catalogue is a function of which one, and one index page whose
  // catalogue is a function of the whole list.
  //
  // THE INDEX CARRIES THE LIST RATHER THAN NOTHING, which is where it differs
  // from `journals-dashboard` above. That page draws its journals through the
  // `journals` widget, which asks the plugin at render time; this one composes
  // one `logbook:` line per registered logbook, so the catalogue has to know
  // which ones exist.
  | { kind: "logbook"; ctx: { def: LogbookDef } }
  | { kind: "logbooks"; ctx: { books: readonly LogbookDef[] } }
  | { kind: "managed" };

// The surface, as the one interface sees it — and what to call it to a reader.
//
// THE NOUN IS NOT DECORATION. Every message these commands write names the
// thing being edited ("this Topic note", "this day's entry"), and a surface
// that could not supply one would send the picker out with "this note", which
// is what a reader is looking at and not what they need told.
// WHERE THE HOST FOLDER COMES FROM (3.15 §10.9), and it is the caller rather
// than the model because only the caller knows which file it opened. A folder
// question resolves its placeholder against this, and a question with nothing
// to resolve against stays inert — which is how a journal TEMPLATE, used in
// every folder of its level, never draws a control that would write one folder
// into all of them.
//
// Null is the honest answer for a template and for any caller with no file in
// hand. It is NOT the answer for the homepage, which sits at the vault root:
// that is the empty string, a folder that is known and happens to be spelled
// with nothing.
// WHERE THE VAULT'S OWN LISTS COME FROM (4.15 §4), and it is the caller for
// `hostFolder`'s reason one line down: only the caller knows which vault it is
// in. `widget-registry.ts` withheld five widgets from the add list because the
// window had no list of this vault's trackers, kinds or journals to ask with,
// and quoted the price of fixing it as widening `FlatNoteSpec` and threading the
// lists through the model constructors. This parameter is that thread.
//
// ABSENT IS A CALLER WITH NO VAULT IN HAND — a journal template, a test — and it
// is the same answer as a vault with nothing in it: the question is drawn as the
// sentence saying so rather than as an empty dropdown. Exactly the posture a
// null `hostFolder` already takes.
export function modelForSurface(
  surface: Exclude<ResolvedSurface, { kind: "managed" }>,
  hostFolder: string | null = null,
  vault?: VaultLists
): { model: SectionModel; noun: string } {
  if (surface.kind === "journal") {
    return {
      model: journalSectionModel({ ...surface.ctx, hostFolder }),
      noun: `${surface.ctx.ownNoun} note`,
    };
  }
  if (surface.kind === "dashboard") {
    return {
      // THE VAULT LISTS REACH THIS BRANCH AS OF 4.58.0. They were threaded to
      // the four flat surfaces in 4.15 and dropped here, because a period
      // dashboard had no widget to ask a question of. It has thirty now.
      model: diarySectionModel({ ...surface.ctx, hostFolder, vault }),
      noun: `${CLASS_DEFS[surface.ctx.grain].periodNoun} dashboard`,
    };
  }
  if (surface.kind === "home") {
    return {
      model: homeSectionModel(surface.diaryRoot, hostFolder, vault),
      noun: "homepage",
    };
  }
  if (surface.kind === "search") {
    return { model: searchSectionModel(vault), noun: "Search note" };
  }
  if (surface.kind === "logbook") {
    return {
      model: logbookSectionModel(surface.ctx.def, vault),
      noun: `${surface.ctx.def.name} logbook`,
    };
  }
  if (surface.kind === "logbooks") {
    return {
      model: logbooksFolderSectionModel(surface.ctx.books, vault),
      noun: "Logbooks note",
    };
  }
  if (surface.kind === "diary-dashboard") {
    return {
      model: diaryDashboardSectionModel(hostFolder, vault),
      noun: "diary dashboard",
    };
  }
  if (surface.kind === "journals-dashboard") {
    return {
      model: journalsDashboardSectionModel(hostFolder, vault),
      noun: "journals dashboard",
    };
  }
  if (surface.kind === "journal-dashboard") {
    // THE NOUN IS THE JOURNAL'S OWN NAME — "this Study dashboard", not "this
    // journal dashboard". Every message these commands write names the thing
    // being edited, and a vault with four journals has four of these pages: a
    // generic noun here would be the one surface whose sentence cannot tell a
    // reader which page they are on.
    return {
      model: journalDashboardSectionModel(surface.ctx.type, hostFolder, vault),
      noun: `${surface.ctx.type.name} dashboard`,
    };
  }
  return {
    model: entrySectionModel(surface.ctx),
    noun: `${CLASS_DEFS[surface.ctx.grain].adjective} entry`,
  };
}

// The two refusals both commands owe a reader, written once.
//
// They were duplicated between the two, and a message that exists twice is a
// message that gets improved once.
const UNRECOGNISED =
  "Almanac: this note isn't one a journal recognises. Open a journal note or one of its templates — the section list is built from that type's own levels and kinds.";

const MANAGED_TEMPLATE =
  "Almanac: this is an entry template — its sections are generated, so an edit here would be overwritten by the next refresh. Edit an entry instead.";

export class SectionInserter {
  constructor(private app: App, private plugin: AlmanacPlugin) {}

  // What this vault can answer a widget's argument with. 4.15 §4.
  //
  // ONE PLACE, TWO ROUTES. The editor and `addSectionHere` are two ways to one
  // write, and this file's own rule is that one knowing something its neighbour
  // does not is the drift that keeps costing a release — so both call sites take
  // the same lists from the same method.
  //
  // THE ID IS WHAT IS WRITTEN AND THE NAME IS WHAT IS SHOWN, which is the shape
  // `WidgetChoice` has everywhere: `journal-card:study` survives a journal being
  // renamed, and the dropdown still reads whatever it is called today.
  private vault(): VaultLists {
    return {
      journals: registeredJournalTypes(this.plugin).map((t) => ({
        value: t.id,
        label: `${t.emoji} ${t.name}`.trim(),
      })),
      logbooks: logbookChoices(this.plugin.settings.logbooks),
    };
  }

  private refs(): JournalHostRef[] {
    return registeredJournalTypes(this.plugin).map((type) => ({
      type,
      root: type.root,
      templatesFolder: type.templatesFolder,
    }));
  }

  // Open the section editor on this note or template.
  //
  // The successor to addSectionHere, and the reason that one is now the
  // fallback rather than the feature: appending was all an append-only
  // command could offer, and the header of this file spent three bullets
  // explaining why removal, positioning and memory were out of reach. They
  // were out of reach of *an append-only command with no preview and no
  // declared extents*. They are not out of reach of a planned, previewed,
  // consented edit over blocks a section declares — which is what 2.54.1 and
  // 2.54.2 built, and what this opens.
  //
  // Resolution is unchanged and still refuses rather than guessing: the answer
  // decides which sections are offered, and a wrong guess writes a widget into
  // someone's note.
  // Which journal surface a note presents, or null for "don't know".
  //
  // Public so the banner can ask before drawing anything. The alternative was
  // rebuilding the ref list at the call site, which is how the longest-folder
  // rule above comes to be implemented twice and then to disagree once — a
  // custom journal's root sits inside the journals root Study claims, so
  // registration order resolves every custom note to Study unless you know
  // that.
  //
  // Null is a real answer here and the banner treats it as one: it draws no
  // control at all rather than a menu that appears and then explains it cannot
  // help.
  // Whether this note is one the section editor will do anything for. 4.5.
  //
  // THE NARROWER QUESTION `contextFor` CANNOT ANSWER. That one resolves a
  // JOURNAL host and returns null for the homepage, Search and the two
  // dashboards — which are exactly the notes a page title card sits on. Both
  // `editSectionsHere` and `addSectionHere` already resolve the full surface
  // and already refuse politely; this is the same resolution asked BEFORE a
  // control is drawn, so a card on a note nothing recognises draws its title
  // and no cog rather than a cog that opens and then apologises.
  //
  // One line, and it must stay one line: the moment it grows a second opinion
  // about which notes are editable, it is a second resolver, which is what
  // `surfaceOfNote`'s own comment exists to prevent.
  canEditSections(notePath: string): boolean {
    return this.surfaceOfNote(notePath) !== null;
  }

  contextFor(notePath: string): SectionContext | null {
    const file = getFile(this.app, notePath);
    if (!file) return null;
    const raw = this.app.metadataCache.getFileCache(file)?.frontmatter?.["type"];
    return resolveSectionHost(this.refs(), notePath, raw);
  }

  // Which diary dashboard a note is, or null.
  //
  // The diary half of `contextFor`, added in 2.59.4 so the inserter reads BOTH
  // catalogues rather than only the journals'. Resolution goes through
  // `noteKindOf` — the one resolver from 2.59.1 — so this cannot drift from
  // what the tracker surfaces, the entry header and the bridge all believe
  // about the same note.
  //
  // ONLY A DASHBOARD, and only a folder note. A diary ENTRY has a template
  // rather than a catalogue, so there is nothing to offer it yet; and a note
  // that merely sits in a period folder is an entry, not the dashboard. Asking
  // `noteKindOf` for the grain and then checking the path against that grain's
  // folder note is what tells the two apart — the grain alone cannot, because
  // an entry and its dashboard share a folder.
  //
  // Null is a real answer, treated the way `contextFor` treats it: draw no
  // control rather than one that appears and then explains it cannot help.
  diaryContextFor(notePath: string): DiaryDashboardContext | null {
    const paths = surfacePathConfig(this.plugin);
    const kind = noteKindOf(paths, notePath);
    if (kind == null || kind.surface !== "diary") return null;
    if (kind.grain === "daily") return null; // no daily dashboard exists
    if (notePath !== folderNotePath(paths[CLASS_DEFS[kind.grain].folderKey])) {
      return null;
    }
    // `diaryRoot` because this is the caller that can supply it: the Tags
    // section (3.14 §3) writes the folder it reads into the note, and the
    // composer — which builds its context from a grain alone — never renders
    // that section because it is `optIn`. See `DiaryDashboardContext`.
    return {
      grain: kind.grain,
      diaryRoot: this.plugin.settings.paths.diaryRoot,
      // And `hostFolder` for the same reason one release later: this is the
      // caller that holds the note, so it is the one that can say what an empty
      // folder answer would resolve to on it.
      hostFolder: this.hostFolderOf(notePath),
    };
  }

  // What could still be added to this diary dashboard.
  async addableHere(notePath: string): Promise<DiarySection[]> {
    const ctx = this.diaryContextFor(notePath);
    const file = getFile(this.app, notePath);
    if (!ctx || !file) return [];
    return addableDiarySections(ctx, await this.app.vault.read(file));
  }

  // The folder an empty folder answer means, for the file at this path — or
  // null where there is no such folder.
  //
  // A TEMPLATE HAS NONE, and `isTemplate` is the discriminator rather than a
  // new one, because it is the question this file already had to answer. A
  // template's own parent is the templates directory, which is emphatically not
  // what a section written from it would read: the note it becomes lives in
  // whichever folder of the level it was created in. So the answer is "there
  // isn't one", the question stays inert, and nothing writes a path into a file
  // used in many places.
  hostFolderOf(notePath: string): string | null {
    if (this.isTemplate(notePath)) return null;
    const at = notePath.lastIndexOf("/");
    return at === -1 ? "" : notePath.slice(0, at);
  }

  // Whether a path is one of a registered journal's TEMPLATES rather than a
  // note. Both resolve to a surface — that is deliberate, and the reason
  // resolveSectionHost matches templates folders too — but only one of them can
  // usefully be told to preview what a repair would write.
  isTemplate(notePath: string): boolean {
    return this.refs().some(
      (r) =>
        r.templatesFolder !== "" &&
        notePath.startsWith(`${r.templatesFolder}/`)
    );
  }

  // Which diary ENTRY a note is, or null.
  //
  // The third resolver, and the last one this command needed. Goes through
  // `noteKindOf` like the other two, so it cannot drift from what the entry
  // header and the tracker surfaces believe about the same file.
  //
  // NOT A DASHBOARD, which is the one thing it has to get right: an entry and
  // its dashboard share a folder, so the grain alone cannot tell them apart.
  // `diaryContextFor` answers "is this the folder note", and this is the same
  // test read the other way round.
  entryContextFor(notePath: string): EntrySectionContext | null {
    const paths = surfacePathConfig(this.plugin);
    const kind = noteKindOf(paths, notePath);
    if (kind == null || kind.surface !== "diary") return null;
    if (this.diaryContextFor(notePath)) return null;
    // THE ANSWERS TO THE ONE QUESTION AN ENTRY SECTION ASKS, assembled here
    // because this is the first point in the chain that holds the plugin.
    //
    // `bridgeCatalogue` rather than a walk of `registeredJournalTypes` written
    // out again: it already dedupes ids across journals, already knows a page
    // is a kind with no date, and is the same function whose list a refusal
    // prints. Two walks would be two lists to keep agreeing, and the one thing
    // that function's own header asks for is that they not be written twice.
    //
    // The target surface is the JOURNALS' — a bridge reads the surface its host
    // is not on, and the host here is a diary entry. Said through
    // `otherSurface` rather than as the literal so it cannot drift from the
    // renderer's idea of the same join.
    return {
      grain: kind.grain,
      journalKinds: bridgeCatalogue(this.plugin, otherSurface("diary")).kinds,
    };
  }

  // WHICH SURFACE THIS NOTE IS, asked once.
  //
  // The three resolvers above answer three questions and both commands need
  // all three answers in the same order. Until 3.0.1 only `editSectionsHere`
  // asked them: `addSectionHere` resolved the journal host and stopped, so on
  // any diary note — a daily entry, a monthly dashboard — "Add a section to
  // this note…" answered "this note isn't one a journal recognises" while
  // "Edit this note's sections…" opened on the very same file. One command
  // knowing about a surface and its neighbour not is the drift a single
  // resolver exists to prevent, and having written the resolver for one caller
  // and not routed the other through it is how the gap got in.
  //
  // Returns the surface rather than a model, because the two callers want
  // different things from it: the editor needs a journal's `SectionContext` for
  // `isHandEdited` and for saving a variant, and the picker needs only a model
  // and a noun.
  private surfaceOfNote(notePath: string): ResolvedSurface | null {
    const file = getFile(this.app, notePath);
    if (!file) return null;
    const raw = this.app.metadataCache.getFileCache(file)?.frontmatter?.["type"];
    const ctx = resolveSectionHost(this.refs(), notePath, raw);
    if (ctx) return { kind: "journal", ctx };

    // BY PATH, AND BEFORE THE DIARY RESOLVERS. The homepage is one configured
    // file rather than a member of a family, so there is nothing for
    // `noteKindOf` to classify — it sits outside every diary folder and would
    // fall through all three of the existing questions, which is exactly how
    // it came to be unrecognised.
    //
    // The path is read from settings rather than from DEFAULT_PATHS, because
    // Settings → Paths lets a reader move it and every other resolver in this
    // file follows the configured value.
    if (notePath === this.plugin.settings.paths.home) {
      return { kind: "home", diaryRoot: this.plugin.settings.paths.diaryRoot };
    }
    if (notePath === this.plugin.settings.paths.search) return { kind: "search" };

    // THE LOGBOOKS (4.52), BY THE PATH ON THE DEF — the one identity in this
    // resolver that is neither a settings key nor derived from a folder.
    // `LogbookDef.path` is stored so that retitling a logbook does not orphan a
    // note full of items, and the consequence shows up here: the note is found
    // by the string the registry holds rather than by anything about the file.
    //
    // BEFORE THE DIARY RESOLVERS BELOW, and it matters. A logbook lives under
    // the diary root, so `entryContextFor` is the next thing that would be asked
    // about it — and `page-head.ts` records what that costs: a note in no grain
    // folder falls back to `daily`, which is a confident wrong answer rather
    // than a missing one. Here it would offer the DAILY ENTRY catalogue on a
    // work log.
    const books = this.plugin.settings.logbooks;
    const book = books.find((b) => b.path === notePath);
    if (book) return { kind: "logbook", ctx: { def: book } };
    // And the page about all of them — derived from the folder, like the two
    // dashboards below, so it moves with a rename and needs no path key.
    if (books.length > 0 && notePath === folderNotePath(this.plugin.settings.paths.logbooks)) {
      return { kind: "logbooks", ctx: { books } };
    }

    // THE TWO FOLDER-NOTE DASHBOARDS (4.1 §2), beside the other two notes
    // identified by path rather than by classification.
    //
    // DERIVED FROM THE CONFIGURED ROOTS rather than read from a settings key of
    // their own, which is §2.5's decision and the reason this needs no
    // `remapConfiguredPaths` case: rename `02 - Diary` in the file explorer,
    // `paths.diaryRoot` follows through the existing remap, and this expression
    // follows it. There is no fifth path key and nothing new in
    // `FILE_PATH_KEYS`.
    //
    // AFTER THE JOURNAL RESOLVER, matching the homepage and Search above. The
    // ordering is only observable if a reader roots a journal AT the journals
    // root itself, in which case that journal's index wins here while repair
    // still composes the dashboard into the same file. The journal creation UI
    // derives a root of `${journalsRoot}/${name}` and so cannot produce it;
    // it is reachable only by editing the root by hand, and the honest note is
    // that the two would then disagree about what that file is.
    const paths = this.plugin.settings.paths;
    if (notePath === folderNotePath(paths.diaryRoot)) {
      return { kind: "diary-dashboard" };
    }
    if (notePath === folderNotePath(paths.journalsRoot)) {
      return { kind: "journals-dashboard" };
    }

    // AND ONE PER REGISTERED JOURNAL (4.36 §0.4), beside the two above and
    // derived the same way — `folderNotePath(type.root)`, so a renamed journal
    // folder brings its page along and there is no fifth path key.
    //
    // AFTER THOSE TWO, WHICH IS THE TIE-BREAK. A journal rooted exactly AT the
    // journals root would otherwise take that page's identity away from it. The
    // paragraph above describes the same collision from the other side and
    // settles it the same way: the arrangement is reachable only by editing a
    // root by hand, and the honest note is that the two pages would then
    // disagree about what that file is. The established page keeps its path.
    //
    // IT ALSO SITS AFTER `resolveSectionHost`, WHICH CANNOT MATCH IT. That
    // resolver needs a `type:` frontmatter value naming a level or a kind, and
    // this page is composed by `composeFlatNote`, which writes no frontmatter at
    // all. The ordering is therefore belt rather than braces — but the property
    // it depends on is asserted, because a page that grew a `type:` line would
    // silently start being offered the journal NOTE catalogue instead of its
    // own.
    for (const type of registeredJournalTypes(this.plugin)) {
      if (notePath === folderNotePath(type.root)) {
        return { kind: "journal-dashboard", ctx: { type } };
      }
    }

    const dash = this.diaryContextFor(notePath);
    if (dash) return { kind: "dashboard", ctx: dash };

    const entry = this.entryContextFor(notePath);
    if (entry) {
      // A MANAGED TEMPLATE IS REFUSED on both commands, and for the reason it
      // is refused on either: an entry template is COMPOSED from the catalogue
      // since 2.60.1 and rewritten by "Refresh entry templates", so a section
      // written into one would survive until the next refresh and then vanish
      // with no explanation.
      if (isManagedTemplate(this.plugin, notePath)) return { kind: "managed" };
      return { kind: "entry", ctx: entry };
    }
    return null;
  }

  async editSectionsHere(notePath: string): Promise<void> {
    const file = getFile(this.app, notePath);
    if (!file) {
      new Notice("Open a note first.");
      return;
    }

    const surface = this.surfaceOfNote(notePath);
    if (!surface) {
      new Notice(UNRECOGNISED);
      return;
    }
    if (surface.kind === "managed") {
      new Notice(MANAGED_TEMPLATE);
      return;
    }

    // The journal goes through `openTemplateEditor` rather than straight to the
    // editor, because two facts in that window are journal-shaped and cannot be
    // asked of the interface: whether the file still matches what the catalogue
    // would compose, and how to store an arrangement as a kind's saved layout.
    if (surface.kind === "journal") {
      const ctx = {
        ...surface.ctx,
        hostFolder: this.hostFolderOf(notePath),
      };
      // THE SECOND DOOR ONTO "Save as layout…" (3.18 §6). The button is the
      // section editor's and has existed since 3.0; until now only the settings
      // rail passed the callback that makes it appear, so a reader arranging a
      // note in front of them could not keep the arrangement.
      //
      // PASSED UNCONDITIONALLY SINCE 4.33. It used to be gated on
      // `variantEligible`, which refused an index and a page; all three note
      // kinds can carry a layout now, so the gate became a tautology and was
      // deleted rather than left as a function that always says yes. See the
      // note where it used to live in template-editor.ts.
      await openTemplateEditor(
        this.app,
        this.plugin,
        notePath,
        ctx,
        undefined,
        (label, sections, options, targets) => {
          const split = splitLayoutTargets(
            ctx.type.kinds.map((k) => k.id),
            targets
          );
          return this.plugin.journals.saveVariant(
            ctx.type.id,
            label,
            sections,
            options,
            split.kinds,
            split.surfaces
          );
        }
      );
      return;
    }

    // ONE EDITOR, THREE MODELS. Nothing here picks a window; it picks which
    // model to hand the window, which is the whole of §2's claim made
    // operational.
    await openSectionEditor(this.app, this.plugin, notePath, {
      model: modelForSurface(surface, this.hostFolderOf(notePath), this.vault())
        .model,
      // THE SECOND DOOR ONTO SAVING A DIARY LAYOUT (4.29), and the seam it uses
      // is the one 3.0 built agnostic and 3.18 gave a single caller. A reader
      // who has just dragged an entry's sections into the order they want is
      // standing in the window where that arrangement exists and nowhere else;
      // until now the only way to keep it was to close this, open the cog again
      // and pick Template.
      //
      // ONE FUNCTION, TWO DOORS — `entryTemplates.saveLayout` is what the
      // Template window calls too. The journal side set exactly this precedent
      // when the settings rail and the banner both gained "Save as layout…".
      //
      // THE TARGETS ARE THE FIVE GRAINS, which is what makes this the diary's
      // own version of the same control rather than a copy: a journal offers a
      // layout to its kinds, and a grain's neighbours are the other grains.
      ...(surface.kind === "entry"
        ? {
            arrangement: {
              buttonLabel: "Save as layout…",
              promptTitle: "Save as layout",
              promptPlaceholder: "e.g. Quiet Monday",
              targets: TRACKER_CLASSES.map((g) => ({
                id: g,
                label: CLASS_DEFS[g].label,
              })),
              originTarget: surface.ctx.grain,
              save: async (
                label: string,
                sections: string[],
                targets: string[]
              ): Promise<void> => {
                // The window hands back ids and knows nothing about what they
                // are, which is its contract. The options are resolved from the
                // FILE rather than carried through the modal, exactly as the
                // journal caller resolves its overrides from the context: an
                // answer is a property of the note, and the agnostic window has
                // no business learning what a bridge target is.
                const file = getFile(this.app, notePath);
                const text = file ? await this.app.vault.read(file) : "";
                const { want } = wantFromEntry(text, surface.ctx);
                const options = new Map(want.map((w) => [w.id, w.options]));
                await this.plugin.entryTemplates.saveLayout(
                  label,
                  sections.map((id) =>
                    options.get(id) ? { id, options: options.get(id) } : { id }
                  ),
                  targets.filter((t): t is TrackerClass =>
                    (TRACKER_CLASSES as readonly string[]).includes(t)
                  )
                );
              },
            },
          }
        : {}),
    });
  }

  // Add one section, with no removals and no reordering.
  //
  // THE RE-RUNNABLE HALF, and it stays beside the editor rather than being
  // subsumed by it: it is one keystroke for the common case and it cannot take
  // anything out, which is occasionally the reason to reach for it.
  //
  // ROUTED THROUGH THE MODEL AS OF 3.0.1, which is both the bug fix and the
  // reason the bug is not going to recur. It resolved a journal host and
  // stopped, so every diary note got "this note isn't one a journal
  // recognises" from this command while the neighbouring one opened an editor
  // on the same file. Fixing that by adding two diary branches here would have
  // put the third copy of the routing in the file — so there is one copy, in
  // `surfaceOfNote`, and both commands read it.
  //
  // STILL NON-DESTRUCTIVE, and now by construction rather than by being
  // written in terms of an append. The request handed to `apply` is everything
  // the note already has PLUS one, so the plan it is checked against can
  // contain no `remove` and no `move` — there is nothing for either to act on.
  // That is a stronger guarantee than "this function only appends", because it
  // is a property of the request rather than of the implementation.
  //
  // WHERE THE BLOCK LANDS is now the catalogue's business rather than this
  // command's. Each one has already argued its own answer: a journal anchors
  // the insertion to the sections the file actually has, an entry writes at the
  // end of the widget fence because a reader who rearranged their entry
  // arranged it. This used to append to the end of the file for all of them,
  // which on an entry would have put a fence below the reader's regions.
  // This page, on the clipboard, as markdown anybody can read (4.30).
  //
  // HERE RATHER THAN IN A MODULE OF ITS OWN, because the one thing it needs
  // that a pure function cannot have is `surfaceOfNote` — and that is PRIVATE.
  // Exporting it so a new file could resolve a surface too would put a second
  // copy of "what kind of note is this" in the vault, which is `RESUME §5`
  // 1c-iii's scar exactly: two correct copies of a lookup did not make a third
  // correct, and an entry banner printed "Daily" where a date belongs. The
  // method goes where the lookup already is.
  //
  // WRITES NOTHING. No settings key, no file, no folder, no migration — which
  // is the whole of the claim that this is reversible by not pressing it, and
  // the reason it needs no confirmation where 4.29's reload needed one.
  //
  // A MANAGED TEMPLATE IS NOT REFUSED, unlike the two commands above it. They
  // refuse because an edit there is overwritten by the next refresh; this reads
  // and copies, so there is nothing to lose and no reason to decline. An entry
  // template's export is its empty fields, which is a truthful answer.
  async copyPlainMarkdownHere(notePath: string): Promise<void> {
    const file = getFile(this.app, notePath);
    if (!file) {
      new Notice("Open a note first.");
      return;
    }

    const resolved = this.modelForNote(notePath);
    if (!resolved) {
      new Notice(UNRECOGNISED);
      return;
    }
    await this.copyAsPlainMarkdown(file, resolved.model);
  }

  // What catalogue reads this note, and which of the seven surfaces it is.
  //
  // THE ONE DOOR ONTO `surfaceOfNote` FOR EVERYTHING THAT ONLY READS (4.31).
  // The clipboard copy asked it directly until this release, and the vault
  // export would have been a fifth caller — so the question is asked once, here,
  // and both go through it. `diary-sections.test.ts` counts the call sites and
  // its own comment records that the total has broken twice before when a new
  // caller appeared; this release adds a feature and does not move the count.
  //
  // A MANAGED TEMPLATE RESOLVES rather than being turned away. `modelForSurface`
  // excludes it by TYPE, because the two editing commands refuse one — and they
  // refuse a WRITE that the next refresh would undo. A read has nothing to lose,
  // and an entry template's export is its empty fields, which is truthful.
  modelForNote(
    notePath: string
  ): { model: SectionModel; surface: ResolvedSurface["kind"] } | null {
    const surface = this.surfaceOfNote(notePath);
    if (!surface) return null;
    if (surface.kind === "managed") {
      const ctx = this.entryContextFor(notePath);
      return ctx
        ? { model: entrySectionModel(ctx), surface: "managed" }
        : null;
    }
    return {
      model: modelForSurface(surface, this.hostFolderOf(notePath), this.vault())
        .model,
      surface: surface.kind,
    };
  }

  // The read, the write to the clipboard and the notice — one copy of them, for
  // the two doors above.
  private async copyAsPlainMarkdown(file: TFile, model: SectionModel): Promise<void> {
    const markdown = toPlainMarkdown(await this.app.vault.read(file), model);
    await navigator.clipboard.writeText(markdown);
    // Says HOW MUCH, because a copy that produced only frontmatter is a page
    // nobody has written in yet, and a bare "Copied." would leave the reader to
    // find that out in the paste.
    const sections = markdown.split("\n").filter((l) => /^#{2,3}\s/.test(l)).length;
    notify.ok(
      sections === 0
        ? "Copied as plain markdown — there is no writing on this page yet."
        : `Copied as plain markdown — ${sections} section${sections === 1 ? "" : "s"}.`
    );
  }

  async addSectionHere(notePath: string): Promise<void> {
    const file = getFile(this.app, notePath);
    if (!file) {
      new Notice("Open a note first.");
      return;
    }

    const surface = this.surfaceOfNote(notePath);
    if (!surface) {
      new Notice(UNRECOGNISED);
      return;
    }
    if (surface.kind === "managed") {
      new Notice(MANAGED_TEMPLATE);
      return;
    }

    const { model, noun } = modelForSurface(
      surface,
      this.hostFolderOf(notePath),
      this.vault()
    );
    const text = await this.app.vault.read(file);
    const options = model.addable(text);
    if (options.length === 0) {
      new Notice(
        `Almanac: this ${noun} already has every section the catalogue offers.`
      );
      return;
    }

    // KEEPS ASKING AT ONE, for a different reason from the tracker remover:
    // this is not destructive, but the section IS what the reader asked for
    // rather than bookkeeping around it. Taking the last remaining option would
    // write a block into their note without ever naming it. See modals.ts::only.
    const chosen = await promptDetailedSuggester(
      this.app,
      options.map((s) => ({
        value: s.id,
        label: `${s.icon} ${s.label}`,
        description: s.blurb,
      })),
      `Add a section to this ${noun}…`
    );
    if (!chosen) return;

    // THE SAME QUESTIONS THE EDITOR ASKS, ASKED THE SAME WAY.
    //
    // This command and the editor are two routes to one write, and 3.0.1's
    // lesson about them is the reason this is here rather than only there: when
    // `addSectionHere` resolved a journal host and stopped, every diary note got
    // a refusal from this command while the neighbouring one opened an editor on
    // the same file. One command knowing something its neighbour does not is the
    // drift that keeps costing a release.
    //
    // So a section that cannot render without an answer is not addable without
    // one from here either — otherwise the empty `bridge-notes:` this patch
    // exists to prevent would simply move one menu over.
    //
    // ABANDONED RATHER THAN DEFAULTED at every exit. A reader who dismisses the
    // second picker has not asked for a half-configured block, and the vault
    // having nothing to answer with is a refusal that names what is missing —
    // the catalogue wrote that sentence for exactly this.
    const questions = options.find((s) => s.id === chosen)?.questions ?? [];
    const answers: Record<string, unknown> = {};
    for (const q of questions) {
      // A FOLDER QUESTION IS ASKED HERE TOO, and in this command's own idiom.
      //
      // The rule above is why: two routes, one write, and the drift between
      // them is what keeps costing a release. But a text field in a row is not
      // available here — this command has no rows — so the question is asked
      // the way this command asks everything else, in a prompt, with the same
      // type-ahead attached to it that the editor puts in its field.
      //
      // ABANDONING IS NOT ANSWERING EMPTY, which is the one place this differs
      // from the editor: there, an untouched folder field means the default and
      // the section is added with it. Here, dismissing a prompt is dismissing
      // the command — `promptText` returns null and this returns with it —
      // because a reader who pressed Escape did not ask for a block scoped to
      // anything. Confirming an empty field is still the default, and is a
      // different gesture.
      if (q.kind === "folder") {
        const answer = await promptText(
          this.app,
          `Choose ${q.label}…`,
          q.hostFolder ?? "",
          "",
          {
            description: q.hostFolder
              ? `Leave empty for this note's own folder (${q.hostFolder}).`
              : "Leave empty for this note's own folder.",
            attach: (input, onPick) => {
              new ArgSuggest(this.app, input, q.keywords ?? [], onPick);
            },
          }
        );
        if (answer === null) return;
        answers[q.key] = answer.trim();
        continue;
      }
      // A title asked at ADD time is skipped rather than prompted for: the
      // section is about to be written with the catalogue's own heading, which
      // is the answer "empty" means, and the reader can rename it in the editor
      // the moment it is there. One prompt per section added is the budget this
      // command has always kept — it is the one-keystroke route (§"the
      // re-runnable half"), and a title is the change least worth spending it
      // on, being the one that costs nothing to make later.
      if (q.kind === "title") continue;
      // A form is skipped at ADD time on the title's argument exactly (4.59.0),
      // and one step stronger. The section is about to be written in the form
      // the catalogue composes — with its bar — which is the answer an
      // unanswered form means; and the reason to change it is a LAYOUT the
      // reader has not built yet, since a widget form exists to join a group and
      // there is nothing to join it to at the moment it is added. The toggle is
      // in the editor, beside the arrows that would move it there.
      if (q.kind === "form") continue;
      if (!q.values.length) {
        new Notice(`Almanac: ${q.empty}`);
        return;
      }
      // `promptChoice` rather than the suggester above it, because two
      // journals may label a kind identically while defining different ids —
      // this is the `items[labels.indexOf(chosen)]` failure that helper was
      // written to remove, and an answer that resolves to the wrong kind writes
      // a bridge that reads the wrong notes.
      const answer = await promptChoice(
        this.app,
        [...q.values],
        (v) => v.label,
        `Choose ${q.label}…`
      );
      if (!answer) return;
      answers[q.key] = answer.value;
    }
    const want: SectionWant = Object.keys(answers).length
      ? { id: chosen, options: answers }
      : chosen;

    // Re-read rather than reusing the copy taken before the picker opened. A
    // suggester is modal but not instantaneous, and writing a stale body back
    // would silently drop anything that arrived from sync in between.
    const current = await this.app.vault.read(file);
    const next = model.apply(current, [...model.present(current), want]);
    if (next === null) {
      // Null means the plan found nothing to do — the section arrived from
      // sync while the picker was open, or the note has no fence to write into.
      // Either way the honest answer is that nothing was written.
      new Notice("Almanac: nothing to add — this note already has that section.");
      return;
    }
    await this.app.vault.modify(file, next);

    const label = options.find((s) => s.id === chosen)?.label ?? chosen;
    notify.ok(`Almanac: ${label} added to this note`);
    await openFile(this.app, file as TFile);
  }

  // Add ONE NAMED diary section, with no picker.
  //
  // The third route to the same write, and the narrowest. `editSectionsHere`
  // opens the editor, `addSectionHere` asks which one; this is for a caller
  // that already knows — today, the "the recap moved" row on the year and
  // quarter banners, where the reader has been told exactly what the button
  // adds and asking them again would be a picker with one interesting entry.
  //
  // NON-DESTRUCTIVE BY CONSTRUCTION, and by the same argument `addSectionHere`
  // makes: the request is everything the note already has PLUS one, so the plan
  // it is checked against can contain no `remove` and no `move` — there is
  // nothing for either to act on. That is a property of the request rather than
  // of this function, which is what makes it worth saying.
  //
  // ROUTED THROUGH THE SAME MODEL, so placement is the catalogue's business
  // here exactly as it is there: the block lands where `insertionPoint` puts
  // it, anchored to the sections the file actually has, and a reader who
  // rearranged their dashboard keeps their arrangement.
  //
  // REFUSES QUIETLY. Every exit here is reachable by clicking a button on a
  // note, not by invoking a command — so a failure is reported once, in a
  // sentence, and never as a modal the reader did not open.
  async addDiarySectionHere(notePath: string, sectionId: string): Promise<void> {
    const ctx = this.diaryContextFor(notePath);
    const file = getFile(this.app, notePath);
    if (!ctx || !file) return;

    const model = diarySectionModel(ctx);
    const current = await this.app.vault.read(file);
    if (!model.addable(current).some((s) => s.id === sectionId)) {
      // Already present, or not offered on this grain. Both mean the button
      // should not have been there, and neither is worth a notice.
      return;
    }

    const next = model.apply(current, [...model.present(current), sectionId]);
    if (next === null) {
      new Notice("Almanac: nothing to add — this note already has that section.");
      return;
    }
    await this.app.vault.modify(file, next);
    notify.ok("Almanac: Recap added to this note");
  }

}
