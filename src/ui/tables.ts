// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The three widgets that replace the vault's `dataviewjs` blocks:
//   tag-index          a frequency-sized tag cloud, scoped to a folder for
//                       counting but searching the whole vault on click
//   topics-table        per-topic rollup (lesson/practice counts, activity, open tasks)
//   confidence-summary   avg/latest/count confidence across lessons in scope
//
// Same pattern as calendar.ts / nav.ts: read straight from metadataCache via
// query.ts, build DOM by hand, no Dataview dependency. Each is wrapped in a
// LiveWidget by widgets.ts so it refreshes when anything in its scope
// changes, not just the host note itself.

import { SCOPE_JOURNAL } from "../core/directive-grammar";
import { App, MarkdownPostProcessorContext, normalizePath, setIcon, TFile, TFolder } from "obsidian";
import type AlmanacPlugin from "../main";
import { childFiles, filesUnder, frontmatterOf, getFile, isoDate, moment, noExt, openFile, openGlobalSearch } from "../core/util";
import { pagesUnder, recencyMs, relativeActivity, tagsOf } from "../core/query";
import type { PageInfo } from "../core/query";
import { formatPeriodLabel } from "../charts/charts";
import type { PeriodBounds } from "../charts/charts";
import { allNoteRegions, writeNoteRegion } from "../core/notestore";
import { TrackerDef, getBuiltinTracker } from "../trackers/trackers";
// Owned by empty.ts since 2.55.3 and re-exported here, because a dozen widget
// modules already import it from this one and moving the import site adds churn
// to a patch that is about the copy rather than the plumbing.
import { emptyCallout, emptyLine } from "./empty";
import { createListRow } from "./list-row";
import { sectionFrame, splitGlyph } from "./section-frame";
import { statStrip } from "./stat-strip";
import type { StatCard } from "./stat-strip";
export { emptyCallout, emptyLine };
import {
  JournalKind,
  JournalType,
  folderEmoji,
  getJournalType,
  hueOf,
  journalChildFolders,
  journalTypeOfNote,
  kindsCarrying,
  registeredJournalTypes,
} from "../journals/journal";
import { kindPlural, plural, typeRating } from "../journals/journal-sections";
import { journalChartRefusal, journalTallyRefusal, summarize } from "../charts/charts";
import { partsOf } from "../core/section-model";
import {
  describeSurface,
  getTracker,
  isJournalSurface,
  parseSelectOptions,
  surfaceAcceptsType,
} from "../trackers/trackers";
import { journalTypeNamer } from "../trackers/entry-trackers";
import {
  AlmanacTask,
  parseTasks,
  serializeTaskLine,
  serializeTasks,
  TaskPriority,
} from "./tasks";


// A clickable internal link to `file`, with the same hover-preview wiring
// nav.ts's pills use.
function internalLink(
  parent: HTMLElement,
  app: App,
  file: TFile,
  text: string,
  sourcePath: string
): HTMLElement {
  const href = noExt(file.path);
  const a = parent.createEl("a", {
    cls: "internal-link",
    text,
    href,
    attr: { "data-href": href },
  });
  a.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(app, file);
  });
  a.addEventListener("mouseover", (evt) => {
    app.workspace.trigger("hover-link", {
      event: evt,
      source: "almanac-tables",
      hoverParent: parent,
      targetEl: a,
      linktext: href,
      sourcePath,
    });
  });
  return a;
}

// A link to a container folder's index note ("Maths/Maths.md").
//
// MOVED HERE FROM `journals-section.ts` IN 4.36, unchanged in what it draws.
// Two widgets now put a container's name on a card — the `journals` card and
// `level-cards` — and `journals-section.ts` already imports from this file, so
// this is the only home the two can share without a cycle.
//
// Falls back to plain text when the index note is missing, which happens if
// someone made the folder by hand — better a visible, unclickable name than a
// dead link.
//
// ON `internalLink`, WHICH WAS ALREADY HERE. The original was a second copy of
// that function's hover-preview wiring with a different `source` string; the
// only thing genuinely its own is the orphan branch and the class it puts on the
// anchor. What is left is the difference rather than a restatement.
export function folderLink(
  plugin: AlmanacPlugin,
  parent: HTMLElement,
  folder: TFolder,
  sourcePath: string,
  cls: string,
  // What the link SAYS, when that is not the folder's own name (4.42).
  //
  // A container is named by its folder and there is nothing else it could be
  // called; a JOURNAL has a display name in settings — "Exercise & Diet" — over
  // a folder that may be called something else entirely, and the head has always
  // shown the display name. Without this the journal's title would rename itself
  // the moment it became a link, which is a worse bug than the one being fixed.
  //
  // AN OVERRIDE AND NOT A SECOND FUNCTION: what makes this worth sharing is the
  // `stopPropagation` below, and a copy written for the journal head is a copy
  // that will be missing it the first time somebody moves the fold.
  text?: string
): void {
  const label = text ?? folder.name;
  const file = getFile(plugin.app, `${folder.path}/${folder.name}.md`);
  if (!file) {
    parent.createSpan({ cls: `${cls} is-orphan`, text: label });
    return;
  }
  const a = internalLink(parent, plugin.app, file, label, sourcePath);
  a.addClass(cls);
  // STOPPED HERE AS WELL AS DEFAULTED. A card's head is a fold target in the
  // `journals` card, so a click that opened the subject and ALSO folded its
  // journal would do two things for one press. `internalLink` only prevents the
  // default.
  a.addEventListener("click", (evt) => evt.stopPropagation());
}

// One child inside a container's card: its name, when it was last worked, and
// what is open beneath it.
//
// MOVED HERE FROM `journals-section.ts` IN 4.36, where it was `topicRow` and
// private. Two widgets draw this row now, and 4.13.3's own sentence is the
// argument for sharing exactly this much and no more: the `journals` card fuses
// the head and this list into ONE card and `level-cards` splits them into a
// pair, so what the two share is not the card — it is *"the thing that actually
// mattered: the NUMBERS"*.
//
// RENAMED FROM `topicRow`, because "topic" is Study's word for its second level
// and this draws whatever the journal calls that thing — a Project, a Dish, a
// Title. The old name was the last of the Study literals in this row.
//
// A FUNCTION FOR TWO CALLERS, and it was worth naming when it had one: what it
// is is the SHAPE of a line in a card — a link, a relative date, and a count
// that arrives late — and the async fill at the end is the part a second copy
// would get wrong.
export function childRow(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  body: HTMLElement,
  sub: TFolder
): void {
  const { pages, lastActive } = folderActivity(plugin.app, sub.path);
  const row = body.createDiv({ cls: "jjs-card-row" });
  folderLink(plugin, row, sub, ctx.sourcePath, "jjs-row-link");
  // NAMED, BECAUSE THE GLYPHS ONLY EXPLAIN THEMSELVES ONCE THERE IS DATA
  // (4.35.2). Populated, these two read "3d ago" and "2 ◻" and need no header.
  // Empty — which is every row on a journal a reader has just made — they are
  // two bare em dashes with nothing to say which is which, and a screen reader
  // heard "dash dash" in either state, since neither cell carried a name.
  //
  // A `title` rather than a header row: the body's height is stated in ROWS
  // (see `.jjs-card-body`), so a header would cost one of the four notes a card
  // can show. This costs nothing and is also the accessible fix.
  const when = row.createSpan({
    cls: "jjs-card-when",
    text: relativeActivity(lastActive),
  });
  when.setAttr("title", "Last activity");
  when.setAttr(
    "aria-label",
    lastActive
      ? `Last activity: ${relativeActivity(lastActive)}`
      : "Last activity: none yet"
  );
  // An Almanac `- ( )` line lives in a note's BODY and is invisible to the
  // metadata cache, so this cell cannot be filled synchronously. It ships a
  // placeholder and fills on resolve — the idiom the banner's four numbers and
  // the level index's Open column both use.
  const openCell = row.createSpan({ cls: "jjs-card-open", text: "…" });
  openCell.setAttr("title", "Open tasks");
  openCell.setAttr("aria-label", "Open tasks: counting…");
  void sumBodyTasks(
    plugin.app,
    pages.map((p) => p.file)
  ).then(({ open }) => {
    // The host may have been torn down, or the LiveWidget rebuilt, while the
    // reads were in flight — `buildJournalsHeader` guards its own fills the same
    // way and for the same reason.
    if (!openCell.isConnected) return;
    openCell.setText(open ? `${open} ◻` : "—");
    // The label is rewritten with the text, so it never describes the
    // placeholder the cell shipped with.
    openCell.setAttr(
      "aria-label",
      open === 0
        ? "No open tasks"
        : `${open} open ${open === 1 ? "task" : "tasks"}`
    );
    openCell.toggleClass("is-zero", open === 0);
  });
}

function hostFile(app: App, ctx: MarkdownPostProcessorContext): TFile | null {
  const f = app.vault.getAbstractFileByPath(ctx.sourcePath);
  return f instanceof TFile ? f : null;
}

// ── tag-index ─────────────────────────────────────────────────────────
// Where a tag's notes live, relative to the scope the section reads.
//
// THE FIRST PATH SEGMENT BENEATH THE SCOPE, NOT THE NOTE'S OWN PARENT, and
// that is the whole of the rule (3.14 §4.1). Under `03 - Journals` it reads
// `Mathematics`, `Physics`, `Cooking` — the journals. Under the diary root it
// reads `Daily`, `Weekly`, `Monthly`. The note's parent would give one value
// per topic folder, so a mature journals root renders forty of them, which is
// noise wearing a column heading.
//
// A note sitting DIRECTLY in the scope has no source: it is not beneath
// anything, it is in the thing itself. That is what makes the column
// self-retiring — where the scope is a leaf folder every note is direct, the
// set comes back empty, and the caller draws no column rather than one saying
// the same word on every row.
//
// Pure, and separated from the drawing for `computeFoldHidden`'s reason: the
// interesting half is a string rule over paths, and a rule that can be
// asserted is worth more than one that can be eyeballed on a dashboard.
export function tagSourcesOf(
  paths: readonly string[],
  scope: string
): string[] {
  const root = scope.replace(/\/+$/, "");
  const out = new Set<string>();
  for (const path of paths) {
    // A path outside the scope is not this section's to describe. It cannot
    // happen through `pagesUnder`, and saying so here costs one comparison and
    // means the function is total rather than trusting its caller.
    const rel = root === "" ? path : path.startsWith(`${root}/`)
      ? path.slice(root.length + 1)
      : null;
    if (rel == null) continue;
    const cut = rel.indexOf("/");
    if (cut === -1) continue; // directly in the scope — see above
    out.add(rel.slice(0, cut));
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

// A tag table for every note under `folder`: one row per tag, most-used first,
// with the notes carrying it one click down and — where the scope spans more
// than one — where they came from.
//
// Counting stays scoped (so it's cheap and the numbers mean something — "12
// notes in your Diary"), but clicking the search control runs Obsidian's own
// global search for that tag across the *whole* vault, not just this folder —
// the plugin can't know every place a tag might matter, so the click hands off
// to Obsidian's own search rather than re-implementing a narrower one. The
// expand toggle on each row still lists the notes counted in scope, for a
// quick glance without leaving the note.
//
// IT WAS A CLOUD UNTIL 3.14, and the three size tiers went with the cloud.
// They encoded each tag's count as visual weight because a cloud has no column
// to put a number in — but the count pill was drawn beside them the whole
// time, so the tier was the less precise of two encodings of one number. Add a
// second column and the pills have to align anyway, at which point a
// frequency-sorted cloud with a number on each pill is a table with extra
// steps. The sort, the note list, the search control and the empty state are
// unchanged.
//
// ONE ROW PER TAG, not one per tag-and-source. A tag used in three journals is
// one row with three source pills: the summary line above says "N tags across
// M notes", and a row per pair contradicts the header immediately above it —
// and the note list is still the answer to "which notes", so the sources
// summarise that list rather than replacing it.
export function buildTagIndex(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  folder: string
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-tag-index" });

  const groups = new Map<string, TFile[]>();
  for (const { file } of pagesUnder(app, folder)) {
    for (const tag of tagsOf(app, file)) {
      const arr = groups.get(tag) ?? [];
      arr.push(file);
      groups.set(tag, arr);
    }
  }

  if (groups.size === 0) {
    root.appendChild(
      emptyCallout(
        "tags",
        "No tagged notes yet",
        `Tag a note under ${folder} and it'll show up here, most-used first — click a tag any time to search the whole vault for it.`
      )
    );
    return root;
  }

  const sorted = Array.from(groups.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );
  const noteCount = new Set(
    sorted.flatMap(([, files]) => files.map((f) => f.path))
  ).size;

  // The source column is drawn only where there is more than one source to
  // name. One is not a distinction, and a column repeating one word on every
  // row is the noise §4.1's rule exists to avoid — so the same widget grows a
  // column on a scope that spans journals and stays as it was on a scope that
  // is one folder of notes.
  const sourcesOf = new Map<string, string[]>();
  const everySource = new Set<string>();
  for (const [tag, files] of sorted) {
    const srcs = tagSourcesOf(files.map((f) => f.path), folder);
    sourcesOf.set(tag, srcs);
    for (const src of srcs) everySource.add(src);
  }
  const showSource = everySource.size > 1;

  root.createDiv({
    cls: "jt-tag-summary",
    text: `${sorted.length} tag${sorted.length === 1 ? "" : "s"} across ${noteCount} note${
      noteCount === 1 ? "" : "s"
    } in ${folder}`,
  });

  const table = root.createDiv({
    cls: showSource ? "jt-tag-table has-source" : "jt-tag-table",
  });

  for (const [tag, files] of sorted) {
    // The row IS the `<summary>`, so the whole line is the expand target and
    // the cells align down the table. The note list is the `<details>` body
    // and so sits under the row it belongs to at full width.
    const details = table.createEl("details", { cls: "jt-tag-group" });
    const summary = details.createEl("summary", { cls: "jt-tag-row" });
    summary.createSpan({ cls: "jt-tag-name", text: tag });
    summary.createSpan({
      cls: "jt-tag-count",
      text: `${files.length} note${files.length === 1 ? "" : "s"}`,
    });
    if (showSource) {
      const cell = summary.createDiv({ cls: "jt-tag-sources" });
      const srcs = sourcesOf.get(tag) ?? [];
      // A tag carried only by notes sitting directly in the scope has no
      // source, and the cell is left empty rather than filled with a dash: the
      // column answers "which of these folders", and "none of them, it is in
      // the scope itself" is not one of the answers it is asking about.
      for (const src of srcs) {
        cell.createSpan({ cls: "jt-tag-source", text: src });
      }
    }

    const searchBtn = summary.createEl("button", {
      cls: "journal-btn-ghost jt-tag-search",
      attr: {
        type: "button",
        "aria-label": `Search ${tag} across the whole vault`,
        title: `Search ${tag} across the whole vault`,
      },
    });
    setIcon(searchBtn.createSpan({ cls: "journal-btn-icon" }), "search");
    // `preventDefault` is what keeps the two controls distinct now that the
    // button sits INSIDE the summary: a click there bubbles to the summary,
    // whose default action is the toggle, so without this "search everywhere"
    // would also expand the local list. Two clicks, two outcomes, still.
    searchBtn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openGlobalSearch(app, `tag:${tag}`);
    });

    const list = details.createEl("ul", { cls: "jt-tag-list" });
    for (const file of files) {
      const li = list.createEl("li");
      internalLink(li, app, file, file.basename, ctx.sourcePath);
    }
  }

  return root;
}

// ── Reading a host note's journal type ───────────────────────────────
//
// The four widgets below all answer "what is beneath this folder", and until
// 2.39 all four answered it in Study's words: literal `"lesson"` and
// `"practice"` filters, column headings that said Lessons and Practice, and an
// average that always read the `confidence` property. That made every one of
// them Study-only by accident rather than by decision — and since the 2.37
// section catalogue emits `topics-table` on any index with sub-containers, a
// two-level Cooking journal was getting a table headed "Lessons | Practice"
// over its recipes.
//
// Everything they need is on the JournalType already. These helpers are the
// one place that reads it, so a fifth widget cannot re-learn Study's nouns.

