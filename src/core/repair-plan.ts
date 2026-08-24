// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Converging a note this plugin COMPOSES on the arrangement this release ships.
//
// WHY THIS EXISTS ALONGSIDE `layout.ts`
//
// `layout.ts` is the 2.53 reconciler and it knows three verbs over one identity,
// the directive keyword. That was the right size while every shipped note was a
// file in `assets/` and every block in one was a fence of its own. Neither is
// true any more: eight shipped notes are COMPOSED from a catalogue, and two of
// the catalogues weld several sections into one fence — `composeFlatNote` for a
// `row`, `composeDiaryDashboard` for the masthead band.
//
// That broke the keyword reconciler in a way it cannot report. `AssetUnit
// .insertable` is `n === 0`: only the FIRST content directive in a fence can be
// inserted, because `fences` is the whole block and inserting it for the second
// would write a duplicate of the first. Everything after it is skipped —
// silently, because "a note missing half a card is not a state this module can
// talk about". On today's homepage that is `diary`, `launcher`, `tasks-table`
// and `on-this-day`: the entire top row. On each period dashboard it is the
// summary and the scoped period button. So a section added to any of those
// reached no vault that already had the note, and repair said nothing at all.
//
// The fix is not a fourth verb. `SectionModel` already reconciles these notes —
// it is what the section editor drives, it knows section identity, rows, cells,
// locks, pins and refusals, and it has a plan/apply pair with the same property
// `previewRepair` states. Repair simply was not using it.
//
// WHAT THIS IS, THEREFORE: the composition of three passes over one note, in the
// order they have to run. Two of them are `layout.ts`'s and are unchanged; the
// third is the section model doing the inserting.
//
// THE RULE IT OBEYS, which is `layout.ts`'s rule and does not move:
//
//   Additive and retired only. A section the release ships and the note lacks is
//   added; a directive named in `RETIRED_WIDGETS` is removed; a token the plugin
//   owns is added to an argument it otherwise leaves alone. Everything else in
//   the file is the reader's and is never touched.
//
// WHAT IT MUST NEVER LEARN TO DO
//
// Removing a section, moving one, or rewriting a header. The model can express
// all three and the ownership rule forbids all three, so the assertion in
// `repairNote` is not defensive coding — it is the rule, enforced at the one
// place a mistake in building `want` could get past it.
//
// AND IT DOES NOT PUT A RE-ADDED SECTION BACK INTO ITS ROW. `FlatSection.row`
// settles that: `renderFlatSection` composes one section and knows nothing about
// its neighbours, so a section added back arrives in a block of its own, which
// the reader can move into the row by hand. Guessing that it wanted to rejoin a
// row would mean writing into a block they may have arranged since — which is
// the reader's, which is the whole rule. The gain here is that it arrives AT
// ALL, and at its catalogue position; where it sits inside the page is theirs.

import {
  CELL_KEYWORD,
  HEADER_KEYWORD,
  MODIFIER_KEYWORDS,
  ROW_KEYWORD,
} from "./directive-grammar";
import { SectionModel, SectionOp, SectionWant } from "./section-model";
import type { LineDiff } from "./line-diff";
import {
  applyFlags,
  keywordOf,
  planFlags,
  retiredDetail,
  retiredIn,
  segment,
  stripRetired,
} from "./layout";
import type { Segment } from "./layout";

// One change repair would make, in the shape both plan sources already answer in
// and the dialog already reads.
//
// A COMMON SHAPE RATHER THAN A UNION, because `confirmPlan` and the console
// report want one line per op and nothing else. `LayoutOp`, `SectionOp` and
// `FlagOp` all carry a `detail` written for a reader; that is the whole of what
// crosses this seam.
export interface RepairOp {
  kind: string;
  detail: string;
}

// ── what a repair is made of, as the window needs it ──────────────────

