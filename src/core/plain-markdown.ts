// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A note as markdown anybody can read.
//
// WHY THIS FILE EXISTS (4.30)
//
// ChronoAnvil keeps what a reader writes in three places, and two of them are
// invisible without the plugin:
//
//   A BODY REGION — `<!--chronoanvil:key … -->`. The prose is already plain text.
//   It is parked inside an HTML comment because Obsidian drops comments
//   natively in both Reading mode and Live Preview, which is what saves the
//   plugin a CM6 decoration and a post-processor. It also means the words are
//   not on the page once the plugin is gone.
//
//   A ```chronoanvil FENCE — the directive lines, each carrying its section's
//   LABEL. Without the plugin this is a code block reading `note:focus`.
//
//   FRONTMATTER — the readings. Fine: it is YAML, and every editor shows it.
//
// So an entry someone has written in every morning for a year renders, with the
// plugin removed, as a stack of code blocks over nothing at all. The words are
// on disk, in plain text, and unreachable in a reader.
//
// ── THE DOCTRINE IS OLD; ONLY THE SCOPE IS NEW ─────────────────────────
//
// This is not a new value for the project, it is one that has never been asked
// of a whole note. `bridge.ts` serialises a frozen bridge as wikilinks "so a
// frozen bridge is a list of links in a note whether or not ChronoAnvil is
// installed". `journal-sections.ts` makes the prose skeleton real `##` headings
// "because they survive the plugin being uninstalled". `attach:` regions have
// stored real markdown since 2.7. 2.57 §3.2 states the rule: LINKS AND VALUES,
// NOT MARKUP. Four arguments, each made at one section, each correct.
//
// ── WHY THIS NEEDS NO CATALOGUE OF ITS OWN ─────────────────────────────
//
// Two things make the whole module a read rather than a table.
//
// THE LABEL IS ALREADY ON THE LINE. Both catalogue families write the same
// shape — `keyword:key[…]|Label`:
//
//     recall:recall|🧠 Recall                          (journal-sections.ts)
//     note:focus#line:What are you focusing on today?|Today's focus
//                                            (built by fields.ts::fieldDirective)
//
// So the label is read off the LINE, not out of a catalogue — which is the
// stronger rule and not merely the cheaper one, because a reader who retitles a
// section has retitled the line, and the catalogue would go on exporting the
// name they replaced. This is the other half of the rule three catalogues
// already state for LOCATING a section by its directive rather than its
// heading: "a reader retitles a header — that is what the `header:` argument is
// for — and matching on it would make a renamed section invisible."
//
// WHICH SECTIONS HAVE CONTENT IS ALREADY DECIDED, AND ALREADY PROVED COMPLETE.
// `widget-registry.ts` tags six keywords with `reason: "region"` — note, list,
// tasks, path, recall, attach — and `test/widget-registry.test.ts` asserts that
// `WIDGETS ∪ NOT_PAGE_WIDGETS` equals the dispatch switch, by scraping the
// `case` labels out of `buildFromSpec`. So the selection rule here is one line
// and it inherits that proof: a seventh region-backed widget added later cannot
// be missed silently, because the union test fails before this file is ever
// consulted. `RESUME §6`: derive, don't configure.
//
// ── WHAT IS LEFT OUT, AND WHY THAT IS THE LOAD-BEARING DECISION ────────
//
// A calendar, a month summary, a tasks-table, a chart and a live bridge are
// computed from the vault at render time and store nothing in the note. They
// are OMITTED ENTIRELY — not placeheld, not commented, not mentioned. Partly
// because an export is what the READER wrote and a calendar is not theirs, but
// mostly for a reason that outlives that judgement:
//
//   Had a derived widget exported a placeholder, blank output would be an
//   ordinary state, and `plainSections` could not be a coverage assertion. It
//   would need a list of which sections are allowed to come back empty — a
//   configured list, stale on the first new widget. With them omitted, BLANK
//   HAS EXACTLY ONE CAUSE: a region-backed section whose label or key did not
//   resolve. That is the assertion, and it exists only because of this.
//
// FRONTMATTER GOES THROUGH VERBATIM and the tracker grid is not re-rendered
// into the body. The readings are already in the properties block, which
// Obsidian draws natively and every other editor shows as YAML; a `**Mood:** 4`
// line beneath would be a SECOND COPY OF A VALUE, and this project has been
// bitten by that twice in six releases (`RESUME §5` 1c-ii and 1c-iii — two
// correct copies of a lookup did not make a third correct, and an entry banner
// printed "Daily" where a date belongs). The frontmatter is also unrecoverable
// if dropped: `journal-date` scopes an entry to its period for every
// period-filtered table, `chronoanvil-events` is stamped once at creation and never
// re-synced, and `title:` is the reader's own words.