// NULL WHEN THE NOTE IS IN NO REGISTERED JOURNAL, rather than Study (3.19.1).
//
// This returned `?? STUDY_JOURNAL` — "this note is in no journal, assume the
// plausible shape" — and the assumption was never plausible, only historical.
// Study was the only journal when these widgets were written. On a vault where
// Study is turned off, or is not the journal the reader thinks in, a stray note
// got its nouns, its kinds and its rating property from a journal that has
// nothing to do with it: a table headed with Study's kinds over folders that
// are not Study's, and an average reading a tracker the host never defined.
//
// The callers all draw into a `root` they return, and all of them already
// return that root empty when the note has no parent. Nothing is the honest
// answer to "what is beneath this folder" when the folder is beneath no
// journal, and it is an answer these widgets already know how to give.
function hostType(
  plugin: AlmanacPlugin,
  notePath: string
): JournalType | null {
  return journalTypeOfNote(plugin, notePath) ?? null;
}

// How deep a container folder sits in its type: 0 for a top-level folder, 1
// for one inside that. Derived from the path rather than from the note's
// `type` frontmatter because these widgets run on folder dashboards, and a
// dashboard whose frontmatter is missing or hand-edited should still count
// what is under it correctly.
//
// THE ROOT IS -1, BECAUSE THE ROOT IS NOT A CONTAINER. It is the box the first
// level sits in: `03 - Journals/Study` holds Subjects, and a Subject is
// `levels[0]`. This returned 0 for it — the same answer it gives for a Subject
// — so a rollup drawn at the root headed its first column "Topic" over rows
// that were Subjects, and (once the branch below started reading this) would
// have called the level below the root the wrong thing too. -1 is the depth of
// the thing whose children are `levels[0]`, which is exactly what the root is.
export function containerDepth(type: JournalType, folderPath: string): number {
  const root = normalizePath(type.root ?? "");
  const path = normalizePath(folderPath);
  if (!type.root) return 0;
  if (path === root) return -1;
  if (!path.startsWith(`${root}/`)) return 0;
  return path.slice(root.length + 1).split("/").length - 1;
}

// Whether the journal declares a level beneath this folder — i.e. whether what
// is below it is more FOLDERS or the notes themselves.
//
// THE STRUCTURE ANSWERS THIS, NOT THE FOLDER'S CURRENT CONTENTS, and that is
// the whole point of extracting it. It is the same rule `sectionContext` states
// as `hasSubContainers` (`depth < type.levels.length - 1`), which is what
// composes the note in the first place; the renderer asking a different
// question is how a page came to disagree with the section that wrote it.
export function hasLevelBelow(type: JournalType, folderPath: string): boolean {
  return containerDepth(type, folderPath) + 1 < type.levels.length;
}

// What the folders one level under this one are called, e.g. "Topic" on a
// Subject dashboard. Falls back to the generic word when the host is already
// at the deepest level — the table still works, it just has nothing more
// specific to call its first column.
function childNoun(type: JournalType, folderPath: string): string {
  const depth = containerDepth(type, folderPath);
  return type.levels[depth + 1]?.noun ?? type.levels[depth]?.noun ?? "Folder";
}

// The tracker an average over this type's notes should read, and its
// definition — so a Cooking journal rated on Difficulty averages `difficulty`
// out of its own maximum rather than `confidence` out of 5.
//
// EXPORTED IN 4.37 for the journals card, which grew a stat strip and needs the
// same fourth cell this file's own cards draw. It is the NUMBERS being shared
// rather than the layout, which is 4.13.3's rule for these two families: *"what
// is still shared is the thing that actually mattered"*. The two strips are built
// separately because they differ in the fourth slot — a container card has three
// cells or four, and a journal card always has four because it can fall back to a
// count of what is in the journal.
export function ratingDefOf(
  plugin: AlmanacPlugin,
  type: JournalType
): TrackerDef | null {
  const id = typeRating(type);
  if (!id) return null;
  return plugin.settings.trackers.find((t) => t.id === id) ?? null;
}

// "Confidence" from "🎯 Confidence" — the registry label with its leading
// glyph stripped. Split out from ratingWord below because the two readers want
// different cases of the same noun: a stats band wants it lowercase under a
// number, a table wants it title-cased over a column.
//
// `fallback` rather than a fixed string, because the two callers disagree about
// what to say when there is no definition: a band has nothing better than the
// generic word, while kind-table has the property's own id, which is at least
// the thing the column is reading.
function ratingNoun(def: TrackerDef | null, fallback: string): string {
  if (!def) return fallback;
  return def.label.replace(/^[^\p{L}\p{N}]+/u, "").trim() || fallback;
}

// "avg confidence" from "🎯 Confidence". The registry label carries an emoji
// and title case for use as a widget heading; under a number in a stats band
// it wants neither.
// Exported in 4.37 with `ratingDefOf`, and for the same reason — the two are one
// answer, and a caller that has the definition without the word would have to
// spell the label-stripping itself.
export function ratingWord(def: TrackerDef | null): string {
  return ratingNoun(def, "rating").toLowerCase();
}

// ── A list of records ────────────────────────────────────────────────
//
// Three tables on these dashboards are the same object: a named thing per row,
// a handful of values across, and a link on the name. They were three `<table>`
// elements, and a four-column table at 380px either overflows the pane or
// squeezes the name to three characters, because table columns cannot shrink
// past their content.
//
// So the rows ARE the layout, and what a wide pane adds is that they line up:
// a grid over `createListRow`'s main region, dropped to one track by the
// container query. One render, no resize listener, no second copy of the data.
//
// This helper exists because 2.56.5 converted one of the three and the next two
// would have been the same twenty lines twice more — which is the mechanism
// this whole release is about. The heading strip, the tracks and the ARIA roles
// are decided once here. (`<table>` gave those roles for free; dropping the
// element drops them unless they are put back.)
interface RecordRow {
  title: string;
  titleRender?: (slot: HTMLElement) => void;
  cls?: string[];
}

// PRIVATE AGAIN AS OF 4.13.3, AND THE ROUND TRIP IS WORTH RECORDING. 4.13.2
// exported this for a fourth caller — the Journals card's per-subject topic
// table — and 4.13.3 replaced that table with cards, which have no heading strip
// and no column key. The three callers left are all in this file again.
//
// WHAT THE CARD KEPT is the half that mattered: `folderActivity` below, so a
// subject's own dashboard and the Journals card still read one implementation of
// "which of these notes is newest". A layout component is worth sharing when two
// surfaces draw the same OBJECT; these two draw the same NUMBERS in two
// different objects, and only the numbers had to agree.
function recordList(
  host: HTMLElement,
  headings: string[]
): { list: HTMLElement; row: (opts: RecordRow) => HTMLElement } {
  // The name column gives way; the value columns are sized to their content,
  // because a date that wraps is unreadable and a count is one character.
  const tracks = `minmax(0, 1fr)${" auto".repeat(Math.max(0, headings.length - 1))}`;

  const list = host.createDiv({ cls: "almanac-list" });
  list.setAttr("role", "table");

  // Hidden by the container query rather than removed: it is the accessible
  // name for each column at any width, and at narrow widths the row's own
  // reading order carries the meaning instead.
  const head = list.createDiv({ cls: "almanac-list-heads" });
  head.setAttr("role", "row");
  head.style.setProperty("--am-row-cols", tracks);
  for (const h of headings) {
    const cell = head.createDiv({ cls: "almanac-list-heads-cell", text: h });
    cell.setAttr("role", "columnheader");
  }

  return {
    list,
    row: (opts) => {
      const { row } = createListRow(list, {
        token: "",
        title: opts.title,
        titleRender: opts.titleRender,
        dense: true,
        columns: tracks,
        cls: opts.cls,
      });
      row.setAttr("role", "row");
      // The main region is where the value cells go, beside the title, so the
      // grid tracks line up across the whole row rather than only across the
      // part after the title.
      return row.querySelector<HTMLElement>(".almanac-list-main") ?? row;
    },
  };
}

function recordCell(
  main: HTMLElement,
  text: string,
  extra?: string
): HTMLElement {
  const cell = main.createDiv({
    cls: extra ? `almanac-list-cell ${extra}` : "almanac-list-cell",
    text,
  });
  cell.setAttr("role", "cell");
  return cell;
}

// ── What is under one container folder ───────────────────────────────
//
// Two facts about a folder of journal notes: everything in it, and the date of
// the most recent typed note in it. Every widget that reports on a topic wants
// exactly this pair.
//
// EXTRACTED IN 4.13.2 §2, WHEN A SECOND SURFACE STARTED ASKING. `topics-table`
// below computed it inline; the Journals card now draws the same two columns for
// the same folders, and two copies of "which of these notes is the newest" is
// how a subject's page and the homepage come to disagree about when a topic was
// last worked on. `topic-stats` states the rule this protects: the numbers a
// subject shows about a topic and the numbers the topic shows about itself come
// from one place and cannot drift.
//
// `typed` IS PART OF THE ANSWER, not a detail of it. A folder holds index notes
// and hand-written pages as well as lessons; the date that means "last worked"
// is the newest date on a note carrying a `type`, and a caller that filtered
// afterwards would have to re-learn that rule to count kinds.
export interface FolderActivity {
  // Everything under the folder, index notes included — what a task count is
  // taken over, because an open task in a subject's index note is still open.
  pages: PageInfo[];
  // The pages carrying a `type`, i.e. the journal's own note kinds.
  typed: PageInfo[];
  // The newest `date` among the typed pages, or null where none is dated.
  lastActive: string | null;
}

export function folderActivity(app: App, folderPath: string): FolderActivity {
  const pages = pagesUnder(app, folderPath);
  const typed = pages.filter((p) => p.fm["type"]);
  let lastActive: string | null = null;
  for (const p of typed) {
    const d = isoDate(p.fm["date"]);
    if (d && (!lastActive || d > lastActive)) lastActive = d;
  }
  return { pages, typed, lastActive };
}

// ── topics-table ─────────────────────────────────────────────────────
// Per-topic rollup for a subject: lesson count, practice count, relative
// last-activity, open-task count. Scope = the host note's own folder (the
// subject folder), topics = its immediate child folders.
// The folder rollup: one row per child folder, with a column per note kind.
//
// TAKES ITS SCOPE RATHER THAN READING THE HOST, as of 4.16 §1. It read the note
// it was rendered in and could therefore only ever describe that note's own
// folder — which is why `topics-table` had no argument and could not be pointed
// anywhere. `level-index` resolves a journal and a folder first and hands them
// in; the arithmetic below is untouched.
export function folderRollup(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType,
  folder: TFolder
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-topics-table" });
  const noun = childNoun(type, folder.path);
  // Excludes another journal type's root, which would otherwise appear as a
  // container of this one — a custom journal's root sits inside the journals
  // root Study claims, so on a table hosted at that root it looks exactly like
  // a subject. See journal.ts::journalChildFolders.
  const topicFolders = journalChildFolders(plugin, type, folder);
  if (topicFolders.length === 0) {
    root.appendChild(
      emptyCallout(
        "folder-plus",
        `No ${plural(noun).toLowerCase()} yet`,
        // THE BUTTON THAT IS ON THIS PAGE, not the one two clicks away. This
        // sent the reader to the homepage's Journals card, which does make a
        // container — but the section this callout is drawn inside opens with
        // `button:<type>:new-container`, labelled with a plus and the bare
        // child noun (journalSubActionSpec). So the control was six pixels
        // above the sentence pointing somewhere else.
        //
        // Derived from the same `noun` the heading uses, on `kindTable`'s rule
        // one screen down: both halves come from one value, so they cannot come
        // to name different buttons.
        `Press “+ ${noun}” above to add one — it'll appear here with its counts and activity.`
      )
    );
    return root;
  }

  // One column per note kind, named after the kind. Study still reads
  // "Lessons | Practice" because those are its kinds; a Cooking journal reads
  // "Recipes" because that is what is in its folders.
  //
  // `kindPlural`, NOT `plural(k.label)`. A kind carries a `plural` override for
  // exactly the words the pluraliser gets wrong, and Study's Practice is the
  // one shipped example of it — so the column read "Practices" while the
  // section header, the buttons and the empty states one level down all read
  // "Practice", every one of them derived from the kind. This was the only
  // place that re-derived it and it was the only place that disagreed.
  const { row: addRow } = recordList(root, [
    noun,
    ...type.kinds.map((k) => kindPlural(k)),
    "Activity",
    "Open",
  ]);

  for (const tf of topicFolders) {
    const { pages, typed, lastActive } = folderActivity(app, tf.path);

    const noteFile = getFile(app, `${tf.path}/${tf.name}.md`);
    const main = addRow({
      title: tf.name,
      // A folder with no index note of its own is still a row; it just has
      // nothing to open, so the name stays text.
      titleRender: noteFile
        ? (slot) => internalLink(slot, app, noteFile, tf.name, ctx.sourcePath)
        : undefined,
    });

    for (const kind of type.kinds) {
      const n = typed.filter((p) => p.fm["type"] === kind.id).length;
      recordCell(main, n ? String(n) : "—");
    }
    recordCell(main, relativeActivity(lastActive), "is-text");

    // Open tasks are Almanac `- ( )` lines in each note's body (the templates'
    // content-level checkboxes), invisible to the metadata cache — so this cell
    // ships a placeholder and fills once the bodies are read (see sumBodyTasks).
    const openCell = recordCell(main, "…");
    void sumBodyTasks(app, pages.map((p) => p.file)).then(({ open }) => {
      openCell.setText(open ? `${open} ◻` : "—");
    });
  }

  return root;
}

// ── level-index ──────────────────────────────────────────────────────
//
// WHAT IS BELOW THIS, AND IT ASKS RATHER THAN ASSUMING. 4.16 §1.
//
// ONE QUESTION HAD TWO WIDGETS AND A BRANCH BETWEEN THEM. The journal catalogue
// has a section literally called "What's below this note", and it answered by
// choosing, AT COMPOSE TIME, between `topics-table` where the note had child
// folders and a stack of `kind-table` fences where it did not. So the answer to
// "what is below this" was decided when the note was WRITTEN, by a composer
// reading `hasSubContainers`, and baked into the file — which is why a note that
// later grew its first sub-folder went on listing its own notes, and why the
// question could not be asked of anywhere but the note it was asked in.
//
// The branch belongs at render time, where the folder can be looked at. That is
// the whole of this function: resolve a scope, then ask it what it holds.
//
// AND IT REPLACES `topics-table` RATHER THAN JOINING IT. That word still draws —
// it is an `alias` in `NOT_PAGE_WIDGETS`, because every shipped Subject index
// carries it — and it routes here with no argument, which is exactly what it
// always meant.
export function buildLevelIndex(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  argument: string
): HTMLElement {
  const root = createDiv({ cls: "journal-level-index" });
  const scope = levelScope(plugin, ctx, argument);
  if (typeof scope === "string") {
    root.createDiv({ cls: "journal-widget-error", text: scope });
    return root;
  }
  const { type, folder } = scope;

  // WHICH BRANCH IS A QUESTION ABOUT THE LEVEL, NOT ABOUT TODAY'S CONTENTS.
  //
  // THE BUG THIS FIXES. It asked `journalChildFolders(...).length > 0` — "does
  // this folder have sub-folders right now" — and read an empty answer as "this
  // is the deepest level". So a Subject with no Topics yet, which is every
  // Subject on the day it is made, got the DEEPEST level's rendering: a "🗂️
  // Lessons" table and a "🗂️ Practice" table, each with an empty state telling
  // the reader to press a "New Lesson" button that is not on a Subject page at
  // all. The one thing the section is for — "what's below this note" — was
  // answered with the level below the level below.
  //
  // Emptiness is not depth. A Subject with no Topics is a Subject WITH NO
  // TOPICS, and the honest answer is the rollup's own empty state, which names
  // the thing that will appear here and the button that makes one.
  //
  // AND THE SAME MISREADING WENT THE OTHER WAY. A paged Lesson is a folder but
  // not a container (see `isContainerFolder` below), so the first Lesson split
  // across pages gave a Topic index a non-empty folder list and turned its two
  // kind tables into a folder rollup listing that one lesson.
  //
  // `hasLevelBelow` is the structure's own answer, and it is the same rule
  // `sectionContext` used to COMPOSE this note. The renderer and the composer
  // now agree by construction rather than by coincidence.
  if (hasLevelBelow(type, folder.path)) {
    root.appendChild(folderRollup(plugin, ctx, type, folder));
    return root;
  }

  // The deepest level: its children are notes, so one table per kind rather
  // than a folder rollup. PER KIND rather than one combined table because the
  // kinds are rated on different things — a single table would need a column
  // for every rating in the type and leave most of it blank. That was the
  // catalogue's argument for emitting several fences and it is unchanged; what
  // changed is that one widget now draws them, so the note does not have to
  // have been written knowing how many kinds its journal has.
  //
  // A HEADING PER TABLE, because two tables with no names between them read as
  // one table that changed its columns halfway down.
  //
  // THE KIND'S OWN EMOJI AND THE KIND'S OWN PLURAL, which is what
  // `childrenParts` writes into the composed fence — "📖 Lessons", "🛠️
  // Practice". This drew "🗂️ Lessons" and "🗂️ Practices": the folder glyph over
  // tables of notes, and a pluralisation the kind explicitly overrides. Two
  // spellings of one heading is one too many when the composer's is on the next
  // note down.
  for (const kind of type.kinds) {
    root.createDiv({
      cls: "journal-level-index-head",
      text: `${kind.emoji} ${kindPlural(kind)}`,
    });
    root.appendChild(kindTable(plugin, ctx, type, folder.path, kind.id));
  }
  return root;
}

