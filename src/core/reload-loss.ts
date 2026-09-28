// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What a recompose over a page would destroy — the half of the question that is
// not about any one catalogue. 4.33.
//
// LIFTED OUT OF `entry-template.ts` RATHER THAN COPIED BESIDE IT. 4.29 wrote
// four checks for diary entries; three of them never looked at a diary. Regions
// are found by their markers, the tracker block is found by its markers, and
// loose prose is "body lines outside every fence and every region" — none of
// which mentions a grain, a section catalogue or a note kind. Only the fourth,
// "a directive in the widget fence this catalogue does not write", needs to know
// whose catalogue is asking.
//
// So the surface supplies that one and this supplies the rest. The alternative
// was a second predicate in the journals, which is precisely the shape
// `ROADMAP-4.29-OUTCOME.md` rejected when it replaced a new `orderShared` sort
// with `desiredOrder`: two implementations of one question drift, and the way
// they drift is that a reload starts destroying something on one surface that it
// refuses to destroy on the other.
//
// THE ORDER OF THE LIST IS PART OF THE CONTRACT. Regions, then trackers, then
// the surface's own, then prose — which is the order 4.29 emitted and the order
// its tests assert, so lifting this changed no diary behaviour at all.

import { TRACKER_MARK_END, TRACKER_MARK_START } from "./constants";
import { allNoteRegions } from "./notestore";
import { frontmatterEnd, GRAPH_MARK } from "./note-sections";

// One thing a recompose over this page would destroy.
//
// A LIST, NOT A BOOLEAN. The window has to say what is in the way — a refusal
// that only says no sends someone looking for a control that does not exist,
// which is the shape every refusal in this plugin was rewritten out of in 4.21.
// And a boolean derived from several unrelated facts is untestable in the way
// that matters: it cannot say WHICH of them broke.
export interface ReloadLoss {
  // `fence` is 4.33's addition and is the journals' case: content a reader put
  // INSIDE a catalogue fence, which is neither a region nor a stray directive.
  // Chart specs are the one that matters — see journal-template.ts.
  kind: "region" | "tracker" | "foreign" | "prose" | "fence";
  // The reader's name for the thing — a section's label, or the line itself.
  label: string;
  detail: string;
}

// The body, as lines: everything after the frontmatter closes.
export function bodyLines(text: string): string[] {
  const lines = text.split("\n");
  return lines.slice(frontmatterEnd(lines) + 1);
}

