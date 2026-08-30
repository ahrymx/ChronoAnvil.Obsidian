// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Converging a dashboard on the layout this release ships.
//
// The problem this exists for: `setupVault` creates missing files and never
// touches an existing one, so every asset change lands only in vaults that
// don't have the note yet — which is no vault that has been used. 2.52 changed
// six shipped assets and, on the developer's own vault, changed nothing: the
// Year page went on rendering a red `Unknown ChronoAnvil widget: year-nav` until
// the file was deleted by hand.
//
// The never-overwrite rule is correct and survives. A dashboard is
// user-editable markdown holding user charts, user prose and user-added
// widgets, and replacing it wholesale destroys all three. The bug was that the
// rule was the *entire* policy.
//
// ── why directives rather than regions ────────────────────────────────
//
// An earlier design fenced a contiguous plugin-owned "spine" in each dashboard
// with marker comments. Two things killed it. Every dashboard is already almost
// nothing but ```chronoanvil fences, so the markers would be a second — deletable,
// movable — encoding of what the fence syntax already says. And a note with no
// markers is *every existing vault*, so the very first run would have to guess
// where the spine ended, on notes whose content it would then overwrite.
//
// Directives are smaller and safer. Everything 2.52 did to an asset was one of
// three operations: insert `entry-rollup`, delete `year-nav`, rewrite the
// `links:` row. None of them is "replace a region", so nothing here does.
//
// The load-bearing rule is the fourth one in `planLayout`: a directive the note
// has, the asset doesn't, and the retired list doesn't name, is the *user's* and
// is never touched. User-added widgets are safe by construction rather than by
// happening to sit outside a marked region.
//
// ── what this must never learn to do ──────────────────────────────────
//
// Reconciling arbitrary user edits against arbitrary asset changes is a general
// diff problem with no good answer, and this is deliberately not that. It knows
// three verbs and one identity (the directive keyword). If a future change
// can't be expressed as insert / delete / rewrite-a-managed-line, the answer is
// to ship it as a one-off migration next to migrateTrends, not to teach this
// module a fourth verb.

import { RETIRED_WIDGETS } from "./constants";
import { MODIFIER_KEYWORDS } from "./directive-grammar";

// Directives whose *arguments* this module may rewrite in place.
//
// The dangerous rule, and deliberately a list of one.
//
// `links:` has to be rewritten wherever it is found: it is structural, the
// plugin owns every pill in it, and leaving it alone is exactly how search.md
// sat on a three-rung ladder for a release after the other seven were widened.
// But `tag-index:03 - Journals` is *configured* — a user who pointed it at a
// folder would have that silently reverted by the same rule, and the note would
// give no hint why.
//
// Nothing in the asset distinguishes the two, so it has to be declared. Adding
// to this list means arguing, here, that the plugin owns that directive's
// arguments more than the user does. Absent that argument, a directive is
// insert-or-leave only.
export const MANAGED_ARGS = new Set<string>(["links"]);

// Tokens *inside* a directive's argument that the plugin owns, where it does
// not own the whole argument.
//
// A NARROWER CLAIM THAN `MANAGED_ARGS`, AND THAT IS THE ENTIRE REASON IT IS A
// SECOND TABLE. `on-this-day[:always][:maxYears]` carries two arguments with
// two owners: `always` is a rendering policy — 4.3.1 added it to the homepage so
// a cell reserved for anniversaries would say what it was waiting for instead of
// sitting blank for a reader's first year — and `maxYears` is a number the
// reader picked. A whole-line rewrite cannot tell them apart, so putting
// `on-this-day` in `MANAGED_ARGS` would revert `on-this-day:always:5` to
// `on-this-day:always` and give no hint why. That is exactly the failure the
// `tag-index` paragraph above declines to accept.
//
// So this adds a token and never removes one, never reorders, and never touches
// any other piece of the argument. Idempotent by construction: a token already
// there is a token nothing is done about.
//
// THE VALUE IS NOT DECLARED HERE, ONLY THE OWNERSHIP. Whether a note should
// carry the flag is read off the SHIPPED composition of that same note — see
// `planFlags` — so a dashboard that ships a bare `on-this-day` does not gain
// one. One list read twice, which is the rule `shippedNotes` itself exists for:
// a second enumeration of what the default is would be a second thing to forget
// to update.
export const MANAGED_FLAGS: Record<string, readonly string[]> = {
  "on-this-day": ["always"],
};