// Which journal and which folder this index is about, or the sentence to draw
// instead.
//
// A REFUSAL IS A STRING, on `journalChartRefusal`'s shape one module over: there
// are four ways to have no scope and each wants its own sentence, so returning
// null and letting the caller guess would be the caller inventing three of them.
//
// EMPTY IS THE HOST NOTE'S OWN FOLDER, which is what `topics-table` always meant
// and what every shipped Subject index still asks for.
//
// EXPORTED BECAUSE THERE USED TO BE TWO OF THESE AND THEY DRIFTED. 4.16 shipped a
// second, narrower copy in `directive-regions.ts` to answer only WHERE for the
// subscription, on the argument that a duplicate answering less was cheaper than
// putting these refusal strings on the module boundary. It was pinned by a test
// that both spellings match — which held exactly until the resolution rule grew
// past one line, at which point the test failed and the region went on
// prepending the journal root to a path that already had one. **A duplicate is
// only narrow while the thing it duplicates is small.** The region takes the
// folder off this and ignores the sentence.
export function levelScope(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  argument: string
): { type: JournalType; folder: TFolder } | string {
  const app = plugin.app;
  const [journalId, relative] = partsOf(argument.trim(), 2, "/").map((p) =>
    p.trim()
  );

  if (!journalId) {
    const file = hostFile(app, ctx);
    if (!file?.parent) {
      return "level-index needs a note in a folder, or a journal to point at.";
    }
    const type = hostType(plugin, file.path);
    // NOT `?? STUDY_JOURNAL`, which is the assumption 3.19.1 removed from every
    // widget in this file: a note in no registered journal got Study's nouns and
    // Study's kinds, and the answer was never plausible, only historical.
    if (!type) {
      return "This note is not in a registered journal, so there is no level below it to index. Name a journal to index instead.";
    }
    return { type, folder: file.parent };
  }

  const type = getJournalType(plugin, journalId);
  if (!type) {
    const have = registeredJournalTypes(plugin).map((t) => t.id);
    return have.length
      ? `No journal called "${journalId}". This vault has: ${have.join(", ")}.`
      : `level-index names the journal "${journalId}", and this vault has no journals — turn on Study or add one in Settings → Almanac → Journals.`;
  }
  const root = normalizePath(type.root);
  if (!relative) {
    const at = app.vault.getAbstractFileByPath(root);
    return at instanceof TFolder
      ? { type, folder: at }
      : `${type.name}'s folder "${root}" is not in this vault.`;
  }

  // TWO SPELLINGS REACH THIS BOX, AND REFUSING ONE OF THEM WAS THE 4.16.1 BUG.
  //
  // The registry declares this piece as `kind: "folder"`, and every other folder
  // argument in the registry means A PATH FROM THE VAULT ROOT — that is what the
  // type's own comment says, what `ArgSuggest` offers (`vaultFolders`), and
  // therefore what the section editor writes the moment a reader picks from the
  // dropdown. This resolver was written to the OTHER grammar, journal-relative,
  // because `level-index:study/Maths` is the shorter thing to hand-type and is
  // what `docs/reference.md` shows. So a picked folder arrived already carrying
  // the journal's root and had it prepended a second time:
  //
  //     No folder "03 - Journals/Cooking/03 - Journals/Cooking/italian" in Cooking.
  //
  // ACCEPT BOTH, because both are honest readings of what the reader typed and
  // the control that wrote one of them is the control this widget ships with.
  // Relative first: it is the documented spelling, and it is the only one that
  // can be ambiguous, so it gets to win its own ambiguity rather than losing it
  // silently to a folder that happens to share the vault's shape.
  const tries = [`${root}/${relative}`, relative];
  for (const candidate of tries) {
    const at = app.vault.getAbstractFileByPath(normalizePath(candidate));
    if (!(at instanceof TFolder)) continue;
    // AND AN ABSOLUTE PATH MUST STILL BE INSIDE THE JOURNAL. `level-index` names
    // a journal and then a folder IN IT; a path that leaves the journal is a
    // reader asking for something this widget cannot describe, since every
    // heading, kind and rating below it comes from `type`. Saying so beats
    // drawing Cooking's nouns over Study's folders.
    if (at.path !== root && !at.path.startsWith(`${root}/`)) {
      return `"${relative}" is not inside ${type.name} (${root}).`;
    }
    return { type, folder: at };
  }
  return `No folder "${relative}" in ${type.name}. Give a path inside ${root}, or the full path from the vault root.`;
}

// ── level-cards ──────────────────────────────────────────────────────
//
// THE SAME QUESTION AS `level-index`, IN CARDS. 4.36 §2.
//
// ── WHY A SECOND KEYWORD, WHEN `journals:cards` IS AN ARGUMENT ──────────
//
// 4.2 put the card arrangement of `journals` in the argument slot and said why:
// *"the grammar already has a slot for that: `keyword[:argument]`, and
// `journals` had never used its argument."* This keyword's slot is not free.
// `level-index` takes a journal AND a folder, joined by `/`, and both pieces
// carry meaning. The three ways out each lose to a rule already written down:
//
//   • A THIRD PIECE (`level-index:study/Maths/cards`) is unparseable — the
//     second piece is a folder path and may contain slashes.
//   • A `#` SUB-GRAMMAR is what `directive-grammar.ts` explicitly declines to
//     generalise: *"a parser that guessed at it would be inventing a rule
//     nothing in the vault follows."*
//   • A FENCE MODIFIER would put an arrangement in the same namespace as
//     `frame:` and `wide`, which are about the block's chrome rather than about
//     what the widget draws.
//
// ── AND IT SHARES THE RESOLVER RATHER THAN RESEMBLING IT ────────────────
//
// `levelScope` is exported for exactly this, and says at its own definition what
// the alternative costs: *"A duplicate is only narrow while the thing it
// duplicates is small."* The two widgets take the same four refusal sentences
// from one function, so a reader who mistypes a journal id is told the same
// thing whichever arrangement they asked for — pinned by a test that compares
// the two outputs rather than by care.
//
// ── WHAT A PAIR IS, AND WHEN THERE IS ONE ───────────────────────────────
//
// One card per container, and a SECOND card beside it listing what is below
// that container — exactly when `hasLevelBelow` says the journal declares a
// level there. That is the structure's own answer rather than "does this folder
// have sub-folders today", which is the misreading 4.16 §1 rewrote
// `buildLevelIndex` around: a Subject with no Topics yet is a Subject WITH NO
// TOPICS, not a deepest level.
//
// So a two-level journal draws pairs and a flat one draws singles, and neither
// depends on what anybody has created yet.
//
// ── WHAT IS SHARED WITH THE `journals` CARD, AND WHAT IS NOT ────────────
//
// The ROW and the NUMBERS, not the card. 4.13.4 decided a flat card is its head
// and 4.13.3 gave a subject's card up its fold to become one; re-litigating
// either would be this release changing a page it is not about. What that
// release said it kept is the right amount to share here too — *"what is still
// shared is the thing that actually mattered: the NUMBERS"* — so `childRow` and
// `folderActivity` have one implementation and the two cards do not.

// One card per container under `folder`, paired with what is below each.
export function buildLevelCards(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  argument: string
): HTMLElement {
  const root = createDiv({ cls: "jld-grid" });
  const scope = levelScope(plugin, ctx, argument);
  if (typeof scope === "string") {
    root.createDiv({ cls: "journal-widget-error", text: scope });
    return root;
  }
  const { type, folder } = scope;

  // THE JOURNAL'S OWN HUE, SET ONCE ON THE GRID (4.37). `hueOf` is a stable
  // function of the journal's id — derived rather than assigned, so two journals
  // cannot swap colours when a third is added — and it is the only per-journal
  // identity colour the plugin has. Set here rather than per card because every
  // card in this grid belongs to one journal; a card reading it from an ancestor
  // cannot disagree with its siblings.
  //
  // ON THE GRID, NOT IN THE STYLESHEET, for the reason `statStrip` states about
  // `data-cols`: what the script knows is which journal this is, and what the
  // stylesheet knows is how to paint one. An inline custom property is the one
  // inline declaration a stylesheet CAN still act on, which is why this is safe
  // where `style.setProperty("grid-template-columns", …)` was not.
  root.style.setProperty("--jjc-hue", String(hueOf(type.id)));

  // CARDS ARE FOR CONTAINERS, AND SAYING SO BEATS DRAWING NOTES. At the deepest
  // level what is below a folder is NOTES — no children to list, no activity to
  // roll up, nothing a two-card pair could hold — and quietly drawing something
  // else is the near-miss `journals:card` is refused for: it reads as the
  // feature not working rather than as the wrong widget having been asked for.
  //
  // The refusal names the widget that DOES answer here, which is the half a bare
  // "not supported" would leave the reader to guess.
  if (!hasLevelBelow(type, folder.path)) {
    root.addClass("is-empty");
    root.appendChild(
      emptyCallout(
        "layout-grid",
        `Nothing to draw as cards here`,
        `${folder.name} holds notes rather than folders, and a card is a container. Use \`level-index\` to list them.`
      )
    );
    return root;
  }

  const tops = journalChildFolders(plugin, type, folder);
  const level = type.levels[containerDepth(type, folder.path) + 1];

  if (tops.length === 0) {
    // A JOURNAL ON THE DAY IT IS MADE, which is the state this page is most
    // often first seen in — and the one state where the tile below is the only
    // thing on the surface, so the callout points AT it rather than sending the
    // reader to the Journals section for a control that is now under their
    // cursor. `is-empty` drops the grid to one column so the two stack.
    root.addClass("is-empty");
    root.appendChild(
      emptyCallout(
        "folder-plus",
        `No ${plural(level.noun).toLowerCase()} yet`,
        `Add the first one below. ${plural(level.noun)} appear here automatically.`
      )
    );
    root.appendChild(addTile(plugin, type, folder, level.noun));
    return root;
  }

  for (const child of tops) {
    // THE PAIR IS A WRAPPER, NOT TWO LOOSE CARDS. It spans two tracks of the
    // grid, so a container and the list belonging to it cannot be split across
    // a wrap — and at a width where two cards will not fit side by side the
    // wrapper stacks them and stays one cell. Two siblings in the grid could do
    // neither.
    // ── AND ONE HEAD ACROSS IT (4.38) ─────────────────────────────────
    //
    // The two panes had a head each, and they were different KINDS of thing
    // pitched identically: the left said "Linear Algebra" — a container's name,
    // and a link — and the right said "Topics", a level noun that goes nowhere.
    // Same size, same weight, same band, one of them clickable. The reader had no
    // way to tell which from looking, and the hue band had a seam in the middle of
    // it where the two heads met.
    //
    // So the pair has ONE head, and it is the container's: the name, the glyph,
    // and the ＋ that adds to it. What each pane holds is said inside the pane by
    // a caps label, which is the treatment for a thing that names a region rather
    // than being a title — see `paneLabel`. A single head cannot disagree with
    // itself, and it is what makes the band one strip.
    const paired = hasLevelBelow(type, child.path);
    if (!paired) {
      root.appendChild(containerCard(plugin, ctx, type, child, true));
      continue;
    }
    const pair = root.createDiv({ cls: "jld-pair" });
    const below = type.levels[containerDepth(type, child.path) + 1];
    containerHead(plugin, ctx, pair, type, child, below?.noun ?? null);
    pair.appendChild(containerCard(plugin, ctx, type, child, false));
    pair.appendChild(childrenCard(plugin, ctx, type, child));
  }

  // THE CREATE CONTROL CLOSES THE SURFACE IT CREATES INTO. The grid lists
  // containers at one level, so the thing at its end makes one of those — and
  // it is a CARD-SHAPED cell rather than a button above or beside the grid, for
  // `journal-tracker-add`'s reason said one widget over: an add that sits in
  // the grid inherits the grid's rhythm instead of orphaning itself on a row of
  // its own, and "the empty slot at the end" is a shape readers already parse
  // without a label telling them it is a control.
  //
  // ── AND IT IS THE SIZE OF THE SLOT IT OPENS (4.37) ──────────────────
  //
  // A tile that always took one track left half a row of nothing whenever the
  // grid drew pairs, because a pair spends both tracks and the tile wrapped
  // alone onto the next row. The fix is not a width; it is the observation that
  // **the tile is an empty slot for the thing it creates**, so it should be that
  // thing's footprint — two tracks where this grid draws pairs, one where it
  // draws singles.
  //
  // DECIDED FROM THE JOURNAL'S SHAPE, NOT FROM A MEASUREMENT. Which of the two
  // it is answers to `hasLevelBelow` at the child level — the same predicate the
  // pairing itself uses — so the tile cannot disagree with the cards beside it,
  // and no query is needed. In a two-track grid `span 2` IS the full row and one
  // track is half of it, which is where the two arrangements come from; at four
  // tracks a pair-sized tile still lands beside a pair rather than stranding a
  // gap. The browser clamps a span to the tracks that exist, which is what makes
  // it safe in a one-column grid — `.jld-pair` relies on the same thing.
  if (tops.some((child) => hasLevelBelow(type, child.path))) {
    root.addClass("is-paired");
  }
  root.appendChild(addTile(plugin, type, folder, level.noun));
  return root;
}