// The four kinds of work `setupVault` does, separated because they carry
// different risk and a reader may reasonably want one and not another.
//
// WHY FOUR AND NOT ONE. Repair was a single button over four unlike things: it
// created missing files, converged existing pages on this release, caught up
// journal index notes, and ran two format migrations. Only the first is
// risk-free, and a reader who wanted only that had no way to ask for it — the
// choice was the whole command or nothing.
//
// AND WHY NOT THREE, which is the obvious grouping ("create / update / fix").
// `journals` and `migrations` are different surfaces and different questions:
// one adds a table for a note type to an INDEX note, the other rewrites the
// shape of a fence written by an older release. Behind one tick they would be
// two unlike things a reader cannot separate, which is the state this is
// getting out of rather than a smaller version of it.
export type RepairGroupId =
  | "create"
  | "pages"
  | "journals"
  | "migrations"
  | "templates"
  // ONE ENTRY, REWRITTEN FROM A TEMPLATE (4.29). Not `templates`, which is the
  // set of template FILES a refresh regenerates — this is the opposite
  // direction, a template written over one note the reader is looking at. The
  // window is borrowed because a diff and a confirmation are exactly what a
  // whole-body replace owes, and reusing it costs one union member where a
  // second confirmation dialog would cost a second idea of what a preview is.
  | "entry"
  // THE WHOLE VAULT, COPIED OUT (4.31). Added on exactly the argument the line
  // above was: a preview and a confirmation are what a write of hundreds of
  // files owes, and reusing this window costs one union member where a second
  // confirmation dialog would cost a second idea of what a preview is.
  //
  // It is also the only group whose items are all in ONE folder, which is the
  // property that makes the write recoverable — see `isUnderExportRoot`.
  | "export";

// One file a repair would touch.
export interface RepairFileChange {
  // The vault path, which is the identity — two subjects have identically named
  // index notes, so a basename cannot be it.
  path: string;
  // What to call it in the window. A basename for a shipped page, a path where
  // the basename would be ambiguous.
  label: string;
  // The reader-facing description of each change, as the planner named it.
  ops: RepairOp[];
  // The literal lines, for the reader who wants to see rather than be told.
  // Absent for a file being CREATED — there is nothing to compare it against,
  // and "every line is an addition" is not a differential.
  diff?: LineDiff;
}

export interface RepairGroup {
  id: RepairGroupId;
  title: string;
  blurb: string;
  glyph: string;
  // "note" / "file" — the window pluralises it.
  noun: string;
  items: RepairFileChange[];
}

export interface RepairSurvey {
  groups: RepairGroup[];
}

// Which groups have anything to do. The window's own emptiness test, and the
// one `setupVault` uses to decide whether to open anything at all.
export function pendingGroups(survey: RepairSurvey): RepairGroup[] {
  return survey.groups.filter((g) => g.items.length > 0);
}

// Whether a repair would write into a note that already exists.
//
// THE DISTINCTION THAT USED TO DECIDE WHETHER A DIALOG OPENED, kept as a
// function because it is still the one that decides how the window READS: a
// repair that only creates files is telling the reader what it is about to add,
// and one that rewrites notes is asking.
export function writesIntoExisting(survey: RepairSurvey): boolean {
  return survey.groups.some((g) => g.id !== "create" && g.items.length > 0);
}

// The op kinds a repair may produce. Everything else the model can emit is
// either not a change (`keep`), not ours (`foreign`), or forbidden.
const ADDITIVE = new Set<SectionOp["kind"]>(["add", "extend", "reconfigure"]);
const FORBIDDEN = new Set<SectionOp["kind"]>(["remove", "move", "regroup"]);

