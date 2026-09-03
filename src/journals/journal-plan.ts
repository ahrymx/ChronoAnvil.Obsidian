// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What changing a template's sections would do to the file on disk.
//
// WHAT THIS FILE IS
//
// The read-only half of the section designer. Given a file's text and the set
// of sections a reader wants it to have, it says which sections are there now,
// what adding or removing would touch, and — only when asked — returns the new
// text. Pure: no App, no vault, no DOM. Same split as journal-manifest.ts, and
// for the same reason: the template editor, the journal wizard and the
// scaffold all need these rules and none of them should have to drag the
// others in to get them.
//
// WHY IT EXISTS
//
// "Generates, never regenerates" was the rule for a journal's templates, and
// the reason was stated plainly in settings-editors.ts: offering a Sections
// step on an existing type would mean either lying (the ticks do nothing) or
// regenerating (the ticks overwrite a file someone has edited), "and there is
// no third option".
//
// There is a third option, and layout.ts already built it for shipped
// dashboards: plan the operations, show them, apply only those. scaffold.ts's
// previewRepair states the property that makes it trustworthy — "the preview
// cannot drift from the action because it *is* the action, minus the write".
// This is that, one level up: layout.ts reconciles directives, this reconciles
// sections.
//
// WHAT MAKES IT EXACT RATHER THAN A GUESS
//
// 2.54.1. A section declares its blocks (`SectionBlock[]`) with at most one
// fence at its head, so finding one in a file is a match rather than an
// inference. An earlier sketch of this module matched fences against a
// section's `claims` and hoped; that works most of the time, which is the
// worst property a deletion routine can have.
//
// THE RULE THIS MODULE OBEYS
//
//   A journal template is jointly owned. The plugin owns the blocks it
//   declared and can add or remove them one at a time, on request, with the
//   change shown first. Everything else in the file is the reader's and is
//   never touched. Anything the plugin cannot prove it wrote is the reader's.
//
// WHAT IT MUST NEVER LEARN TO DO
//
// The list layout.ts keeps, and for the same reasons: no reflowing, no
// normalising whitespace, no rewriting a directive's arguments, no touching
// frontmatter, no reordering blocks it did not move. Adding those turns a
// reconciler into a formatter, and a formatter is a thing that changes a file
// every time it runs.
//
// One more, specific to sections: NEVER DELETE A NON-EMPTY REGION. A section's
// `<!--chronoanvil:key-->` region holds the reader's own writing — recall cards,
// task lists, the Path text.
//
// HOW THAT RULE IS HONOURED CHANGED IN 2.59.7, and the rule itself did not.
// Until then, removing such a section took its fence and left the region where
// it was, reported. That satisfied the rule. Refusing the removal outright
// satisfies it more strongly: the file is left exactly as it was, rather than
// left in a state where a region has no section that owns it.
//
// What tipped it is that the leftover is INVISIBLE. It renders as nothing in
// reading mode, so after the one report that mentions it the reader has no way
// to see it exists — and re-adding the same section later silently resurrects
// text they thought was gone. State that persists and cannot be seen is what
// this plugin rules against everywhere else: a frozen bridge says it is frozen,
// a scoped widget names its scope.
//
// The cost is that a reader who genuinely wants the section gone does two steps
// instead of one, and the second is theirs — clear the text, then remove. That
// is a keystroke they already know and can undo, where an orphaned region is
// one they cannot see.
//
// It also aligns the two halves of the vault. The diary's entry sections refuse
// on the same condition (the 2.60 plan, §3), and one question with two answers
// is what 2.59 spent six patches removing.

import { JournalType } from "./journal";
import {
  answersOn,
  flatBlocks,
  graphLinksSection,
  regroupFlatNote,
  rowDelimiter,
} from "../core/note-sections";
import type { FlatSection } from "../core/note-sections";
import {
  JournalSection,
  SectionContext,
  SectionOverrides,
  SectionPart,
  composeSectionRuns,
  bracketKeyOf,
  questionsOf,
  sectionBlocks,
  widgetFormBar,
  bracketSpanIn,
  headingsFromTitles,
  skeletonTitles,
  renderBlock,
  renderSection,
  rowOf,
  soloBarOf,
  sectionOverrides,
  sectionRemovable,
  sectionsFor,
  surfaceLayout,
} from "./journal-sections";
import { Segment, keywordOf, segment } from "../core/layout";
import {
  MODIFIER_KEYWORDS,
  ROW_KEYWORD,
  cutFromFence,
  dropSoloBar,
  insertBar,
  isHeaderLine,
  leadingBar,
  needsSoloBar,
  soloBar,
  titledHeadersIn,
  splitDirective,
} from "../core/directive-grammar";
import {
  SectionModel,
  SectionOp,
  SectionOpKind,
  SectionView,
  SectionWant,
  describeAnswers,
  idsOf,
  moveOps,
  optionsFor,
  reconfigured,
  answersInText,
  withAnswers,
} from "../core/section-model";

// ── what a file is made of ────────────────────────────────────────────

// One contiguous run of a file, attributed.
//
// `sectionId` is null for a run the catalogue did not write: the reader's own
// prose, a hand-added fence, frontmatter. Those are reported and never moved.
export interface SectionRun {
  // The section this run belongs to, or the FIRST of them where a row fence
  // holds several — 4.70. Kept beside `sectionIds` rather than replaced by it
  // because every consumer that asks "whose block is this" wants one answer,
  // and for every run but a row it is the only one there is.
  sectionId: string | null;
  // Every section in this run, in file order. Empty for a run that is nobody's.
  sectionIds: string[];
  // Index into the segment list, inclusive.
  from: number;
  to: number;
  // Blank separators and frontmatter: structure rather than content. See the
  // note in parseSections for why these are not reported as the reader's own
  // blocks.
  filler: boolean;
}

// ── operations ────────────────────────────────────────────────────────

// MOVED TO core/section-model.ts IN 3.0, and re-exported here so no caller
// changed. It was always the general vocabulary — add, remove, move, keep and
// foreign are what a plan over ANY catalogue says — and it lived in this module
// for the accident of having been needed here first. The diary catalogues now
// speak it too, which is what §2 of the 3.0 plan means by one interface over
// three implementations.
export type { SectionOpKind, SectionOp };

// ── parsing ───────────────────────────────────────────────────────────

// The directive keywords a rendered fence carries, ignoring `header:`.
//
// Uses layout.ts's keywordOf on both sides of the comparison rather than a
// second extractor of its own, because the two only have to disagree once —
// on `# chronoanvil:trackers:start`, say, whose keyword is the odd but perfectly
// consistent `# chronoanvil` — for a section to stop being findable in the file
// that just wrote it.
//
// Headers are excluded because they are retitleable: layout.ts settled that
// for dashboards ("a user who renames `header:⏳ Open tasks` keeps it") and the
// same holds here. What identifies a fence is the widgets in it.
// A fence's CONTENT keywords: what it draws, with the furniture dropped.
//
// `MODIFIER_KEYWORDS` AS OF 4.70, WHERE IT WAS `k !== "header"`. That list was
// complete when it was written and became silently wrong as the grammar grew:
// a `frame:` line, and now a `row`, counted as a widget, so a fence carrying one
// matched no signature and the section in it read as absent. Same list, same
// release, same reason as `assetUnits`.
function fenceKeywords(lines: string[]): string[] {
  return lines
    .map(keywordOf)
    .filter((k) => k.length > 0 && !MODIFIER_KEYWORDS.has(k));
}

function sameKeywords(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((k, i) => k === sb[i]);
}

// Fences whose body is chart specs rather than directives, so they yield no
// keywords and are matched by their info string instead. One section owns each,
// which is what makes that unambiguous — asserted, not assumed.
const OPAQUE_FENCE_KINDS = new Set(["chronoanvil-charts", "chronoanvil-journal-charts"]);

// Which region keys a segment holds, and how many non-blank lines each has.
//
// A region is `<!--chronoanvil:key` … `-->`. notestore.ts locates one by a
// whole-file indexOf, so it need not be adjacent to anything; here it only has
// to be findable, which is weaker.
function regionsIn(lines: string[]): Map<string, number> {
  const out = new Map<string, number>();
  let key: string | null = null;
  let count = 0;
  for (const line of lines) {
    if (key === null) {
      const m = line.match(/^<!--chronoanvil:([A-Za-z0-9_-]+)\s*$/);
      if (m) {
        key = m[1];
        count = 0;
      }
      continue;
    }
    if (line.trim() === "-->") {
      out.set(key, count);
      key = null;
      continue;
    }
    if (line.trim() !== "") count++;
  }
  return out;
}

interface Signature {
  section: JournalSection;
  keywords: string[];
  fenceKind: string;
  // Whether this section is built from repeatable parts, and so may legitimately
  // appear in a file with fewer of them than the catalogue would write. 3.18 §1.
  extensible: boolean;
}

// Every section's fence signature and region ownership for one surface.
function signaturesFor(ctx: SectionContext): {
  fences: Signature[];
  regionOwners: Map<string, string>;
} {
  const fences: Signature[] = [];
  const regionOwners = new Map<string, string>();
  for (const s of sectionsFor(ctx)) {
    const blocks = s.render(ctx, sectionOverrides(ctx, s.id));
    for (const b of blocks) {
      if (b.kind === "region") regionOwners.set(b.key, s.id);
      if (b.kind !== "fence") continue;
      fences.push({
        section: s,
        keywords: fenceKeywords(b.lines),
        fenceKind: b.info,
        extensible: (s.parts?.(ctx, sectionOverrides(ctx, s.id)) ?? []).length > 0,
      });
    }
  }
  return { fences, regionOwners };
}

// A section with no fence at all — `headings`, and only `headings`.
//
// Signature matching cannot see it: its output is ordinary `## ` markdown.
// Leaving it unattributed would have every Lesson template report its own prose
// skeleton as blocks that aren't the catalogue's, and would make isHandEdited
// true for a file the plugin had just written.
//
// So fall back to the section's own `locate` probe, which is exactly what that
// callback is for.
//
// ── WHY OVER-MATCHING IS STILL HARMLESS, ON A NEW ARGUMENT (5.6) ─────────
//
// This function claims a WHOLE raw segment, and a raw segment runs from one
// fence to the next — so it holds the skeleton, the markers, and every word the
// reader has typed under the last heading. Until 5.6 the justification for that
// was one sentence: "a markdown-only section is never removable, so attributing
// a reader's own `## Notes` to it changes nothing that happens to the file."
//
// The skeleton is removable now, so that sentence is spent, and the replacement
// has to be about the WRITE rather than about the attribution. It is: the only
// thing removal does to this run is `cutBracketedSpan`, which copies everything
// outside the markers verbatim and, inside them, drops only headings with
// nothing written under them. A segment claimed too widely is therefore still a
// segment nothing touches, and the reader's prose is safe because the cut is
// scoped to the bracket rather than because the attribution was exact.
//
// AN UNMARKED SKELETON IS CLAIMED THE SAME WAY AND CANNOT BE REMOVED AT ALL —
// `planSections` and `journalRefusal` both ask `bracketSpanIn` before they will
// write. So the pre-5.6 note keeps exactly the behaviour it had.
function markdownOwnerOf(
  seg: Segment,
  ctx: SectionContext,
  sections: JournalSection[]
): JournalSection | null {
  if (seg.kind !== "raw") return null;
  const text = seg.lines.join("\n");
  if (!text.trim()) return null;
  for (const s of sections) {
    const blocks = s.render(ctx, sectionOverrides(ctx, s.id));
    if (blocks.some((b) => b.kind === "fence")) continue;
    if (!blocks.some((b) => b.kind === "markdown" || b.kind === "bracketed"))
      continue;
    if (s.locate(text, ctx) >= 0) return s;
  }
  return null;
}

// Whether `sub` is a sub-multiset of `all` — every keyword in `sub` present in
// `all` at least as many times.
function isSubMultiset(sub: string[], all: string[]): boolean {
  const left = [...all];
  for (const k of sub) {
    const at = left.indexOf(k);
    if (at === -1) return false;
    left.splice(at, 1);
  }
  return true;
}

