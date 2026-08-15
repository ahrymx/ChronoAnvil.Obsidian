// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Reading an entry as a template, and writing a template back over an entry.
//
// WHY THIS FILE EXISTS (4.29)
//
// A grain's template is composed — `composeEntryTemplate` plus
// `settings.entrySections` — and written to a file the entry openers read
// (`diary.ts`). Until now the only thing that could write that setting was one
// two-row table in Settings. Everything else a reader can do to an entry's
// shape — reorder its shared band, point a bridge at a journal kind — lived in
// the one note and had nowhere to go.
//
// So: save the page in front of you as the grain's default, or as a named
// layout, and reload one onto an entry that holds nothing yet.
//
// ── THE RELOAD IS THE DESTRUCTIVE ONE, AND THAT IS THE POINT ────────
//
// "Apply a template to this page" could mean two things:
//
//   PLAN AND SPLICE — `applyEntrySections`, which adds, removes and moves
//   sections and re-emits every other byte as it was read. It exists, it is on
//   the same cog as "Edit sections…", and it needs no emptiness test because
//   it destroys nothing.
//
//   RECOMPOSE — write the template over the page.
//
// If reload meant the first, this would be a second door onto a built feature
// under a new name. It means the second, and `entryReloadLoss` is what makes a
// wholesale rewrite allowed to sit beside a safe splice: the control is not
// drawn at all unless the page holds nothing the rewrite would destroy.
//
// ── THE FRONTMATTER IS NEVER RECOMPOSED ─────────────────────────────
//
// Not a courtesy. `journal-date` is what scopes an entry to its period for
// every period-filtered table; `month:` keys a monthly note; the events stamp
// is written once at creation and `diary.ts::stampEvents` says in its own
// comment that entries are never re-synced against the events list, so a
// recomposed frontmatter would destroy it permanently. The alias `title:` is
// the reader's words and the tracker properties hold their readings. So a
// reload replaces the BODY and copies the frontmatter through untouched, which
// also narrows "is this page empty" to a question about the body alone.

import {
  ENTRY_SECTIONS,
  offerableEntrySections,
  parseEntry,
} from "./entry-sections";
import type { EntrySection, EntrySectionContext } from "./entry-sections";
import { allNoteRegions } from "../core/notestore";
import { answerInText } from "../core/section-model";
import type { SectionChoice } from "../core/section-model";
import { frontmatterEnd } from "../core/note-sections";
import { TRACKER_MARK_END, TRACKER_MARK_START } from "../core/constants";
import type { TrackerClass } from "../trackers/trackers";

// A named arrangement of an entry's shared band, offered on the grains the
// reader picked.
//
// MIRRORS `JournalVariantConfig` AND IS NOT IT. A journal variant is stored on
// a journal config and scaffolds a template FILE, because a journal kind can be
// created from any of several arrangements. A grain has exactly one template
// file, so a diary layout is only ever a recipe you seed a page from — half
// that shape has nothing to do here, and sharing the storage would put a diary
// layout on a journal, which is the cross-catalogue carry `layout-transfer.ts`
// exists to refuse.
export interface EntryLayoutConfig {
  id: string;
  label: string;
  // Shared-band section ids, in the order they should be composed.
  sections: string[];
  // Each section's own answers, keyed by section id. Absent for a layout whose
  // sections asked nothing — storing an entry per section would put a wall of
  // empty objects in data.json, which is the reasoning `saveVariant` already
  // gives for the same field.
  options?: Record<string, Record<string, unknown>>;
  // Which grains it may be reloaded onto. A layout saved from a weekly entry
  // naming `challenges` is meaningful on monthly too; one naming a section a
  // grain cannot compose is reported when it is applied, not filtered here,
  // because the reader may add that section to that grain later.
  grains: TrackerClass[];
}

// One thing a recompose over this page would destroy.
//
// A LIST, NOT A BOOLEAN. The window has to say what is in the way — a refusal
// that only says no sends someone looking for a control that does not exist,
// which is the shape every refusal in this plugin was rewritten out of in 4.21.
// And a boolean derived from four unrelated facts is untestable in the way that
// matters: it cannot say WHICH of the four broke.
export interface EntryLoss {
  kind: "region" | "tracker" | "foreign" | "prose";
  // The reader's name for the thing — a section's label, or the line itself.
  label: string;
  detail: string;
}

// The body, as lines: everything after the frontmatter closes.
function bodyLines(text: string): string[] {
  const lines = text.split("\n");
  return lines.slice(frontmatterEnd(lines) + 1);
}