// ── parsing ───────────────────────────────────────────────────────────

// Every fence info-string the plugin writes. `chronoanvil-charts` is the diary's
// chart stack, `chronoanvil-journal-charts` a journal dashboard's — different
// owners (charts.ts and journal-charts.ts), same property: the contents are
// chart specs rather than directives, so neither yields keywords.
export type FenceKind = "chronoanvil" | "chronoanvil-charts" | "chronoanvil-journal-charts";

// A fence whose body is user data rather than directives. Segmented so it can
// anchor a position, never read for keywords — migrateTrends and
// journal-charts.ts each own their own.
const OPAQUE_FENCES: FenceKind[] = ["chronoanvil-charts", "chronoanvil-journal-charts"];

// A note as alternating fences and everything-else, so a reconciler can splice
// whole fences without ever rewriting the prose, frontmatter or user blocks
// between them.
export interface Segment {
  kind: "fence" | "raw";
  // Verbatim, including the ``` lines for a fence. Round-trips exactly.
  lines: string[];
  fenceKind?: FenceKind;
  // Directive keywords inside a fence, in order. Empty for a raw segment and
  // for a chart fence (see below).
  keywords?: string[];
}

// The keyword half of a directive line: everything before the first `:`.
//
// This is the identity the whole module turns on, and it works because it is
// unique per note for every content directive the assets use — `links`,
// `month-summary`, `entry-rollup`, `tasks-table`, `tag-index`, `diary-search`,
// `timeline`, `diary`, `journals`, `on-this-day`. A block therefore needs no
// id, no marker and no position: the keyword is the handle.
//
// `header:` is the apparent exception and isn't one — see assetUnits.
export function keywordOf(line: string): string {
  const t = line.trim();
  const colon = t.indexOf(":");
  return colon === -1 ? t : t.slice(0, colon);
}

const FENCE_OPEN = /^```(chronoanvil|chronoanvil-charts|chronoanvil-journal-charts)\s*$/;
// Any fence opener at all, with the length of its backtick run captured.
//
// WHY THE LENGTH MATTERS, AND THE BUG IT IS THE FIX FOR (4.68.1). A markdown
// fence is closed by a backtick run at least as long as the one that opened it,
// which is exactly how a document SHOWS a fence rather than rendering one:
// `assets/documentation.md` wraps its worked example in a four-backtick fence so
// the three-backtick ```chronoanvil inside it is printed as source.
//
// This function used to ignore the outer fence entirely — it matched only
// `FENCE_OPEN` and pushed everything else to raw — so the example inside it was
// read as a live widget block. `Set up / repair vault` then offered to rewrite
// the DOCUMENTATION: two rows in the window, one of them proposing to insert a
// `header:` line into a prose page's illustration of what a bare directive looks
// like. Nothing was broken in the reader's vault, which is the worst kind of
// repair to be offered.
//
// So a fence that is not ours is now skipped WHOLE rather than walked into. For
// every other input the output is unchanged: a non-chronoanvil block's lines went to
// `raw` one at a time before and go there together now.
const FENCE_RUN = /^(`{3,})(.*)$/;
const FENCE_SHUT = /^(`{3,})\s*$/;