function ownerOf(seg: Segment, sigs: Signature[]): JournalSection | null {
  if (seg.kind !== "fence") return null;
  const kind = seg.fenceKind ?? "chronoanvil";
  if (OPAQUE_FENCE_KINDS.has(kind)) {
    return sigs.find((c) => c.fenceKind === kind)?.section ?? null;
  }
  const kw = (seg.keywords ?? []).filter((k) => !MODIFIER_KEYWORDS.has(k));
  const exact = sigs.find(
    (c) => !OPAQUE_FENCE_KINDS.has(c.fenceKind) && sameKeywords(c.keywords, kw)
  );
  if (exact) return exact.section;

  // A SHORT FENCE STILL BELONGS TO ITS SECTION. 3.18 §1.
  //
  // A Topic index written before a journal gained a note kind carries one
  // `kind-table:` where the catalogue would now write two, and exact keyword
  // equality calls that fence nobody's — so the section read as ABSENT and the
  // plan said `add`, which appends a second copy of the whole thing beside the
  // short one. The probe in §1.2 predicted `keep`; the tree does something
  // worse, and it writes.
  //
  // FALLBACK ONLY, AND ONLY FOR EXTENSIBLE SECTIONS. Every exact match is tried
  // first, so no attribution that worked before can change. A sub-multiset is
  // still an exact reconstruction from declared pieces rather than a
  // resemblance: `children` is the only section whose keywords are `button` and
  // `kind-table`, and a fence of `["tasks-table"]` or `["button",
  // "pages-table"]` is not a sub-multiset of it. The catalogue shape test pins
  // that no two sections can collide here.
  //
  // Non-empty because an empty fence is not evidence of anything.
  if (!kw.length) return null;
  return (
    sigs.find(
      (c) =>
        c.extensible &&
        !OPAQUE_FENCE_KINDS.has(c.fenceKind) &&
        isSubMultiset(kw, c.keywords)
    )?.section ?? null
  );
}

// EVERY SECTION IN ONE FENCE, WHICH IS MORE THAN ONE WHEN THE FENCE IS A ROW.
//
// `ownerOf` above answers "whose fence is this", and until 4.70 that question
// had one answer by construction: a journal template composed one fence per
// section. `composeSectionRuns` now welds a row's cells into a single fence, so
// a subject index's `row / review-queue / tasks-table` is two sections in one
// block, and a matcher that can only say one of them reports the other absent
// and offers to add a second copy.
//
// DEALT OFF THE FRONT, LONGEST FIRST. The fence's content keywords are consumed
// by signatures in file order: at each position the longest signature that
// matches the next N keywords wins, and the walk continues after it. Longest
// first is what stops a one-keyword section swallowing the head of a
// two-keyword one — the `children` / `tasks` pair is exactly that shape.
//
// ALL OR NOTHING. If the walk cannot consume the whole list the answer is the
// empty array and the block is foreign, which is the same conservatism
// `ownerOf` applies: a fence the catalogue cannot fully account for is the
// reader's, and half-attributing it is how a reconciler cuts a line it did not
// write.
function ownersOf(seg: Segment, sigs: Signature[]): JournalSection[] {
  const one = ownerOf(seg, sigs);
  if (one) return [one];
  if (seg.kind !== "fence") return [];
  const kind = seg.fenceKind ?? "chronoanvil";
  if (OPAQUE_FENCE_KINDS.has(kind)) return [];
  if (!(seg.keywords ?? []).some((k) => k === ROW_KEYWORD)) return [];

  const kw = (seg.keywords ?? []).filter((k) => !MODIFIER_KEYWORDS.has(k));
  const usable = sigs
    .filter((c) => !OPAQUE_FENCE_KINDS.has(c.fenceKind) && c.fenceKind === kind)
    .filter((c) => c.keywords.length > 0)
    .sort((a, b) => b.keywords.length - a.keywords.length);

  const out: JournalSection[] = [];
  let at = 0;
  while (at < kw.length) {
    const hit = usable.find(
      (c) =>
        at + c.keywords.length <= kw.length &&
        sameKeywords(c.keywords, kw.slice(at, at + c.keywords.length))
    );
    if (!hit) return [];
    out.push(hit.section);
    at += hit.keywords.length;
  }
  return out.length > 1 ? out : [];
}

const isBlank = (lines: string[]): boolean =>
  lines.every((l) => l.trim() === "");

// Split a raw segment where a frontmatter block or region comment is followed
// by other content (such as the prose skeleton or another region), so that
// lookaheads like region absorption do not swallow unrelated sections.
//
// EXPORTED BECAUSE `SectionRun.from`/`to` ARE INDICES INTO ITS OUTPUT (5.10),
// not into `segment(...)`. A caller holding a run and wanting its lines has to
// segment the file the same way this module did, and there is no second way to
// arrive at the same numbering — so the alternative to exporting it is every
// reader of a run reimplementing it and one of them getting it wrong.
export function splitRawSegments(segs: readonly Segment[]): Segment[] {
  const out: Segment[] = [];

  for (const seg of segs) {
    if (seg.kind !== "raw") {
      out.push(seg);
      continue;
    }

    let remaining = seg.lines;
    while (remaining.length > 0) {
      // 1. Frontmatter block at start of note
      if (out.length === 0 && remaining[0]?.trim() === "---") {
        let fmClose = -1;
        for (let j = 1; j < remaining.length; j++) {
          if (remaining[j].trim() === "---") {
            fmClose = j;
            break;
          }
        }
        if (fmClose !== -1 && fmClose + 1 < remaining.length) {
          let end = fmClose;
          if (
            remaining[end + 1]?.trim().startsWith("`chronoanvil:spacer`") ||
            remaining[end + 1]?.trim().startsWith("`almanac:spacer`")
          ) {
            end++;
          }
          out.push({ kind: "raw", lines: remaining.slice(0, end + 1) });
          remaining = remaining.slice(end + 1);
          continue;
        }
      }

      // 2. Region block (<!--chronoanvil:key ... -->)
      const rOpen = remaining.findIndex((l) =>
        /^<!--(?:chronoanvil|almanac):[A-Za-z0-9_-]+\s*$/.test(l.trim())
      );
      if (rOpen !== -1) {
        let rClose = -1;
        for (let j = rOpen + 1; j < remaining.length; j++) {
          if (remaining[j].trim() === "-->") {
            rClose = j;
            break;
          }
        }
        if (rClose !== -1 && rClose + 1 < remaining.length) {
          // If there are lines before the region opener (e.g. blanks or prose),
          // push them first.
          if (rOpen > 0) {
            out.push({ kind: "raw", lines: remaining.slice(0, rOpen) });
          }
          out.push({
            kind: "raw",
            lines: remaining.slice(rOpen, rClose + 1),
          });
          remaining = remaining.slice(rClose + 1);
          continue;
        }
      }

      // No more split points; push remainder as a single raw segment
      out.push({ kind: "raw", lines: remaining });
      break;
    }
  }

  return out;
}

// A file as the sections it contains, in file order, plus the runs that belong
// to nobody.
//
// The inverse of composeTemplate, and deliberately conservative: a section is
// present iff its own fence is present. Its regions are attributed to it when
// they follow; a region the reader moved elsewhere keeps its content either
// way, because nothing in this module deletes one.
export function parseSections(text: string, ctx: SectionContext): SectionRun[] {
  const segs = splitRawSegments(segment(text.split("\n")));
  const { fences, regionOwners } = signaturesFor(ctx);

  const runs: SectionRun[] = [];
  let i = 0;
  while (i < segs.length) {
    const seg = segs[i];
    const owners = ownersOf(seg, fences);
    const owner =
      owners[0] ?? markdownOwnerOf(seg, ctx, sectionsFor(ctx)) ?? null;

    if (!owner) {
      runs.push({
        sectionId: null,
        sectionIds: [],
        from: i,
        to: i,
        // Blank separators and the frontmatter block. Neither is a block the
        // plan could ever touch, and counting them as the reader's own content
        // would have every untouched template report "two blocks here aren't
        // the catalogue's" — true, useless, and alarming.
        //
        // The frontmatter run also carries the banner's `chronoanvil:spacer`,
        // which sits on line 0 of the body with no blank line above it and is
        // therefore in the same raw segment. That is fine: banner is
        // `required` and never removable, so nothing ever needs to splice it.
        filler:
          isBlank(seg.lines) ||
          (i === 0 && seg.lines[0]?.trim() === "---") ||
          seg.lines.every(
            (l) =>
              l.trim() === "" ||
              l.trim().startsWith("%%") ||
              l.trim().startsWith("[[")
          ),
      });
      i++;
      continue;
    }

    // Absorb the regions this section owns, as long as they follow it. A raw
    // segment holding somebody else's prose stops the run.
    let end = i;
    let j = i + 1;
    while (j < segs.length) {
      const next = segs[j];
      if (next.kind !== "raw") break;
      if (isBlank(next.lines)) {
        // A blank line between a fence and its own region is still inside the
        // section; a blank line before something else is not. Look ahead.
        const after = segs[j + 1];
        if (!after || after.kind !== "raw") break;
        const keys = [...regionsIn(after.lines).keys()];
        if (!keys.length || !keys.every((k) => regionOwners.get(k) === owner.id))
          break;
        end = j + 1;
        j += 2;
        continue;
      }
      const keys = [...regionsIn(next.lines).keys()];
      if (!keys.length || !keys.every((k) => regionOwners.get(k) === owner.id))
        break;
      end = j;
      j++;
    }
    runs.push({
      sectionId: owner.id,
      sectionIds: owners.length ? owners.map((o) => o.id) : [owner.id],
      from: i,
      to: end,
      filler: false,
    });
    i = end + 1;
  }
  return runs;
}

// The section ids a file contains, in file order.
//
// The same question detectSections answers, asked of the block model instead
// of a per-section `locate` regex. Kept alongside rather than replacing it:
// detectSections is load-bearing for "add a section to this note" and for the
// wizard, and swapping its implementation belongs in a patch that has a reason
// to, not this one.
export function sectionsPresent(text: string, ctx: SectionContext): string[] {
  const out: string[] = [];
  for (const run of parseSections(text, ctx)) {
    for (const id of run.sectionIds) if (!out.includes(id)) out.push(id);
  }
  return out;
}

// ── planning ──────────────────────────────────────────────────────────

function describeAdd(section: JournalSection): string {
  return `adds ${section.label.toLowerCase()}`;
}

// Why a removal was refused, in the reader's terms: what is in the way, and
// what to do about it. A refusal that only says no sends someone looking for a
// setting that does not exist.
function describeRefusedRemove(
  keeps: { key: string; lines: number }[]
): string {
  const total = keeps.reduce((n, k) => n + k.lines, 0);
  const names = keeps.map((k) => k.key).join(", ");
  return `has your writing in it (${total} line${
    total === 1 ? "" : "s"
  } in ${names}) — clear it first, then remove the section`;
}

// WHY A SKELETON THIS NOTE CARRIES STILL CANNOT GO, said once (5.6).
//
// The section is removable — `sectionRemovable` says so, and it is right about
// every note the plugin writes from here on. This note is one of the ones that
// came before: its headings were composed as bare markdown with nothing marking
// where they start, so there is no honest way to tell them from a `## Notes` the
// reader typed themselves.
//
// ONE STRING, TWO CALLERS. `planSections` says it on the change list and
// `journalRefusal` says it on the row, and 4.21's rule is that a second
// derivation of "may this go" is how the row and the plan come to disagree —
// with the row being the one the reader believes.
//
// IT NAMES THE DOOR, which is the pattern the template modal's refusal already
// follows: recomposing the page composes the skeleton again, this time
// bracketed, and the section becomes removable like any other.
//
// AND IT NAMES IT IN THE WORDS ON THE BUTTON. "Reload this page" is what the
// gesture is called in both template modals and in the note's own command; a
// refusal that says "rebuild from its template" describes the same act in
// words that appear nowhere on screen, and sends a reader looking for a control
// that is not spelled that way. "Page" rather than "note" for the same reason —
// this refusal is read over a template as often as over a note, and a template
// is not a note.
export const UNMARKED_PROSE_REFUSAL =
  "written as ordinary markdown here — Reload this page to mark it, " +
  "or delete the headings by hand";

function describeKept(kept: readonly { key: string; lines: number }[]): string {
  const total = kept.reduce((n, k) => n + k.lines, 0);
  const names = kept.map((k) => k.key).join(", ");
  return `keeps ${names} (${total} line${
    total === 1 ? "" : "s"
  } of your writing)`;
}