import { segment } from "./layout";
import { frontmatterEnd } from "./note-sections";
import { isHeaderLine, parseHeaderDirective, splitDirective } from "./directive-grammar";
import { NOT_PAGE_WIDGETS } from "./widget-registry";
import { isValidNoteKey, noteKeyOf, readNoteRegion } from "./notestore";
import { CAPTURE_NOTE_KEY, LOGBOOK_KEYWORD, LOGBOOK_NOTE_KEY } from "./constants";
import type { SectionModel } from "./section-model";
import { parseEntries } from "../diary/entries";
import { parseLogItems } from "../diary/log-items";
import { parseTaskLine, serializeTaskLine } from "../ui/tasks";
import { parseRecall } from "../review/recall";

// One region-backed section of a note, as the export sees it.
//
// REPORTED EVEN WHEN EMPTY, which is the whole reason this is a separate
// function from `toPlainMarkdown`. A test over the finished string can only say
// "the output does not contain the word Highlights"; it cannot tell a section
// that produced nothing from one a reader renamed. This can, because it names
// the region key the heading was built for.
export interface PlainSection {
  // The region key — `<!--chronoanvil:focus-->` — which is what a failure needs to
  // name, and what a wrong binding gets wrong.
  id: string;
  // What the heading says. Read off the directive's `|label`, falling back to
  // the model and then to the key itself.
  label: string;
  // "" when the region holds nothing a reader would miss.
  body: string;
  // The `header:` bar this section sits under, when its fence has one. Null
  // otherwise. Not part of the id — two `attach:` fields under one Resources
  // bar are two sections, and the bar is the name of the group.
  heading: string | null;
}

// Whether this directive keyword stores a reader's text in the note body.
//
// THE ONE QUESTION THE MODULE ASKS OF A DIRECTIVE, and it is asked of the
// registry rather than of a list here. See the header: the registry's union
// with `WIDGETS` is already pinned against the dispatch switch, so this borrows
// a completeness proof instead of starting a second list that can go stale.
function isRegionBacked(keyword: string): boolean {
  // A LOGBOOK IS THE ONE PAGE WIDGET THAT IS ALSO A REGION (4.52), so it cannot
  // come from the registry's `region` reason — that list is the widgets a page
  // is NOT offered, and a logbook is offered.
  //
  // WHICH NOTE'S REGION, THOUGH, IS ANSWERED BY THE TEXT IN HAND rather than by
  // this predicate, and that is what makes it safe. `logbook:work` on the
  // homepage draws the work log's items from another file; exported, it finds no
  // `logbook` region in the HOMEPAGE's text and contributes nothing, which is
  // right — an export of the homepage is not an export of the work log. On
  // `Work log.md` the same directive finds its own region and carries the items.
  if (keyword === LOGBOOK_KEYWORD) return true;
  return NOT_PAGE_WIDGETS[keyword]?.reason === "region";
}

// Which region a region-backed directive reads.
//
// EVERY OTHER ONE NAMES ITS REGION IN ITS ARGUMENT — `note:capture` reads
// `capture` — and a logbook's argument names a NOTE instead, so it is the one
// keyword whose key is a constant. Asked in one place because the two walks
// below must agree: they count the same lines in the same order, and a key rule
// spelled twice is how the count and the content come to disagree.
function regionKeyFor(keyword: string, argument: string): string {
  return keyword === LOGBOOK_KEYWORD ? LOGBOOK_NOTE_KEY : noteKeyOf(argument);
}