export function segment(lines: string[]): Segment[] {
  const out: Segment[] = [];
  let raw: string[] = [];

  const flushRaw = (): void => {
    if (raw.length) out.push({ kind: "raw", lines: raw });
    raw = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const run = lines[i].match(FENCE_RUN);
    if (!run) {
      raw.push(lines[i]);
      continue;
    }
    const ticks = run[1].length;
    const open = lines[i].match(FENCE_OPEN);
    // Find the closing fence — a run of AT LEAST as many backticks, and nothing
    // after it. An unterminated fence is left as raw text: the note is malformed
    // and guessing where it ends is how a reconciler eats the rest of the file.
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const shut = lines[j].match(FENCE_SHUT);
      if (shut && shut[1].length >= ticks) {
        close = j;
        break;
      }
    }
    if (close === -1) {
      raw.push(lines[i]);
      continue;
    }
    if (!open) {
      // SOMEBODY ELSE'S CODE BLOCK, AND ITS CONTENTS ARE LITERAL. Skipped whole
      // so that a fence drawn INSIDE it — which is what a longer opener is for —
      // is never mistaken for one this plugin owns.
      for (let j = i; j <= close; j++) raw.push(lines[j]);
      i = close;
      continue;
    }

    flushRaw();
    const fenceKind = open[1] as FenceKind;
    const inner = lines.slice(i + 1, close);
    out.push({
      kind: "fence",
      lines: lines.slice(i, close + 1),
      fenceKind,
      // Chart fences hold chart specs, not directives — they are user data,
      // and migrateTrends and journal-charts.ts already own them. Giving them
      // no keywords keeps them out of every rule below except as an anchor.
      keywords: OPAQUE_FENCES.includes(fenceKind)
        ? []
        : inner.map((l) => keywordOf(l)).filter((k) => k.length > 0),
    });
    i = close;
  }
  flushRaw();
  return out;
}

export function serialize(segs: Segment[]): string[] {
  return segs.flatMap((s) => s.lines);
}

// ── the asset side ────────────────────────────────────────────────────

// One thing the shipped layout has: a content directive, plus the fences it
// takes to write it.
export interface AssetUnit {
  keyword: string;
  // The fence(s) to insert verbatim. Two when the asset titles the block from
  // a separate fence, as the Open Tasks sections do.
  fences: Segment[];
  // The canonical line, for the managed-argument rewrite.
  line: string;
  // Whether a note missing this directive can have it INSERTED, or only
  // rewritten and used as an anchor.
  //
  // ONE FENCE CAN CARRY TWO HANDLES AS OF 3.2 PATCH 3. The diary's masthead
  // fuses navigation and the period summary into one card, which is one fence
  // holding two content directives. Both are still handles — `links:` has
  // managed arguments and the summary anchors what follows it — but only the
  // first can be inserted, because `fences` is the whole block and inserting it
  // for the second would write a duplicate `links:` row into the note.
  //
  // THIS IS NOT A FOURTH VERB. Insert, delete and rewrite-a-managed-line are
  // untouched; what changes is that one of them is unavailable for a directive
  // that has no block of its own. A note missing half a masthead is malformed
  // in a way this module cannot express, and 3.2 §6 already assigns that shape
  // to the migration rather than to the reconciler.
  //
  // ── NO SHIPPED NOTE REACHES THIS ANY MORE, AND THAT IS THE POINT ──────
  //
  // The paragraph above is still true of what this module can do, and it stopped
  // being an acceptable answer once the composers welded sections together at
  // scale. `composeFlatNote` puts a `row` in one fence and `composeDiaryDashboard`
  // puts the masthead band in one, so `insertable` was silently false for the
  // homepage's `diary`, `launcher`, `tasks-table` and `on-this-day` and for each
  // period dashboard's summary and scoped button. A section added to any of them
  // reached no vault that already had the note — and, because a non-insertable
  // unit is skipped rather than refused, the plan said nothing at all.
  //
  // Eight shipped notes are now reconciled by `repair-plan.ts` through their
  // `SectionModel`, which knows sections rather than keywords and has no such
  // limit. What is left here is the three entries COPIED from assets, none of
  // which has a fence holding two directives — so this flag is now describing a
  // shape that no caller of this module produces.
  //
  // IT IS NOT DELETED, because the module's own closing rule stands: this is the
  // reconciler for a note that is a file rather than a composition, and an asset
  // gaining a two-directive fence would need this again on the day it did.
  insertable: boolean;
}