function describeProseRemove(kept: { key: string; lines: number }[]): string {
  if (!kept.length) return "removes the empty headings";
  return `removes the empty headings — ${describeKept(kept)}`;
}

function describeRemove(
  section: JournalSection,
  keeps: { key: string; lines: number }[]
): string {
  if (!keeps.length) return `removes ${section.label.toLowerCase()}`;
  const total = keeps.reduce((n, k) => n + k.lines, 0);
  return `removes ${section.label.toLowerCase()} — keeps ${total} line${
    total === 1 ? "" : "s"
  } of your text`;
}

// What changing a file's sections to `want` would do.
//
// `want` is ordered, but this patch does not reorder: a section already in the
// file stays where it is. Order is carried so the planner and the eventual
// editor agree about the shape of the request rather than needing a second
// call when reordering lands.
// What "the host note's own folder" is here, for a plan line. A journal index
// sits in the folder it indexes, so the honest answer on a note is its own
// path — and on a template there is no answer, which is why a folder question
// asked there never reaches a control in the first place.
export function journalHostLabel(ctx: SectionContext): string {
  return ctx.hostFolder || "this note's folder";
}

// The parts of a section a run does not contain, in catalogue order. 3.18 §1.3.
//
// EMPTY FOR EVERY SECTION THAT DECLARES NO PARTS, which is every section but
// `children` — so this is a no-op on all three surfaces except the one place it
// is about.
//
// GATED ON THE SURFACE, NOT ON THE CATALOGUE (§1.4). `extend` may run on an
// index note or an index template and never on a leaf note, a kind template or
// a page, because a dashboard's content is a rollup of what is beneath it — it
// can be WRONG about a fact — while a leaf note's content is the reader's
// writing. `children` is `surface: "index"` today, so the leaf arm is
// unreachable through the shipped catalogue; the gate is here anyway, because a
// rule that holds by accident of the catalogue stops holding the day somebody
// adds a leaf section with parts, and they will not know they were the one who
// broke it.
export function missingParts(
  lines: string[],
  section: JournalSection,
  ctx: SectionContext
): SectionPart[] {
  if (ctx.noteKind === "leaf" || ctx.noteKind === "page") return [];
  const parts = section.parts?.(ctx, sectionOverrides(ctx, section.id)) ?? [];
  if (!parts.length) return [];
  const present = new Set(lines.map((l) => l.trim()));
  return parts.filter((p) => !present.has(p.probe.trim()));
}

// ── A CELL ALREADY ON DISK WITH NO TITLE OVER IT (5.9) ───────────────────
//
// `soloBar` gives a row's surviving cell a title when the row is COMPOSED
// without its opener and when one is CUT out of a fence. Neither reaches a page
// that is already in that state — written by a release that had no such rule,
// or by a removal made before it — and the reader of that page has no gesture
// that fixes it: unticking the section and ticking it back composes the same
// barless fence they started with.
//
// So it is the third door, and it is reported before it is written. An
// `extend` is exactly what this is — a section short of something it should
// have — which is the shape `missingParts` already established and the reason
// this needs no new op kind.
//
// ── AND EVERY OTHER SECTION THAT LOST ITS TITLE (5.10) ───────────────────
//
// 5.9 scoped this to a ROW's surviving cell, because that was the only way a
// block was known to end up untitled. It was not. A section whose catalogue
// entry gained a `header:` line — `trackers` and `stats` both did — is in the
// same state on every note composed before that, and for the same reason: the
// file says one thing, the catalogue says another, and no gesture reconciles
// them because unticking and re-ticking composes what the file already has.
//
// The alternative that was tried and is being undone here was to draw a
// fallback bar at render time. That gives a vault two looks for one object,
// chosen by the age of the note, and it does it silently. Reporting the gap
// puts the change in front of the reader, in the window whose job is exactly
// that, and leaves the file as the single source of what the note holds.
//
// SO THE QUESTION IS ASKED OF THE RENDER, not of a new catalogue field. If
// composing this section today would open it with a `header:` line, that is
// the title it is missing — which means a section cannot declare one place and
// draw another, and adding a bar to a catalogue entry needs no second edit
// here.
//
// STILL NARROW WHERE IT MATTERS. Only where the run holds this section alone,
// only where the fence carries no bar of ANY kind, and never over a title. A
// fence the reader has titled themselves, or one framed with `frame: section`,
// answers `isSectionFence` and is left exactly as they have it.
//
// AND ON EVERY NOTE KIND, unlike `missingParts` beside it, which is withheld
// from a leaf and a page on the grounds that a rollup can be WRONG about the
// world where a reader's writing cannot. A bar is not content. It is one line
// of chrome at the top of a fence the plugin composed, and a leaf note wearing
// last release's chrome is the same defect on a page nobody is arguing about.
function declaredBar(
  section: JournalSection,
  ctx: SectionContext
): string | undefined {
  // ── AND A SECTION THE READER MAY HAVE MEANT TO BE BARE IS NEVER SHORT OF
  //    A BAR (5.11) ───────────────────────────────────────────────────
  //
  // This repair reads a barless fence as a page BEHIND the catalogue, and that
  // reading is only honest while "barless" has one cause. A section carrying a
  // form toggle has two: the reader answered "as a widget", which is what makes
  // it groupable at all — and nothing in the file tells the two apart.
  //
  // SO THE AMBIGUOUS CASE IS LEFT ALONE, which is the cheap side of the trade.
  // Repairing it would overwrite an answer the reader gave, on a save they
  // asked for something else in, with a line the plan called an `extend`;
  // declining leaves a page as they have it, and the toggle that would put the
  // bar back is in the same window as the sentence that would have offered it.
  //
  // NOT A NARROWING OF 5.10. Everything that catalogue repairs — the tracker
  // grid, the note tables, the charts region, the banner — hosts a control in
  // its bar and therefore has no widget form to be in.
  if (widgetFormBar(section, ctx)) return undefined;
  // A row member names its solo title outright: the bar it wears is worded for
  // ITSELF rather than for the band, so it cannot be read off a render that
  // composes the band's.
  const own = soloBarOf(section, ctx);
  if (own) return own;
  if (rowOf(section, ctx)) return undefined;

  const first = section.render(ctx, sectionOverrides(ctx, section.id))[0];
  return first?.kind === "fence" ? leadingBar(first.lines) : undefined;
}

export function missingSoloBar(
  runLines: readonly string[],
  run: SectionRun,
  section: JournalSection,
  ctx: SectionContext
): string | null {
  if (run.sectionIds.length !== 1) return null;
  const bar = declaredBar(section, ctx);
  return needsSoloBar(runLines, bar) ? (bar as string) : null;
}

// ── A FENCE FULL OF GROUP HEADS AND NO SECTION BAR (5.12) ────────────────
//
// `needsSoloBar` asks `isSectionFence`, which asks whether the fence carries a
// `header:` at all — the right question while a fence carried at most one. The
// deepest index carries one PER NOTE KIND, so every Topic index already in a
// vault answers "titled" while missing the only bar that names the section those
// heads sit in. Its first group's head is read as the section's, and the card
// comes out headed "📝 Notes" with Lessons and Experiments inside it.
//
// COUNTED, NOT MATCHED, and that is the whole of why this is safe. Comparing the
// file's first head against the bar the catalogue would compose reports a
// missing bar on every note whose reader RENAMED it — the one thing this must
// never do, since renaming in place is the gesture that titles it. A count moves
// with a rename: one head per group that is actually here, and nothing else, is
// a fence with no bar; one more than that is a fence with one, whatever it says.
//
// STRICT ON BOTH SIDES. A head short (a reader deleted one and kept its table)
// and a head over (something else in the fence titles itself) both decline —
// the repair writes a line into somebody's note, so the only case it takes is
// the one it can name exactly.
export function missingGroupBar(
  runLines: readonly string[],
  section: JournalSection,
  ctx: SectionContext
): string | null {
  const parts = section.parts?.(ctx, sectionOverrides(ctx, section.id)) ?? [];
  const groups = parts.filter((p) => p.lines.some((l) => isHeaderLine(l.trim())));
  // ONE GROUP IS NO GROUPING on this side too: a section whose parts carry no
  // heads composes a bar and a body, which is exactly what `needsSoloBar`
  // already reports. Two doors onto one case is two answers to be told apart.
  if (groups.length < 2) return null;
  const present = new Set(runLines.map((l) => l.trim()));
  const here = groups.filter((g) => present.has(g.probe.trim())).length;
  if (here === 0) return null;
  if (titledHeadersIn(runLines).length !== here) return null;
  return declaredBar(section, ctx) ?? null;
}

// The bar this run is short of, by either door.
//
// ONE ANSWER FOR THE PLAN AND THE WRITE, which is this file's rule wherever a
// preview promises something: the sentence the reader reads and the line the
// save inserts come from the same call.
export function missingBar(
  runLines: readonly string[],
  run: SectionRun,
  section: JournalSection,
  ctx: SectionContext
): string | null {
  return (
    missingSoloBar(runLines, run, section, ctx) ??
    missingGroupBar(runLines, section, ctx)
  );
}

