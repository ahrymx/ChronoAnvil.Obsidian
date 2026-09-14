// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The dashboards a new note kind has not reached yet, offered at the moment the
// kind is added.
//
// WHY THIS EXISTS (3.18 follow-ups §4)
//
// 3.18 built `extend`: a section that is present, wanted and short of a part
// gets a seventh op rather than a `keep`, and `apply` inserts only the missing
// blocks. It works, and it works through the path the app uses. What it is not
// is DISCOVERABLE — it runs only when a reader opens *Edit sections…* on a note
// and presses Save, and nothing anywhere tells them there is something to open
// it for. So the reported behaviour — "the section must be removed then
// re-added" — was a reader doing by hand what `extend` would have done, because
// nothing surfaced that the option existed.
//
// That gap has a sharper edge than the follow-up gave it. `kind-change.ts`
// already promises, unhedged, in its own box:
//
//   Dashboards will offer to list the new type; nothing is written until you
//   accept the change.
//
// Nothing made that offer. The window was not merely quiet about a feature —
// it described one that did not happen. This is the offer.
//
// WHY NOT A BACKGROUND SWEEP. §8 of the 3.18 roadmap ruled one out, and the
// ruling stands: a repair running unasked is what would make that guarantee
// false rather than merely imprecise. The guarantee that survives 3.18 —
// *nothing is written until you accept it* — is worth more than the keystroke a
// live sync would save. So this plans, reports and waits, exactly as every
// other door onto `planSections` does. Nothing here writes until a caller has
// an answer.
//
// WHY AT THE CONFIRMATION AND NOT ON THE NOTE. The alternative was a quiet
// marker on the banner when the current note has an extend pending, which costs
// a plan on every journal note render — the sort of thing the "one observer per
// note" work exists to keep cheap — and still only reaches a reader who happens
// to open that note. The confirmation already knows a kind is being added,
// already writes missing templates, and already names what it is about to do.
// One window, one decision, at the only moment the reader is thinking about it.

import { App, Notice, TFile } from "obsidian";
import { confirmPlan } from "../ui/modals";
import {
  SectionContext,
  detectSections,
  sectionContext,
} from "./journal-sections";
import { applySections, planSections } from "./journal-plan";
import {
  consolidateChildren,
  consolidateDetail,
} from "./children-consolidate";
import type { JournalType } from "./journal";
import type { SectionOp } from "../core/section-model";
import { noteTypeOf } from "../core/util";

// One note or template that would gain something, and what.
export interface DashboardCatchup {
  file: TFile;
  // What to call it in the offer. A path is what makes two identically named
  // index notes — one per subject — tellable apart, which is the common case
  // here rather than an edge one.
  label: string;
  ops: SectionOp[];
  // Whether this file's per-kind tables would be merged into one. 1.0.16.
  //
  // NOT AN `op`, AND NOT FOR WANT OF LOOKING. `SectionOpKind` has eight members
  // and this is none of them: it is not an `add`, it removes nothing the reader
  // asked about, and `regroup` already means a page break inside a group and is
  // on `repair-plan.ts`'s FORBIDDEN list. Inventing a ninth would put a word in
  // the shared vocabulary that three catalogues can never emit, for one
  // release's migration — so the fact travels as a fact and the sentence comes
  // from `consolidateDetail`, which is the same string the repair window shows.
  merge: boolean;
}

// Whether this door consolidates as well as extends. 1.0.16.
//
// ONE FILE, ONE ROW, WHICH IS WHY THIS IS A PARAMETER AND NOT A CONSTANT. The
// repair window has a group whose entire subject is notes an older release
// wrote — it computes this migration itself, with a diff beside it — and the
// `journals` group's own blurb promises that *"nothing already in them is
// touched"*. Reporting the merge from both would put two rows about one file in
// front of a reader who reads one diff per file, and would make that promise
// false in the row that carries it.
//
// THE KIND-ADD DOOR IS THE ONE THAT NEEDS IT. `kind-change.ts` promises that
// dashboards will offer to list the new type; a consolidated card lists it by
// construction and has no part to be short of, so on a note still carrying the
// per-kind stack the merge IS the offer. See `children-consolidate.ts`.
export interface CatchupScope {
  merge?: boolean;
}