// The `# chronoanvil:trackers` block's contents, wherever in the body it sits.
//
// LOCATED BY ITS MARKERS rather than by fence position, for the reason
// `parseEntry` locates regions by theirs: the block is inside the tracker fence
// on a modern entry and was inside the banner fence before 4.20, and an entry
// written under either is still the reader's. A journal note uses the same two
// markers (`journal-sections.ts`'s `trackers` section renders them), so this
// needed nothing added to work there.
export function trackerBlockLines(text: string): string[] {
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

// Which fence openers this walk steps over.
//
// IT WAS `line === "```chronoanvil"` AND THAT WAS A BUG WAITING FOR A SECOND
// SURFACE (4.33). Diary entries only ever carry the bare `chronoanvil` fence, so the
// equality was true there and the walk was correct. A journal INDEX note carries
// `` ```chronoanvil-journal-charts `` (JOURNAL_CHARTS_FENCE) and, on the diary
// dashboards, `` ```chronoanvil-charts `` — neither of which is that string. The
// walk therefore never entered fence mode and collected every `jchart:` spec as
// though it were the reader's prose.
//
// THE FAILURE WOULD HAVE HIDDEN ITSELF, which is why it is worth this comment:
// `reloadLoss` compares a page's loose lines against the COMPOSED page's, so on
// a freshly made index the stray chart lines appear on both sides and cancel.
// It looks correct until a reader adds a chart, and then it reports the loss
// with `label: "jchart:j3:trend:confidence"` — accidentally right, and
// unexplainable to the person reading it.
//
// Spelled as one regex rather than a set membership test because the closing
// fence is always a bare ``` and pairing an opener kind with a closer would be
// state this walk does not otherwise keep.
// Legacy `almanac` spellings are matched too: this module decides what a
// reload would LOSE, and a fence it fails to recognise reads as ordinary
// prose worth preserving — the one misjudgement here that costs a reader
// their content. Kept in step with notestore.ts and widgets/index.ts.
const FENCE_OPEN = /^```(?:chronoanvil|almanac)(-charts|-journal-charts)?$/;

// Body lines that sit outside every fence and every region, trimmed, blanks
// dropped — the composer's own structural furniture on a composed template, and
// the reader's prose on a page they have written in.
//
// ONE WALK, TWO READERS, and that is deliberate rather than tidy: the loss test
// compares a page's loose lines against a template's, so the two lists have to
// be gathered by the same rule or the comparison is between two different
// questions. A region opener is matched by the same shape `parseEntry` uses.
export function looseLines(text: string): string[] {
  const out: string[] = [];
  let fence = false;
  let region = false;
  let graph = false;
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
    // ── THE HIDDEN GRAPH BLOCK IS NOT THE READER'S PROSE (1.0.46) ────
    //
    // `setGraphLinks` calls these two lines "the only text in an entry this
    // plugin claims", and that is exactly what makes them poison here: an
    // ENTRY is a template filled in once, and the parent's name depends on the
    // entry's DATE — `Week-2026-W40` — so `composeEntryTemplate` cannot emit
    // them and never has. Every diary entry in every vault therefore carried
    // two lines that appear on the page and not in the composition, and this
    // walk reported them as writing of the reader's:
    //
    //   %% chronoanvil-graph %% — written outside any section
    //   %% [[Week-2026-W40]] %% — written outside any section
    //
    // Which meant NO diary entry could ever be rebuilt from a template. The
    // refusal was true about the text and false about the reader, and it was
    // invisible until 1.0.46 made the box legible and the window the place you
    // go to apply one. Reported from a brand-new 29 September entry: untouched,
    // and already refusing.
    //
    // A JOURNAL NOTE IS NOT AFFECTED and is skipped here anyway. Its composer
    // DOES emit the block (`journal-plan.ts` appends `graphLinksSection`), so
    // the lines cancelled on both sides — but they are this plugin's lines
    // there too, and a walk that counts them as prose on one surface and not
    // the other would be two answers to one question.
    //
    // THE MARKER TAKES THE LINE AFTER IT WITH IT, which is the block's shape
    // wherever it is written: the marker, then one `%% … %%` line of links.
    // Tracked with a flag rather than an index lookahead so it reads like the
    // two skips above it.
    if (graph) {
      graph = false;
      continue;
    }
    if (line === GRAPH_MARK) {
      graph = true;
      continue;
    }
    if (FENCE_OPEN.test(line)) {
      fence = true;
      continue;
    }
    if (/^<!--(?:chronoanvil|almanac):[A-Za-z0-9_-]+$/.test(line)) {
      region = true;
      continue;
    }
    if (line !== "") out.push(line);
  }
  return out;
}

// The mirror of `looseLines`: everything INSIDE a chronoanvil fence, trimmed,
// blanks and the fence markers dropped.
//
// WHY THE JOURNALS NEED A WALK THE DIARY NEVER DID. An entry keeps its content
// in regions and its structure in one shared fence, so "is there writing here"
// is answered by `allNoteRegions` and the fence holds only directives. A
// journal note's fences hold content the reader authored: `jchart:` specs
// written by the chart editor's Add button, and `attach:` shelves named in the
// resources section. Neither is a region, so check 1 cannot see them; and
// `parseSections` cannot either, because `chronoanvil-journal-charts` is an OPAQUE
// fence kind and `ownerOf` attributes it to `charts` whatever is inside it —
// which is how a plan can report "Charts — unchanged" over a fence about to be
// rewritten.
//
// The same walk as `looseLines`, inverted, so the two cannot disagree about
// where a fence starts and ends.
export function fenceLines(text: string): string[] {
  return fenceBlocks(text).flat();
}

// The same walk, kept as blocks.
//
// ONE FENCE PER SECTION is what `renderSection` emits, so a block is the unit
// that answers "which section is this line part of" — and a caller that needs
// to read a section's own `header:` cannot use the flattened list, because a
// page with two headed sections has two `header:` lines and no way to tell them
// apart. `fenceLines` is this, flattened, rather than a second walk.
export function fenceBlocks(text: string): string[][] {
  const out: string[][] = [];
  let block: string[] | null = null;
  for (const raw of bodyLines(text)) {
    const line = raw.trim();
    if (block) {
      if (line === "```") {
        out.push(block);
        block = null;
        continue;
      }
      if (line !== "") block.push(line);
      continue;
    }
    if (FENCE_OPEN.test(line)) block = [];
  }
  // An unterminated fence is still the reader's content; dropping it would
  // under-report a loss, which is the direction that costs work.
  if (block) out.push(block);
  return out;
}