export function planSections(
  text: string,
  ctx: SectionContext,
  requested: readonly SectionWant[]
): SectionOp[] {
  const want = idsOf(requested);
  const runs = parseSections(text, ctx);
  const present = new Set(runs.flatMap((r) => r.sectionIds));
  const sections = sectionsFor(ctx);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const segs = splitRawSegments(segment(text.split("\n")));
  const rewriting = new Set(reconfigured([...present], requested));
  const ops: SectionOp[] = [];

  // Removals, keeps and reconfigures, in file order, so the plan reads down the
  // file.
  // EVERY SECTION OF EVERY RUN, WHICH IS TWO FOR A ROW FENCE (4.70). Each cell
  // gets its own op — its own keep, its own remove, its own refusal — because
  // that is what the reader is ticking. What they share is the run they sit in,
  // which is why the region and gap scans below are computed from the run.
  for (const run of runs) for (const runId of run.sectionIds) {
    const section = byId.get(runId);
    if (!section) continue;
    if (want.includes(runId)) {
      const runLines: string[] = [];
      for (let i = run.from; i <= run.to; i++) runLines.push(...segs[i].lines);
      const gaps = missingParts(runLines, section, ctx);
      // A TITLE IS A MISSING PART TOO, and it is reported in the same words for
      // the same reason — see `missingSoloBar`, which is what decides.
      const noBar = missingBar(runLines, run, section, ctx);
      // A reconfigure and an extension are both real writes, and a section can
      // want both at once. `reconfigure` wins the label because it is the one
      // that rewrites a line the reader may have edited; the extension is
      // reported in the same detail rather than swallowed.
      const kindOfOp = rewriting.has(section.id)
        ? "reconfigure"
        : gaps.length || noBar
          ? "extend"
          : "keep";
      const partDetail =
        gaps.length === 1
          ? `${gaps[0].label} has no table here — it will be added`
          : `${gaps.map((g) => g.label).join(", ")} have no table here — they will be added`;
      const barDetail = "this block has no title over it — one will be added";
      const gapDetail = gaps.length
        ? partDetail + (noBar ? `; ${barDetail}` : "")
        : barDetail;
      // A HEADING THE READER DID NOT LIST, BUT HAS WRITTEN UNDER, SURVIVES THE
      // rewrite — so the plan says so before the write rather than leaving them
      // to notice afterwards that the list they typed is not the list they got.
      // `rewriteBracketedSpan` is asked for the answer rather than re-derived
      // here: the preview and the write disagreeing is the whole failure this
      // sentence exists to prevent.
      const listSkel = skeletonOf(section, ctx);
      const listed = listedTitles(
        section,
        ctx,
        optionsFor(requested, section.id)
      );
      const orphans =
        listSkel && listed && listed.length
          ? (rewriteBracketedSpan(runLines, listSkel, listed)?.orphans ?? [])
          : [];
      ops.push({
        kind: kindOfOp,
        sectionId: section.id,
        label: section.label,
        ...(orphans.length ? { keepsContent: orphans } : {}),
        detail: rewriting.has(section.id)
          ? describeAnswers(
              questionsOf(section, ctx),
              optionsFor(requested, section.id),
              journalHostLabel(ctx)
            ) +
            (orphans.length ? ` — ${describeKept(orphans)}` : "") +
            (gaps.length || noBar ? `; ${gapDetail}` : "")
          : gaps.length || noBar
            ? gapDetail
            : "unchanged",
      });
      continue;
    }
    if (!sectionRemovable(section, ctx, sectionOverrides(ctx, section.id))) {
      // Asked for but refused, and said so. Silently keeping a section a
      // reader unticked would be the designer lying, which is the thing the
      // whole feature exists not to do.
      ops.push({
        kind: "keep",
        sectionId: section.id,
        label: section.label,
        detail: section.required
          ? "required — cannot be removed"
          : "written as ordinary markdown — delete it by hand",
      });
      continue;
    }
    // ── A BRACKETED SECTION, WHOSE ANSWER DEPENDS ON THIS FILE (5.6) ────
    //
    // Everything below this point is about fences and regions, and a prose
    // skeleton has neither: `regionsIn` finds nothing in it, so the untouched
    // path would report a clean `remove` and `applySections` would then find no
    // fence to drop and leave the note exactly as it was. A plan promising a
    // write that does not happen is the same silence `reconfigure` was added to
    // end, so the branch is here rather than absent.
    const skel = skeletonOf(section, ctx);
    if (skel !== null) {
      const cut = cutBracketedSpan(runLinesOf(segs, run), skel);
      ops.push(
        cut === null
          ? {
              kind: "keep",
              sectionId: section.id,
              label: section.label,
              detail: UNMARKED_PROSE_REFUSAL,
            }
          : {
              kind: "remove",
              sectionId: section.id,
              label: section.label,
              detail: describeProseRemove(cut.kept),
              ...(cut.kept.length ? { keepsContent: cut.kept } : {}),
            }
      );
      continue;
    }
    const keeps: { key: string; lines: number }[] = [];
    for (let i = run.from; i <= run.to; i++) {
      for (const [key, lines] of regionsIn(segs[i].lines)) {
        if (lines > 0) keeps.push({ key, lines });
      }
    }
    if (keeps.length) {
      // REFUSED WHILE IT HOLDS THE READER'S WRITING (2.59.7).
      //
      // The rule at the top of this file is unchanged and is the reason for the
      // change: NEVER DELETE A NON-EMPTY REGION. Keeping the region and dropping
      // the fence satisfied it, and refusing satisfies it more strongly — the
      // note is left exactly as it was rather than left in a state no section
      // owns.
      //
      // What tipped it is that an orphaned region is INVISIBLE. It renders as
      // nothing in reading mode, so after the one report that mentions it the
      // reader has no way to see it exists; the note now carries text with no
      // owner, and re-adding the same section later silently resurrects it.
      // State that persists and cannot be seen is the thing this plugin rules
      // against everywhere else — the frozen bridge says it is frozen, a scoped
      // widget names its scope.
      //
      // Refusing costs a reader who genuinely wants it gone two steps instead
      // of one, and the second step is theirs: clear the text, then remove the
      // section. That is a keystroke they already know and can undo.
      ops.push({
        kind: "keep",
        sectionId: section.id,
        label: section.label,
        detail: describeRefusedRemove(keeps),
      });
      continue;
    }
    ops.push({
      kind: "remove",
      sectionId: section.id,
      label: section.label,
      detail: describeRemove(section, keeps),
      ...(keeps.length ? { keepsContent: keeps } : {}),
    });
  }

  // Additions, in the order the reader asked for them rather than in
  // catalogue order: `want` is an ordered list now, and a plan that renamed
  // its own input would be describing a different request.
  const adding: string[] = [];
  for (const id of want) {
    if (present.has(id)) continue;
    const section = byId.get(id);
    if (!section) continue;
    adding.push(id);
    ops.push({
      kind: "add",
      sectionId: id,
      label: section.label,
      detail: describeAdd(section),
    });
  }

  // Moves, worked out from what the order will be once the adds and removes
  // have happened.
  //
  // REPORTED AS THE MINIMAL SET, via a longest common subsequence: moving one
  // section past another shifts the index of everything between them, and a
  // plan that named all of those would say "moves Charts, Path, Resources"
  // when the reader dragged Review. What actually moved is what is not in the
  // longest run that kept its relative order.
  const surviving = runs
    .flatMap((r) => r.sectionIds)
    .filter((id) => want.includes(id));
  const target = want.filter(
    (id) => surviving.includes(id) || adding.includes(id)
  );
  // Through the shared helper as of 3.0. The computation is unchanged — the
  // minimal set via a longest common subsequence, so dragging one section does
  // not report the three it shifted past — and it is shared because the diary
  // catalogues need the same answer to the same question. The alternative was
  // the diary importing this planner, which would drag `JournalType` and the
  // whole journal catalogue into a module about diary entries.
  ops.push(...moveOps(surviving, target, (id) => byId.get(id)?.label));

  // Anything the catalogue did not write, counted rather than named: the
  // reader knows what their own blocks are, and the useful fact is that the
  // plan is not going to touch them.
  const foreign = runs.filter((r) => !r.sectionIds.length && !r.filler).length;
  if (foreign) {
    ops.push({
      kind: "foreign",
      sectionId: null,
      label: "—",
      detail: `${foreign} block${
        foreign === 1 ? "" : "s"
      } in this file aren't the catalogue's; left alone`,
    });
  }

  return ops;
}

// ── applying ──────────────────────────────────────────────────────────

// The file with `want`'s sections, or null if nothing would change.
//
// Null-means-no-change is applyLayout's and mergeTrendsSection's convention,
// and it is what makes idempotence structural rather than a claim in a
// comment: a second call has nothing left to return.
//
// Calls planSections first and applies only what it named. That is the
// property the whole preview rests on, and it is asserted by test rather than
// assumed.
//
// SPLICES SEGMENTS VERBATIM. Every untouched run is re-emitted as the exact
// lines it was read as, so a reader's three blank lines, their odd indentation
// and their hand-written blocks all survive byte-for-byte. Rebuilding the file
// by re-joining sections with a standard separator would have been shorter and
// would have quietly reformatted every file it ever touched — which is the
// difference between a reconciler and a formatter, and the reason layout.ts
// keeps a list of things it must never learn to do.
// Insert the parts a section's run is missing, in catalogue order, into the
// fence that is already there. 3.18 §1.3.
//
// WHAT THIS MUST NOT DO, and the list is the one at the top of this file: no
// reflowing, no normalising whitespace, no rewriting a directive's arguments,
// no reordering blocks it did not move. It may insert lines. It may not tidy
// the ones around them — which is what makes it safe on a fence somebody has
// retitled or rearranged by hand.
//
// WHERE A PART LANDS. After the probe of the nearest PRECEDING part the file
// actually has, else before the group of the nearest FOLLOWING one, else just
// inside the fence close. That is catalogue order expressed against the file's
// own order rather than imposed on it: a reader who put Practice above Lessons
// keeps that, and the new kind arrives next to the one it follows in the
// catalogue rather than at the end.
//
// "After the probe" is correct only because a probe is the LAST line of its
// part — the rule SectionPart states. Inserting after a probe is inserting
// after the whole group.
function withMissingParts(
  lines: string[],
  section: JournalSection,
  ctx: SectionContext
): string[] {
  const gaps = missingParts(lines, section, ctx);
  if (!gaps.length) return lines;
  const parts = section.parts?.(ctx, sectionOverrides(ctx, section.id)) ?? [];

  const out = [...lines];
  const indexOfProbe = (probe: string): number =>
    out.findIndex((l) => l.trim() === probe.trim());

  // Where a present part's own block starts: its probe, walked back over the
  // lines it contributes, stopping at anything that is another part's probe or
  // is not one of this part's own lines. Bounded by the part's own length, so a
  // fence the reader has edited cannot make this run away.
  const groupStart = (part: SectionPart): number => {
    const at = indexOfProbe(part.probe);
    if (at === -1) return -1;
    const own = new Set(part.lines.map((l) => l.trim()));
    let i = at;
    let back = part.lines.length - 1;
    while (i - 1 >= 0 && back > 0 && own.has(out[i - 1].trim())) {
      i--;
      back--;
    }
    return i;
  };

  for (const gap of gaps) {
    const at = parts.findIndex((p) => p.id === gap.id);

    let insertAt = -1;
    // Nearest preceding part present in the file.
    for (let i = at - 1; i >= 0; i--) {
      const probeAt = indexOfProbe(parts[i].probe);
      if (probeAt !== -1) {
        insertAt = probeAt + 1;
        break;
      }
    }
    // Else before the nearest following one.
    if (insertAt === -1) {
      for (let i = at + 1; i < parts.length; i++) {
        const start = groupStart(parts[i]);
        if (start !== -1) {
          insertAt = start;
          break;
        }
      }
    }
    // Else just inside the fence close — the last line of the run that is a
    // bare ``` — falling back to the end of the run when there isn't one.
    if (insertAt === -1) {
      const close = out.map((l) => l.trim()).lastIndexOf("```");
      insertAt = close === -1 ? out.length : close;
    }
    out.splice(insertAt, 0, ...gap.lines);
  }
  return out;
}