// ── The create controls ────────────────────────────────────────────────
//
// ONE PER LIST SURFACE, AND NONE PER CARD. Until 4.36.3 every container card
// carried an action row — an *Open* button beside a bare ＋ opening a menu —
// and both halves were answering questions the card had already answered. The
// card's TITLE is the link that opens it, which is 4.13.3's rule and the reason
// `titleRender` exists; and a ＋ on a card is ambiguous about what it adds,
// which is why it had to be a menu at all.
//
// Putting the control in the SURFACE removes the ambiguity rather than
// explaining it: the grid lists subjects and its tile makes a subject, a
// children card lists topics and its row makes a topic. Nothing needs a menu,
// because a surface that lists one kind of thing can only be adding that kind
// of thing.
//
// A card's body is not a list surface, so a card in a FLAT journal gets no
// control here — notes are made from the container's own page, from the
// palette, or from the Journals section, all of which name the note type they
// are making. That is the affordance the old ＋ menu's second branch was, and
// it was the branch nobody could have guessed was there.
//
// ── AND THE LIST'S CONTROL IS IN ITS HEAD, NOT ITS BODY (4.37) ──────────
//
// 4.36.3 put the children card's control at the end of its list, as a dashed
// row. Two things were wrong with that once it was rendered. A row inside a
// four-row scrolling body SPENDS ONE OF THE FOUR — a card showing two topics
// showed two topics and a control — and the body is a list of TOPICS, so a row
// that is not a topic is the one row in it that does not mean what its
// neighbours mean.
//
// The head is where a section's own controls already live: `sectionFrame`
// returns an `actions` slot for exactly this, and at level 2 that slot sits
// inline on the title line pushed right (`30-header-bars.css:147`). So the
// control costs no geometry, no row, and nothing new to learn — it is where the
// chart edit button, the scope cycle and the journals section's own `+ Subject`
// already are.
//
// THE TILE STAYS A TILE, because the grid has no head of its own to put a
// control in — its head belongs to the Contents SECTION, which is a different
// scope: it covers the whole widget rather than one list. An empty slot at the
// end of a grid of cards is the affordance that reads correctly there, and it
// is `journal-tracker-add`'s.

// Create one container inside `parent`. Depth 0 is the journal's top level and
// has its own entry point, because `newContainer` REFUSES `depth <= 0` — it
// exists to nest under a parent and it says so.
function addContainer(
  plugin: AlmanacPlugin,
  type: JournalType,
  parent: TFolder
): void {
  const depth = containerDepth(type, parent.path) + 1;
  if (depth <= 0) void plugin.journals.newTopLevel(type);
  else void plugin.journals.newContainer(type, depth, parent.name);
}

// The click, shared by both shapes — the one thing they genuinely have in
// common, and the reason they are not two functions with two handlers.
function onAdd(
  btn: HTMLElement,
  plugin: AlmanacPlugin,
  type: JournalType,
  parent: TFolder
): void {
  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    // The children card's rows open notes on click, and the grid's cards sit
    // inside a section whose head folds it. Neither should fire because
    // something was created.
    evt.stopPropagation();
    addContainer(plugin, type, parent);
  });
}