// GFM, out of ChronoAnvil's own checkbox.
//
// WALKED LINE BY LINE RATHER THAN THROUGH `parseTasks`, and this is the one
// place the module declines a ready-made helper. Five of the six region parsers
// are explicitly total over non-blank lines — `parseEntries` keeps every one,
// `parseRecall` treats an unseparated line as a question with no answer yet,
// `parseAttachmentLine` yields "free text at worst, which is what makes the
// round-trip lossless", `parseLogItems` keeps what someone typed by hand so it
// "survives a round trip instead of being silently swallowed", and `note` is
// not parsed at all.
//
// `parseTasks` is the exception: it returns null for "anything not starting
// with the `- ( )` marker so the caller can skip them". That skip is RIGHT for
// the widget, which cannot draw a checkbox for a line it does not understand.
// It is WRONG here, because this was asked to carry the note and not the part
// of the note one widget understands — a reader who typed a paragraph above
// their tasks would watch it vanish from the copy with nothing to tell them.
//
// The inline `[priority:: …]` / `[due:: …]` fields are kept as they are: that
// is Dataview's spelling, which is portable already.
function tasksToMarkdown(region: string): string {
  return region
    .split("\n")
    .map((line) => {
      const task = parseTaskLine(line);
      if (!task) return line;
      // Through `serializeTaskLine` so the inline fields are emitted in the one
      // order the format has, then only the box is rewritten. Spelling the
      // fields again here would be a second copy of that order.
      return serializeTaskLine(task).replace(
        task.done ? /^- \(x\)/ : /^- \( \)/,
        task.done ? "- [x]" : "- [ ]"
      );
    })
    .join("\n")
    .trim();
}

// A stamped region as a list, with when it was written and whether it is done.
//
// ONE FUNCTION FOR BOTH REGIONS THAT USE THE GRAMMAR (4.52) — the capture log
// and a logbook — because they ARE one grammar, and the only difference between
// them is whether the stamp carries a date. That is a property of the item, so
// it is read off the item rather than passed in by the caller.
function logItemsToMarkdown(region: string): string {
  return parseLogItems(region)
    .map((c) => {
      const box = c.done ? "- [x] " : "- ";
      const when = [c.date, c.time].filter((part) => !!part).join(" ");
      const stamp = when ? `${when} — ` : "";
      const [first, ...rest] = c.text.split("\n");
      // Continuation lines are indented under their own item so a multi-line
      // item stays one list entry rather than becoming several.
      const tail = rest.map((l) => (l ? `  ${l}` : "")).join("\n");
      const head = `${box}${stamp}${first}`;
      return tail ? `${head}\n${tail}` : head;
    })
    .join("\n")
    .trim();
}

// Question and answer, one card per line in, two lines out.
function recallToMarkdown(region: string): string {
  return parseRecall(region)
    .map((p) => (p.answer ? `**${p.question}**\n\n${p.answer}` : `**${p.question}**`))
    .join("\n\n")
    .trim();
}

// A region's text as portable markdown, by the keyword that owns it.
function bodyFor(keyword: string, key: string, region: string): string {
  if (keyword === "list") return parseEntries(region).map((e) => `- ${e}`).join("\n");
  if (keyword === "tasks" || keyword === "path") return tasksToMarkdown(region);
  if (keyword === "recall") return recallToMarkdown(region);
  // Already real markdown — wikilinks, embeds and `[title](url)` — and has been
  // since 2.7 for this module's own reason. Emitted as it stands.
  if (keyword === "attach") return region.trim();
  // `note`, and the capture log is a `note:` whose key IS the identity — the
  // same test `index.ts` makes before it picks a builder, and `constants.ts`
  // gives capture its own region precisely so it is not confused with prose
  // written on purpose.
  if (keyword === "note" && key === CAPTURE_NOTE_KEY) return logItemsToMarkdown(region);
  // A LOGBOOK, WHOSE REGION IS THE SAME GRAMMAR ONE STAMP WIDER (4.52). Keyed
  // on the KEYWORD and not on the key, unlike capture above, because a logbook
  // note holds exactly one region and `LOGBOOK_NOTE_KEY` is what it is called —
  // the directive's argument names the note, never the region.
  if (keyword === LOGBOOK_KEYWORD) return logItemsToMarkdown(region);
  return region.trim();
}