export function applySections(
  text: string,
  ctx: SectionContext,
  requested: readonly SectionWant[]
): string | null {
  const want = idsOf(requested);
  const ops = planSections(text, ctx, requested);
  const removing = new Set(
    ops
      .filter((o) => o.kind === "remove")
      .map((o) => o.sectionId)
      .filter((id): id is string => id !== null)
  );
  const adding = ops
    .filter((o) => o.kind === "add")
    .map((o) => o.sectionId)
    .filter((id): id is string => id !== null);
  const moving = ops.some((o) => o.kind === "move");
  const rewriting = new Set(
    ops
      .filter((o) => o.kind === "reconfigure")
      .map((o) => o.sectionId)
      .filter((id): id is string => id !== null)
  );
  // A reconfigure may ALSO be short of a part (see planSections), so extending
  // is asked of both kinds rather than read off the op name.
  const extending = new Set(
    ops
      .filter((o) => o.kind === "extend" || o.kind === "reconfigure")
      .map((o) => o.sectionId)
      .filter((id): id is string => id !== null)
  );
  if (
    !removing.size &&
    !adding.length &&
    !moving &&
    !rewriting.size &&
    !ops.some((o) => o.kind === "extend")
  ) {
    return null;
  }

  const segs = splitRawSegments(segment(text.split("\n")));
  const runs = parseSections(text, ctx);
  const byId = new Map(sectionsFor(ctx).map((s) => [s.id, s]));

  interface Chunk {
    // Every section in this chunk, in file order — a list as of 4.70 for the
    // same reason `SectionRun` grew one: a row fence is two sections in one
    // block, and a chunk is what a block becomes on the way out.
    ids: string[];
    filler: boolean;
    lines: string[];
  }

  const chunks: Chunk[] = [];
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    const lines: string[] = [];
    for (let i = run.from; i <= run.to; i++) lines.push(...segs[i].lines);

    const doomed = run.sectionIds.filter((id) => removing.has(id));
    const keeping = run.sectionIds.filter((id) => !removing.has(id));

    if (!doomed.length) {
      // Answers spliced into their own span, on a section the plan named as a
      // reconfigure and on no other. Everything else here is the reader's file,
      // copied out verbatim — which is what `applySections` has done since it
      // was written and what patch 5 was most likely to cost.
      let out = lines;
      for (const id of run.sectionIds) {
        if (rewriting.has(id)) {
          const listedSection = byId.get(id);
          out = withAnswers(
            out,
            // AND A ROW FENCE ANSWERS NO FORM QUESTION (5.11). `withAnswers`'
            // widget branch filters every `header:` line in the chunk it is
            // handed, and a chunk holding two cells has one bar between them —
            // the band's, composed by the opener. So a form answer arriving for
            // one cell of a row would take the whole group's title off. The
            // editor already declines to offer the box there ("widgets in a
            // group are automatically drawn as widgets"); this is the same
            // refusal at the write, where a `want` built anywhere else lands.
            listedSection
              ? questionsOf(listedSection, ctx).filter(
                  (q) => q.kind !== "form" || run.sectionIds.length === 1
                )
              : [],
            optionsFor(requested, id)
          );
          if (listedSection) {
            out = withListedHeadings(
              out,
              listedSection,
              ctx,
              optionsFor(requested, id)
            );
          }
        }
        const section = byId.get(id);
        if (section && extending.has(section.id)) {
          out = withMissingParts(out, section, ctx);
          // AND THE TITLE, IF THE PLAN SAID SO. Asked of the same function the
          // plan asked rather than of a second derivation of it, which is this
          // file's rule wherever a preview promises a write.
          // `insertBar` RATHER THAN `soloBar`, because the gate has already been
          // asked: `missingBar` is the same call the plan made, and `soloBar`'s
          // own guard would refuse the group case it just approved.
          const bar = missingBar(out, run, section, ctx);
          if (bar) out = insertBar(out, bar);
        }
      }
      chunks.push({ ids: run.sectionIds, filler: run.filler, lines: out });
      continue;
    }

    // ── ONE CELL OF A ROW, WHERE THE OTHERS ARE STAYING (4.70) ──────────
    //
    // The fence is rewritten rather than dropped: the doomed cell's own
    // keywords come out, a keyword a survivor also writes is spared, and the
    // `row` line goes if the fence has fallen to a single widget. All three are
    // `cutFromFence`, shared with the diary dashboards, which is where the
    // argument for each is written down.
    if (keeping.length) {
      const keywordsOf = (id: string): string[] => {
        const section = byId.get(id);
        if (!section) return [];
        return section
          .render(ctx, sectionOverrides(ctx, id))
          .flatMap((b) => (b.kind === "fence" ? b.lines : []))
          .map((l) => splitDirective(l).keyword);
      };
      const survivor = keeping.length === 1 ? byId.get(keeping[0]) : undefined;
      const cut = cutFromFence(
        lines,
        new Set(doomed.flatMap(keywordsOf)),
        new Set(keeping.flatMap(keywordsOf)),
        // THE SURVIVOR'S OWN TITLE WHERE ONE CELL IS LEFT (5.9). Removing Review
        // takes the bar with it — it is Review's line — and what remains is the
        // barless cell beside it. `soloBar` gives that cell the name the
        // catalogue already writes for it standing alone, and does nothing at
        // all to a fence that still has a bar or still has two cells.
        survivor ? soloBarOf(survivor, ctx) : undefined
      );
      if (cut) {
        chunks.push({ ids: keeping, filler: false, lines: cut });
        continue;
      }
    }

    // A BRACKETED SECTION IS CUT INSIDE ITS RUN RATHER THAN DROPPED WITH IT
    // (5.6). Every other removal takes whole segments out, because every other
    // section IS whole segments; the skeleton shares a raw segment with whatever
    // the reader has written under its last heading, so dropping the segment
    // would delete their prose to remove a `## `.
    //
    // The plan already decided this is a `remove`, which means `cutBracketedSpan`
    // returned non-null there — the null case became a `keep` and never reaches
    // here. It is called again rather than carried across, because the op
    // carries a description and this needs the lines, and a plan that shipped
    // its own output would be a second thing to keep equal to the file.
    const skelGone = doomed
      .map((id) => byId.get(id))
      .filter((sec): sec is JournalSection => sec !== undefined)
      .map((sec) => skeletonOf(sec, ctx))
      .find((k) => k !== null);
    if (skelGone) {
      const cut = cutBracketedSpan(runLinesOf(segs, run), skelGone);
      if (cut) {
        // NO FOLLOWING FILLER IS EATEN, unlike every other removal here. The
        // blank this run sat behind is one of its own lines, and
        // `cutBracketedSpan` has already decided what to leave of it — taking
        // the next run's blank as well would close the gap the note needs.
        chunks.push({
          ids: [],
          filler: !cut.lines.some((l) => l.trim() !== ""),
          lines: cut.lines,
        });
        continue;
      }
    }

    // Removing: the fence goes, a region with the reader's writing in it
    // stays exactly as it was. See the note at the top of this file — the
    // failure mode of deleting it is unrecoverable and the workaround for
    // keeping it is one keystroke.
    const survivors = keepNonEmptyRegions(segs, run);
    if (survivors.length) {
      chunks.push({ ids: [], filler: false, lines: survivors });
      continue;
    }
    // Nothing survived, so take the blank separator that followed it too —
    // otherwise every removal leaves a widening gap behind.
    if (runs[ri + 1]?.filler && isBlank(segs[runs[ri + 1].from].lines)) ri++;
  }

  // Insertions, positioned against the catalogue's order: after the last
  // preceding section the file actually has, else before the earliest
  // following one, else at the end. A reader who reordered their template
  // keeps their order and gets the new block somewhere sensible.
  // ORDERED THE WAY THIS SURFACE COMPOSES, layout included — see
  // `surfaceLayout`. This is the rank `insertionPoint` reads, so a section
  // re-added through the editor goes back where the template would have put it.
  const order = sectionsFor(ctx, surfaceLayout(ctx)).map((s) => s.id);
  for (const id of adding) {
    const section = byId.get(id);
    if (!section) continue;
    // THE READER'S CHOICE OVER THE PRESET'S, and in that order. A layout's
    // `SectionOverrides` is what the journal TYPE declares about this section
    // (Study's three resource shelves, its own bridge tracker); a
    // `SectionChoice` is what this reader asked for on this note. The preset is
    // a default and the choice is an answer, so the answer wins — and a choice
    // that says nothing leaves the preset exactly as it was.
    const markdown = renderSection(
      section,
      ctx,
      renderOptionsFor(section, ctx, requested)
    );
    // A CELL GOES BACK INTO ITS ROW, NOT BESIDE IT — the other half of the cut
    // above, and the property `insertionPoint` names as the reason it stops
    // where it does: remove a section, put it back, get the file you started
    // with. The ordinary add path composes a BLOCK, and a cut cell came out of
    // a fence somebody else is still in.
    if (joinRowChunk(chunks, section, ctx, byId, order, requested)) continue;
    // AND A CELL THAT COULD NOT REJOIN ONE IS COMPOSING A BLOCK OF ITS OWN, so
    // it takes the title a block of its own needs. `soloBar`'s third door, and
    // the one a reader reaches by ticking Open tasks onto a page whose Review
    // queue is not there: without it the add path hands back exactly the
    // headless fence the other two doors exist to stop.
    const alone = soloBar(markdown.split("\n"), soloBarOf(section, ctx));
    const at = insertionPoint(chunks, order, id);
    chunks.splice(at, 0, {
      ids: [id],
      filler: false,
      lines: ["", ...alone],
    });
  }

  // Reordering, last, so it is a permutation of the final set rather than of
  // an intermediate one.
  //
  // SECTIONS MOVE AROUND FOREIGN BLOCKS, WHICH KEEP THEIR INDEX. That is the
  // only rule available: a reader's own fence sitting between two sections
  // being swapped has no correct destination, so it stays put and the sections
  // trade the slots they had. Stated rather than guessed at, and the Markdown
  // tab shows the result before anything is written.
  //
  // Blank separators keep their positions for the same reason — they are
  // filler, so permuting them would be reformatting a file to no end.
  if (moving) {
    const slots: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].ids.length) slots.push(i);
    }
    // The order the reader asked for, restricted to what is actually present,
    // then anything present that `want` does not mention appended in the order
    // it already had. The second half matters: a section the reader never
    // touched must not be dropped because it was not in the list.
    const occupants = slots.map((i) => chunks[i].ids[0]);
    const desired = [
      ...want.filter((id) => occupants.includes(id)),
      ...occupants.filter((id) => !want.includes(id)),
    ];
    const byIdChunk = new Map(slots.map((i) => [chunks[i].ids[0], chunks[i]]));
    slots.forEach((slot, n) => {
      const wanted = byIdChunk.get(desired[n]);
      if (wanted) chunks[slot] = wanted;
    });
  }

  const next = chunks.flatMap((c) => c.lines).join("\n");
  return next === text ? null : next;
}

// ── A CELL REJOINING THE ROW IT LEFT (4.70) ──────────────────────────────
//
// The third copy of this rule and the last, after the diary dashboards and the
// flat notes: a section that declares a row looks for that row's fence before it
// composes a block of its own, and puts its line back inside it. See
// `diary-sections.ts` for the argument in full — this differs only in that a
// journal section renders a LIST of blocks, so a section that is not a lone
// fence has nothing a cell line could hold and is turned away at the top.
//
// FALSE FOR "NOT MY ROW", which includes the ordinary case of a row whose other
// cells are not on this surface at all: there is nothing to join, and a block of
// its own is exactly right.
function joinRowChunk(
  chunks: { ids: string[]; filler: boolean; lines: string[] }[],
  section: JournalSection,
  ctx: SectionContext,
  byId: Map<string, JournalSection>,
  order: string[],
  requested: readonly SectionWant[]
): boolean {
  const row = rowOf(section, ctx);
  if (!row) return false;
  const opts = renderOptionsFor(section, ctx, requested);
  const blocks = section.render(ctx, opts);
  if (blocks.length !== 1 || blocks[0].kind !== "fence") return false;
  const mine = blocks[0];

  const at = chunks.findIndex(
    (c) => c.ids.length > 0 && c.ids.every((id) => {
      const other = byId.get(id);
      return other !== undefined && rowOf(other, ctx) === row;
    })
  );
  if (at < 0) return false;

  const chunk = chunks[at];
  const rank = order.indexOf(section.id);
  const later = chunk.ids.find((id) => order.indexOf(id) > rank);
  const laterKeywords = later
    ? new Set(
        (byId.get(later)?.render(ctx, sectionOverrides(ctx, later)) ?? [])
          .flatMap((b) => (b.kind === "fence" ? b.lines : []))
          .map((l) => splitDirective(l).keyword)
      )
    : null;

  // AND THE SOLO BAR COMES BACK OFF — `dropSoloBar`, `soloBar`'s inverse. The
  // cut gave the survivor a title when it was left alone in the fence; the cell
  // arriving beside it composes the band's again, so the borrowed one goes and
  // remove-then-re-add restores the file byte for byte.
  const lines = chunk.ids.reduce((out, id) => {
    const member = byId.get(id);
    return member ? dropSoloBar(out, soloBarOf(member, ctx)) : out;
  }, chunk.lines as readonly string[]).slice();
  let insertAt = lines.length;
  for (let n = lines.length - 1; n >= 0; n--) {
    if (lines[n].trim() === "```") {
      insertAt = n;
      break;
    }
  }
  if (laterKeywords) {
    const found = lines.findIndex((l) =>
      laterKeywords.has(splitDirective(l.trim()).keyword)
    );
    if (found >= 0) insertAt = found;
  }
  // The `row` line comes back with the cell, because the cut took it when the
  // fence fell to one widget.
  if (!lines.some((l) => l.trim() === ROW_KEYWORD)) {
    const open = lines.findIndex((l) => l.trim().startsWith("```"));
    if (open < 0) return false;
    lines.splice(open + 1, 0, ROW_KEYWORD);
    if (insertAt > open) insertAt++;
  }
  // ── AND THE DELIMITER, WHICH THIS RECONCILER OWED THE OTHER ONE (5.18) ─
  //
  // `rowDelimiter` is the flat-note reconciler's rule, hoisted so both ask it
  // once. It arrived here because 5.18 gives this catalogue a TABBED row — the
  // tracker grid paged against the stats band — and a cell spliced in with no
  // delimiter is welded onto the one above it: re-adding Stats from the section
  // editor would have produced one page holding both widgets, which is neither
  // the shape composition writes nor a shape a reader asked for.
  //
  // THE ROW'S MEMBERS ARE ASKED OF THE CONTEXT, because `row` here is a
  // predicate rather than a constant — the same call `joinRowChunk` already
  // makes above to find the chunk.
  const before = chunk.ids.filter((id) => order.indexOf(id) < rank);
  const prevId = before.length ? before[before.length - 1] : undefined;
  const memberOf = (id: string | undefined): JournalSection | undefined =>
    id === undefined ? undefined : byId.get(id);
  const arrival = rowDelimiter({
    lines,
    insertAt,
    member: section,
    // An id in the chunk is a member; `?? {}` keeps "there is a cell above me"
    // true for one the map cannot resolve rather than turning it into "I
    // arrive first", which is a different branch with a different answer.
    prev: prevId === undefined ? undefined : (memberOf(prevId) ?? {}),
    later: later === undefined ? undefined : (memberOf(later) ?? {}),
    divided: order.some((id) => {
      const other = byId.get(id);
      return (
        other !== undefined &&
        rowOf(other, ctx) === row &&
        other.cell !== undefined
      );
    }),
  });
  insertAt = arrival.insertAt;
  lines.splice(
    insertAt,
    0,
    ...mine.lines,
    ...(arrival.delimiter && prevId === undefined ? [arrival.delimiter] : [])
  );
  if (arrival.delimiter && prevId !== undefined) {
    lines.splice(insertAt, 0, arrival.delimiter);
  }

  chunks[at] = {
    ids: [...chunk.ids, section.id].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b)
    ),
    filler: false,
    lines,
  };
  return true;
}