// The index surfaces of one journal: its dashboards, and the templates they are
// made from.
//
// INDEX ONLY, WHICH IS THE GATE RATHER THAN AN OPTIMISATION (§1.4). `extend`
// may run on a dashboard and on an index template and never on a leaf note, a
// kind template or a page — a dashboard's content is a rollup of what is beneath
// it and can be WRONG about a fact, while a leaf note's content is the reader's
// writing. `planSections` enforces that itself, on the context rather than the
// catalogue; scanning only index surfaces here means the enforcement never has
// to fire, and the two agreeing is deliberate belt-and-braces rather than one
// check standing in for the other.
// EXPORTED IN 1.0.16 FOR A SECOND WALKER. The repair window's migration group
// needs exactly this set — every index note of a type, and the templates the
// next one will be made from — and deriving it a second time there is how two
// doors come to disagree about which files a journal has.
export function indexSurfaces(
  app: App,
  type: JournalType
): { file: TFile; ctx: SectionContext }[] {
  const out: { file: TFile; ctx: SectionContext }[] = [];

  // The templates, by name. One per level, sitting in the type's own templates
  // folder rather than under its root, which is why they need a pass of their
  // own and cannot be found by the frontmatter walk below.
  type.levels.forEach((lvl, depth) => {
    const path = `${type.templatesFolder}/${lvl.indexTemplate}`;
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      out.push({ file, ctx: sectionContext(type, { depth }) });
    }
  });

  // The dashboards, by their `type:` value. Read from metadataCache rather than
  // by re-parsing frontmatter, which is what every other classifier in the
  // plugin does and the reason a note the cache has not seen yet is simply not
  // offered rather than misread.
  const depthOf = new Map(type.levels.map((lvl, depth) => [lvl.id, depth]));
  for (const file of app.vault.getMarkdownFiles()) {
    if (!type.root || !file.path.startsWith(`${type.root}/`)) continue;
    const depth = depthOf.get(noteTypeOf(app, file));
    if (depth === undefined) continue;
    out.push({
      file,
      // The host folder is the note's own, which is what an index note is: it
      // sits in the folder it indexes.
      ctx: {
        ...sectionContext(type, { depth }),
        hostFolder: file.parent?.path ?? "",
      },
    });
  }
  return out;
}

// Which of them are short of something, and what they would gain.
//
// `want` IS WHAT THE FILE ALREADY HAS, which is the whole reason this is an
// offer rather than a redesign. It asks the planner the same question the
// section editor asks when a reader opens it and presses Save without touching
// a row: keep every section that is there, and nothing else. So the only op it
// can ever produce is `extend` — nothing is added, nothing removed, nothing
// moved — and the filter below is an assertion of that rather than a narrowing
// of a wider result.
export async function findDashboardCatchups(
  app: App,
  type: JournalType,
  scope: CatchupScope = {}
): Promise<DashboardCatchup[]> {
  const out: DashboardCatchup[] = [];
  for (const { file, ctx } of indexSurfaces(app, type)) {
    const text = await app.vault.read(file);
    // THE MERGE IS READ FIRST AND PLANNED SECOND, in the order the write runs
    // them: a note whose tables are about to become one is asked about its
    // parts as the consolidated shape, which has none, so the two cannot report
    // a table as both merged away and missing.
    const merged =
      (scope.merge ? consolidateChildren(text, type) : null) ?? text;
    const want = detectSections(merged, ctx);
    const ops = planSections(merged, ctx, want).filter(
      (o) => o.kind === "extend"
    );
    const merge = merged !== text;
    if (ops.length || merge) out.push({ file, label: file.path, ops, merge });
  }
  return out;
}