// Every region-backed section of this note, in the order the note has them.
//
// EMPTY REGIONS ARE REPORTED, not skipped. `toPlainMarkdown` drops them from
// the string — a blank field is not a heading — but a caller checking coverage
// needs to see that the section resolved at all.
export function plainSections(text: string, model: SectionModel): PlainSection[] {
  const out: PlainSection[] = [];
  // The model's own labels, for a directive that carries none of its own.
  const byId = new Map<string, string>();
  for (const view of model.sections(text)) byId.set(view.id, view.label);

  for (const seg of segment(text.split("\n"))) {
    if (seg.kind !== "fence") continue;
    // The fence's own lines, without the ``` delimiters.
    const inner = seg.lines.slice(1, -1);
    const bar = inner.find((l) => isHeaderLine(l));
    const heading = bar
      ? parseHeaderDirective(splitDirective(bar).argument).title || null
      : null;

    for (const line of inner) {
      const parts = splitDirective(line);
      if (!isRegionBacked(parts.keyword)) continue;
      const key = regionKeyFor(parts.keyword, parts.argument);
      // A key the store would refuse on write is a key nothing was written
      // under, so there is no region to find and nothing honest to label.
      if (!isValidNoteKey(key)) continue;
      out.push({
        id: key,
        label: parts.label?.trim() || byId.get(key) || key,
        body: bodyFor(parts.keyword, key, readNoteRegion(text, key)),
        heading,
      });
    }
  }
  return out;
}

// Everything the plugin wrote to make this page work, and nothing a reader put
// on it.
//
// `<!--chronoanvil:…-->` REGIONS ARE CONSUMED BY THEIR DIRECTIVES above, so what is
// left of one here is a duplicate; the spacer is an inert strip that exists to
// give the cursor somewhere to land.
function stripPluginMarkup(raw: string): string {
  return (
    raw
      .replace(/<!--chronoanvil:[\s\S]*?-->/g, "")
      // THE PROSE SKELETON'S BRACKET, WHOSE CONTENTS ARE KEPT (5.6). The region
      // form above swallows what is between its markers because that content is
      // a field's value and the field is going; a bracket's markers are around
      // the reader's own document and only the markers go. Two lines, not a
      // span, and that difference is the whole reason the two are told apart by
      // a `-` where a region has a `:`.
      .replace(/<!--\/?chronoanvil-[A-Za-z0-9_-]+-->/g, "")
      .split("\n")
      .filter((l) => l.trim() !== "`chronoanvil:spacer`")
      .join("\n")
  );
}

// WHERE THIS TEXT IS GOING, which is the only thing that decides what happens
// to the properties (4.31).
//
// NOT A PREFERENCE AND NOT A SETTING. Frontmatter pasted into another editor is
// a real document header, and `keep` is right there — it is 4.30's whole
// behaviour and the default, so that output is byte-identical. Frontmatter
// written into a file INSIDE this vault is a claim about what a note is, and
// `noteKindOf` reads that claim before it looks at any path: "a note that SAYS
// what it is outranks where it sits". An exported copy of Tuesday carrying
// `journal: Daily Notes` IS Tuesday, in every calendar and every rollup, and no
// folder can stop it because the classifier never gets as far as the folder.
//
// So `demote` moves the block into the body, where every key and value is still
// visible and none of it is frontmatter any more. The collision is not
// mitigated, it is made unrepresentable.
export type PropertiesMode = "keep" | "demote";