// The tile: an empty slot at the end of the grid, in `journal-tracker-add`'s
// vocabulary — dashed edge, no ground, muted ink lifting to the accent.
// EXPORTED IN 4.38 for the journals section's empty states, which replaced two
// sentences that pointed at controls with the control itself. It is exported rather
// than reimplemented there for the reason `childRow` and `folderActivity` already
// are: an empty slot that opens a create dialog is one object, and a second copy
// would be a second answer to "what does an empty surface look like" the first time
// either was tuned.
export function addTile(
  plugin: AlmanacPlugin,
  type: JournalType,
  parent: TFolder,
  noun: string
): HTMLElement {
  const label = `New ${noun.toLowerCase()}`;
    // ── NO `title`, BECAUSE THE BUTTON ALREADY SAYS IT (4.42) ───────────
    //
    // MEASURED: on `20260818_20h59m08s_grim.png` a tooltip reading "New project"
    // is open under a tile whose visible label reads "New project". A `title`
    // that repeats the words on the control tells a pointer user nothing and
    // makes a screen reader announce the name twice.
    //
    // `aria-label` STAYS. It is the same string, which is redundant rather than
    // wrong, and it is what keeps the accessible name stable if the visible label
    // is ever shortened.
    //
    // AND `addHeadButton` KEEPS ITS `title`, forty lines down, because there the
    // two strings DIFFER — the button shows "Topic" and the tooltip says "New
    // topic" — and that button collapses to icon-only under 460px, where the
    // tooltip is the only text there is.
  const btn = createEl("button", {
    cls: "jld-add jld-add-tile",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(btn.createSpan({ cls: "jld-add-icon" }), "plus");
  btn.createSpan({ cls: "jld-add-label", text: label });
  onAdd(btn, plugin, type, parent);
  return btn;
}

// The same tile, wearing a card (4.38.4).
//
// WHY A WRAPPER AND NOT A STYLED BUTTON. A naked dashed tile beside a run of
// bordered cards reads as a control that wandered into the grid; the maintainer's
// note was that it should look like the thing it makes. So it takes `.jjs-card`'s
// chrome — the same ground, border and radius its neighbours have — with the
// dashed affordance inside, which is exactly what an EMPTY subject card already
// looks like one column over (`buildGroup` puts the same tile in its body).
//
// AND THE WRAPPER IS WHAT MAKES IT MATCH IN HEIGHT, which the tile alone could
// not do. `.jjs-grid` is `align-items: stretch`, but a `<button>` does not
// stretch: Obsidian gives form controls a definite height, and `align-self:
// stretch` is ignored on any item whose height is not `auto`, so the tile sat at
// its 92px minimum beside 160px cards. A `div` has no such height and stretches,
// and the tile then fills it through the flex chain below.
//
// NO HEAD, because there is no name yet. That is the one way it differs from its
// neighbours, and it is the honest difference: a head would have nothing to say.
export function addCardTile(
  plugin: AlmanacPlugin,
  type: JournalType,
  parent: TFolder,
  noun: string
): HTMLElement {
  const card = createDiv({ cls: "jjs-card jjs-card-add" });
  const body = card.createDiv({ cls: "jjs-card-body" });
  body.appendChild(addTile(plugin, type, parent, noun));
  return card;
}

// The head control: a ＋ that says what it adds when you point at it.
//
// A GHOST BUTTON, NOT A DASHED ONE. The dashed treatment means "an empty slot
// where a thing would go", which is true of a cell in a grid of cards and false
// of a control on a bar — there is no slot in a head. On a bar the house form is
// `journal-btn-ghost`, which is what every other icon control in the plugin
// wears (`85-tracker-controls.css:475`: *"shared by every directional/utility
// icon button"*).
//
// THE LABEL IS DRAWN AND HIDDEN RATHER THAN OMITTED, which is the whole point of
// this shape. A bare ＋ in a card head has the ambiguity the old ＋ menu had —
// add WHAT — and a permanently labelled button costs the title its width on a
// 330px card. Rendering the label and revealing it on hover keeps the width at
// rest and answers the question on demand.
//
// AND THE TOOLTIP IS NOT THE FALLBACK, IT IS THE ANSWER FOR EVERYONE ELSE.
// `aria-label` and `title` carry the same sentence, so a screen reader, a
// keyboard and a touch device — none of which have a hover — all get the noun
// without depending on the reveal. That is the condition `50-entry-header.css`
// attaches to its own icon-only collapse (*"safe only BECAUSE `buildButton` sets
// `aria-label` and `title` independently of the label span"*), met here for the
// same reason: this control also hides a label it has drawn.
function addHeadButton(
  plugin: AlmanacPlugin,
  type: JournalType,
  parent: TFolder,
  noun: string
): HTMLElement {
  const label = `New ${noun.toLowerCase()}`;
  const btn = createEl("button", {
    cls: "journal-btn-ghost jld-head-add",
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(btn.createSpan({ cls: "journal-btn-icon" }), "plus");
  btn.createSpan({ cls: "journal-btn-label", text: noun });
  onAdd(btn, plugin, type, parent);
  return btn;
}

// The container's head, drawn on whichever box IS the container — the pair when
// there are two panes, the card itself when there is one. One function so the two
// arrangements cannot drift into two different heads for one object.
//
// `noun` is the level BELOW, and it is optional because it is only the ＋'s: a
// container at the deepest container level has nothing to create, so it gets a
// head with a name and no control rather than a disabled one.
function containerHead(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  host: HTMLElement,
  type: JournalType,
  folder: TFolder,
  below: string | null
): void {
  const level = type.levels[containerDepth(type, folder.path)];
  // THE HEAD IS `sectionFrame`, WHICH IS WHY THIS IS CHEAP — 4.13.3's argument,
  // reused rather than restated: the slim recessed band with a glyph in a fixed
  // slot and a name in small caps IS a level-2 section bar, so nothing about the
  // title, its truncation, its glyph slot or its link is decided here.
  const frame = sectionFrame(host, {
    title: folder.name,
    glyph: folderEmoji(plugin, folder.name, level?.fallbackEmoji ?? "📁"),
    level: 2,
    owns: "children",
    titleRender: (slot) =>
      folderLink(plugin, slot, folder, ctx.sourcePath, "jjs-group-name"),
  });
  if (below) {
    frame.actions.appendChild(addHeadButton(plugin, type, folder, below));
  }
}

// A pane's own caption. `paneLabel` and not a second head: what these say —
// "SUBJECT", "TOPICS" — names the REGION rather than titling a document, and the
// plugin's caps treatment is exactly that distinction said in type. Both panes
// take one, which is also what gives them a shared first line to start on; a
// label on the list alone would put the two halves a line out of step.
function paneLabel(host: HTMLElement, text: string): void {
  host.createDiv({ cls: "jld-pane-label", text: text.toUpperCase() });
}

// The left card: one container, summarised. `head` is false inside a pair, where
// the head belongs to the pair and saying it twice is the thing 4.38 removed.
function containerCard(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType,
  folder: TFolder,
  head: boolean
): HTMLElement {
  const card = createDiv({ cls: "jld-card jld-container" });
  const level = type.levels[containerDepth(type, folder.path)];

  if (head) {
    const below = type.levels[containerDepth(type, folder.path) + 1];
    containerHead(plugin, ctx, card, type, folder, below?.noun ?? null);
  }

  // NAMED FOR WHAT IT IS, which is information the page stopped carrying when the
  // head became the container's name alone: "Linear Algebra" does not say that a
  // Linear Algebra is a SUBJECT. Only inside a pair, because a single card's head
  // is right there and would then say the level noun twice.
  //
  // ON THE CARD, LEVEL WITH THE LIST'S LABEL, which is the half of this that is
  // about the pair rather than about this pane: the two labels are siblings of
  // their bodies in both panes, so they sit on one line and the two halves start
  // together. Finding 15 — *"the panes of a pair keep different vertical
  // rhythms"* — is this, and a label in one pane only would have deepened it.
  if (!head && level) paneLabel(card, level.noun);
  const body = card.createDiv({ cls: "jld-card-body" });

  // ── The numbers ────────────────────────────────────────────────────────
  //
  // `statStrip` LITERALLY, NOT A BAND THAT LOOKS LIKE ONE — 4.35's outcome note
  // is the argument in full. The shared strip collapses on an `@container` query
  // rather than an `@media` one, which is the difference between a card that
  // reads correctly in a 400px pane and one that does not, and rediscovering
  // that correctly on the first try is what `RESUME.md` §2.5 is about.
  const { pages, lastActive } = folderActivity(plugin.app, folder.path);
  const ratingDef = ratingDefOf(plugin, type);
  const ratingId = ratingDef?.id ?? confidenceProperty(plugin);
  const conf = ratingDef
    ? confidenceStats(
        pagesUnder(plugin.app, folder.path),
        ratingId,
        confidenceKinds(plugin, folder.path, ratingId)
      )
    : null;

  const cards: StatCard[] = [
    { label: "notes", value: String(pages.length) },
    { label: "last", value: relativeActivity(lastActive) || "—" },
    { label: "open", value: "…" },
  ];
  // A FOURTH CELL ONLY WHERE THE JOURNAL RATES SOMETHING. Projects declares no
  // rating at all, and an "avg rating —" cell on every card would be a column of
  // em dashes explaining nothing. `data-cols` is what the collapse rules read,
  // and `statStrip` sets it from the count it is handed.
  if (ratingDef) {
    cards.push({
      // An em dash rather than 0.0 when nothing is graded: an average of no
      // readings is absent, not zero — `buildTopicStats`' own rule, and the
      // reason it is stated there is that 0.0/5 reads as "you understand none of
      // this" rather than "nothing logged yet".
      //
      // THE BARE NOUN, WITHOUT "avg" (4.38). Measured on the render: this was
      // the only label on either card grid long enough to wrap in a 240px track,
      // and a wrapped label made the card 15px taller than the one beside it.
      // `align-items: stretch` stops that from raggedding the row, but the label
      // is also the wrong length for what it says: the three cells beside it are
      // "notes", "last", "open" — one word each, and none of them says how it is
      // computed either. `buildTopicStats` keeps its "avg confidence" because it
      // is a wide hero strip that also prints the /5 denominator; a 54px cell in
      // a card is not that.
      label: ratingWord(ratingDef),
      value: conf ? conf.avg : "—",
    });
  }
  const { cells } = statStrip(body, cards);

  // Open tasks are `- ( )` lines in note BODIES, invisible to the metadata
  // cache, so this cell ships a placeholder and fills on resolve — the same
  // idiom `childRow` and `buildTopicStats` use.
  const openCell = cells[2].value;
  void sumBodyTasks(
    plugin.app,
    pages.map((p) => p.file)
  ).then(({ open }) => {
    if (!openCell.isConnected) return;
    openCell.setText(open ? String(open) : "—");
  });

  return card;
}

// The right card: what is below this container, one row each.
function childrenCard(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType,
  folder: TFolder
): HTMLElement {
  const card = createDiv({ cls: "jld-card jld-children" });
  const below = type.levels[containerDepth(type, folder.path) + 1];
  const subs = journalChildFolders(plugin, type, folder);

  // NO HEAD OF ITS OWN (4.38). It had one — "🗂️ Topics" in a level-2 bar, with
  // the ＋ on it as of 4.37 — and the trouble was never what it said but that it
  // was a TITLE saying it. A pane's head, beside a pane head carrying a link to a
  // place, made two things that look the same and behave differently, and put a
  // seam in the middle of the hue band.
  //
  // What it says survives as the pane's caps label, and the ＋ moved up to the
  // pair's one head — which is the same folder and the same action, because the
  // ＋ was always adding a child of the CONTAINER, not of this list.
  // ABOVE THE BODY AND NOT IN IT, because the body is a stated four rows that
  // SCROLLS — a label inside it would ride away on the first scroll and would
  // spend one of the four rows the card is built to show.
  paneLabel(card, plural(below.noun));
  const body = card.createDiv({ cls: "jjs-card-body" });

  // EVERY CHILD IS DRAWN AND THE BODY SCROLLS, which is 4.13.4's answer and its
  // number: a card is its bar plus four rows whatever is in it, so the grid is
  // rows rather than a ragged edge and a long list is a scroll away rather than
  // a page away. `.jjs-card-body` is where the four is stated, and this card
  // takes that class rather than restating it.
  if (subs.length === 0) {
    // STATES THE FACT AND NOTHING ELSE. This sentence has now outlived two
    // create controls — it once ended *"add one with the ＋ beside this card"*,
    // then *"add one below"* was avoided on the same grounds — which is the
    // argument for it naming no control at all: prose that quotes a button
    // breaks silently every time the button moves, and it has moved twice.
    body.createDiv({
      cls: "jjs-empty-row",
      text: `No ${plural(below.noun).toLowerCase()} yet.`,
    });
  }
  // AND NOTHING FOLLOWS THEM. 4.36.3 closed this body with a dashed row, and it
  // cost one of the four rows a card gets — a card showing two topics showed two
  // topics and a control — on a body whose every other row is a topic. The
  // control is in the head now; see `addHeadButton`.
  for (const sub of subs) childRow(plugin, ctx, body, sub);
  return card;
}

// ── topic-stats ──────────────────────────────────────────────────────
// The four-number band under a Topic dashboard's banner: lessons, practice,
// average confidence, open tasks. Scope = the host note's own folder, the
// same rule confidence-summary uses, so it reads a topic index note without
// being told which topic it is on.
//
// Nothing here is new arithmetic: it is the row buildTopicsTable already
// computes for *each* topic on a subject page, scoped to one topic and laid
// out as a band rather than a table row. Presenting it at the top of the
// topic's own page means the numbers a subject shows about a topic and the
// numbers the topic shows about itself come from one place and cannot drift.
//
// A band rather than the sentence `confidence-summary` renders, because the
// subject dashboard one level up already states its totals as a band — the
// two levels now read the same way instead of each inventing a header.
export function buildTopicStats(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-topic-stats" });

  const file = hostFile(app, ctx);
  if (!file?.parent) return root;

  const type = hostType(plugin, file.path);
  if (!type) return root;
  const pages = pagesUnder(app, file.parent.path);
  const ratingDef = ratingDefOf(plugin, type);
  const ratingId = ratingDef?.id ?? confidenceProperty(plugin);
  const conf = confidenceStats(
    pages,
    ratingId,
    confidenceKinds(plugin, file.path, ratingId)
  );

  const cell = (value: string, label: string, sub?: string): HTMLElement => {
    const c = root.createDiv({ cls: "jts-cell" });
    const v = c.createDiv({ cls: "jts-value", text: value });
    if (sub) v.createSpan({ cls: "jts-sub", text: sub });
    c.createDiv({ cls: "jts-label", text: label });
    return c;
  };

  // One cell per note kind, named after the kind — the same derivation
  // topics-table uses one level up, so a subject's numbers about a topic and
  // the topic's numbers about itself keep coming from one place. That claim was
  // true of the count and false of the WORD until the rollup and this band both
  // went through `kindPlural`: a topic's band read "0 practices" under a
  // subject's column headed "Practices", and every other surface said
  // "Practice".
  for (const kind of type.kinds) {
    const n = pages.filter((p) => p.fm["type"] === kind.id).length;
    cell(String(n), (n === 1 ? kind.label : kindPlural(kind)).toLowerCase());
  }
  // An em dash rather than 0.0 when nothing is graded: an average of no
  // readings is absent, not zero, and showing 0.0/5 on a fresh topic reads
  // as "you understand none of this" rather than "nothing logged yet".
  const word = `avg ${ratingWord(ratingDef)}`;
  const outOf = ratingDef?.max != null ? `/${ratingDef.max}` : undefined;
  if (conf) cell(conf.avg, word, outOf);
  else cell("—", word);

  // Open tasks are Almanac `- ( )` lines in note bodies, invisible to the
  // metadata cache — so this cell ships a placeholder and fills once the
  // bodies are read, exactly as the topics-table's Open column does.
  const openCell = root.createDiv({ cls: "jts-cell" });
  const openVal = openCell.createDiv({ cls: "jts-value", text: "…" });
  openCell.createDiv({ cls: "jts-label", text: "open tasks" });
  void sumBodyTasks(app, pages.map((p) => p.file)).then(({ open }) => {
    openVal.setText(open ? String(open) : "—");
  });

  return root;
}

// ── journal-totals ───────────────────────────────────────────────────
//
// `journal-totals` — what the notes below this one ADD UP TO.
//
// NO ARGUMENT, AND THAT IS THE DESIGN. A directive naming one tracker would
// force the summable quantity to be a kind's `rating`, because the catalogue
// can only name a tracker through `typeRating` — and a kind has exactly one,
// so an Exercise journal would have to choose between Intensity and Distance
// and could never band both.
//
// So it reads the REGISTRY instead, which it can do and `journal-chart`
// cannot, for one reason: the widget holds the plugin. `TrackerDef.reduce` is
// already the field that says a quantity adds up — its only effect until now
// was on diary charts, so on a journal tracker the control that sets it was
// visibly present and did nothing. This gives it its meaning on this surface.
//
// Reuses `pagesUnder` and `confidenceKinds` — so a total and an average can
// never disagree about what is in scope — and `summarize`, which has returned
// `total` all along.
//
// A QUANTITY WITH NO READINGS DRAWS NO CELL. That is what makes one directive
// serve Books and Film out of one journal: the Books shelf bands *Pages read*,
// the Film shelf bands *Minutes*, because neither has any reading of the
// other. A zero would be a claim that nobody read any pages; absence is the
// honest answer and the useful one.
export function buildJournalTotals(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  label: string | null
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-totals" });

  const file = hostFile(app, ctx);
  if (!file?.parent) return root;

  const type = hostType(plugin, file.path);
  if (!type) return root;

  const pages = pagesUnder(app, file.parent.path);
  const cells: { label: string; value: string }[] = [];

  for (const def of summableTrackers(plugin, type)) {
    // The kinds that carry this tracker, exactly as an average would ask —
    // `kindAllowsTracker`'s read-side counterpart. A Meal's Calories are not
    // added into a band of Workout distances.
    const counts = new Set(confidenceKinds(plugin, file.path, def.id));
    const values: number[] = [];
    for (const p of pages) {
      const t = p.fm["type"];
      if (typeof t !== "string" || !counts.has(t)) continue;
      const raw = p.fm[def.id];
      if (raw == null || raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) values.push(n);
    }
    const stats = summarize(values);
    if (!stats) continue;
    // Trailing zeroes off a whole number: 45 minutes reads as "45", and 8.5 km
    // keeps the half it was logged with.
    const total = Number(stats.total.toFixed(2));
    cells.push({
      label: ratingNoun(def, def.id).toLowerCase(),
      value: def.unit ? `${total} ${def.unit}` : String(total),
    });
  }

  if (cells.length === 0) {
    // Silent rather than an empty state on a fresh journal: this band sits on
    // an index note that has just been made, and a callout saying "nothing
    // logged" under a heading that already says Totals is a box inside a box —
    // the same rule `journal-breakdown` records one widget up.
    return root;
  }

  if (label) root.createDiv({ cls: "jtot-title", text: label });
  // THE STAT STRIP, REUSED RATHER THAN COPIED. `.am-stats` is the row of
  // divided cells the year dashboard's body and three mastheads already draw,
  // and it brings the one thing a hand-rolled band would have got wrong: it
  // collapses on a `@container` query rather than a `@media` one, so it folds
  // in a narrow PANE and not only in a phone-width window. That distinction
  // was a real bug in this stylesheet once (see 96-stat-strip.css).
  const strip = root.createDiv({ cls: "am-stats" });
  // Capped at the four the collapse rules are written for; a fifth quantity
  // wraps onto a second row, which the gap-as-divider design handles with no
  // per-cell arithmetic.
  strip.setAttribute("data-cols", String(Math.min(cells.length, 4)));
  for (const c of cells) {
    const cell = strip.createDiv({ cls: "am-stat" });
    cell.createDiv({ cls: "am-stat-value", text: c.value });
    cell.createDiv({ cls: "am-stat-label", text: c.label });
  }
  return root;
}

// THE PREDICATE, AND IT IS DELIBERATELY NARROW. A quantity is in this band
// when it is a NUMBER on THIS journal that declares `reduce: "sum"`.
//
// `scale` is excluded even though it is numeric: a total of Intensity readings
// is a number with no meaning — five workouts at 4/5 do not make 20 of
// anything — which is exactly why `reduce` defaults to mean and why the
// default is the silent one. `confidence` and every other mean-reduced tracker
// stay out for the same reason.
export function summableTrackers(
  plugin: AlmanacPlugin,
  type: JournalType
): TrackerDef[] {
  return plugin.settings.trackers.filter(
    (t) =>
      t.type === "number" &&
      t.reduce === "sum" &&
      isJournalSurface(t.surface) &&
      surfaceAcceptsType(t.surface, type.id)
  );
}

// ── journal-tally ────────────────────────────────────────────────────
//
// `journal-tally:<tracker>` — how many of the things below sit at each value.
//
// `journal-breakdown`'s grammar exactly, and the counterpart question: that
// widget ranks containers by an average, this one counts them into the buckets
// of a vocabulary. Two Areas with four Projects and two Completed is a
// sentence a project journal is kept to be able to say, and nothing in the
// plugin could say it — `journalChartRefusal` refuses `select` by design, so
// no chart can count "how many finished".
//
// COUNTS THE CHILD CONTAINERS' INDEX NOTES where the level has one below it,
// and the NOTES where it does not — branching on `hasLevelBelow`, which is the
// structure's own answer and the one that composed the note. An Area tallies
// its Projects; a Project tallies its Updates. Asking the folder what it
// currently contains instead is how a page comes to disagree with the section
// that wrote it.
export function buildJournalTally(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  trackerId: string,
  label: string | null
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-tally" });

  const file = hostFile(app, ctx);
  if (!file?.parent) return root;

  const type = journalTypeOfNote(plugin, file.path);
  const namer = journalTypeNamer(plugin);
  const def = getTracker(plugin, trackerId);
  const refusal = journalTallyRefusal(
    def,
    trackerId,
    type?.id ?? null,
    (surface) => describeSurface(surface, namer),
    type?.name
  );
  if (refusal != null || !def) {
    root.createDiv({ cls: "journal-widget-error", text: refusal ?? "" });
    return root;
  }

  const title = label ?? `${def.label ?? trackerId} tally`;
  root.createDiv({ cls: "jtly-title", text: title });

  // IN THE TRACKER'S DECLARED ORDER, NOT BY COUNT. A status vocabulary is a
  // pipeline — Planned, Active, Blocked, Done — and sorting it by size would
  // reorder the row every time a project moved, which is the one thing a
  // reader is scanning it to notice. `parseSelectOptions` already supplies
  // both the values and their labels.
  const options = parseSelectOptions(def.options);
  const counts = new Map<string, number>(options.map((o) => [o.value, 0]));

  const values: string[] = [];
  if (type && hasLevelBelow(type, file.parent.path)) {
    for (const folder of journalChildFolders(plugin, type, file.parent).filter(
      (f) => isContainerFolder(app, plugin, f)
    )) {
      const index = getFile(app, `${folder.path}/${folder.name}.md`);
      if (!index) continue;
      const v = frontmatterOf(app, index)?.[def.id];
      if (typeof v === "string" && v) values.push(v);
    }
  } else {
    const kinds = new Set(confidenceKinds(plugin, file.path, trackerId));
    for (const p of pagesUnder(app, file.parent.path)) {
      if (p.file.path === file.path) continue;
      const t = p.fm["type"];
      if (typeof t !== "string" || !kinds.has(t)) continue;
      const v = p.fm[def.id];
      if (typeof v === "string" && v) values.push(v);
    }
  }
  for (const v of values) {
    // A value the vocabulary no longer lists is counted rather than dropped:
    // a reader who renamed an option still has notes carrying the old word,
    // and silently omitting them would make the tally disagree with the
    // folder.
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  if (values.length === 0) {
    emptyLine(
      root,
      `Nothing here carries a ${ratingNoun(def, trackerId).toLowerCase()} yet — set one on the notes below and they'll be counted here.`
    );
    return root;
  }

  const known = new Set(options.map((o) => o.value));
  const rows = [
    ...options.map((o) => ({ label: o.label, n: counts.get(o.value) ?? 0 })),
    // Anything off the vocabulary, after the declared run and in the order it
    // was met, so the pipeline still reads left to right.
    ...[...counts.keys()]
      .filter((v) => !known.has(v))
      .map((v) => ({ label: v, n: counts.get(v) ?? 0 })),
  ];

  const strip = root.createDiv({ cls: "jtly-strip" });
  for (const r of rows) {
    const pill = strip.createDiv({ cls: "jtly-pill" });
    // A zero-count option is drawn and dimmed rather than omitted: the row is
    // a pipeline, and a missing stage reads as a stage that does not exist.
    if (r.n === 0) pill.addClass("jtly-empty");
    pill.createSpan({ cls: "jtly-count", text: String(r.n) });
    pill.createSpan({ cls: "jtly-label", text: r.label });
  }
  return root;
}

// ── kind-table ───────────────────────────────────────────────────────
//
// `kind-table:<kindId>` — the notes of one kind beneath this folder, in the
// columns that kind actually has.
//
// REPLACES A ```base BLOCK, and that is the point rather than a side effect.
// The `children` section emitted one Bases table per kind — the last generated
// dashboard content that was not Almanac's own — and it cost three things:
//
//   • a dependency on Bases for the most-read page the plugin generates;
//   • a section that could not be one fence, because a ```base block cannot
//     live inside an ```almanac one. A deepest index therefore shipped 2N
//     sibling blocks with gaps between them that no styling could close —
//     the same limit journals-section.ts describes, and the one 2.13.9 and
//     2.18.4 each spent a release removing somewhere else;
//   • a table that disagreed with the band above it. See the scope note.
//
// SCOPE IS RECURSIVE, and that is a deliberate correction rather than a
// translation. The base table filtered `file.inFolder(this.file.folder)` —
// the folder itself, not what is under it — so a lesson that had been
// *promoted* (moved into `Quadratics/Quadratics.md` so it could hold pages)
// silently dropped out of the very table that should head it, while
// `topic-stats` and `topics-table`, which both read `pagesUnder`, went on
// counting it. Three widgets on one page and two answers to "what is here".
// This reads the same folder they do.
//
// Pages are excluded by construction rather than by a rule: a page's `type` is
// its kind's `pages.id`, deliberately not one of the type's kinds, so a filter
// on the kind id cannot match one.
//
// NO VIEW SWITCHER. The base table shipped three views — Not Completed,
// Completed, All — and reproducing them would mean interactive state, which a
// LiveWidget cannot keep: it rebuilds the whole subtree on every change in
// scope, so a chosen tab would reset the next time anyone logged anything. The
// intent behind those views was "open work first", and sorting says that
// without inventing state that would not survive. Completed notes sort last and
// render muted, which is strictly more than the default view showed.
// The status value every rollup treats as done.
//
// A constant rather than a literal in three places, and exported because it is
// the one word the whole status vocabulary was settled around: `in-progress`
// and `completed` won over `active/paused/done` precisely because the tables
// were the load-bearing consumers. Those consumers used to be `base` filter
// lines in a composed template, where a test could read them; they are this
// function now, so this is where that claim gets asserted.
//
// Compared case-insensitively and trimmed, because `status` is a property a
// reader can type by hand as easily as pick from the dropdown.
export const COMPLETED_STATUS = "completed";

export function isCompletedStatus(raw: unknown): boolean {
  return String(raw ?? "").trim().toLowerCase() === COMPLETED_STATUS;
}

// The frontmatter properties a kind's table shows, after the title: its date,
// its rating if it declares one and nothing where it doesn't, then its status.
//
// The same derivation the leaf template's frontmatter uses, so a table cannot
// offer a column for a property the notes never carry — which is the whole of
// per-kind rating scoping as it reaches this surface. Pure and exported for the
// reason sortBreakdown is: the derivation is the claim worth testing, and until
// 2.54 it was testable by reading the ```base block out of a composed template.
// Moving the table into code moved that claim with it.
export function kindTableProperties(
  kind: JournalKind,
  statusProperty = "status"
): string[] {
  return [
    "date",
    ...(kind.rating ? [kind.rating] : []),
    statusProperty,
  ];
}

// Open work first, then newest first, then by name.
//
// Pure given the rows, exactly as sortBreakdown is, and for the same reason:
// three tie-breaks is enough rules to be worth pinning somewhere a vault isn't
// needed to check them.
//
// Undated sorts LAST rather than first: a note with no date has no position in
// the sequence, which is not the same as being the oldest — the reading
// journal-search already settled on for a dateless page.
export interface KindRow {
  basename: string;
  date: string | null;
  done: boolean;
}

export function sortKindRows<T extends KindRow>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    }
    return a.basename.localeCompare(b.basename);
  });
}

export function buildKindTable(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  kindId: string
): HTMLElement {
  const app = plugin.app;
  const file = hostFile(app, ctx);
  if (!file?.parent) {
    return createDiv({ cls: "journal-table journal-kind-table" });
  }
  const type = hostType(plugin, file.path);
  if (!type) return createDiv({ cls: "journal-table journal-kind-table" });
  return kindTable(plugin, ctx, type, file.parent.path, kindId);
}

// One kind's notes under a folder, as a table.
//
// TAKES ITS SCOPE RATHER THAN READING THE HOST, on `folderRollup`'s argument and
// in the same release: `level-index` draws one of these per kind at the deepest
// level, for a folder it resolved rather than the one it happens to sit in.
export function kindTable(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType,
  folderPath: string,
  kindId: string
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-kind-table" });
  const kind = type.kinds.find((k) => k.id === kindId);
  // Named rather than silent, and this is the case that will actually happen:
  // removing a note kind leaves this directive behind in every template and
  // index note that carried it, and "nothing rendered here" is the least
  // useful thing to say about that. Same wording as the unknown-widget error
  // the block processor already prints, for the same reason.
  if (!kind) {
    root.createDiv({
      cls: "journal-widget-error",
      text: `Unknown ${type.name} note type: ${kindId}`,
    });
    return root;
  }

  // Both resolved from the registry rather than spelled out, the same rule
  // reviewProperties follows — a relabelled or re-keyed built-in must not
  // leave this reading a dead property.
  const statusId = getBuiltinTracker(plugin, "status")?.id ?? "status";
  const statusDef = getTracker(plugin, statusId) ?? null;
  const ratingId = kind.rating ?? null;
  const ratingDef = ratingId ? getTracker(plugin, ratingId) ?? null : null;

  const notes = pagesUnder(app, folderPath).filter(
    (p) => p.fm["type"] === kind.id
  );

  if (notes.length === 0) {
    root.appendChild(
      emptyCallout(
        "file-plus",
        `No ${kindPlural(kind).toLowerCase()} yet`,
        // “New Lesson”, matching the button, not “Lesson”, matching the kind.
        // The button is labelled `New ${kind.label}` (journalButtonSpec), so
        // this told a reader to press something that is not on the screen —
        // close enough to guess, and the sort of near-miss that makes an empty
        // state feel written rather than checked. Both strings are derived from
        // `kind.label`, so they agree by construction now.
        `Press “New ${kind.label}” above to add one — it'll appear here with its date${
          ratingId ? `, ${ratingWord(ratingDef)}` : ""
        } and status.`
      )
    );
    return root;
  }

  // A select tracker's stored value is a slug and its label is what a reader
  // set in Settings, so "in-progress" shows as whatever they called it. Falls
  // back to the raw value for a status the registry doesn't describe, which is
  // every hand-typed one.
  const statusLabels = new Map(
    parseSelectOptions(statusDef?.options).map((o) => [o.value, o.label])
  );
  const statusOf = (fm: Record<string, unknown>): string => {
    const raw = fm[statusId];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return "";
    return statusLabels.get(value) ?? value;
  };
  const sorted = sortKindRows(
    notes.map((p) => ({
      note: p,
      basename: p.file.basename,
      date: isoDate(p.fm["date"]),
      done: isCompletedStatus(p.fm[statusId]),
    }))
  );

  // Headings: the kind's own label over the title column, matching the
  // `displayName` the base table set — "Lesson", not "Title" — then one per
  // property the kind carries, labelled from the registry where it has an
  // entry and from the property name where it doesn't.
  const columns = kindTableProperties(kind, statusId);
  const heading = (property: string): string => {
    if (property === "date") return "Date";
    if (property === statusId) return ratingNoun(statusDef, "Status");
    return ratingNoun(ratingDef, property);
  };

  // Was a `<table>`; see `recordList` above for why these three dashboards'
  // lists stopped being one. This was the first of the three converted, in
  // 2.56.5, and it carried the heading strip and the ARIA roles inline until
  // the second and third arrived to make the repetition obvious.
  const { row: addRow } = recordList(root, [
    kind.label,
    ...columns.map(heading),
  ]);

  for (const { note, date, done } of sorted) {
    const main = addRow({
      title: note.file.basename,
      titleRender: (slot) =>
        internalLink(slot, app, note.file, note.file.basename, ctx.sourcePath),
      cls: ["is-done-able", done ? "is-done" : ""],
    });
    for (const property of columns) {
      if (property === "date") {
        recordCell(main, date ?? "—");
      } else if (property === statusId) {
        recordCell(main, statusOf(note.fm) || "—", "is-text");
      } else {
        const v = Number(note.fm[property]);
        const cell = recordCell(main, "");
        ratingCell(cell, v, property === ratingId ? ratingDef : null);
      }
    }
  }

  return root;
}

// A bounded number, drawn as filled segments rather than written as a digit.
//
// `3` on its own is not a reading — three out of what? The tracker already
// declares its own range, so the bar is built from `min`/`max` rather than from
// the largest value present, which is the same rule buildJournalBreakdown's
// scale follows and for the same reason: normalising to the data makes the best
// item look full whatever it scored.
//
// Falls back to the digit where the tracker declares no bounds, because a bar
// with no scale is a decoration.
function ratingCell(
  host: HTMLElement,
  value: number,
  def: TrackerDef | null
): void {
  if (!Number.isFinite(value)) {
    host.setText("—");
    return;
  }
  const min = def?.min ?? null;
  const max = def?.max ?? null;
  if (min == null || max == null || max <= min || max - min > 10) {
    host.setText(String(value));
    return;
  }
  const steps = Math.round(max - min) + 1;
  const filled = Math.round(value - min) + 1;
  const bar = host.createDiv({ cls: "almanac-list-gauge" });
  bar.setAttr("aria-label", `${value} of ${max}`);
  for (let i = 1; i <= steps; i++) {
    bar.createSpan({
      cls: `almanac-list-seg${i <= filled ? " is-on" : ""}`,
    });
  }
}

// ── pages-table ──────────────────────────────────────────────────────
// The page index on a promoted note's dashboard. Reads the markdown files
// sitting beside the folder note — not recursively, because a sub-folder under
// a lesson belongs to a different note.
//
// A page is identified by its `type` matching the kind's `pages.id`, which is
// deliberately not one of the type's kinds: that is what keeps pages out of the
// review queue, the confidence average and the Lessons table without any of
// them needing a rule about pages. Here is the one place that wants them, so
// here is the one place that names the value.
//
// Ordered by the `order` property the page template stamps at creation, with
// the file name as the tie-break so a hand-added page (no `order`) still lands
// somewhere predictable rather than at a random point in the list.
export function buildPagesTable(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-pages-table" });

  const file = hostFile(app, ctx);
  if (!file?.parent) return root;

  const type = journalTypeOfNote(plugin, file.path);
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const kind = type?.kinds.find((k) => k.id === fm["type"]);
  const pageId = kind?.pages?.id ?? "page";
  const label = kind?.pages?.label ?? "Page";

  const pages = childFiles(file.parent)
    .filter((f) => f.path !== file.path)
    .map((f) => ({
      file: f,
      fm: app.metadataCache.getFileCache(f)?.frontmatter ?? {},
    }))
    .filter((p) => p.fm["type"] === pageId)
    .sort((a, b) => {
      const ao = Number(a.fm["order"]);
      const bo = Number(b.fm["order"]);
      const av = Number.isFinite(ao) ? ao : Number.MAX_SAFE_INTEGER;
      const bv = Number.isFinite(bo) ? bo : Number.MAX_SAFE_INTEGER;
      return av !== bv ? av - bv : a.file.basename.localeCompare(b.file.basename);
    });

  if (pages.length === 0) {
    root.appendChild(
      emptyCallout(
        "files",
        // `label` is a kind's label, which carries the kind's glyph.
        `No ${splitGlyph(label).text.toLowerCase()}s yet`,
        `Press “New ${label}” to split this note across several — the note itself stays where it is and keeps its trackers.`
      )
    );
    return root;
  }

  // The same row as the two lists above, with the ordinal in the component's
  // `token` slot — which is what that slot is: the small fixed thing before the
  // name. `jpt-index`, `jpt-row` and `jpt-title` were this list's own three
  // classes for a shape three other lists already had.
  //
  // No heading strip and no value columns: a page index is a name and its
  // position, so `recordList`'s grid would be one track with a blank header
  // over it. `createListRow` directly, therefore, rather than bending the
  // helper to describe a table with no columns.
  const list = root.createDiv({ cls: "almanac-list" });
  pages.forEach((page, i) => {
    createListRow(list, {
      token: String(i + 1),
      title: page.file.basename,
      titleRender: (slot) =>
        internalLink(slot, app, page.file, page.file.basename, ctx.sourcePath),
      dense: true,
    });
  });

  return root;
}

// ── journal-breakdown ────────────────────────────────────────────────
//
// `journal-breakdown:<tracker>[|Label]` — one bar per thing below this note,
// ranked weakest first. The categorical sibling of `journal-chart`: that one
// answers "am I improving?", this one answers "where am I weakest?", and only
// the second changes what you open next.
//
// WHY IT IS NOT A CHART. The whole chart system is a time series — ranges,
// windows, points with dates. A breakdown across topics has no time axis at
// all, and bending the chart system around a categorical series would mean
// giving every chart type a notion of what to do without one. So it is a
// widget that draws bars, and it borrows `journal-chart`'s refusal path rather
// than the chart system's rendering.
//
// GENERALISED ON THE WAY IN, deliberately. `confidence-trend` shipped in 2.29
// hardcoded to one built-in and had to be generalised in 2.32; that was cheap
// only because nothing had accumulated on the narrow version yet. Shipping
// this as `confidence-by-topic` would be the identical mistake with the
// identical excuse, so it takes a tracker id from the start and there is no
// preset spelling — unlike `confidence-trend`, nothing on disk names the
// narrow version, so there is nothing to keep working.
//
// WHAT THE BARS ARE. The immediate child *containers*, when there are any: on
// a subject index that is its topics, matching `topics-table`'s rows exactly.
// When there are none — a topic index, whose children are notes — it falls to
// one bar per rated note, which is the same question asked one level down
// ("which lesson is weakest?"). A promoted lesson is a folder but not a
// container, so it is excluded from the first list and counted in the second;
// otherwise a topic would break down into "the lessons that happen to have
// been split" plus a lump.
function isContainerFolder(
  app: App,
  plugin: AlmanacPlugin,
  folder: TFolder
): boolean {
  const note = getFile(app, `${folder.path}/${folder.name}.md`);
  if (!note) return true; // no folder note at all — still a container
  const t = app.metadataCache.getFileCache(note)?.frontmatter?.["type"];
  const value = typeof t === "string" ? t : "";
  const type = journalTypeOfNote(plugin, note.path);
  // No journal, so no leaf kinds to recognise — and the permissive answer is
  // already this function's documented default two lines up: a folder note
  // whose `type` names nothing we know is still a container (3.19.1). Reading
  // Study's kinds here made a stray folder note saying `type: lesson` a LEAF in
  // a vault that may not even have Study turned on.
  if (!type) return true;
  const leaves = new Set<string>();
  for (const kind of type.kinds) {
    leaves.add(kind.id);
    if (kind.pages) leaves.add(kind.pages.id);
  }
  return !leaves.has(value);
}

export interface BreakdownBar {
  label: string;
  file: TFile | null;
  value: number;
  count: number;
}

// Pure given the rows: sort weakest-first, then by name so equal values have a
// stable order rather than whatever the filesystem returned.
export function sortBreakdown(bars: BreakdownBar[]): BreakdownBar[] {
  return bars
    .slice()
    .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

export function buildJournalBreakdown(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  trackerId: string,
  label: string | null
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-breakdown" });

  const file = hostFile(app, ctx);
  if (!file?.parent) return root;

  const type = journalTypeOfNote(plugin, file.path);
  const namer = journalTypeNamer(plugin);
  const def = getTracker(plugin, trackerId);
  const refusal = journalChartRefusal(
    def,
    trackerId,
    type?.id ?? null,
    (surface) => describeSurface(surface, namer),
    type?.name
  );
  if (refusal != null || !def) {
    root.createDiv({ cls: "journal-widget-error", text: refusal ?? "" });
    return root;
  }

  const kinds = confidenceKinds(plugin, file.path, trackerId);
  // "⚖️ Weight breakdown", not "⚖️ Weight".
  //
  // A subject index draws a confidence CHART and this ranking one after the
  // other, and both used to title themselves with the bare tracker label — two
  // adjacent widgets, same words, and no way to tell from the titles that one
  // is a trend over time and the other a ranking of the topics beneath. The
  // reader reported it as a duplicated title, which is what it looked like.
  //
  // "Breakdown" rather than a new word: it is what the directive that draws
  // this is called (`journal-breakdown`), so it is already a term this plugin
  // owns and a reader can already have seen. An explicit `|Label` in the
  // directive still wins — the default is what changes, not the override.
  const title = label ?? `${def.label ?? trackerId} breakdown`;
  root.createDiv({ cls: "jbd-title", text: title });

  const containers = journalChildFolders(
    plugin,
    // The type resolved above, not a second call to the same resolver. The two
    // gave different answers for an unclassified note — `type?.id ?? null`
    // there is the permissive branch that lets the refusal pass, while the
    // fallback here quietly borrowed Study's identity to enumerate with. One
    // resolution, so the widget cannot refuse as one journal and then read the
    // folder tree as another.
    //
    // AND THE FALLBACK IS GONE (3.19.1). It survived here on the grounds that
    // `journalChildFolders` needs *a* type to exclude foreign roots by; that
    // function now takes null and reads it as "every registered root is
    // foreign", which is what an unclassified host actually means and what
    // Study-as-a-stand-in only approximated.
    type ?? null,
    file.parent
  ).filter((f) => isContainerFolder(app, plugin, f));

  const bars: BreakdownBar[] = [];
  if (containers.length > 0) {
    for (const folder of containers) {
      const stats = confidenceStats(pagesUnder(app, folder.path), def.id, kinds);
      if (!stats) continue;
      bars.push({
        label: folder.name,
        file: getFile(app, `${folder.path}/${folder.name}.md`),
        value: Number(stats.avg),
        count: stats.count,
      });
    }
  } else {
    // One level down: the rated notes in this folder. `count` is 1 per note,
    // so the row still says what it is averaging over even though there is
    // nothing to average.
    const counts = new Set(kinds);
    for (const p of pagesUnder(app, file.parent.path)) {
      if (p.file.path === file.path) continue;
      const t = p.fm["type"];
      if (typeof t !== "string" || !counts.has(t)) continue;
      const raw = p.fm[def.id];
      const n = raw != null && raw !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) continue;
      bars.push({ label: p.file.basename, file: p.file, value: n, count: 1 });
    }
  }

  if (bars.length === 0) {
    // A LINE, not a callout, and empty.ts already said so: `emptyCallout`
    // REPLACES content where there is no card, `emptyLine` ANNOTATES a region
    // inside a widget that has already drawn its own header. This widget draws
    // `jbd-title` two lines up, so the callout was a box inside a box — and,
    // worse, its title was built as `No ${title.toLowerCase()} ratings yet`,
    // which restated the heading directly above it AND lowercased a string
    // beginning with an emoji, producing "No 🎯 confidence ratings yet". A
    // glyph is a slot, not a word in a sentence.
    //
    // The copy keeps both halves of the empty-state rule: what will appear
    // here, and how to make it happen.
    emptyLine(
      root,
      "No ratings yet — rate some notes, or grade a Recall deck, which writes the rating for you, and they'll be ranked here."
    );
    return root;
  }

  // The scale is the tracker's own range where it declares one, not the
  // largest value present. A bar chart normalised to its own maximum makes the
  // best item full-width whatever it scored, which reads as "this one is
  // fine" — the exact opposite of what a weakest-first ranking is for.
  const max = Math.max(
    def.max ?? 0,
    ...bars.map((b) => b.value),
    1
  );

  const list = root.createDiv({ cls: "jbd-list" });
  for (const bar of sortBreakdown(bars)) {
    const row = list.createDiv({ cls: "jbd-row" });
    const name = row.createDiv({ cls: "jbd-label" });
    if (bar.file) {
      internalLink(name, app, bar.file, bar.label, ctx.sourcePath);
    } else {
      name.createSpan({ text: bar.label });
    }
    const track = row.createDiv({ cls: "jbd-track" });
    const fill = track.createDiv({ cls: "jbd-fill" });
    fill.style.width = `${Math.max(2, (bar.value / max) * 100)}%`;
    row.createDiv({
      cls: "jbd-value",
      text: `${bar.value}${bar.count > 1 ? ` · ${bar.count}` : ""}`,
    });
  }

  return root;
}

// ── confidence-summary ───────────────────────────────────────────────
// Avg/latest/count confidence across every lesson in scope. Scope = the
// host note's own folder, so the same widget works unchanged for both the
// subject index (aggregates all topics) and a topic index (just itself) —
// both are folder notes. Owns its own empty/non-empty state; the Tracker
// Activity chart stays a separate `tracker` block and is left to render on
// its own (see the v1.5 plan §5 — an empty chart on a brand-new subject is
// a fine tradeoff for deleting the old DOM-hiding hack).
// Average/latest confidence across a set of pages, or null when no lesson
// carries a rating. Pure given the pages, and shared by the standalone
// `confidence-summary` widget and the Progress rail in the activity heatmap so
// the two can never drift into reporting different averages for one subject.
//
// `property` is the frontmatter key to read, resolved by the caller from the
// registry (getBuiltinTracker(plugin, "confidence").id) rather than hardcoded
// here — the same rule that keeps the sleep coupling and the heat map from
// spelling out "Mood". It defaults to the built-in's own id so a caller
// without the plugin in hand still gets the right answer.
//
// The frontmatter key the confidence built-in writes. One helper rather than
// four getBuiltinTracker calls, so the four readers of this number can't drift
// onto different properties — the same reason confidenceStats itself is shared.
export function confidenceProperty(plugin: AlmanacPlugin): string {
  return getBuiltinTracker(plugin, "confidence")?.id ?? "confidence";
}

// Which note kinds an average of `trackerId` should count, for the journal
// type a note belongs to. Falls back to Study's kinds for a note outside every
// registered root, which is the only shape a stray note of this sort has.
//
// NARROWED IN 2.36, and this is the read-side half of the split. Until then it
// returned every kind of the type, on the stated grounds that there was
// nothing in JournalKind that could say otherwise. There is now: a kind
// declares which trackers it carries, so an average of Confidence counts the
// kinds that carry Confidence and nothing else.
//
// What that fixes is not cosmetic. 2.31 made a Recall block on a Practice note
// write Confidence, and 2.34 confirmed that as deliberate — so `topics-table`'s
// column, `confidence-summary` and `journal-breakdown` had all been averaging
// "did I remember this" together with "did I get these right" into one number
// per topic that meant neither. Item 1's whole case was that a comparison
// across topics finally compares something measured.
//
// `trackerId` is REQUIRED, and the sentinel below is the only way to ask for
// every kind. It was optional for about an hour and that was long enough to
// ship two call sites that forgot it — the trend kept averaging Practice notes
// into a Confidence series while its sibling the breakdown did not, which is
// precisely the "two answers to one question" rot the codebase keeps warning
// about. An optional parameter whose default is the *old* behaviour is a
// migration that never finishes: every future caller silently opts out of the
// fix. A caller that genuinely wants every kind now has to say the word.
export const EVERY_KIND = Symbol("every kind");

export function confidenceKinds(
  plugin: AlmanacPlugin,
  notePath: string,
  trackerId: string | typeof EVERY_KIND
): string[] {
  // EMPTY WHEN THE NOTE IS IN NO JOURNAL (3.19.1), where this read Study's
  // kinds. The return value is a list of `type:` frontmatter values that count
  // as rated notes, and the honest answer for a note outside every root is that
  // none do — the same answer `kindsCarrying` gives for a tracker no kind
  // carries. Handing back `["lesson", "practice"]` there made an average count
  // whatever Study-shaped notes happened to be lying around, in a vault that
  // may not have Study enabled at all.
  const type = journalTypeOfNote(plugin, notePath);
  if (!type) return [];
  if (trackerId === EVERY_KIND) return type.kinds.map((k) => k.id);
  return kindsCarrying(type, trackerId);
}

// `kinds` is which `type` values count as a rated note. Previously the literal
// "lesson", which made this — and everything built on it — a Study-only
// feature by accident rather than by decision. 2.27 made the *property* come
// from the registry and deliberately left this half, on the grounds that
// generalising one and not the other reads as finished work that isn't; item 2
// of the roadmap is where the other half comes due.
//
// `kinds` is REQUIRED as of 2.39. It used to default to `["lesson"]` on the
// grounds that the callers only ever saw Study notes — which stopped being
// true the moment the section catalogue started emitting these widgets into
// custom journals, and a default that silently means "Study" is exactly the
// kind of leak items 0 and 1 of the designer roadmap existed to close. Every
// caller now passes a kind list from confidenceKinds, which reads the host
// note's own type.
export function confidenceStats(
  pages: PageInfo[],
  property: string,
  kinds: string[]
): { avg: string; latest: unknown; count: number } | null {
  const counts = new Set(kinds);
  const rated = pages.filter(
    (p) =>
      typeof p.fm["type"] === "string" &&
      counts.has(p.fm["type"]) &&
      p.fm[property] != null
  );
  if (rated.length === 0) return null;
  // Date desc, then created/ctime desc — same order the old dataviewjs used.
  const sorted = rated.slice().sort((a, b) => {
    const cmp = (isoDate(b.fm["date"]) ?? "").localeCompare(
      isoDate(a.fm["date"]) ?? ""
    );
    return cmp !== 0 ? cmp : recencyMs(b.fm, b.file) - recencyMs(a.fm, a.file);
  });
  const avg = (
    sorted.reduce((s, p) => s + Number(p.fm[property]), 0) / sorted.length
  ).toFixed(1);
  return { avg, latest: sorted[0].fm[property], count: sorted.length };
}

export function buildConfidenceSummary(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-confidence-summary" });

  const file = hostFile(app, ctx);
  if (!file?.parent) return root;
  const scope = file.parent.path;

  const type = hostType(plugin, file.path);
  if (!type) return root;
  const pages = pagesUnder(app, scope);
  const typed = pages.filter((p) => p.fm["type"]);
  const ratingDef = ratingDefOf(plugin, type);
  const ratingId = ratingDef?.id ?? confidenceProperty(plugin);
  // The kinds this average counts — the ones that carry the rating — which is
  // also what the empty state should name. Telling a Cooking journal to "add a
  // lesson" was the most visible of these four leaks.
  const counted = confidenceKinds(plugin, file.path, ratingId);
  const named = type.kinds.filter((k) => counted.includes(k.id));
  const nameList = named.length
    ? named.map((k) => `${k.emoji} New ${k.label}`).join(" or ")
    : `New ${type.levels[type.levels.length - 1].noun}`;

  if (typed.length === 0) {
    root.appendChild(
      emptyCallout(
        "graduation-cap",
        `No ${splitGlyph(type.name).text.toLowerCase()} notes yet`,
        `Add one with ${nameList} — a summary fills in here automatically.`
      )
    );
    return root;
  }

  const stats = confidenceStats(typed, ratingId, counted);

  if (!stats) {
    root.appendChild(
      emptyCallout(
        "gauge",
        `No ${ratingWord(ratingDef)} data yet`,
        `Set ${ratingDef ? ratingDef.label : "a rating"} on a note here to see a summary.`
      )
    );
    return root;
  }

  const outOf = ratingDef?.max != null ? `/${ratingDef.max}` : "";
  const label = named.length === 1 ? named[0].label.toLowerCase() : "note";
  const p = root.createEl("p", { cls: "jt-confidence-line" });
  p.createEl("strong", {
    text: `${ratingDef?.label ?? "Rating"} avg ${stats.avg}${outOf} · latest ${
      stats.latest
    }${outOf} · ${stats.count} ${
      stats.count === 1 ? label : plural(label)
    } tracked`,
  });

  return root;
}

// ── tasks-table ──────────────────────────────────────────────────────
// The folder-scoped open-tasks rollup that replaces the vault's old
// ```tasks``` (Tasks-plugin) blocks on the Weekly / Monthly / Staging
// overviews and the Subject dashboard. Where the per-note `tasks:` widget
// (widgets.ts::buildTasks) reads one note's own region, this walks every
// note under `folder`, reads each body, pulls Almanac task lines out of any
// `<!--almanac:KEY-->` region, and lists the still-open ones grouped by
// source note — the same shape the old `not done` + `group by filename`
// query produced.
//
// Reading bodies is async (the metadata cache doesn't carry Almanac's
// `- ( )` marker, only Obsidian's `- [ ]`, so `taskCounts` can't see these).
// The builder returns its root synchronously and fills it once the reads
// resolve, matching how buildTasks defers its first paint. Toggling a checkbox
// re-serializes just that note's region back via vault.process, and the
// surrounding LiveWidget (scoped to `folder` in widgets.ts) repaints the whole
// table. The DOM is rebuilt from scratch each paint, but the disk reads behind
// it are cached by mtime/size (see the read cache below), so a repaint after
// one toggle only re-reads the single note that changed.

interface OpenTaskRow {
  file: TFile;
  key: string;
  // Index of this task within its region's full (open+done) task list. Kept as
  // a fast-path hint for the toggle, but the toggle no longer trusts it blindly
  // — see toggleTaskDone: it matches on the serialized line first (stable under
  // concurrent edits) and only falls back to the index when the line is
  // ambiguous or gone.
  index: number;
  // The exact on-disk line this row was parsed from (serializeTaskLine output).
  // Used to re-find the task at toggle time without depending on its position,
  // so two toggles racing on the same note can't flip each other's lines.
  line: string;
  task: AlmanacTask;
}

// ── read cache ────────────────────────────────────────────────────────
// Reading every note body under a folder on every repaint is the table's one
// real cost, and the LiveWidget wrapper repaints on any change under the scope
// — so ticking one task would otherwise re-read the whole folder. This caches
// each file's parsed open-task rows keyed by path, invalidated on mtime *or*
// size change (mtime alone can miss same-second edits on coarse-granularity
// filesystems; size catches most of those cheaply). It's in-memory only: mtime
// is the source of truth, so there's no persisted-cache staleness to reconcile
// against external edits or sync — a changed file is always re-read.
//
// Module-level (shared across every tasks-table instance and repaint) so two
// dashboards scoped to overlapping folders don't double-read. Entries for
// deleted files are swept lazily each build (see readOpenTasks).
interface CacheEntry {
  mtime: number;
  size: number;
  rows: OpenTaskRow[];
}
const taskCache = new Map<string, CacheEntry>();

// Test-only: clear the module cache so unit tests don't leak state between
// cases. Harmless in production (just forces a cold read).
export function __clearTaskCache(): void {
  taskCache.clear();
}

// Parse one file's text into its open-task rows (pure given the text).
function parseOpenRows(file: TFile, text: string): OpenTaskRow[] {
  const rows: OpenTaskRow[] = [];
  for (const region of allNoteRegions(text)) {
    const tasks = parseTasks(region.content);
    tasks.forEach((task, index) => {
      if (!task.done) {
        rows.push({
          file,
          key: region.key,
          index,
          line: serializeTaskLine(task),
          task,
        });
      }
    });
  }
  return rows;
}

// Count Almanac tasks (open + done) across every `<!--almanac:KEY-->` region in
// a note's body. Pure given the text. This is the counterpart the week/month
// summaries need: util.ts::taskCounts reads Obsidian's listItems cache, which
// only sees native `- [ ]` checkboxes — Almanac's `- ( )` marker is invisible
// to it by design, so taskCounts always returns 0 for Almanac tasks. Walking
// the regions (the same source the open-tasks table reads) is the only correct
// count. Exported for unit testing without a vault.
export function countAlmanacTasks(text: string): { open: number; done: number } {
  let open = 0;
  let done = 0;
  for (const region of allNoteRegions(text)) {
    for (const task of parseTasks(region.content)) {
      if (task.done) done++;
      else open++;
    }
  }
  return { open, done };
}

// Sum open/done Almanac tasks across a set of notes. The counterpart every
// *summary* needs (week-summary, month-summary, the home hero's stat rail):
// each of those used to call util.ts::taskCounts, which reads the listItems
// cache and therefore reported a flat 0 for a vault whose tasks are all
// Almanac's `- ( )` lines — see the note on countAlmanacTasks above.
//
// Reading bodies is the cost of counting correctly, so this is async and
// bounded (mapWithLimit, same 12-way limit the tasks-table read uses) rather
// than firing one read per note at the adapter. Callers build their DOM
// synchronously with a placeholder and fill it when this resolves.
//
// `cachedRead` (not `read`) because nothing here writes: the counts are a
// read-through view and a stale-by-milliseconds number on a passive dashboard
// is fine, whereas the toggle path in openTasksInFile deliberately uses `read`.
export async function sumAlmanacTasks(
  app: App,
  files: TFile[]
): Promise<{ open: number; done: number }> {
  const texts = await mapWithLimit(files, 12, (f) => app.vault.cachedRead(f));
  let open = 0;
  let done = 0;
  for (const text of texts) {
    const c = countAlmanacTasks(text);
    open += c.open;
    done += c.done;
  }
  return { open, done };
}

// Count Almanac tasks (open + done) anywhere in a note's body — not just inside
// `<!--almanac:KEY-->` regions. This is what the study dashboards need, because
// a reader's tasks may sit in a note's prose — beside a Learning-Path bullet,
// under a heading — as well as inside its `tasks:` widget region.
//
// CORRECTED IN 3.12. This used to say the lesson/practice/topic templates carry
// content-level `- ( )` checkboxes of their own. They did as assets; they do
// not as composed templates, and that is the right shape — a fresh lesson ships
// a `tasks:tasks|✅ Tasks` widget over an empty region rather than seeded tasks
// nobody asked for. The stale wording is worth recording rather than deleting,
// because three call sites repeated it and it is what made a Study root of
// task-free lessons read as a defect (§14.8).
// `countAlmanacTasks` (regions only) can't see those, and util.ts::taskCounts
// only ever saw the old Obsidian `- [ ]` marker the templates no longer emit —
// so both would report 0. Scanning the whole body with parseTasks (which skips
// every non-task line) counts each `- ( )` / `- (x)` line exactly once whether
// it sits in a region or in free prose. Pure given the text; exported for tests.
export function countBodyTasks(text: string): { open: number; done: number } {
  let open = 0;
  let done = 0;
  for (const task of parseTasks(text)) {
    if (task.done) done++;
    else open++;
  }
  return { open, done };
}

// Sum open/done Almanac tasks across a set of notes, counting the whole body of
// each (see countBodyTasks). The study `topics-table` "Open" column and the
// study Activity chart both used to lean on util.ts::taskCounts (the listItems
// cache, native `- [ ]` only) and so reported 0 once the templates moved to
// Almanac's `- ( )` marker. Async and 12-way bounded, matching sumAlmanacTasks;
// callers build their DOM synchronously with a placeholder and fill on resolve.
export async function sumBodyTasks(
  app: App,
  files: TFile[]
): Promise<{ open: number; done: number }> {
  const texts = await mapWithLimit(files, 12, (f) => app.vault.cachedRead(f));
  let open = 0;
  let done = 0;
  for (const text of texts) {
    const c = countBodyTasks(text);
    open += c.open;
    done += c.done;
  }
  return { open, done };
}

// Whether a note's own date falls inside a dashboard period. Pure, and the
// whole of the period filter's logic — the ISO strings compare lexicographically
// so there's no date parser in the loop (the same reasoning charts.ts gives for
// pointInWindow, and the same class of timezone bug it avoids).
//
// A null `bounds` means "unscoped" and admits everything, which is what keeps
// the plain `tasks-table` behaviour byte-identical. A note with no resolvable
// date is *excluded* from a scoped table: it can't be shown to belong to the
// period, and silently including undated notes would defeat the point of
// scoping (every stray note in the folder would pin itself to every month).
export function inPeriod(
  iso: string | null,
  bounds: PeriodBounds | null
): boolean {
  if (!bounds) return true;
  if (!iso) return false;
  return iso >= bounds.start && iso <= bounds.end;
}

// Read one file's open tasks, using the cache when the file is unchanged since
// last read. A cache hit costs one `stat` field comparison and no disk read.
// Exported for cache-behaviour tests (driven by a fake vault).
export async function openTasksInFile(
  app: App,
  file: TFile
): Promise<OpenTaskRow[]> {
  const cached = taskCache.get(file.path);
  if (
    cached &&
    cached.mtime === file.stat.mtime &&
    cached.size === file.stat.size
  ) {
    return cached.rows;
  }
  const text = await app.vault.read(file);
  const rows = parseOpenRows(file, text);
  taskCache.set(file.path, {
    mtime: file.stat.mtime,
    size: file.stat.size,
    rows,
  });
  return rows;
}

// Bounded-parallel map: run `fn` over `items` at most `limit` at a time, so a
// folder with hundreds of notes doesn't fire hundreds of concurrent vault
// reads at the adapter. Results preserve input order. Exported for testing.
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// Read every file's open tasks (cached). `files` is everything under `folder`,
// so any cache entry *under folder* that wasn't in this read is a since-deleted
// note and can be dropped — but entries under *other* folders (belonging to a
// different table scoped elsewhere) are left alone, so two dashboards don't
// evict each other's caches and cold-read on every paint.
// `files` is what we read; `liveFiles` is everything currently under `folder`
// and defaults to it. The two differ only for a period-scoped table, where
// `files` is a subset — and there the distinction matters: sweeping against the
// subset would evict the cache entry for every out-of-period note on each
// paint, so navigating to last month and back would cold-read the whole folder
// twice instead of hitting cache.
async function readOpenTasks(
  app: App,
  folder: string,
  files: TFile[],
  liveFiles: TFile[] = files
): Promise<OpenTaskRow[][]> {
  const perFile = await mapWithLimit(files, 12, (f) => openTasksInFile(app, f));
  const prefix = normalizePath(folder) + "/";
  const live = new Set(liveFiles.map((f) => f.path));
  for (const path of taskCache.keys()) {
    if (path.startsWith(prefix) && !live.has(path)) taskCache.delete(path);
  }
  return perFile;
}

// Pure: given a region's full task list, the serialized line a row was rendered
// from, and the positional hint, return the index of the task to complete, or
// -1 for a no-op. Matches on the serialized line first (stable under reorder /
// insert since the row was drawn), and only falls back to the index hint when
// the hint still points at an open task whose line matches — never blindly
// trusting the position, which is what makes two toggles racing on one note
// safe. Exported for unit testing without an App/vault.
export function resolveToggleTarget(
  tasks: AlmanacTask[],
  line: string,
  indexHint: number
): number {
  // Prefer an exact serialized-line match among the still-open tasks.
  const byLine = tasks.findIndex(
    (t) => !t.done && serializeTaskLine(t) === line
  );
  if (byLine !== -1) return byLine;
  // Fall back to the positional hint only if it still points at an open task
  // whose line matches (guards against the hint landing on a different task).
  if (
    indexHint >= 0 &&
    indexHint < tasks.length &&
    !tasks[indexHint].done &&
    serializeTaskLine(tasks[indexHint]) === line
  ) {
    return indexHint;
  }
  return -1; // line gone or already completed — no-op
}

// Flip `done` on one open task line and persist. Matches the target line by its
// serialized text within its region rather than by position, so it stays
// correct even if another write reordered or added lines since this row was
// rendered (positional index would silently flip the wrong task). A no-op (line
// already gone / already done) leaves the file untouched, so a double-tap can't
// toggle something back on.
async function toggleTaskDone(
  app: App,
  file: TFile,
  key: string,
  line: string,
  indexHint: number
): Promise<void> {
  await app.vault.process(file, (text) => {
    const region = allNoteRegions(text).find((r) => r.key === key);
    if (!region) return text;
    const tasks = parseTasks(region.content);

    const target = resolveToggleTarget(tasks, line, indexHint);
    if (target === -1) return text;

    tasks[target].done = true;
    const next = writeNoteRegion(text, key, serializeTasks(tasks));
    // Proactively refresh this file's cache entry from the text we're about to
    // write, so the follow-up repaint sees the completion even before the
    // vault's modify event lands and updates stat.mtime.
    taskCache.set(file.path, {
      mtime: file.stat.mtime,
      size: next.length,
      rows: parseOpenRows(file, next),
    });
    return next;
  });
}

// Priority weight for sorting: high first, then normal, then low.
const PRIO_WEIGHT: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

// A terse, human relative label for a due date, plus whether it's overdue.
// Pure (both args are YYYY-MM-DD), so it unit-tests without a clock. Day delta
// is computed the same way query.ts::relativeActivity does it (midnight-floored
// dates, whole-day rounding) so the two agree. House style is terse:
//   past    → "2d ago" (overdue)
//   0 / 1   → "today" / "tomorrow"
//   2..6    → "in 3d"
//   >= 7    → absolute "25 Jul" (D MMM)
// relativeActivity itself is past-only and returns "—" for null, so it can't
// express future due dates — hence this dedicated helper.
export function dueLabel(
  dueIso: string,
  todayIso: string
): { text: string; overdue: boolean } {
  const due = new Date(dueIso + "T00:00:00");
  const today = new Date(todayIso + "T00:00:00");
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: `${-days}d ago`, overdue: true };
  if (days === 0) return { text: "today", overdue: false };
  if (days === 1) return { text: "tomorrow", overdue: false };
  if (days < 7) return { text: `in ${days}d`, overdue: false };
  return { text: moment(dueIso).format("D MMM"), overdue: false };
}