// What converging this note on this composition would change, and the text it
// would leave behind.
//
// ONE FUNCTION FOR BOTH, which is `previewRepair`'s property made structural
// rather than restated: the preview cannot drift from the action because the
// same call produces both, and the caller chooses which half to use. The old
// pair — `planLayout` for the dry run, `applyLayout` for the write — could and
// did disagree, and the only sign of it was a console line saying so.
//
// `next` IS NULL WHEN NOTHING WOULD CHANGE, which is `applyLayout`'s and
// `applySections`' convention and is what makes idempotence structural: a second
// call has nothing left to return.
export function repairNote(
  model: SectionModel,
  text: string,
  shipped: string
): { ops: RepairOp[]; next: string | null } {
  const ops: RepairOp[] = [];

  // 1. RETIRED DIRECTIVES FIRST, so the passes below read a note with no dead
  //    words in it. A retired keyword is not a catalogue section, so the model
  //    would report its block as `foreign` and leave it — correct, and the
  //    reason this pass stays at the keyword level: the section model has no way
  //    to name a directive the catalogue never declared.
  //
  //    `keep` IS THE SHIPPED COMPOSITION'S OWN WORD LIST. A keyword this release
  //    still writes into the note is not retired here, whatever the table says.
  const shippedWords = new Set(directiveWords(shipped));
  const keep = (k: string): boolean => shippedWords.has(k);
  for (const keyword of retiredIn(text.split("\n"), keep)) {
    ops.push({ kind: "delete", detail: retiredDetail(keyword) });
  }
  const stripped = stripRetired(text.split("\n"), keep)?.join("\n") ?? text;

  // 2. OWNED TOKENS. See `MANAGED_FLAGS` for why this is a token and not the
  //    whole argument.
  for (const op of planFlags(stripped.split("\n"), shipped.split("\n"))) {
    ops.push({ kind: "flag", detail: op.detail });
  }
  const flagged =
    applyFlags(stripped.split("\n"), shipped.split("\n"))?.join("\n") ??
    stripped;

  // 3. THE SECTIONS THIS RELEASE SHIPS AND THIS NOTE LACKS.
  //
  //    `defaults` IS READ OFF THE SHIPPED TEXT rather than off the catalogue,
  //    and that is deliberate: the composed markdown a fresh vault gets is the
  //    only statement of what "ships" means, and `optIn` sections are excluded
  //    from it by the composer itself. A second enumeration here — the catalogue
  //    filtered by `!optIn` — would be exactly the second list `shippedNotes`
  //    exists to prevent, and it would go stale in the direction nobody notices:
  //    silently restoring a section 3.13 §11 took off the page.
  const present = model.present(flagged);
  const defaults = model.present(shipped);
  const want = wantWith(model, flagged, present, defaults);

  for (const op of model.plan(flagged, want)) {
    if (FORBIDDEN.has(op.kind)) {
      // NOT FILTERED, THROWN. A forbidden op reaching here means `want` was
      // built wrong, and dropping it silently would leave the write to do
      // something the plan never named — which is the one failure this whole
      // module is arranged to make impossible.
      throw new Error(
        `[Almanac] repair produced a ${op.kind} op for ${op.sectionId ?? "?"}; ` +
          "a repair is additive and this is a bug in how its want was built"
      );
    }
    if (ADDITIVE.has(op.kind)) ops.push({ kind: op.kind, detail: op.detail });
  }

  const next = model.apply(flagged, want) ?? flagged;
  return { ops, next: next === text ? null : next };
}

// The note's want: everything it already has, in the order it has it, plus every
// shipped section it lacks, at the position the catalogue gives it.
//
// FILE ORDER FOR WHAT IS THERE is what makes this additive rather than a
// reformat: `moveOps` diffs the wanted order against the file's, so a want that
// listed present sections in catalogue order would ask a reader's rearranged
// page to be put back the way it shipped.
//
// CATALOGUE POSITION FOR WHAT IS NOT is what keeps the result readable, and on a
// banded surface it is what keeps it legal — a masthead section appended to the
// end of the want is a masthead section asked to live below the page. Both
// writers place an add by catalogue order anyway; this makes the PLAN say the
// same thing, so the two cannot disagree about where it landed.
function wantWith(
  model: SectionModel,
  text: string,
  present: readonly string[],
  defaults: readonly string[]
): SectionWant[] {
  const missing = defaults.filter((id) => !present.includes(id));
  if (!missing.length) return [...present];

  const rank = new Map<string, number>();
  model.sections(text).forEach((s, i) => rank.set(s.id, i));
  const rankOf = (id: string): number => rank.get(id) ?? Number.MAX_SAFE_INTEGER;

  const out = [...present];
  for (const id of missing) {
    // After the last present section the catalogue puts before this one; failing
    // that, before the first it puts after; failing both, at the end. The three
    // fallbacks `applyLayout` already anchors on, said in catalogue rank rather
    // than in keyword adjacency.
    let at = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (rankOf(out[i]) < rankOf(id)) {
        at = i + 1;
        break;
      }
    }
    if (at === -1) at = out.findIndex((o) => rankOf(o) > rankOf(id));
    if (at === -1) at = out.length;
    out.splice(at, 0, id);
  }
  return out;
}

// Every directive keyword the shipped composition writes.
//
// A SET OF WORDS RATHER THAN `assetUnits`, because the question here is only
// "does this release still write this word" — the positions, fences and
// insertability `assetUnits` computes are what the section model has replaced.
//
// THROUGH `segment`, so a chart fence contributes nothing: its body is chart
// specs, and reading one as a directive is the mistake `noteLineFor` had made
// for as long as it read every fence.
function directiveWords(shipped: string): string[] {
  const out: string[] = [];
  for (const seg of segment(shipped.split("\n"))) {
    if (seg.kind !== "fence" || seg.fenceKind !== "almanac") continue;
    for (const line of seg.lines) {
      if (line.trim().startsWith("```")) continue;
      const word = keywordOf(line);
      if (word) out.push(word);
    }
  }
  return out;
}