// Write the extensions the reader accepted.
//
// THROUGH `applySections`, NOT THROUGH A REPAIR ROUTINE OF ITS OWN. This is the
// property `previewRepair` states and the reason `extend` was put in the op
// vocabulary rather than built as a sweep: the preview cannot drift from the
// action because it IS the action, minus the write. The ops shown in the offer
// were produced by `planSections` from the same `want` this recomputes, so a
// reader who read the list gets the list.
//
// RE-READ RATHER THAN CACHED. The text is read again here because the reader
// has been looking at a modal in between, and a write built on a stale read is
// how an accepted plan silently reverts an edit made in another pane. `null`
// from `applySections` means nothing to do, which is the honest outcome for a
// file that has caught up on its own since the scan.
export async function applyDashboardCatchups(
  app: App,
  type: JournalType,
  files: readonly TFile[],
  scope: CatchupScope = {}
): Promise<number> {
  const wanted = new Set(files.map((f) => f.path));
  let written = 0;
  for (const { file, ctx } of indexSurfaces(app, type)) {
    if (!wanted.has(file.path)) continue;
    const text = await app.vault.read(file);
    // THE SAME TWO STEPS THE SCAN RAN, IN THE SAME ORDER, which is the whole of
    // why the preview cannot drift from the write: both call one pure function
    // and then one planner, and `scope` decides whether the first of them runs
    // at all.
    const merged = (scope.merge ? consolidateChildren(text, type) : null) ?? text;
    const next =
      applySections(merged, ctx, detectSections(merged, ctx)) ?? merged;
    if (next === text) continue;
    await app.vault.modify(file, next);
    written++;
  }
  return written;
}

// ── The offer itself ──────────────────────────────────────────────────────
//
// EXTRACTED IN 1.1 BECAUSE IT GREW A SECOND DOOR. It was a private method on
// the journal editor, which was the only place a kind could be added; the
// "Add kind" row on a journal's *What's below* card is a second, and a second
// copy of this would be a second answer to "what is a reader shown before their
// dashboards are written to". The window, the sentence and the `Notice` are the
// same from both doors because there is one of each.
//
// THE DIALOG IS THE PLAN, not a summary of it — `previewRepair`'s property, and
// the reason `extend` carries a detail string rather than the word "unchanged".
// Each line is the op's own detail ("Practice has no table here — it will be
// added"), so what the reader accepts is what was computed.
//
// DECLINING IS FREE AND STAYS FREE. The kind is already committed by the time
// this runs; this is a second, separate consent about the reader's dashboards,
// and refusing it leaves a vault where the notes exist, carry the right
// frontmatter, and are simply not listed until the reader says so here or in
// the section editor later. Returns what was written so a caller can say so.
export async function offerDashboardCatchup(
  app: App,
  type: JournalType
): Promise<number> {
  // MERGING, FROM THIS DOOR ONLY — see `CatchupScope`. A note carrying the
  // per-kind stack has no part to be short of once the section is one table, so
  // without this a reader who adds a second note type to a journal would be
  // offered nothing at all and their index notes would go on listing the first
  // kind alone.
  const scope = { merge: true };
  const pending = await findDashboardCatchups(app, type, scope);
  if (!pending.length) return 0;

  // ── THE SENTENCE SAYS WHICHEVER OF THE TWO THINGS IS HAPPENING ───────
  //
  // The old wording is a promise: *"nothing already in them is moved, rewritten
  // or removed"*. That is exactly true of an `extend` and exactly false of a
  // merge, which deletes a group head and a create button per kind — so a
  // window holding one merge says so instead. Keeping the reassurance over a
  // rewrite would be the plugin lying in the one place it asks permission.
  const merging = pending.filter((p) => p.merge).length;
  const ok = await confirmPlan(
    app,
    `List the new note type on ${pending.length} dashboard${
      pending.length === 1 ? "" : "s"
    }?`,
    merging
      ? "These index notes and templates draw a separate table for each note " +
        "type, written before this one existed. Merging them into a single " +
        "table is what makes the new type appear: the per-type headings and " +
        "their create buttons are replaced by one of each, and everything else " +
        "on the note stays where it is. No note you have written is touched."
      : "These index notes and templates were written before the note type " +
        "existed, so they have no table for it. Only the missing tables are " +
        "added — nothing already in them is moved, rewritten or removed, and " +
        "no note you have written is touched.",
    pending.map((p) => ({
      label: p.file.basename,
      lines: [
        ...(p.merge ? [`${type.name} — ${consolidateDetail(type)}`] : []),
        ...p.ops.map((o) => `${o.label} — ${o.detail}`),
      ],
    })),
    merging ? "Update the notes" : "Add the tables"
  );
  if (!ok) return 0;

  const written = await applyDashboardCatchups(
    app,
    type,
    pending.map((p) => p.file),
    scope
  );
  if (written) {
    new Notice(
      `ChronoAnvil: updated ${written} dashboard${written === 1 ? "" : "s"} ✅`
    );
  }
  return written;
}