// The lines of a removed section's run that must survive: its non-empty
// regions, verbatim. Its fence goes.
// One run's lines, end to end. Two callers ask the same question — the plan and
// the write — and asking it twice in two spellings is how they come to describe
// different files.
function runLinesOf(segs: Segment[], run: SectionRun): string[] {
  const out: string[] = [];
  for (let i = run.from; i <= run.to; i++) out.push(...segs[i].lines);
  return out;
}

function keepNonEmptyRegions(segs: Segment[], run: SectionRun): string[] {
  const out: string[] = [];
  for (let i = run.from; i <= run.to; i++) {
    const seg = segs[i];
    if (seg.kind === "fence") continue;
    const regions = regionsIn(seg.lines);
    if ([...regions.values()].some((n) => n > 0)) out.push(...seg.lines);
  }
  return out;
}

// ── REMOVING A BRACKETED SECTION (5.6) ───────────────────────────────────
//
// THE SAME PROMISE `keepNonEmptyRegions` MAKES, AT A FINER GRAIN. The rule at
// the top of this file is that a removal never deletes the reader's writing,
// and a region keeps that promise wholesale: the fence goes, the region and
// everything in it stays exactly where it was. A prose skeleton cannot be kept
// wholesale, because what the reader wrote is not in a container of its own —
// it is UNDER the headings, interleaved with them.
//
// So the unit is the heading. A heading with nothing beneath it is scaffolding
// and goes; a heading with a word beneath it is the top of something the reader
// wrote and stays, with everything under it. That is a rule a reader can hold
// in their head, and it makes the common case — untick the skeleton on a note
// you have not written in yet — leave nothing behind at all.
//
// WHAT IS OUTSIDE THE MARKERS IS COPIED VERBATIM, unconditionally, and that is
// what makes `markdownOwnerOf` free to claim a whole raw segment. The bracket
// is the extent; the run is merely where to look for it.
//
// NOT DEDUCED FROM THE DECLARED HEADINGS. Matching the note's `## ` lines
// against `SectionOverrides.headings` would be the obvious way to find "the
// ones we wrote", and it is wrong twice: a reader who retitles `## Notes` to
// `## Working` would have their retitled heading treated as foreign and kept
// forever, and a reader whose layout changed since the note was made would have
// a heading they never touched treated as theirs. Emptiness is a fact about the
// file in front of us. Authorship is a guess.
//
// Returns null when this file has no bracket — a note written before 5.6 — which
// every caller reads as "this skeleton is unmarked prose and cannot be removed".
// One heading and everything under it, up to the next heading or the end of the
// span.
//
// THE UNIT BOTH WRITES WORK IN. Removing the section and rewriting its heading
// list are the same question asked twice — which of these blocks is the
// reader's — so they walk the span the same way, once, here. A second grouping
// is how a removal and an edit come to disagree about whose paragraph that was.
interface SpanGroup {
  // Null for the run above the first `## `. The catalogue writes none, so
  // anything there is the reader's.
  title: string | null;
  lines: string[];
  // Non-blank lines beneath the heading. The whole of what "has the reader
  // written here" means.
  written: number;
}

function spanGroups(inner: readonly string[]): SpanGroup[] {
  const out: SpanGroup[] = [];
  let group: string[] = [];
  let title: string | null = null;
  const flush = (): void => {
    if (!group.length) return;
    out.push({
      title,
      lines: group,
      written: (title === null ? group : group.slice(1)).filter(
        (l) => l.trim() !== ""
      ).length,
    });
    group = [];
  };
  for (const line of inner) {
    const head = /^##\s+(\S.*)$/.exec(line.trim());
    if (head) {
      flush();
      title = head[1].trim();
    }
    group.push(line);
  }
  flush();
  return out;
}

// A group's own blank edges taken off, its inside untouched.
//
// NOT `tidyBlanks`, WHICH COLLAPSES. A reader who puts two blank lines between
// two paragraphs meant to; reformatting that while reordering their headings
// would be this module editing prose it has no business in.
function trimEdges(lines: readonly string[]): string[] {
  const out = [...lines];
  while (out.length && out[0].trim() === "") out.shift();
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out;
}

// The reader's heading list, applied to the span they already have.
//
// A REWRITE, NOT A RE-RENDER. `renderSection` would compose the whole skeleton
// from the requested titles and lose every word underneath, so the titles are
// matched against the groups already in the file: a title that names an
// existing group takes that group WHOLE — heading line, prose and all — and
// only a title with no group behind it is composed fresh.
//
// AN UNREQUESTED HEADING WITH WRITING UNDER IT SURVIVES, appended after the
// list and reported back as an orphan, on exactly the rule removal uses: a
// heading is empty or it is the reader's, and this module never decides that a
// paragraph was a mistake. An unrequested EMPTY heading is what "delete this
// line from the box" has to mean, so it goes.
// What this section WOULD have written into its span, one body per heading.
//
// THE MEASURE OF "UNTOUCHED", AND THE REASON IT IS NOT A GUESS. Stage 1 settled
// that emptiness is a fact about the file and authorship is a guess, and that
// stands: this does not ask whether a heading is one the catalogue knows, it
// asks whether the words under it are, to the byte, the words the catalogue put
// there. A placeholder bullet nobody has filled in is not the reader's writing
// just because it is not blank — and a reader who typed those exact characters
// themselves has lost a line they can retype, against a rule that otherwise
// hands them back every heading they ever deleted.
//
// MEASURED AGAINST WHAT THE CATALOGUE WOULD WRITE, NOT AGAINST A REPLACEMENT —
// the same question `fenceContentLoss` asks of a fence, for the same reason.
function pristineBodies(
  section: JournalSection,
  ctx: SectionContext,
  key: string
): Map<string, string> {
  const out = new Map<string, string>();
  const composed = renderSection(
    section,
    ctx,
    sectionOverrides(ctx, section.id)
  ).split("\n");
  const span = bracketSpanIn(composed, key);
  if (!span) return out;
  for (const g of spanGroups(composed.slice(span.open + 1, span.close))) {
    if (g.title === null) continue;
    out.set(g.title, trimEdges(g.lines.slice(1)).join("\n"));
  }
  return out;
}

// The section's bracket, and everything both writes need to know about it.
function skeletonOf(
  section: JournalSection,
  ctx: SectionContext
): { key: string; pristine: Map<string, string> } | null {
  const key = bracketKeyOf(section, ctx, sectionOverrides(ctx, section.id));
  if (key === null) return null;
  return { key, pristine: pristineBodies(section, ctx, key) };
}

// Has the reader written under this heading?
//
// ONE PREDICATE, BOTH WRITES. A removal that keeps a heading the relist would
// drop — or the other way about — is the same file answering two different
// questions about whose paragraph that was, which is precisely what `SpanGroup`
// exists above to prevent.
function isWritten(g: SpanGroup, pristine: Map<string, string>): boolean {
  if (g.title === null || g.written === 0) return false;
  const body = trimEdges(g.lines.slice(1)).join("\n");
  return pristine.get(g.title) !== body;
}

function rewriteBracketedSpan(
  lines: readonly string[],
  skel: { key: string; pristine: Map<string, string> },
  titles: readonly string[]
): { lines: string[]; orphans: { key: string; lines: number }[] } | null {
  const span = bracketSpanIn(lines, skel.key);
  if (!span) return null;

  const groups = spanGroups(lines.slice(span.open + 1, span.close));

  // One group's markdown, in the shape `renderBlock` writes: the heading, a
  // blank, then the body — or a single blank line where a body would go, which
  // is the empty skeleton's invitation to write. Editing the list without
  // changing it therefore yields the file back byte for byte.
  const emit = (g: SpanGroup): string[] => {
    if (g.title === null) return trimEdges(g.lines);
    const body = trimEdges(g.lines.slice(1));
    return [`## ${g.title}`, "", ...(body.length ? body : [""])];
  };

  const taken = new Set<number>();
  const blocks: string[][] = [];
  groups.forEach((g, i) => {
    if (g.title !== null) return;
    taken.add(i);
    blocks.push(emit(g));
  });
  for (const title of titles) {
    const at = groups.findIndex((g, i) => !taken.has(i) && g.title === title);
    if (at === -1) {
      blocks.push([`## ${title}`, "", ""]);
      continue;
    }
    taken.add(at);
    blocks.push(emit(groups[at]));
  }

  const orphans: { key: string; lines: number }[] = [];
  groups.forEach((g, i) => {
    if (taken.has(i) || !isWritten(g, skel.pristine)) return;
    orphans.push({ key: g.title as string, lines: g.written });
    blocks.push(emit(g));
  });

  const inner = blocks
    .filter((b) => b.length > 0)
    .flatMap((b, i) => (i === 0 ? b : ["", ...b]));
  return {
    lines: [
      ...lines.slice(0, span.open + 1),
      "",
      ...inner,
      "",
      ...lines.slice(span.close),
    ],
    orphans,
  };
}

// The `lines` answer for a section, as titles, or null when this section asks no
// such question or this reader answered none of it.
function listedTitles(
  section: JournalSection,
  ctx: SectionContext,
  options: Record<string, unknown> | undefined
): string[] | null {
  const q = questionsOf(section, ctx).find((x) => x.kind === "lines");
  if (!q) return null;
  const answer = options?.[q.key];
  if (typeof answer !== "string") return null;
  return answer
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function withListedHeadings(
  lines: string[],
  section: JournalSection,
  ctx: SectionContext,
  options: Record<string, unknown> | undefined
): string[] {
  const titles = listedTitles(section, ctx, options);
  if (!titles || !titles.length) return lines;
  const skel = skeletonOf(section, ctx);
  if (!skel) return lines;
  return rewriteBracketedSpan(lines, skel, titles)?.lines ?? lines;
}

// The options a section is rendered with: the layout's defaults, the reader's
// answers on top — and a `lines` answer turned back into the shape the
// catalogue's `render` reads.
//
// THE QUESTION'S KEY IS THE OVERRIDE'S FIELD NAME. That is not a coincidence
// this file arranged; it is the contract `withAnswers` already runs on, where a
// question writes the argument it is keyed by. A `lines` question is the one
// kind whose answer is not a directive argument, so the conversion is here
// rather than in `section-model.ts`, which owns no catalogue's shapes.
function renderOptionsFor(
  section: JournalSection,
  ctx: SectionContext,
  requested: readonly SectionWant[]
): SectionOverrides {
  const declared = sectionOverrides(ctx, section.id);
  const opts: Record<string, unknown> = {
    ...declared,
    ...(optionsFor(requested, section.id) ?? {}),
  };
  const q = questionsOf(section, ctx).find((x) => x.kind === "lines");
  const titles = listedTitles(section, ctx, opts);
  if (q && titles && titles.length) {
    const carried = (declared as Record<string, unknown> | undefined)?.[q.key];
    opts[q.key] = headingsFromTitles(
      titles,
      Array.isArray(carried)
        ? (carried as { title: string; body?: string[] }[])
        : undefined
    );
  }
  return opts as SectionOverrides;
}

function cutBracketedSpan(
  lines: readonly string[],
  skel: { key: string; pristine: Map<string, string> }
): { lines: string[]; kept: { key: string; lines: number }[] } | null {
  const span = bracketSpanIn(lines, skel.key);
  if (!span) return null;

  const kept: { key: string; lines: number }[] = [];
  const survivors: string[] = [];
  for (const g of spanGroups(lines.slice(span.open + 1, span.close))) {
    if (g.title === null) {
      survivors.push(...g.lines);
      continue;
    }
    if (!isWritten(g, skel.pristine)) continue;
    kept.push({ key: g.title, lines: g.written });
    survivors.push(...g.lines);
  }

  const body = tidyBlanks([
    ...lines.slice(0, span.open),
    ...survivors,
    ...lines.slice(span.close + 1),
  ]);
  // THE EDGES OF THE RUN ARE PUT BACK, and they are not decoration. A raw
  // segment sits between two fences, so its first line is the blank that
  // separates it from the block above — strip that and a surviving heading
  // lands hard against a closing ```, which is a different bug in the same
  // family as the widening gap `tidyBlanks` exists to prevent. Restored only
  // where the original had one, and only when something survived at all: an
  // empty result means the caller takes the whole run out, blank and all.
  const lead = lines[0]?.trim() === "" ? [""] : [];
  const tail = lines[lines.length - 1]?.trim() === "" ? [""] : [];
  // AND ONE BLANK SURVIVES A RUN THAT LOSES EVERYTHING ELSE.
  //
  // This run is a RAW segment, so the blank lines separating it from the fences
  // on either side are INSIDE it — which is not true of any other removable
  // section, whose fence is its own segment with the separators as filler runs
  // beside it. That is why the region path can drop its whole run and then step
  // over the following blank, and why doing the same here would weld the block
  // above straight onto the block below: ````` and then
  // ````chronoanvil` with nothing between them.
  //
  // One, not two: the run contributed a separator at each end and the two blocks
  // it sat between now need exactly one between them.
  const separator = lead.length || tail.length ? [""] : [];
  return {
    lines: body.length ? [...lead, ...body, ...tail] : separator,
    kept,
  };
}

// Collapse the gaps a cut leaves behind: no run of more than one blank line, and
// none at either end. Chunks are concatenated verbatim on the way out
// (`chunks.flatMap`), so a removal that left its own blank lines in place would
// widen the note every time one was made — the same growing gap the region path
// steps over by taking the following filler segment with it.
function tidyBlanks(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" && out[out.length - 1]?.trim() === "") continue;
    out.push(line);
  }
  while (out.length && out[0].trim() === "") out.shift();
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out;
}