// What the shipped asset declares, in order.
//
// `header:` is not a unit. It repeats within a note, so it is not a unique key
// — but it is never independent either: it sits in the same fence as the
// directive it titles (`header:📖 What the days said` + `entry-rollup`) or in
// the fence immediately before it (`header:⏳ Open tasks`, then
// `tasks-table:,period`). So it is an *attribute of the block it titles*, and
// keying the content directive alone is enough. A header-only fence is held
// pending and attached to whatever unit comes next.
//
// The consequence worth stating: a user who renames `header:⏳ Open tasks` to
// something of their own keeps it. Headers are never rewritten, only inserted
// alongside a block that was missing entirely.
//
// ── AND NEITHER IS ANY OTHER MODIFIER (4.70) ─────────────────────────────
//
// `header:` was the only line of its kind when this was written and the filter
// named it directly. There are four more now — `frame:` (4.1 §3), `row` and
// `cell` (4.2/4.4), `wide` (4.12) — and every argument in the paragraph above
// is true of all of them: they repeat within a note, they are never
// independent, and each is an attribute of the block it modifies rather than a
// thing the block IS.
//
// WHAT IT WOULD HAVE DONE. `row` reaching this list makes a UNIT of a line that
// draws nothing: `planLayout` would report "row is missing" against a note that
// has the widgets and not the grouping, and `applyLayout` would splice a bare
// `row` line in as though it were a block. That is a fence gaining a modifier
// nobody asked for, decided by a reconciler that does not know what a row is.
//
// ONE SET, FROM THE GRAMMAR. `MODIFIER_KEYWORDS` is where the dispatcher's own
// "drop this line from the loop" list lives, so this cannot drift from it the
// way a second literal would.
export function assetUnits(assetLines: string[]): AssetUnit[] {
  const out: AssetUnit[] = [];
  let pending: Segment[] = [];

  for (const seg of segment(assetLines)) {
    if (seg.kind !== "fence") continue;
    const keys = seg.keywords ?? [];
    const content = keys.filter((k) => !MODIFIER_KEYWORDS.has(k));
    if (!content.length) {
      // Header-only (or a chart fence, which has no keywords at all). A chart
      // fence must not be held pending — it is not a title for what follows.
      if (seg.fenceKind === "chronoanvil" && keys.length) pending.push(seg);
      else pending = [];
      continue;
    }
    // EVERY content directive is a unit, not just the first. Keying only the
    // first was right while one fence meant one block; on a merged masthead it
    // silently dropped the summary from the plan, so a repair anchored on
    // `links` alone and inserted the next block between the card's two rows —
    // which is precisely the note shape 3.2 §11 says the migration will decline.
    const fences = [...pending, seg];
    content.forEach((keyword, n) => {
      const line =
        seg.lines.find((l) => keywordOf(l) === keyword && l.trim() !== "```") ??
        keyword;
      out.push({
        keyword,
        fences,
        line: line.trim(),
        insertable: n === 0,
      });
    });
    pending = [];
  }
  return out;
}

// ── planning ──────────────────────────────────────────────────────────

export type LayoutOpKind = "insert" | "delete" | "rewrite";

export interface LayoutOp {
  kind: LayoutOpKind;
  keyword: string;
  // Human-readable, for the dry run. This is the whole point of planning
  // separately from applying: "Set up / repair vault" is frightening because
  // you cannot see what it will do.
  detail: string;
}