// What a recompose of this page as `composed` would destroy. Empty means the
// reload is safe to offer.
//
// TAKES THE COMPOSED TEXT rather than recomposing it here, so a loss is exactly
// "something in the page that the replacement does not carry" and the answer
// cannot drift from the write. It is also what makes the round trip statable:
// the losses of composing a page over itself are none, and if that is ever
// false a freshly created note can never be reloaded.
export function reloadLoss(
  text: string,
  composed: string,
  opts: {
    // A region key as the reader knows it. The catalogues hold the labels and
    // this does not; an unknown key falls back to the key, which is right for a
    // region a reader added by hand.
    label: (key: string) => string;
    // The checks only this surface's catalogue can make.
    extra?: (text: string, composed: string) => ReloadLoss[];
  }
): ReloadLoss[] {
  const out: ReloadLoss[] = [];

  // 1. REGIONS WITH WRITING IN THEM. Discovered rather than looked up by
  // catalogue id — `allNoteRegions` finds the keys — so a region a reader added
  // by hand counts too. Every region a recompose writes is empty, so any
  // content at all is a loss.
  for (const { key, content } of allNoteRegions(text)) {
    if (content.trim() === "") continue;
    out.push({
      kind: "region",
      label: opts.label(key),
      detail: "holds your writing",
    });
  }

  // 2. TRACKERS THIS NOTE GAINED ON ITS OWN. The loss nobody predicts: "+ Add
  // tracker" writes a directive into the body between the tracker markers while
  // its PROPERTY sits in the frontmatter, so a recompose reseeds the block from
  // the defaults and leaves an orphaned property above a grid that no longer
  // reads it. A regions-are-empty test misses this completely.
  const seeded = new Set(trackerBlockLines(composed));
  for (const line of trackerBlockLines(text)) {
    if (seeded.has(line)) continue;
    out.push({
      kind: "tracker",
      label: line,
      detail: "added to this note only",
    });
  }

  // 3. WHATEVER THIS SURFACE KNOWS AND THIS FILE CANNOT. Third rather than last
  // so the diary's list comes out in the order 4.29 emitted it and its tests
  // still assert.
  out.push(...(opts.extra?.(text, composed) ?? []));

  // 4. PROSE. Anything in the body outside a fence and outside a region that is
  // not a piece of structure the composer itself emits.
  //
  // THE STRUCTURE IS GATHERED FROM `composed`, NOT LISTED HERE. It is `---` and
  // `` `chronoanvil:spacer` `` on an entry, and every prose block's markers and
  // default headings on a journal leaf. A list written into this file would be a second copy of a
  // decision the composers make, and it would go wrong silently — reporting the
  // reader's own page as full of prose — the first time one of them emitted
  // anything new.
  //
  // AND IT IS WHY THE JOURNAL SIDE CAN ASK THIS AT ALL. A runs walk cannot see
  // prose typed under a heading, and that is as true after 1.0.36 as it was
  // before: attribution stopped guessing — `markdownOwnerOf` claims a segment
  // for prose because it holds a BRACKET now, rather than because it holds any
  // `##` at all — but a block still owns every word between its two markers,
  // which is the reader's paragraph and the composed heading alike. This diff
  // can tell them apart: the composed `## Notes` appears on both sides and
  // cancels, and the paragraph under it does not.
  const structure = new Set(looseLines(composed));
  for (const line of looseLines(text)) {
    if (structure.has(line)) continue;
    out.push({ kind: "prose", label: line, detail: "written outside any section" });
  }

  return out;
}

