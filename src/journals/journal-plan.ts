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
// `<!--almanac:key-->` region holds the reader's own writing — recall cards,
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
  JournalSection,
  SectionContext,
  SectionOverrides,
  SectionPart,
  renderBlock,
  renderSection,
  sectionOverrides,
  sectionRemovable,
  sectionsFor,
} from "./journal-sections";
import { Segment, keywordOf, segment } from "../core/layout";
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
  sectionId: string | null;
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

export interface TemplatePlan {
  // templateTargets() key: "index:0", "kind:lesson", "page".
  key: string;
  file: string;
  label: string;
  exists: boolean;
  // Disk differs from what the catalogue would compose with the sections the
  // file already has. Not an error — it is the normal state of an edited
  // template — but it is the fact a reader most needs before pressing Save.
  handEdited: boolean;
  ops: SectionOp[];
}

// ── parsing ───────────────────────────────────────────────────────────

// The directive keywords a rendered fence carries, ignoring `header:`.
//
// Uses layout.ts's keywordOf on both sides of the comparison rather than a
// second extractor of its own, because the two only have to disagree once —
// on `# almanac:trackers:start`, say, whose keyword is the odd but perfectly
// consistent `# almanac` — for a section to stop being findable in the file
// that just wrote it.
//
// Headers are excluded because they are retitleable: layout.ts settled that
// for dashboards ("a user who renames `header:⏳ Open tasks` keeps it") and the
// same holds here. What identifies a fence is the widgets in it.
function fenceKeywords(lines: string[]): string[] {
  return lines.map(keywordOf).filter((k) => k.length > 0 && k !== "header");
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
const OPAQUE_FENCE_KINDS = new Set(["almanac-charts", "almanac-journal-charts"]);

// Which region keys a segment holds, and how many non-blank lines each has.
//
// A region is `<!--almanac:key` … `-->`. notestore.ts locates one by a
// whole-file indexOf, so it need not be adjacent to anything; here it only has
// to be findable, which is weaker.
function regionsIn(lines: string[]): Map<string, number> {
  const out = new Map<string, number>();
  let key: string | null = null;
  let count = 0;
  for (const line of lines) {
    if (key === null) {
      const m = line.match(/^<!--almanac:([A-Za-z0-9_-]+)\s*$/);
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
// Signature matching cannot see it: its output is ordinary `## ` markdown,
// which is the whole reason it is unremovable. But leaving it unattributed
// would have every Lesson template report its own prose skeleton as blocks
// that aren't the catalogue's, and would make isHandEdited true for a file
// the plugin had just written.
//
// So fall back to the section's own `locate` probe, which is exactly what that
// callback is for. Over-matching is harmless here in a way it would not be
// anywhere else in this module: a markdown-only section is never removable, so
// attributing a reader's own `## Notes` to it changes nothing that happens to
// the file — it only stops the plan claiming the block is unaccounted for.
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
    if (!blocks.some((b) => b.kind === "markdown")) continue;
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
  const kind = seg.fenceKind ?? "almanac";
  if (OPAQUE_FENCE_KINDS.has(kind)) {
    return sigs.find((c) => c.fenceKind === kind)?.section ?? null;
  }
  const kw = (seg.keywords ?? []).filter((k) => k !== "header");
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

const isBlank = (lines: string[]): boolean =>
  lines.every((l) => l.trim() === "");

// A file as the sections it contains, in file order, plus the runs that belong
// to nobody.
//
// The inverse of composeTemplate, and deliberately conservative: a section is
// present iff its own fence is present. Its regions are attributed to it when
// they follow; a region the reader moved elsewhere keeps its content either
// way, because nothing in this module deletes one.
export function parseSections(text: string, ctx: SectionContext): SectionRun[] {
  const segs = segment(text.split("\n"));
  const { fences, regionOwners } = signaturesFor(ctx);

  const runs: SectionRun[] = [];
  let i = 0;
  while (i < segs.length) {
    const seg = segs[i];
    const owner =
      ownerOf(seg, fences) ?? markdownOwnerOf(seg, ctx, sectionsFor(ctx));

    if (!owner) {
      runs.push({
        sectionId: null,
        from: i,
        to: i,
        // Blank separators and the frontmatter block. Neither is a block the
        // plan could ever touch, and counting them as the reader's own content
        // would have every untouched template report "two blocks here aren't
        // the catalogue's" — true, useless, and alarming.
        //
        // The frontmatter run also carries the banner's `almanac:spacer`,
        // which sits on line 0 of the body with no blank line above it and is
        // therefore in the same raw segment. That is fine: banner is
        // `required` and never removable, so nothing ever needs to splice it.
        filler:
          isBlank(seg.lines) || (i === 0 && seg.lines[0]?.trim() === "---"),
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
    runs.push({ sectionId: owner.id, from: i, to: end, filler: false });
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
    if (run.sectionId && !out.includes(run.sectionId)) out.push(run.sectionId);
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

export function planSections(
  text: string,
  ctx: SectionContext,
  requested: readonly SectionWant[]
): SectionOp[] {
  const want = idsOf(requested);
  const runs = parseSections(text, ctx);
  const present = new Set(
    runs.map((r) => r.sectionId).filter((id): id is string => id !== null)
  );
  const sections = sectionsFor(ctx);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const segs = segment(text.split("\n"));
  const rewriting = new Set(reconfigured([...present], requested));
  const ops: SectionOp[] = [];

  // Removals, keeps and reconfigures, in file order, so the plan reads down the
  // file.
  for (const run of runs) {
    if (run.sectionId === null) continue;
    const section = byId.get(run.sectionId);
    if (!section) continue;
    if (want.includes(run.sectionId)) {
      const runLines: string[] = [];
      for (let i = run.from; i <= run.to; i++) runLines.push(...segs[i].lines);
      const gaps = missingParts(runLines, section, ctx);
      // A reconfigure and an extension are both real writes, and a section can
      // want both at once. `reconfigure` wins the label because it is the one
      // that rewrites a line the reader may have edited; the extension is
      // reported in the same detail rather than swallowed.
      const kindOfOp = rewriting.has(section.id)
        ? "reconfigure"
        : gaps.length
          ? "extend"
          : "keep";
      const gapDetail =
        gaps.length === 1
          ? `${gaps[0].label} has no table here — it will be added`
          : `${gaps.map((g) => g.label).join(", ")} have no table here — they will be added`;
      ops.push({
        kind: kindOfOp,
        sectionId: section.id,
        label: section.label,
        detail: rewriting.has(section.id)
          ? describeAnswers(
              section.questions?.(ctx) ?? [],
              optionsFor(requested, section.id),
              journalHostLabel(ctx)
            ) + (gaps.length ? `; ${gapDetail}` : "")
          : gaps.length
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
    .map((r) => r.sectionId)
    .filter((id): id is string => id !== null && want.includes(id));
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
  const foreign = runs.filter((r) => r.sectionId === null && !r.filler).length;
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

  const segs = segment(text.split("\n"));
  const runs = parseSections(text, ctx);
  const byId = new Map(sectionsFor(ctx).map((s) => [s.id, s]));

  interface Chunk {
    id: string | null;
    filler: boolean;
    lines: string[];
  }

  const chunks: Chunk[] = [];
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    const lines: string[] = [];
    for (let i = run.from; i <= run.to; i++) lines.push(...segs[i].lines);

    if (!run.sectionId || !removing.has(run.sectionId)) {
      // Answers spliced into their own span, on a section the plan named as a
      // reconfigure and on no other. Everything else here is the reader's file,
      // copied out verbatim — which is what `applySections` has done since it
      // was written and what patch 5 was most likely to cost.
      const rewritten =
        run.sectionId && rewriting.has(run.sectionId)
          ? withAnswers(
              lines,
              byId.get(run.sectionId)?.questions?.(ctx) ?? [],
              optionsFor(requested, run.sectionId)
            )
          : lines;
      const section = run.sectionId ? byId.get(run.sectionId) : null;
      const extended =
        section && extending.has(section.id)
          ? withMissingParts(rewritten, section, ctx)
          : rewritten;
      chunks.push({ id: run.sectionId, filler: run.filler, lines: extended });
      continue;
    }

    // Removing: the fence goes, a region with the reader's writing in it
    // stays exactly as it was. See the note at the top of this file — the
    // failure mode of deleting it is unrecoverable and the workaround for
    // keeping it is one keystroke.
    const survivors = keepNonEmptyRegions(segs, run);
    if (survivors.length) {
      chunks.push({ id: null, filler: false, lines: survivors });
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
  const order = sectionsFor(ctx).map((s) => s.id);
  for (const id of adding) {
    const section = byId.get(id);
    if (!section) continue;
    // THE READER'S CHOICE OVER THE PRESET'S, and in that order. A layout's
    // `SectionOverrides` is what the journal TYPE declares about this section
    // (Study's three resource shelves, its own bridge tracker); a
    // `SectionChoice` is what this reader asked for on this note. The preset is
    // a default and the choice is an answer, so the answer wins — and a choice
    // that says nothing leaves the preset exactly as it was.
    const markdown = renderSection(section, ctx, {
      ...sectionOverrides(ctx, id),
      ...(optionsFor(requested, id) ?? {}),
    });
    const at = insertionPoint(chunks, order, id);
    chunks.splice(at, 0, { id, filler: false, lines: ["", ...markdown.split("\n")] });
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
      if (chunks[i].id !== null) slots.push(i);
    }
    // The order the reader asked for, restricted to what is actually present,
    // then anything present that `want` does not mention appended in the order
    // it already had. The second half matters: a section the reader never
    // touched must not be dropped because it was not in the list.
    const occupants = slots.map((i) => chunks[i].id as string);
    const desired = [
      ...want.filter((id) => occupants.includes(id)),
      ...occupants.filter((id) => !want.includes(id)),
    ];
    const byIdChunk = new Map(slots.map((i) => [chunks[i].id as string, chunks[i]]));
    slots.forEach((slot, n) => {
      const wanted = byIdChunk.get(desired[n]);
      if (wanted) chunks[slot] = wanted;
    });
  }

  const next = chunks.flatMap((c) => c.lines).join("\n");
  return next === text ? null : next;
}

// The lines of a removed section's run that must survive: its non-empty
// regions, verbatim. Its fence goes.
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
  chunks: { id: string | null }[],
  order: string[],
  id: string
): number {
  const rank = order.indexOf(id);
  let after = -1;
  for (let i = 0; i < chunks.length; i++) {
    const k = chunks[i].id;
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
  return ids.map((id) => {
      const s = byId.get(id);
      return s ? renderSection(s, ctx, sectionOverrides(ctx, id)) : "";
    })
    .filter(Boolean)
    .join("\n\n");
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
  ...(section.questions ? { questions: section.questions(ctx) } : {}),
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
  ...(text !== undefined && section.questions
    ? { answered: answersInText(text, section.questions(ctx)) }
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

// This journal surface, as the editor sees it.
export function journalSectionModel(ctx: SectionContext): SectionModel {
  const find = (id: string): JournalSection | undefined =>
    sectionsFor(ctx).find((s) => s.id === id);
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
  };
}