// What converging this note on this asset would change. Pure, and the input to
// both the preview and the write, so the preview cannot drift from the action.
export function planLayout(
  noteLines: string[],
  assetLines: string[]
): LayoutOp[] {
  const ops: LayoutOp[] = [];
  const segs = segment(noteLines);
  const units = assetUnits(assetLines);

  const noteLineFor = new Map<string, string>();
  for (const seg of segs) {
    // `chronoanvil` FENCES ONLY, WHICH IS WHAT THE WRITE ALREADY MEANT. This walk
    // read every fence and the three passes below it each filter to `chronoanvil`,
    // so a chart spec whose first word happened to be a directive keyword put a
    // line in this map that nothing could act on: an insert would be skipped for
    // a block the note does not have, and a retired keyword would be NAMED by
    // the plan and left by the write — which surfaces as `layout plan/apply
    // disagreed` in the console and no repair.
    if (seg.kind !== "fence" || seg.fenceKind !== "chronoanvil") continue;
    for (const l of seg.lines) {
      const k = keywordOf(l);
      if (!k || k === "header" || l.trim().startsWith("```")) continue;
      if (!noteLineFor.has(k)) noteLineFor.set(k, l.trim());
    }
  }

  for (const u of units) {
    const have = noteLineFor.get(u.keyword);
    if (have == null) {
      // A directive with no block of its own cannot be inserted — see
      // `insertable`. Reported as nothing rather than as a refusal: the note is
      // missing half a card, which is not a state this module can talk about.
      if (!u.insertable) continue;
      ops.push({
        kind: "insert",
        keyword: u.keyword,
        detail: `add ${u.keyword}`,
      });
    } else if (MANAGED_ARGS.has(u.keyword) && have !== u.line) {
      ops.push({
        kind: "rewrite",
        keyword: u.keyword,
        detail: `update ${u.keyword} row`,
      });
    }
  }

  for (const keyword of retiredIn(noteLines, (k) =>
    units.some((u) => u.keyword === k)
  )) {
    ops.push({ kind: "delete", keyword, detail: retiredDetail(keyword) });
  }

  return ops;
}

// ── retired directives, as a pass of their own ────────────────────────

// ONE PREDICATE, TWO READERS — `isReconcilable`'s rule one file over, applied to
// the rule underneath it. `planLayout` named the deletions and `applyLayout` did
// the cutting, from two separate walks over the same segments, and only matching
// edits kept them agreeing; they had already drifted over which fences to read
// (see `noteLineFor`). `repair-plan.ts` is a third reader — a composed note has
// no `AssetUnit`s to walk at all — so one spelling stopped being tidiness.
//
// `keep` IS WHY A RETIRED WORD CAN SURVIVE. A keyword the shipped layout still
// declares is not retired *in this note*, whatever the table says. That is the
// guard the original loop carried inline and it is worth keeping explicit: it is
// what stops a word retired in one release and re-shipped in the next from being
// cut out of a note the moment it arrives.
export function retiredIn(
  noteLines: string[],
  keep: (keyword: string) => boolean
): string[] {
  const out: string[] = [];
  for (const seg of segment(noteLines)) {
    if (seg.kind !== "fence" || seg.fenceKind !== "chronoanvil") continue;
    for (const l of seg.lines) {
      if (l.trim().startsWith("```")) continue;
      const k = keywordOf(l);
      if (!k || k === "header") continue;
      if (!RETIRED_WIDGETS[k] || keep(k)) continue;
      if (!out.includes(k)) out.push(k);
    }
  }
  return out;
}

export function retiredDetail(keyword: string): string {
  return `remove ${keyword} (${RETIRED_WIDGETS[keyword]?.note ?? "retired"})`;
}

// The note with its retired directives cut out, or null when it has none.
//
// Line-level, so a fence holding a retired directive beside a live one keeps the
// live one; a fence left with no directives at all goes, since an empty
// ```chronoanvil fence renders as an empty block.
export function stripRetired(
  noteLines: string[],
  keep: (keyword: string) => boolean
): string[] | null {
  const gone = new Set(retiredIn(noteLines, keep));
  if (!gone.size) return null;
  const segs = segment(noteLines)
    .map((seg) => {
      if (seg.kind !== "fence" || seg.fenceKind !== "chronoanvil") return seg;
      const kept = seg.lines.filter((l) => {
        if (l.trim().startsWith("```")) return true;
        const k = keywordOf(l);
        return !k || !gone.has(k);
      });
      if (kept.length === seg.lines.length) return seg;
      const inner = kept.filter((l) => !l.trim().startsWith("```"));
      if (!inner.length) return null; // fence emptied — drop it
      return {
        ...seg,
        lines: kept,
        keywords: inner.map(keywordOf).filter((k) => k.length > 0),
      };
    })
    .filter((s): s is Segment => s !== null);
  return serialize(segs);
}