// The scope cycle — Below / Journal / Path. 3.18 §5.3.
//
// BUILT TO `buildRangeCycle`'S SHAPE (chart-widgets.ts), which is the control
// this was asked to resemble and the established pattern for a widget-level
// scope change: one small button in the corner, an optimistic local update, and
// a write back into the directive it is about.
//
// PATH IS CARRIED, NEVER PROPOSED. A reader whose directive names a folder —
// typed in the section editor, or shipped as `tasks-table:{{folder}}` on the
// Subject Index — must be able to cycle away and back without losing the path,
// so it is a state the cycle passes THROUGH when one exists and never a state
// it invents. That is also why the third option is offered at all: it is the
// one that already exists.
//
// STATIC RATHER THAN ABSENT when there is nowhere to cycle to, on
// buildRangeCycle's reasoning — the scope is worth showing whether or not it
// can be changed, and a button that vanishes on some tables and not others is
// harder to read than a quiet one.
// EXPORTED SINCE 3.19.2 so the block processor can draw it in the section's
// header bar. It was built into the table's own root — inside the section body,
// under the title rather than on it — which put a section-level control in the
// same place as the section's content. The bar is where this belongs for the
// same reason "Add category" moved there: the strip is the section's own, and a
// control that acts on the whole table is not one of the table's rows.
export function buildScopeCycle(root: HTMLElement, scope: TasksScope): void {
  const isKeyword = scope.arg === SCOPE_JOURNAL;
  const hasPath = !!scope.arg && !isKeyword;
  const current = isKeyword ? "journal" : hasPath ? "path" : "below";

  const states: { id: string; value: string; label: string; hint: string }[] = [
    {
      id: "below",
      value: "",
      label: "Below",
      hint: `Tasks in notes under ${scope.hostFolder ?? "this note's folder"}`,
    },
    ...(scope.inJournal
      ? [
          {
            id: "journal",
            value: SCOPE_JOURNAL,
            label: "Journal",
            hint: "Tasks in every note of this journal",
          },
        ]
      : []),
    ...(hasPath
      ? [
          {
            id: "path",
            value: scope.arg,
            label: "Path",
            hint: `Tasks in notes under ${scope.arg}`,
          },
        ]
      : []),
  ];

  const at = Math.max(
    0,
    states.findIndex((s) => s.id === current)
  );
  const btn = root.createEl("button", { cls: "journal-tasks-scope" });
  btn.createSpan({
    cls: "journal-tasks-scope-text",
    text: states[at]?.label ?? "Below",
  });
  if (states.length < 2) {
    btn.addClass("is-static");
    btn.disabled = true;
    btn.setAttr("title", `${states[at]?.hint ?? ""} — the only scope available here`);
    return;
  }
  const next = states[(at + 1) % states.length];
  const hint = `${states[at].hint} — click for ${next.label.toLowerCase()}`;
  btn.setAttr("aria-label", hint);
  btn.setAttr("title", hint);
  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    scope.cycle(next.value);
  });
}