// ── WHAT THE BOX SHOWS, WHICH IS NOT THE WHOLE LIST (1.0.46) ─────────────
//
// `journalReloadLoss` answers a question about the FILE and answers it one
// thing at a time, which is the contract stated at the top of this module: a
// boolean "cannot rebuild" is untestable in the way that matters, because it
// cannot say WHICH of several unrelated facts broke. That is still right and
// nothing below changes it.
//
// It is the wrong list to PRINT. Prose is emitted one entry per loose line, so
// a note somebody actually wrote in — a cheat sheet of fifteen headings, tables
// and display maths — produced sixty-odd rows, each one a raw markdown line
// with `— written outside any section` after it, in a box above the templates
// it was there to introduce. The window scrolled for a page and a half before
// reaching the thing it manages, and every row after the third said the same
// sentence.
//
// SO THE SUMMARY IS A VIEW, and it lives here rather than in either modal for
// the reason the list itself does: both windows draw the same box, and the
// journal one is where the fifteen-heading page turns up. One implementation,
// two doors.
//
// GROUPED BY `detail` RATHER THAN BY `kind`. The detail is the sentence the row
// prints, so a group is exactly the set of rows that would read identically —
// which is the thing being collapsed. Grouping by kind would merge a chart you
// added with a stray directive, and those say different things.
//
// FIRST APPEARANCE ORDER, so the contract order at the top of this module —
// regions, then trackers, then the surface's own, then prose — survives into
// what the reader sees. Prose is last, which is also the group most likely to
// be the one that got cut.
//
// AND THE CAP IS PER GROUP, not over the whole list. A global cap would let
// forty prose lines push a region's `holds your writing` off the bottom, and
// that row is the one a reader can act on.

/** How many rows of one kind the box prints before it starts counting. */
export const LOSS_SHOWN = 3;

/** Longest label printed before it is cut — a loose line can be a whole table row. */
const LABEL_MAX = 72;

// One line of the box, ready to print.
//
// NOTHING IS PLURALISED INTO THE DETAIL. "3 sections holds your writing" is
// what building the count into that sentence produces, and the fix is not five
// plural forms in a table — it is to leave every printed row in the shape it
// already had (`label — detail`) and add ONE row that counts the rest. See
// `RETIRED_WORDS`' own grammar traps in `vocabulary.ts`: a sentence assembled
// from parts is where this codebase keeps meeting the same bug.
export function summariseLoss(loss: ReloadLoss[]): string[] {
  const groups: { detail: string; labels: string[] }[] = [];
  for (const l of loss) {
    const at = groups.find((g) => g.detail === l.detail);
    if (at) at.labels.push(l.label);
    else groups.push({ detail: l.detail, labels: [l.label] });
  }

  const out: string[] = [];
  for (const g of groups) {
    for (const label of g.labels.slice(0, LOSS_SHOWN)) {
      out.push(`${cut(label)} — ${g.detail}`);
    }
    const rest = g.labels.length - LOSS_SHOWN;
    if (rest > 0) {
      out.push(`…and ${rest} more like ${rest === 1 ? "it" : "these"}`);
    }
  }
  return out;
}

// A label short enough to read, with the cut marked.
//
// TRIMMED FIRST, because a loose line keeps its indentation and a row that
// begins with four spaces looks like a broken list rather than a quoted line.
function cut(label: string): string {
  const s = label.trim();
  return s.length <= LABEL_MAX ? s : `${s.slice(0, LABEL_MAX - 1).trimEnd()}…`;
}
