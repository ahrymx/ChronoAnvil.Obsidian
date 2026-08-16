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
import { frontmatterEnd } from "./note-sections";

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

// The `# almanac:trackers` block's contents, wherever in the body it sits.
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
// IT WAS `line === "```almanac"` AND THAT WAS A BUG WAITING FOR A SECOND
// SURFACE (4.33). Diary entries only ever carry the bare `almanac` fence, so the
// equality was true there and the walk was correct. A journal INDEX note carries
// `` ```almanac-journal-charts `` (JOURNAL_CHARTS_FENCE) and, on the diary
// dashboards, `` ```almanac-charts `` — neither of which is that string. The
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
const FENCE_OPEN = /^```almanac(-charts|-journal-charts)?$/;

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
    if (FENCE_OPEN.test(line)) {
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

// The mirror of `looseLines`: everything INSIDE an almanac fence, trimmed,
// blanks and the fence markers dropped.
//
// WHY THE JOURNALS NEED A WALK THE DIARY NEVER DID. An entry keeps its content
// in regions and its structure in one shared fence, so "is there writing here"
// is answered by `allNoteRegions` and the fence holds only directives. A
// journal note's fences hold content the reader authored: `jchart:` specs
// written by the chart editor's Add button, and `attach:` shelves named in the
// resources section. Neither is a region, so check 1 cannot see them; and
// `parseSections` cannot either, because `almanac-journal-charts` is an OPAQUE
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
  // `` `almanac:spacer` `` on an entry, and the whole prose skeleton on a
  // journal leaf. A list written into this file would be a second copy of a
  // decision the composers make, and it would go wrong silently — reporting the
  // reader's own page as full of prose — the first time one of them emitted
  // anything new.
  //
  // AND IT IS WHY THE JOURNAL SIDE CAN ASK THIS AT ALL. `parseSections`
  // deliberately over-matches a markdown-only section — `markdownOwnerOf`'s own
  // comment says attributing a reader's `## Notes` to `headings` "changes
  // nothing that happens to the file" — so a runs walk cannot see prose typed
  // under a heading. This diff can: the composed `## Notes` appears on both
  // sides and cancels, and the paragraph under it does not.
  const structure = new Set(looseLines(composed));
  for (const line of looseLines(text)) {
    if (structure.has(line)) continue;
    out.push({ kind: "prose", label: line, detail: "written outside any section" });
  }

  return out;
}