// ── managed flags ─────────────────────────────────────────────────────

// One token this note is short of, on the directive that should carry it.
export interface FlagOp {
  keyword: string;
  flag: string;
  detail: string;
}

// Which owned tokens the shipped composition carries and this note does not.
//
// READ OFF THE SHIPPED TEXT rather than declared in `MANAGED_FLAGS`, which is
// where that table's comment says the value lives. So this asks one question per
// entry: does the version a fresh vault gets carry this token, and does the
// reader's copy not?
export function planFlags(noteLines: string[], shippedLines: string[]): FlagOp[] {
  const ops: FlagOp[] = [];
  const mine = argumentsByKeyword(noteLines);
  const theirs = argumentsByKeyword(shippedLines);
  for (const [keyword, flags] of Object.entries(MANAGED_FLAGS)) {
    const here = mine.get(keyword);
    const there = theirs.get(keyword);
    if (here === undefined || there === undefined) continue;
    for (const flag of flags) {
      if (!there.includes(flag) || here.includes(flag)) continue;
      ops.push({
        keyword,
        flag,
        detail: `add ${flag} to ${keyword}`,
      });
    }
  }
  return ops;
}

// The note with each missing owned token appended to its directive's argument.
//
// APPENDED, NEVER SPLICED IN AT A POSITION. Every reader of these arguments
// splits on `:` and asks whether a token is in the list — `buildOnThisDayRegion`
// is the one that exists — so order carries no meaning and choosing one would be
// inventing a rule the parsers do not have.
export function applyFlags(
  noteLines: string[],
  shippedLines: string[]
): string[] | null {
  const ops = planFlags(noteLines, shippedLines);
  if (!ops.length) return null;
  const wanted = new Map<string, string[]>();
  for (const op of ops) {
    wanted.set(op.keyword, [...(wanted.get(op.keyword) ?? []), op.flag]);
  }
  const segs = segment(noteLines).map((seg) => {
    if (seg.kind !== "fence" || seg.fenceKind !== "chronoanvil") return seg;
    return {
      ...seg,
      lines: seg.lines.map((l) => {
        if (l.trim().startsWith("```")) return l;
        const add = wanted.get(keywordOf(l));
        if (!add) return l;
        // A TRAILING SEPARATOR IS NOT AN EMPTY ARGUMENT — `joinParts`' rule in
        // `section-model.ts`, and the same one line down: `on-this-day:` is a
        // directive that reads as though something went missing, and appending
        // to it would spell `on-this-day::always`.
        const trimmed = l.trimEnd().replace(/:+$/, "");
        const missing = add.filter((f) => !argTokens(trimmed).includes(f));
        if (!missing.length) return l;
        return `${trimmed}:${missing.join(":")}`;
      }),
    };
  });
  const out = serialize(segs);
  return out.join("\n") === noteLines.join("\n") ? null : out;
}

// A directive's argument, as the tokens every reader of one splits it into.
function argTokens(line: string): string[] {
  const colon = line.indexOf(":");
  if (colon === -1) return [];
  return line
    .slice(colon + 1)
    .split(":")
    .map((a) => a.trim())
    .filter(Boolean);
}

// The FIRST occurrence of each keyword's argument tokens, on `noteLineFor`'s
// rule and for its reason: a keyword is a note-wide handle, so a second one is
// not a second answer.
function argumentsByKeyword(lines: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const seg of segment(lines)) {
    if (seg.kind !== "fence" || seg.fenceKind !== "chronoanvil") continue;
    for (const l of seg.lines) {
      if (l.trim().startsWith("```")) continue;
      const k = keywordOf(l);
      if (!k || k === "header" || out.has(k)) continue;
      out.set(k, argTokens(l.trim()));
    }
  }
  return out;
}