// ── OFFERING A SHIPPED PAGE THE GROUPING THIS RELEASE COMPOSES (4.70) ────
//
// Reconciliation is ADDITIVE and stays that way. A section that stops being
// `optIn` is spliced in at its catalogue position and nothing already on the
// page moves — which is the right default, and the reason a reader can run
// repair without reading the diff first. But 4.70 did not only add sections: it
// GROUPED them, and a group is not something an additive reconciler can reach.
// A 4.69 diary dashboard has `tasks-table` and `tag-index` in two fences with
// two other blocks between them; this release writes them as the two cells of
// one. Repair converges every WORD on that page and still leaves it stacked,
// forever.
//
// SO THE REGROUP IS A MIGRATION, AND IT IS OFFERED RATHER THAN APPLIED. Pure
// text in, text or null out, on `collapseJournalsBlocks`'s pattern — which is
// what lets the repair window's dry run BE the migration with the write taken
// off, so the diff a reader ticks is the diff they get. It is the only thing in
// this release that MOVES a reader's blocks relative to each other, which is
// exactly why it is a tick and not a default. Nothing regroups a page unasked.
//
// ── ONE ROW AT A TIME, NOT THE WHOLE PAGE ──
//
// The first draft compared the reader's whole page against the composed one and
// rebuilt it from the composition's skeleton when the two held the same widgets
// in the same order. Simpler, and useless: 4.70 also ADDS sections, so a 4.69
// page never holds the same list, and the function returned `null` for every
// real page in the vault it was written for. A guard that can only pass on a
// page needing nothing is not a guard.
//
// What it does instead is local, one row at a time. For each ROW the
// composition writes, find the fence on the reader's page that holds each of
// its cells; weld those fences into the one the composition writes, at the
// position of the topmost of them. Everything else is untouched, in place, in
// order: a section they added, a section they removed, a section this release
// adds later, prose, headings, their charts. A row whose cells are not all on
// the page is not welded at all — the diary dashboard's `on-this-day` row waits
// for `sleep-summary` to arrive rather than being half-built.
//
// ── THE THREE THINGS THAT MAKE IT DECLINE ──
//
//   1. A CELL THIS PAGE DOES NOT HAVE. Nothing to group; the row is skipped and
//      the rest of the page's rows are still considered.
//
//   2. A CELL WRITTEN TWICE. If `tasks-table` appears in two fences there is no
//      answer to which one is the cell, and picking one would silently orphan
//      the other. Refuse the row.
//
//   3. A FENCE HOLDING MORE THAN THE ROW ASKS FOR, or holding a modifier a cell
//      has no place for. A fence carrying `tab:`, `height:`, `frame:` or `wide`
//      is a gesture the reader made in the section editor — putting a block on a
//      page, giving it a height — and there is no honest way to carry it into a
//      shape with no room for it. A fence holding a widget the row says nothing
//      about would have that widget dragged along by the weld. Both refuse.
//
// ── WHAT IS CARRIED, AND WHAT COMES FROM THE COMPOSITION ──
//
// The WIDGET LINES are the reader's, verbatim, arguments and all: `diary:3`
// stays `diary:3` and `on-this-day:always` keeps its argument. The MODIFIERS are
// the composition's, because they are what a row IS — the `row` line, the `cell`
// divider, and the band's `header:`. That last is the only thing a reader can
// lose here and it is deliberate: a bar reading "Open tasks" was true of a fence
// holding `tasks-table` alone and is false the moment the band holds `tag-index`
// too, because a row draws ONE bar above BOTH columns (see `row.ts`). A reader
// who had renamed it sees the rename in the diff and can decline.
//
// ── WHY IT MAY WELD MORE THAN THE WINDOW SHOWED ──
//
// The dry run reads the file on disk; the write re-reads it after the `pages`
// group has reconciled, which is where a newly-composed cell arrives. A reader
// who ticks BOTH groups can therefore get one row welded the preview did not
// show — the row whose second cell they agreed to add in the same dialog.
// Ticking migrations ALONE always applies exactly the diff shown, because then
// nothing runs before it. Stated rather than fixed: the alternative is running
// the reconciler inside the migration scan, which would put those additions in
// two rows of the window with two diffs, and a reader reads one diff per file.
export function regroupShippedPages(text: string, shipped: string): string | null {
  const rows = composedRows(shipped);
  if (!rows.length) return null;

  let segs = segment(text.split("\n"));
  let changed = false;
  for (const row of rows) {
    const cells = locateCells(segs, row.words);
    if (!cells) continue;
    const at = Math.min(...cells.map((c) => c.seg));
    const body = row.lines.map((l) => {
      const word = keywordOf(l);
      if (MODIFIER_KEYWORDS.has(word)) return l;
      return cells.find((c) => c.word === word)?.line ?? l;
    });
    const welded: Segment = {
      kind: "fence",
      fenceKind: "almanac",
      lines: ["```almanac", ...body, "```"],
      keywords: body.map((l) => keywordOf(l)),
    };
    const doomed = new Set(cells.map((c) => c.seg));
    if (doomed.size === 1 && segs[at].lines.join("\n") === welded.lines.join("\n"))
      continue;
    // A CELL LEAVES ITS SEPARATOR WITH IT. Cutting a fence out of the middle of
    // a page and leaving the blank line that divided it from its neighbour would
    // open a widening gap every time a row welded — so the blank line above each
    // fence being moved goes too, which is exactly the pair the composition
    // wrote when it put the fence there.
    for (const i of [...doomed]) {
      if (i === at) continue;
      const above = segs[i - 1];
      if (above?.kind === "raw" && above.lines.every((l) => l.trim() === ""))
        doomed.add(i - 1);
    }
    segs = segs.flatMap((seg, i) =>
      i === at ? [welded] : doomed.has(i) ? [] : [seg]
    );
    changed = true;
  }
  return changed ? segs.flatMap((s) => s.lines).join("\n") : null;
}