// Where a new section goes, in chunk space.
//
// Anchored to the sections the file actually has, not to an absolute position,
// so a template someone rearranged keeps its arrangement.
//
// ONE PASS, STOPPING AT THE FIRST SECTION THAT OUTRANKS IT. Scanning the whole
// file for the last lower-ranked section looks equivalent and isn't: Study's
// Topic index puts `children` after `path`, so re-adding `review` would find
// `children` late in the file, rank it as "before me", and land the block at
// the bottom. Stopping at the first section that should follow it keeps the
// insertion local — and makes remove-then-re-add restore the file exactly,
// which is the property worth having because it is the one a test can check.
//
// Falls through to the end, which is where "add a section to this note" has
// always put things.
function insertionPoint(
  chunks: { ids: string[] }[],
  order: string[],
  id: string
): number {
  const rank = order.indexOf(id);
  let after = -1;
  for (let i = 0; i < chunks.length; i++) {
    const k = chunks[i].ids[0];
    if (!k) continue;
    const r = order.indexOf(k);
    if (r === -1) continue;
    if (r > rank) return after === -1 ? i : after + 1;
    after = i;
  }
  return after === -1 ? chunks.length : after + 1;
}

// ── the whole-type view ───────────────────────────────────────────────

// Whether a file differs from what the catalogue would compose for the
// sections it already has.
//
// Not "differs from the default" — that would flag every template whose
// sections a reader chose at creation, which is all of them. The question is
// narrower and more useful: given these sections, is the file still the file
// the plugin wrote?
export function isHandEdited(text: string, ctx: SectionContext): boolean {
  return composedFromPresent(text, ctx).trim() !== stripFrontmatter(text).trim();
}

// What the catalogue would write for THE SECTIONS THIS FILE ALREADY HAS.
//
// EXTRACTED FROM `isHandEdited` IN 4.33 rather than spelled a second time. That
// function reduces it to a boolean; the reload gate needs the text, because the
// question it asks is "which lines in this note's fences did the catalogue not
// put there" — a reader's added chart, a shelf they named — and a yes/no cannot
// answer it.
//
// AGAINST THE FILE'S OWN SECTIONS, NOT AGAINST A LAYOUT'S. That is the whole
// reason this is the right baseline: comparing a note against what a layout
// would compose would report every section the layout DROPS as content lost,
// and refuse every reload that changed anything — which is 4.29's rule that "a
// catalogue directive the replacement drops is not a loss, it is the reload
// doing what it was asked", carried onto a surface whose fences also hold
// things the reader wrote.
export function composedFromPresent(
  text: string,
  ctx: SectionContext
): string {
  return composeFrom(ctx, sectionsPresent(text, ctx));
}

// Composed in the order the sections appear IN THE FILE, not in catalogue
// order. Study's Topic index already puts `children` after `path`, and a
// reader may rearrange further; a file is not "hand edited" for having its
// sections somewhere the catalogue would not have put them, and this module
// must never undo an arrangement it did not make.

function stripFrontmatter(text: string): string {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? text : text.slice(end + 5);
}

function composeFrom(ctx: SectionContext, ids: string[]): string {
  const byId = new Map(sectionsFor(ctx).map((s) => [s.id, s]));
  // THROUGH `composeSectionRuns`, NOT SECTION BY SECTION (4.70). This mapped
  // each id to its own block and joined them, which was the same thing while
  // one section meant one fence and became a different note the moment a row
  // welded two of them together: the baseline showed two blocks where the file
  // has one, so `isHandEdited` called every freshly composed subject index
  // edited and the reload gate reported its own row as a loss.
  //
  // The same function `composeTemplate` uses, so the baseline is composed by
  // the code that composes the file rather than by a second implementation that
  // has to be remembered.
  const body = composeSectionRuns(
    ids
      .map((id) => byId.get(id))
      .filter((s): s is JournalSection => s !== undefined),
    ctx,
    (s) => sectionOverrides(ctx, s.id)
  ).join("\n\n");
  // THE TYPE'S OWN NOTE, NOT THE LEVEL'S NOUN. This read
  // `ctx.type.levels[d].noun` — "Topic", "Lesson" — which is the word a level
  // is CALLED and never the name of any note, so every journal note in the
  // vault linked to something that does not exist and Obsidian drew a phantom
  // node for each distinct noun. `ctx.type.name` is the type's folder note
  // (`03 - Journals/Study/Study.md`), which always resolves.
  //
  // ONE LEVEL COARSER THAN THE TRUTH, deliberately and for now: a lesson's real
  // parent is its topic's index NOTE, and this context carries the level a note
  // is at but not the path of the note above it. Naming the type is true —
  // every note in Study is inside Study — where naming "Lesson" was not.
  const parentName = ctx.type.name;
  return body + graphLinksSection([parentName]).trimEnd();
}

// Re-exported so a caller planning a whole type doesn't need journal-sections
// as well. The blocks are the source of truth; this is the one seam that
// turns them back into text.
export { renderBlock, renderSection };
export type { JournalType, SectionOverrides };

// ── changing a journal type's note kinds ──────────────────────────────
//
// Kinds have always been editable on an established journal — `renderKinds` is
// in the single-page edit form. What was missing is everything downstream of
// the save: a kind added got settings, a manifest and a homepage button but no
// TEMPLATE, so the first "New Field Note" failed with "field-notes.md missing
// — run 'Set up / repair vault'"; a kind removed silently declassified every
// note carrying its `type:` value and said nothing.
//
// So this is not "make kinds editable". It is make editing them honest: do the
// downstream work, and confess the part that cannot be done.
//
// THE PART THAT CANNOT BE DONE is retroactivity, and it is not a limitation to
// be apologised for — it is the guarantee. Notes already written keep the
// `type:` they were created with, their text, their trackers and their
// frontmatter. Nothing on disk is rewritten. A kinds change decides what gets
// written from here on, and the confirmation says exactly that in those words.

export type KindChangeKind =
  | "added"
  | "removed"
  | "relabelled"
  | "rated"
  | "paged";

export interface KindChange {
  kind: KindChangeKind;
  id: string;
  label: string;
  detail: string;
}

// Minimal shape, so this stays testable without building a whole JournalType.
export interface KindLike {
  id: string;
  label: string;
  rating?: string;
  pages?: unknown;
}

// What changed between two kind lists, by id.
//
// BY ID, NOT BY POSITION OR LABEL. `normaliseKinds(…, { preserveIds: true })`
// keeps an established type's ids across a rename precisely so that renaming
// "Meeting" to "Catch-up" is not a delete-and-add — the notes on disk carry
// the id, and re-deriving it from the new label would declassify every one of
// them. This function has to read the change the same way or the confirmation
// would offer to destroy something a rename did not touch.
export function diffKinds(before: KindLike[], after: KindLike[]): KindChange[] {
  const out: KindChange[] = [];
  const byId = new Map(before.map((k) => [k.id, k]));
  const afterIds = new Set(after.map((k) => k.id));

  for (const k of after) {
    const was = byId.get(k.id);
    if (!was) {
      out.push({
        kind: "added",
        id: k.id,
        label: k.label,
        detail: `a create button, a ${k.id}.md template, and type: ${k.id} on new notes.`,
      });
      continue;
    }
    if (was.label !== k.label) {
      // Reported but harmless, and worth reporting *because* it is harmless:
      // a reader renaming a kind should be able to see that the window is not
      // about to do anything to their notes.
      out.push({
        kind: "relabelled",
        id: k.id,
        label: k.label,
        detail: `“${was.label}” is now “${k.label}”. Notes keep type: ${k.id} — nothing is rewritten.`,
      });
    }
    if ((was.rating ?? "") !== (k.rating ?? "")) {
      out.push({
        kind: "rated",
        id: k.id,
        label: k.label,
        detail: k.rating
          ? `new notes are scored on ${k.rating}. Notes already written keep what they have.`
          : "new notes are no longer scored. Notes already written keep their score.",
      });
    }
    if (Boolean(was.pages) !== Boolean(k.pages)) {
      out.push({
        kind: "paged",
        id: k.id,
        label: k.label,
        detail: k.pages
          ? "can be split into pages."
          : "can no longer be split into pages. Notes already split keep their pages and go on working.",
      });
    }
  }

  for (const k of before) {
    if (afterIds.has(k.id)) continue;
    out.push({
      kind: "removed",
      id: k.id,
      label: k.label,
      detail: `${k.id}.md stays on disk. Delete it yourself if you want it gone.`,
    });
  }

  return out;
}

// Whether a change needs the hard confirmation.
//
// A relabel does not: nothing on disk moves and nothing stops being
// recognised. Anything that adds or removes a kind does, and a removal makes
// it destructive — which is the difference between the two confirm buttons.
export function kindChangeNeedsConfirming(changes: KindChange[]): boolean {
  return changes.some((c) => c.kind !== "relabelled");
}

export function kindChangeIsDestructive(changes: KindChange[]): boolean {
  return changes.some((c) => c.kind === "removed");
}

// What a removed kind costs the notes that carry it.
//
// Enumerated rather than summarised, because "those notes stop being
// recognised" is the kind of sentence a reader nods at and does not picture.
// Every line here is a real call site: journalTypeOfNote returns undefined for
// an unrecognised `type:`, and these are the six things that reads.
//
// The last one is what a reader notices first and understands least — their
// notes disappear from the index while still sitting in the folder — so it is
// written in those words rather than in the plugin's.
export function declassificationCost(typeName: string, count: number): string[] {
  if (count === 0) return [];
  const these = count === 1 ? "That note" : `Those ${count} notes`;
  return [
    `${these} stop being recognised as ${typeName} notes. They keep their text and stay where they are, but:`,
    "• they lose their breadcrumbs at the top of the note",
    "• they drop out of the review queue",
    "• they stop appearing in their parent's tables — still in the folder, gone from the index",
    "• the tracker picker stops offering this journal's trackers on them",
    `Adding this note type back with the same name restores all of it.`,
  ];
}

// ── the shared interface ──────────────────────────────────────────────
//
// PATCH 2 OF THE 3.0 PLAN. The journal side gains nothing here and loses
// nothing: `plan` and `apply` are already this shape, and were the shape the
// interface was drawn from — they name the change before the write and return
// null for no change. The diary implementations gained them rather than this
// one losing anything.
//
// What IS new is that the editor can now hold one of these without knowing
// which catalogue made it. Nothing below returns the journal type, the note
// kind or the surface, and that is the point: if the editor can ask, the
// interface is wrong.