// The properties as a block a reader can see, for a copy that has to live in
// this vault without being mistaken for the note it came from.
//
// A LINE TRANSFORM, NOT A YAML PARSE. Obsidian's `parseYaml` is one import away
// and is deliberately not reached for: the job is to make a block readable
// rather than to interpret it, and a parser would turn a value it disliked into
// an exception in the middle of an export of somebody's whole vault.
function demoteProperties(front: string): string {
  const out: string[] = [];
  for (const line of front.split("\n")) {
    const trimmed = line.trim();
    // The fences of the block itself, and the markers that delimit the tracker
    // properties inside it — plugin markup either way.
    if (trimmed === "---" || trimmed === "") continue;
    if (trimmed.startsWith("#")) continue;
    // A continuation or list line belongs to the key above it, so its indent is
    // kept rather than being bolded into a key of its own.
    if (line.startsWith(" ") || line.startsWith("\t") || trimmed.startsWith("- ")) {
      out.push(`> ${line.replace(/^\s+/, (s) => " ".repeat(s.length))}`);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      out.push(`> ${trimmed}`);
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    out.push(value ? `> **${key}:** ${value}` : `> **${key}:**`);
  }
  return out.join("\n");
}

// A note as markdown anybody can read: its properties, then the reader's own
// writing under headings that say what they said on the page.
export function toPlainMarkdown(
  text: string,
  model: SectionModel,
  properties: PropertiesMode = "keep"
): string {
  const lines = text.split("\n");
  const end = frontmatterEnd(lines);
  // `frontmatterEnd` returns the index of the closing `---`, or -1 for a note
  // with no frontmatter at all.
  const raw = end >= 0 ? lines.slice(0, end + 1).join("\n") : "";
  const front = properties === "demote" ? demoteProperties(raw) : raw;

  const chunks: string[] = [];
  const sections = plainSections(text, model);
  let taken = 0;
  let lastHeading: string | null = null;

  for (const seg of segment(lines.slice(end + 1))) {
    if (seg.kind === "fence") {
      // The sections this fence contributed, in the order `plainSections`
      // walked them — the same walk, so the two cannot drift apart.
      const inner = seg.lines.slice(1, -1);
      const mine = inner.filter((l) => {
        const p = splitDirective(l);
        return (
          isRegionBacked(p.keyword) &&
          isValidNoteKey(regionKeyFor(p.keyword, p.argument))
        );
      }).length;
      const here = sections.slice(taken, taken + mine);
      taken += mine;

      for (const s of here) {
        if (!s.body) continue;
        // A BAR OVER ONE FIELD IS THAT FIELD'S NAME, so it is not written
        // twice. "🧭 Learning Path" over a lone `path:path` is the section; a
        // `### path` beneath it would be the key leaking onto the page. A bar
        // over SEVERAL is the name of the group, and each field keeps its own.
        if (s.heading && s.heading !== lastHeading && here.length > 1) {
          chunks.push(`## ${s.heading}`);
          lastHeading = s.heading;
        }
        const depth = s.heading && here.length > 1 ? "###" : "##";
        chunks.push(`${depth} ${here.length === 1 && s.heading ? s.heading : s.label}`);
        chunks.push(s.body);
      }
      continue;
    }

    // A reader's own prose, their `##` headings, and the prose skeleton — which
    // emits no directive at all, and whose headings are `## ` markdown that
    // reads the same with the plugin gone. Both arrive here and both are
    // theirs; the skeleton's two markers are markup and `stripPluginMarkup`
    // takes them, leaving the headings between them exactly as they were.
    const raw = stripPluginMarkup(seg.lines.join("\n")).trim();
    // A run that is nothing but the band rule is ChronoAnvil's own separator
    // between an entry's structural fences and its fields. Judged by what the
    // run CONTAINS rather than by where it sits, so a rule a reader typed
    // between two paragraphs is in a run with those paragraphs and survives.
    if (!raw || raw === "---") continue;
    chunks.push(raw);
  }

  const body = chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return front ? (body ? `${front}\n\n${body}\n` : `${front}\n`) : `${body}\n`;
}