// Every row the composition writes: the fence's body, and the widget keywords it
// groups. A fence with no `row` line groups nothing, and a row of one is not a
// group either — `undoRowOfOne` means the composition never writes one, but
// asking rather than assuming costs a comparison.
function composedRows(shipped: string): { lines: string[]; words: string[] }[] {
  const out: { lines: string[]; words: string[] }[] = [];
  for (const seg of segment(shipped.split("\n"))) {
    if (seg.kind !== "fence" || seg.fenceKind !== "almanac") continue;
    const body = seg.lines.slice(1, -1).filter((l) => keywordOf(l).length > 0);
    if (!body.some((l) => keywordOf(l) === ROW_KEYWORD)) continue;
    const words = body
      .filter((l) => !MODIFIER_KEYWORDS.has(keywordOf(l)))
      .map(keywordOf);
    if (words.length > 1) out.push({ lines: body, words });
  }
  return out;
}

// The widget lines a fence holds, in order, with its modifiers dropped.
function widgetLines(seg: Segment): string[] {
  return seg.lines.slice(1, -1).filter((l) => {
    const word = keywordOf(l);
    return word.length > 0 && !MODIFIER_KEYWORDS.has(word);
  });
}

// Which fence on the page holds each of this row's cells, and the reader's own
// line for it. `null` if any of the three refusals above applies — the row is
// then left exactly as the page has it.
function locateCells(
  segs: readonly Segment[],
  words: readonly string[]
): { word: string; line: string; seg: number }[] | null {
  const out: { word: string; line: string; seg: number }[] = [];
  for (const word of words) {
    let found: { word: string; line: string; seg: number } | null = null;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.kind !== "fence" || seg.fenceKind !== "almanac") continue;
      const line = widgetLines(seg).find((l) => keywordOf(l) === word);
      if (line == null) continue;
      if (found) return null; // written twice — refusal 2
      // Refusal 3, in its two halves: nothing here the row does not group, and
      // no modifier a cell has no room for.
      if (widgetLines(seg).some((l) => !words.includes(keywordOf(l)))) return null;
      if (
        seg.lines
          .slice(1, -1)
          .map(keywordOf)
          .some((k) => MODIFIER_KEYWORDS.has(k) && !weldable(k))
      )
        return null;
      found = { word, line, seg: i };
    }
    if (!found) return null; // not on this page — refusal 1
    out.push(found);
  }
  return out;
}

// Whether a fence carrying this modifier can still be welded into a row.
// `header:` is the one a fence may bring and lose, and the paragraph above says
// why losing it is right; `row` and `cell` are the row's own, so a half-welded
// page converges rather than being refused. Everything else — `tab:`, `height:`,
// `frame:`, `wide` — leaves the fence exactly where the reader put it.
function weldable(keyword: string): boolean {
  return keyword === HEADER_KEYWORD || keyword === ROW_KEYWORD || keyword === CELL_KEYWORD;
}