// The `# almanac:trackers` block's contents, wherever in the body it sits.
//
// LOCATED BY ITS MARKERS rather than by fence position, for the reason
// `parseEntry` locates regions by theirs: the block is inside the tracker fence
// on a modern entry and was inside the banner fence before 4.20, and an entry
// written under either is still the reader's.
function trackerBlockLines(text: string): string[] {
  const lines = bodyLines(text);
  const start = lines.findIndex((l) => l.trim() === TRACKER_MARK_START);
  if (start === -1) return [];
  const end = lines.findIndex((l, i) => i > start && l.trim() === TRACKER_MARK_END);
  if (end === -1) return [];
  return lines
    .slice(start + 1, end)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

// Body lines that sit outside every fence and every region, trimmed, blanks
// dropped — the composer's own structural furniture on a composed template, and
// the reader's prose on a page they have written in.
//
// ONE WALK, TWO READERS, and that is deliberate rather than tidy: the loss test
// compares a page's loose lines against a template's, so the two lists have to
// be gathered by the same rule or the comparison is between two different
// questions. A region opener is matched by the same shape `parseEntry` uses.
function looseLines(text: string): string[] {
  const out: string[] = [];
  let fence = false;
  let region = false;
  for (const raw of bodyLines(text)) {
    const line = raw.trim();
    if (fence) {
      if (line === "```") fence = false;
      continue;
    }
    if (region) {
      if (line === "-->") region = false;
      continue;
    }
    if (line === "```almanac") {
      fence = true;
      continue;
    }
    if (/^<!--almanac:[A-Za-z0-9_-]+$/.test(line)) {
      region = true;
      continue;
    }
    if (line !== "") out.push(line);
  }
  return out;
}

// What a recompose of this page as `composed` would destroy. Empty means the
// reload is safe to offer.
//
// TAKES THE COMPOSED TEXT rather than recomposing it here, so a loss is exactly
// "something in the page that the replacement does not carry" and the answer
// cannot drift from the write. It is also what makes the round trip statable:
// the losses of composing a page over itself are none, and if that is ever
// false a freshly created entry can never be reloaded.
export function entryReloadLoss(
  text: string,
  composed: string,
  ctx: EntrySectionContext
): EntryLoss[] {
  const out: EntryLoss[] = [];
  const labels = new Map(ENTRY_SECTIONS.map((s) => [s.id, s.label]));

  // 1. REGIONS WITH WRITING IN THEM. Discovered rather than looked up by
  // catalogue id — `allNoteRegions` finds the keys — so a region a reader added
  // by hand counts too. Every region a recompose writes is empty, so any
  // content at all is a loss.
  for (const { key, content } of allNoteRegions(text)) {
    if (content.trim() === "") continue;
    out.push({
      kind: "region",
      label: labels.get(key) ?? key,
      detail: "holds your writing",
    });
  }

  // 2. TRACKERS THIS ENTRY GAINED ON ITS OWN. The loss nobody predicts: "+ Add
  // tracker" writes a directive into the body between the tracker markers while
  // its PROPERTY sits in the frontmatter, so a recompose reseeds the block from
  // the grain's defaults and leaves an orphaned property above a grid that no
  // longer reads it. A regions-are-empty test misses this completely.
  const seeded = new Set(trackerBlockLines(composed));
  for (const line of trackerBlockLines(text)) {
    if (seeded.has(line)) continue;
    out.push({
      kind: "tracker",
      label: line,
      detail: "added to this entry only",
    });
  }

  // 3. DIRECTIVES IN THE WIDGET FENCE THAT ARE NOT THE CATALOGUE'S. The same
  // set `planEntrySections` reports as `foreign` and leaves alone — it can
  // leave them alone because it splices, and this cannot because it replaces.
  //
  // ONLY THE UNRECOGNISED ONES. A catalogue directive the replacement drops is
  // not a loss, it is the reload doing what it was asked: a layout that takes
  // out an empty section is the whole gesture, and reporting that as damage
  // would refuse every reload that changed anything.
  const shared = parseEntry(text, ctx).shared;
  for (const b of shared?.body ?? []) {
    if (b.id !== null || b.line.trim() === "") continue;
    out.push({
      kind: "foreign",
      label: b.line.trim(),
      detail: "not a line this catalogue writes",
    });
  }

  // 4. PROSE. Anything in the body outside a fence and outside a region that is
  // not a piece of structure the composer itself emits.
  //
  // THE STRUCTURE IS GATHERED FROM `composed`, NOT LISTED HERE. It is `---` and
  // `` `almanac:spacer` `` today. A list written into this file would be a
  // second copy of a decision `composeEntryTemplate` makes, and it would go
  // wrong silently — reporting the reader's own page as full of prose — the
  // first time that function emitted anything new.
  const structure = new Set(looseLines(composed));
  for (const line of looseLines(text)) {
    if (structure.has(line)) continue;
    out.push({ kind: "prose", label: line, detail: "written outside any section" });
  }

  return out;
}

// This page's shared band, in the order the page has it, with each section's
// answers read back off its own directive.
//
// `drops` ARE REPORTED, NEVER DROPPED IN SILENCE. A hand-written directive
// cannot become a catalogue id, so a save that carried the page into a stored
// layout has to say which lines it will not carry. That is `layout-transfer.ts`'s
// settled rule, in its own words: "drop silently, drop loudly, or refuse — and
// silence is the wrong one".
export function wantFromEntry(
  text: string,
  ctx: EntrySectionContext
): { want: SectionChoice[]; drops: string[] } {
  const shared = parseEntry(text, ctx).shared;
  const byId = new Map(offerableEntrySections(ctx).map((s) => [s.id, s]));
  const want: SectionChoice[] = [];
  const drops: string[] = [];
  const seen = new Set<string>();

  for (const b of shared?.body ?? []) {
    if (b.id === null) {
      if (b.line.trim() !== "") drops.push(b.line.trim());
      continue;
    }
    // A second copy of one section is one region shared by two widgets, which
    // `addableEntrySections` already refuses to create. Reading one back as two
    // wants would then compose a template with the same defect in it.
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const section = byId.get(b.id);
    want.push(section ? choiceFor(text, section, ctx) : { id: b.id });
  }
  return { want, drops };
}

// One section's stored choice, with whatever the page already answers.
function choiceFor(
  text: string,
  section: EntrySection,
  ctx: EntrySectionContext
): SectionChoice {
  const options: Record<string, unknown> = {};
  for (const q of section.questions?.(ctx) ?? []) {
    const answer = answerInText(text, q);
    // EMPTY IS NOT AN ANSWER. An unset bridge writes `bridge-notes:` with
    // nothing after the colon, and storing `""` would make "the reader chose
    // nothing" indistinguishable from "the reader chose the empty string" — and
    // `directiveFor` already treats a blank target as unconfigured.
    if (answer != null && answer.trim() !== "") options[q.key] = answer.trim();
  }
  return Object.keys(options).length ? { id: section.id, options } : { id: section.id };
}

// A saved band with one section switched on or off.
//
// HERE RATHER THAN IN THE SETTINGS RENDERER, and that is the rule this file
// exists to keep: the suite has no DOM, so a decision made inside a `write`
// closure is a decision nothing can test — and this one is the single way the
// two stores could come to disagree. A grain that has a band ignores
// `entrySections` for membership, so a tick in Settings → Diary entries that
// did not reach the band would change a setting and nothing else.
//
// `undefined` IN, `undefined` OUT. Most vaults have no band, and the catalogue's
// own order is still the answer for them — a caller that reads undefined must
// write nothing rather than create one out of a checkbox.
//
// APPENDED AT THE END when it is switched on, which is `addSectionToNote`'s call
// and its reasoning: a reader who arranged their band arranged it, and inserting
// into the middle of that to satisfy a canonical order would undo a
// customisation in the name of adding one.
export function bandWithSection(
  band: readonly string[] | undefined,
  id: string,
  present: boolean
): string[] | undefined {
  if (!band) return undefined;
  const without = band.filter((x) => x !== id);
  return present ? [...without, id] : without;
}

// The page with `composed`'s body and its own frontmatter.
//
// Returns null when nothing would change, which is `applyEntrySections`' and
// `applyLayout`'s convention and matters for the same reason: a rewrite that
// changes nothing still bumps mtime, and on the diary side mtime is the source
// of truth for what is stale.
export function reloadEntryBody(text: string, composed: string): string | null {
  const lines = text.split("\n");
  const end = frontmatterEnd(lines);
  // No frontmatter to keep — the whole file is the body. An entry always has
  // some, so this is the malformed case rather than a supported one, and
  // replacing everything is what the reader asked for on a file with nothing
  // to preserve.
  const head = end === -1 ? [] : lines.slice(0, end + 1);
  const body = composed.split("\n").slice(frontmatterEnd(composed.split("\n")) + 1);
  const next = [...head, ...body].join("\n");
  return next === text ? null : next;
}