// `text` IS OPTIONAL AND ITS ABSENCE IS A CALLER WITH NO NOTE (4.47). The
// template editor and `addable` build views to LIST sections; the section window
// builds them over a file. Only the second can say what a question is currently
// answered with.
// What this file already says for each of a section's questions.
//
// `answersInText` PLUS THE ONE ANSWER IT CANNOT REACH (5.6). That function
// reads a directive's argument, which is where four of the five question kinds
// keep their answer. A `lines` question keeps its answer in the note's prose,
// so the catalogue that wrote the prose is the only thing that can find it —
// see `LinesQuestion`, which states why that is a promotion of an existing
// reader rather than a second parser.
//
// SILENCE IS THE REFUSAL, AND IT IS LOAD-BEARING. `skeletonTitles` returns null
// for a note with no markers, and this leaves the key unset rather than setting
// it empty — so `readable()` in the editor draws the question's `settled`
// wording instead of a box. That matters more than the wording: an answer the
// reader could give here is one `applySections` could not write, and a plan
// promising a write that does not happen is the silence `reconfigure` was
// introduced to end.
function answeredIn(
  text: string,
  section: JournalSection,
  ctx: SectionContext
): Record<string, string> {
  const questions = questionsOf(section, ctx);
  const out = answersInText(text, questions);
  // AND THE FORM, WHICH IS READ OFF THE FENCE RATHER THAN OFF AN ARGUMENT
  // (5.11). `answerInText` answers null for a `form` question by construction —
  // the answer is a LINE'S EXISTENCE, not a span inside one — so a question this
  // catalogue derives would have reached the editor unreadable, and the control
  // would have been replaced by its `settled` wording on every section that has
  // one. `answersOn` is the read the other two models already use, and what it
  // wants is the section's anchor, which `locate` is.
  if (questions.some((q) => q.kind === "form")) {
    Object.assign(out, answersOn(section.locate(text, ctx), questions, text));
  }
  // THE KEY IS READ OFF THE QUESTION, not written here. This file knows that a
  // bracketed section's prose answers a `lines` question; it does not need to
  // know that the journal catalogue happens to call the answer "headings".
  const list = questions.find((q) => q.kind === "lines");
  if (!list) return out;
  if (bracketKeyOf(section, ctx, sectionOverrides(ctx, section.id)) === null)
    return out;
  const titles = skeletonTitles(text);
  if (titles) out[list.key] = titles.join("\n");
  return out;
}

const viewOf = (
  section: JournalSection,
  ctx: SectionContext,
  text?: string
): SectionView => ({
  id: section.id,
  label: section.label,
  blurb: section.blurb,
  icon: section.icon,
  removable: sectionRemovable(section, ctx, sectionOverrides(ctx, section.id)),
  // EVERY JOURNAL SECTION MOVES. 3.2 §4 pins navigation on the two diary
  // surfaces and deliberately does not answer the question here: the journal's
  // `nav` is optional rather than locked, so "it must always be first" and "it
  // may not be there at all" have to be reconciled before it can be pinned, and
  // that argument belongs with the patch that moves `nav` into the banner fence
  // rather than with the one that fixes a required row.
  movable: true,
  // THROUGH `questionsOf`, so the derived form toggle reaches the row (5.11). A
  // section that declares nothing can still HAVE a question, which is why this
  // no longer asks whether the catalogue entry has a `questions` field.
  ...(questionsOf(section, ctx).length
    ? { questions: questionsOf(section, ctx) }
    : {}),
  // WHAT THE FILE ALREADY SAYS, PER QUESTION (4.47), and this catalogue was the
  // one that never supplied it.
  //
  // `note-sections.ts` has set `answered` on flat sections since 4.16, and a
  // journal note's model did not — which cost nothing while every question here
  // owned a WHOLE argument, because the editor falls back to reading the file
  // itself. It stops being free the moment a question owns a PIECE: the fallback
  // hands every one of four boxes the entire argument, so a band configured
  // `notes,rating,open` would show that string in all four.
  //
  // THROUGH `answersInText`, WHICH ALSO EXPANDS. A superseded keyword and a
  // shorthand argument both have to be resolved before the pieces are split, and
  // doing that here rather than in the editor is what keeps the window from
  // learning what a stats band is.
  //
  // AND THROUGH `questionsOf` TOO, WHICH THE FIELD ABOVE ALREADY IS. This read
  // `section.questions` — the DECLARED field — for one turn after the toggle
  // became derived, so a section that declares nothing got the question and no
  // answer to it: the box came up unticked over a fence with no bar, and the
  // next save wrote the bar back over the reader's choice. `trackers`, `stats`,
  // `progress` and `tally` are the four that declare nothing; `find`, `review`,
  // `tasks` and `tags` hid it, because a `folder` question was enough to open
  // this branch.
  ...(text !== undefined && questionsOf(section, ctx).length
    ? { answered: answeredIn(text, section, ctx) }
    : {}),
  // ONE BAND. A journal note is a stack of sections with no structural rule
  // through it, so every section may be reordered against every other. A diary
  // entry is the one surface where that is not true.
  group: null,
});

// Why this section cannot be removed from THIS file, or null if it can.
//
// THE SAME TWO QUESTIONS THE DIARY ASKS, IN THE SAME ORDER — is it removable at
// all, and is it holding the reader's writing — assembled here from the answers
// `sectionRemovable` and `planSections` already give rather than computed a
// second way. A second derivation of "may this go" is how the row and the plan
// come to disagree, and the row is what the reader believes.
function journalRefusal(
  section: JournalSection,
  ctx: SectionContext,
  text: string
): string | null {
  if (!sectionRemovable(section, ctx, sectionOverrides(ctx, section.id))) {
    return section.required
      ? "Part of every journal note, so it can't be removed. You can still move it."
      : "Written as ordinary markdown — the plugin cannot tell it from your own prose, so delete it by hand.";
  }
  // A SECTION THAT IS REMOVABLE IN PRINCIPLE AND NOT FROM THIS NOTE (5.6).
  //
  // The row asks about a file, which is what this function is for and what its
  // own header says: `SectionView.removable` answers "ignoring what is written
  // in it", and the case it cannot cover is a skeleton composed before the
  // markers existed. Sentence-cased here for the same 4.21 reason the plan's
  // details are not — a row's subtitle is a sentence and a plan's detail is a
  // predicate.
  const bracketKey = bracketKeyOf(
    section,
    ctx,
    sectionOverrides(ctx, section.id)
  );
  if (bracketKey !== null && !bracketSpanIn(text.split("\n"), bracketKey)) {
    return (
      UNMARKED_PROSE_REFUSAL.charAt(0).toUpperCase() +
      UNMARKED_PROSE_REFUSAL.slice(1) +
      "."
    );
  }
  // Asked of the plan rather than of the file, so the answer is the one that
  // will actually be acted on: `planSections` is what decides, and it reports a
  // refused removal as a `keep` carrying the reason.
  const want = sectionsPresent(text, ctx).filter((id) => id !== section.id);
  const op = planSections(text, ctx, want).find(
    (o) => o.sectionId === section.id
  );
  // THE DETAIL ALONE, SENTENCE-CASED (4.21). This read `${label} ${detail}` and
  // the details are written as predicates — "holds 3 charts", "is required" — so
  // the sentence opened with a label of unknown number, which is the grammar
  // break `entryRemovalRefusal` records at length. The row's own title says
  // which section this is.
  if (op?.kind === "keep") {
    const d = op.detail;
    return `${d.charAt(0).toUpperCase()}${d.slice(1)}.`;
  }
  return null;
}

// ── A JOURNAL SECTION AS THE ROW MACHINERY READS IT (5.11) ───────────────
//
// `flatBlocks` and `regroupFlatNote` are the flat note's, and the diary
// dashboard has borrowed them through an adapter of exactly this shape since
// 4.58 — one function, `asFlat`, and the two lines in the model below. This is
// the third caller, and it is a THIRD CALLER rather than a third copy for the
// reason `rowRuns` is one function: what a `row` line means, where a cell may
// be cut, and what a group is are decided once.
//
// THE TWO THINGS THAT ARE THIS CATALOGUE'S. A journal section renders a LIST of
// blocks where a flat one renders a fence, so the fence is picked out and a
// section that emits none — the prose skeleton, which is bracketed markdown —
// answers with no lines and is in no block. That is the honest answer: it has
// nothing a `cell` line could delimit, so it is never a column, never joined,
// and `blocks` simply does not list it. And `locate` takes a context here,
// which the adapter closes over.
//
// `render` FORWARDS ITS OPTIONS, which is what makes `hasKnownExtent` right:
// that predicate asks whether a section renders ONE line — in either form — and
// a section whose bar is its first line is a one-line widget the moment the
// reader drops it. A cell that cannot be bounded is not offered a split, so
// getting this wrong would take the group controls away from exactly the
// sections this release exists to give them to.
//
// `bar` IS DELIBERATELY LEFT UNANSWERED, and the reasoning is worth keeping
// because the field looks like it wants `widgetFormBar`. `RowMember.bar` is the
// title a cell takes BACK — `undoRowOfOne` and the out-path of a break-up hand
// it to `soloBar`. On this catalogue the only section that can be a cell is one
// already in the widget form, because `isSectionFence` refuses a self-titling
// fence as a column; so every id this field would be read for is one whose bar
// the READER took off. Answering it would put that title back the first time
// they broke the group up, quietly reversing the toggle they had just used.
// Leaving it undefined is what makes the form answer survive a round trip
// through a row, which `test/journal-rows.test.ts` asserts from both ends.
function asFlat(section: JournalSection, ctx: SectionContext): FlatSection {
  return {
    id: section.id,
    label: section.label,
    blurb: section.blurb,
    icon: section.icon,
    locked: Boolean(section.required),
    render: (opts) => {
      const merged = {
        ...sectionOverrides(ctx, section.id),
        ...((opts as SectionOverrides | undefined) ?? {}),
      } as SectionOverrides;
      const block = sectionBlocks(section, ctx, merged).find(
        (b) => b.kind === "fence"
      );
      return block?.kind === "fence"
        ? { fence: block.info, lines: block.lines }
        : { fence: "chronoanvil", lines: [] };
    },
    locate: (text) => section.locate(text, ctx),
  };
}

// This journal surface, as the editor sees it.
export function journalSectionModel(ctx: SectionContext): SectionModel {
  const find = (id: string): JournalSection | undefined =>
    sectionsFor(ctx).find((s) => s.id === id);
  const flats = (): FlatSection[] =>
    sectionsFor(ctx).map((s) => asFlat(s, ctx));
  return {
    sections: (text) => sectionsFor(ctx).map((s) => viewOf(s, ctx, text)),
    present: (text) => sectionsPresent(text, ctx),
    addable: (text) => {
      const present = new Set(sectionsPresent(text, ctx));
      return sectionsFor(ctx)
        .filter((s) => !present.has(s.id))
        .map((s) => viewOf(s, ctx));
    },
    refusal: (id, text) => {
      const s = find(id);
      return s ? journalRefusal(s, ctx, text) : null;
    },
    plan: (text, want) => planSections(text, ctx, want),
    apply: (text, want) => applySections(text, ctx, want),
    // ── THE GROUP THE EDITOR COULD NOT SEE (5.11) ────────────────────
    //
    // A subject index has composed `row / header:🔁 Due and open /
    // review-queue / tasks-table` since 4.70 — one block, two cells, one bar —
    // and this model implemented neither of these, so `SectionEditorModal`
    // drew the list it draws for a surface with no rows: two independent rows,
    // both wearing the "Section" pill, with no card round them and no control
    // that could make or break one. The page said group and the window that
    // edits the page said nothing.
    //
    // BOTH OR NEITHER — `hasRows` reads them together, and it must: `blocks`
    // alone would seed the window's `joined` bits from the file and give it no
    // way to write a change back, so the first Save would flatten the group it
    // had just drawn.
    blocks: (text) => flatBlocks(text, flats()),
    regroup: (text, blocks, pages) =>
      regroupFlatNote(text, flats(), blocks, pages),
  };
}