// ── applying ──────────────────────────────────────────────────────────

// Converge the note. Returns null when nothing would change.
//
// Null-means-no-change is `mergeTrendsSection`'s convention and it is what
// makes idempotence structural rather than a claim in a comment: running this
// twice cannot write twice, because the second call has nothing to report.
export function applyLayout(
  noteLines: string[],
  assetLines: string[]
): string[] | null {
  if (planLayout(noteLines, assetLines).length === 0) return null;

  const units = assetUnits(assetLines);

  // 1. Retired directives, through the same function that NAMED them. Two walks
  //    over the same segments is how the plan and the write came to disagree
  //    about which fences to read — see `retiredIn`.
  const keep = (k: string): boolean => units.some((u) => u.keyword === k);
  const segs = segment(stripRetired(noteLines, keep) ?? noteLines);

  // 2. Managed-argument rewrites, in place.
  for (const u of units) {
    if (!MANAGED_ARGS.has(u.keyword)) continue;
    for (const seg of segs) {
      if (seg.kind !== "fence" || seg.fenceKind !== "chronoanvil") continue;
      const idx = seg.lines.findIndex(
        (l) => !l.trim().startsWith("```") && keywordOf(l) === u.keyword
      );
      if (idx === -1) continue;
      seg.lines = [...seg.lines];
      seg.lines[idx] = u.line;
    }
  }

  // 3. Inserts, positioned by the asset's own order.
  //
  //    Anchored on the *previous* asset unit that the note actually has,
  //    rather than on an absolute index: a user who added blocks, reordered
  //    sections or deleted one still gets the new block in a sensible place,
  //    and a note that matches the asset exactly gets it in the asset's place.
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (hasKeyword(segs, u.keyword)) continue;
    // Skipped for the same reason planLayout skipped it, and skipped HERE too
    // rather than relying on the plan: `applyLayout` re-derives its work from
    // the units, so a rule enforced in only one of the two would let the write
    // do something the preview never named.
    if (!u.insertable) continue;

    let at = -1;
    for (let j = i - 1; j >= 0; j--) {
      const idx = lastIndexOfKeyword(segs, units[j].keyword);
      if (idx !== -1) {
        at = idx + 1;
        break;
      }
    }
    if (at === -1) {
      // No predecessor present: sit in front of the earliest successor that is,
      // and failing that at the end. Appending is the honest fallback — the
      // note shares no structure with the asset, so any claimed position would
      // be a guess.
      for (let j = i + 1; j < units.length; j++) {
        const idx = firstIndexOfKeyword(segs, units[j].keyword);
        if (idx !== -1) {
          at = idx;
          break;
        }
      }
    }
    if (at === -1) at = segs.length;

    const fences = u.fences.map((f) => ({ ...f, lines: [...f.lines] }));
    // A blank line before each inserted fence, so the note stays readable as
    // markdown rather than becoming a wall of adjacent code fences.
    const spaced: Segment[] = [];
    for (const f of fences) {
      spaced.push({ kind: "raw", lines: [""] }, f);
    }
    segs.splice(at, 0, ...spaced);
  }

  const out = serialize(segs);
  return out.join("\n") === noteLines.join("\n") ? null : out;
}

function hasKeyword(segs: Segment[], keyword: string): boolean {
  return firstIndexOfKeyword(segs, keyword) !== -1;
}

function firstIndexOfKeyword(segs: Segment[], keyword: string): number {
  return segs.findIndex(
    (s) => s.kind === "fence" && (s.keywords ?? []).includes(keyword)
  );
}

function lastIndexOfKeyword(segs: Segment[], keyword: string): number {
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (s.kind === "fence" && (s.keywords ?? []).includes(keyword)) return i;
  }
  return -1;
}