// `period` non-null restricts the table to notes whose `journal-date` falls
// inside the host dashboard's current week/month (see inPeriod). It's resolved
// by the caller on every repaint — the Monthly Overview is a single note whose
// `month-start` the period-nav buttons rewrite in place, so the bounds must be
// re-read per build, never captured once.
// What the scope cycle needs to draw itself, or null on a surface that has no
// scope to change. 3.18 §5.3.
export interface TasksScope {
  // The directive's argument as written, minus any `,period` suffix.
  arg: string;
  // Where a bare directive reads, for the Below label's tooltip.
  hostFolder: string | null;
  // Whether "This whole journal" is reachable from here — false outside every
  // registered journal root, where the keyword would resolve to nothing.
  inJournal: boolean;
  // Write the next argument back into the note.
  cycle: (next: string) => void;
}

export function buildTasksTable(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  folder: string,
  period: PeriodBounds | null = null,
  scope: TasksScope | null = null
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "journal-table journal-tasks-table" });
  if (scope) buildScopeCycle(root, scope);

  // Was a two-branch conditional over a four-value union, so a quarter-scoped
  // table labelled itself "week of 1 Jul 2026". See formatPeriodLabel.
  const periodLabel = period ? formatPeriodLabel(period.unit, period.start) : "";

  const allFiles = filesUnder(app, folder);
  // Filter before reading: a scoped table on a folder with years of notes
  // should not pay to read the notes it's about to discard.
  const files = period
    ? allFiles.filter((f) =>
        inPeriod(isoDate(frontmatterOf(app, f)["journal-date"]), period)
      )
    : allFiles;

  if (files.length === 0) {
    root.appendChild(
      period
        ? emptyCallout(
            "list-checks",
            `Nothing for ${periodLabel} yet`,
            `Open tasks from ${periodLabel}'s notes collect here — add one in a note's Tasks field, or use the arrows above to look at another ${period.unit}.`
          )
        : emptyCallout(
            "list-checks",
            "No notes here yet",
            `Open tasks from notes under ${folder} collect here — add a task in any note's Tasks field and it'll show up, grouped by note.`
          )
    );
    return root;
  }

  // Reads are async but cached by mtime/size (see openTasksInFile), so a
  // repaint after a single toggle re-reads only the one changed note, not the
  // whole folder. The LiveWidget wrapper re-invokes this whole builder on any
  // change under `folder`; there's no incremental DOM update path — the DOM is
  // rebuilt from scratch, but the disk reads behind it are mostly cache hits.
  const body = root.createDiv({ cls: "jtt-body" });
  body.createDiv({ cls: "jtt-loading", text: "Loading tasks…" });

  void readOpenTasks(app, folder, files, allFiles).then((perFile) => {
    body.empty();

    // Group by source note, preserving folder read order (already sorted by
    // path via getMarkdownFiles), so notes list in a stable, predictable order.
    const groups: { file: TFile; rows: OpenTaskRow[] }[] = [];
    perFile.forEach((rows, i) => {
      if (rows.length > 0) groups.push({ file: files[i], rows });
    });

    if (groups.length === 0) {
      body.appendChild(
        emptyCallout(
          "check-check",
          "All clear",
          period
            ? `No open tasks for ${periodLabel} — everything's done, or nothing's been added yet.`
            : `No open tasks under ${folder} — everything's done, or nothing's been added yet.`
        )
      );
      return;
    }

    // Local calendar day, computed once for the header's overdue count and
    // reused for every row's due label below (a due date means the user's
    // calendar day; a repaint just before local midnight lags a day, which is
    // fine for a passive dashboard — same tradeoff the old per-row check made).
    const todayIso = isoDate(new Date()) ?? "";
    const total = groups.reduce((s, g) => s + g.rows.length, 0);
    const overdue = groups.reduce(
      (s, g) =>
        s +
        g.rows.filter(
          (r) => r.task.due && todayIso !== "" && r.task.due < todayIso
        ).length,
      0
    );

    // Lighter in-widget line: the collapsible `header:` bar above the widget is
    // the section's primary heading, so this row is a small muted label plus the
    // count / overdue pills — not a bold repeat of the bar.
    const head = body.createDiv({ cls: "jtt-head" });
    const titleEl = head.createDiv({ cls: "jtt-title" });
    setIcon(titleEl.createSpan({ cls: "jtt-title-icon" }), "hourglass");
    // Naming the period is what stops a scoped table from reading as a broken
    // unscoped one: without it, "3 open" on a dashboard showing March is
    // indistinguishable from a table that has quietly lost most of its rows.
    titleEl.createSpan({ text: period ? `Open tasks · ${periodLabel}` : "Open tasks" });

    const pills = head.createDiv({ cls: "jtt-pills" });
    if (overdue > 0) {
      pills.createSpan({
        cls: "jtt-pill jtt-pill-danger",
        text: `${overdue} overdue`,
      });
    }
    pills.createSpan({
      cls: "jtt-pill",
      text: `${total} open · ${groups.length} note${groups.length === 1 ? "" : "s"}`,
    });

    for (const group of groups) {
      const groupEl = body.createDiv({ cls: "jtt-group" });
      const heading = groupEl.createDiv({ cls: "jtt-group-head" });
      internalLink(heading, app, group.file, group.file.basename, ctx.sourcePath);
      heading.createSpan({ cls: "jtt-group-count", text: String(group.rows.length) });

      // Within a note: high → normal → low, then earliest due first (undated
      // last), then original order — the same "most pressing first" reading the
      // old query's default gave.
      const rows = group.rows.slice().sort((a, b) => {
        const p = PRIO_WEIGHT[a.task.priority] - PRIO_WEIGHT[b.task.priority];
        if (p !== 0) return p;
        const ad = a.task.due ?? "\uffff";
        const bd = b.task.due ?? "\uffff";
        return ad.localeCompare(bd);
      });

      const list = groupEl.createDiv({ cls: "jtt-list" });
      for (const row of rows) {
        const rowEl = list.createDiv({
          cls: `journal-task-row jtt-row journal-task-${row.task.priority}`,
        });

        const box = rowEl.createEl("input", {
          type: "checkbox",
          cls: "journal-task-check",
        });
        box.checked = false;
        box.addEventListener("change", () => {
          // Optimistically dim the row; the LiveWidget repaint drops it. Guard
          // against a double-fire (disabled input can still receive a
          // programmatic change) by disabling immediately.
          rowEl.addClass("is-done");
          box.disabled = true;
          void toggleTaskDone(app, row.file, row.key, row.line, row.index);
        });

        rowEl.createSpan({ cls: "journal-task-text jtt-text", text: row.task.text });

        // Priority now reads from the row's left edge (driven by the
        // `journal-task-<priority>` modifier in CSS), so there's no trailing
        // pip. `aria-label` on the row carries the priority for screen readers.
        rowEl.setAttr("aria-label", `${row.task.priority} priority task`);

        if (row.task.due) {
          // `todayIso` is hoisted above the group loop; a null (unparseable
          // clock) yields "" there, and dueLabel treats any real due date as a
          // valid comparison — when todayIso is "" we skip the label entirely.
          if (todayIso !== "") {
            const { text, overdue } = dueLabel(row.task.due, todayIso);
            const due = rowEl.createSpan({
              cls: `jtt-due${overdue ? " jtt-due-overdue" : ""}`,
              text,
            });
            setIcon(due.createSpan({ cls: "jtt-due-icon" }), "calendar");
          }
        }
      }
    }
  });

  return root;
}
