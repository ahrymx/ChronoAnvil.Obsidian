// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The dashboards a note kind has not reached yet — or has not left yet —
// offered at the moment the kind is added or removed.
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
import type { JournalType } from "./journal";
import type { SectionOp } from "../core/section-model";
import { noteTypeOf } from "../core/util";
import { pageTypesOf } from "./kind-tables";

// One note or template that would gain something, and what.
export interface DashboardCatchup {
  file: TFile;
  // What to call it in the offer. A path is what makes two identically named
  // index notes — one per subject — tellable apart, which is the common case
  // here rather than an edge one.
  label: string;
  ops: SectionOp[];
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
function indexSurfaces(
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
        // AND WHICH PAGE-ADDED TYPES THIS ONE LISTS (1.0.33), which is the
        // note's own answer and is why it is added HERE and not in the template
        // pass above. A template is composed once for every index note of its
        // level, so a page's list written into one would be every page's list.
        //
        // This is what makes the pair work in both directions: `missingParts`
        // offers the group to the page that claims the kind, and `strayParts`
        // treats that same group as known rather than as a table for a kind
        // the journal lost. Every other index note in the journal sees the
        // kind in neither list and is left exactly as it was — *"adding a new
        // note-type to a table should not add this type to all index pages."*
        localKinds: pageTypesOf(app, file),
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
// a row: keep every section that is there, and nothing else. So no SECTION is
// added, removed or moved, and the filter below is an assertion of that rather
// than a narrowing of a wider result.
//
// TWO OPS PASS IT AS OF 1.0.23, and they are one question asked in both
// directions. `extend` is a dashboard short of a table for a kind the journal
// GAINED; `prune` is one still carrying a table for a kind it LOST — the state
// the reader reported, where an imported Study drew a `📝 Cheatsheets` group
// over *"Unknown Study note type: cheatsheets"*. Both act inside a section that
// is staying, on lines this plugin composed, and a catch-up that could only ever
// add was telling half the truth about what a kinds change does to a vault.
export async function findDashboardCatchups(
  app: App,
  type: JournalType
): Promise<DashboardCatchup[]> {
  const out: DashboardCatchup[] = [];
  for (const { file, ctx } of indexSurfaces(app, type)) {
    const text = await app.vault.read(file);
    const want = detectSections(text, ctx);
    const ops = planSections(text, ctx, want).filter(
      (o) => o.kind === "extend" || o.kind === "prune"
    );
    if (ops.length) out.push({ file, label: file.path, ops });
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
  files: readonly TFile[]
): Promise<number> {
  const wanted = new Set(files.map((f) => f.path));
  let written = 0;
  for (const { file, ctx } of indexSurfaces(app, type)) {
    if (!wanted.has(file.path)) continue;
    const text = await app.vault.read(file);
    const next = applySections(text, ctx, detectSections(text, ctx));
    if (next == null || next === text) continue;
    await app.vault.modify(file, next);
    written++;
  }
  return written;
}

// ── One note, because the reader is standing on it (1.0.33) ──────────────
//
// THE READER'S ASK: *"adding a new note-type to a table should not add this type
// to all index pages. The only place the defaults should be configured like this
// is from chronanvil's journal settings."*
//
// `+ Add note type` on a *What's below* card used to finish by opening the
// vault-wide offer below — *"List the new note type on 7 dashboards?"* — so a
// group wanted on one Topic arrived on every Topic in the subject. Which is what
// that offer is FOR when it is the Settings editor asking: a kinds change made in
// the journal's own settings is a change to the journal's defaults, and the
// dashboards catching up with it is the honest consequence. Pressed from one
// card it is the wrong scope, and it was the wrong scope silently — the reader
// reads a list of paths and accepts, and the mistake is seven files old.
//
// SO THE SCOPE FOLLOWS THE DOOR. This writes the note the control was pressed
// from and nothing else; `offerDashboardCatchup` stays exactly as it is for the
// door that means every dashboard.
//
// AND IT ASKS NOTHING, which is not a weakening of the consent. The window below
// exists because it writes to files the reader is not looking at; this writes the
// card under their hand, and `promptAddKind`'s own description already promises
// precisely that — *"It gets its own template, its own create button and its own
// group on this card."* The old behaviour was the one that exceeded what the
// prompt said it would do.
//
// THROUGH `indexSurfaces`, NOT BY BUILDING A CONTEXT HERE. That function is the
// one place that knows a note's depth comes from its `type:` and its host folder
// from its parent, and a second derivation of a `SectionContext` is how the offer
// and the write come to plan against different questions. A note it does not
// return is not an index surface of this journal, and nothing is written.
// ── AND THE CALLER MAY HAVE TO SAY WHAT THE PAGE LISTS ───────────────────
//
// The reader's report: *"adding a new-note type no longer automatically updates
// the table (the user has to repair vault for it to show)"*.
//
// `indexSurfaces` reads a page's claimed note types out of its frontmatter, and
// `frontmatterOf` reads OBSIDIAN'S METADATA CACHE — which is filled from a file
// event, after the write that caused it returns. So the sequence that adds a
// page-local note type (claim the kind, then reconcile) asked the planner about
// a page that had already claimed the kind and was told, by a cache one event
// behind, that it had not. Nothing was composed; the reader's next Repair vault
// found the claim and did it then, which is exactly what they saw.
//
// `listing` IS THE WRITE'S OWN ANSWER, handed straight over — `listKindOnPage`
// and `unlistKindOnPage` both resolve to the list they just put in the file. Not
// a delta and not a hint: where it is given it IS this page's list, so the same
// argument serves both directions, and a caller with nothing to say omits it and
// gets the cache's answer as before.
export async function catchUpIndexNote(
  app: App,
  type: JournalType,
  file: TFile,
  listing?: readonly string[]
): Promise<boolean> {
  const found = indexSurfaces(app, type).find((s) => s.file.path === file.path);
  if (!found) return false;
  const ctx: SectionContext = listing
    ? { ...found.ctx, localKinds: [...listing] }
    : found.ctx;
  const text = await app.vault.read(file);
  const next = applySections(text, ctx, detectSections(text, ctx));
  if (next == null || next === text) return false;
  await app.vault.modify(file, next);
  return true;
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
  const pending = await findDashboardCatchups(app, type);
  if (!pending.length) return 0;

  const ok = await confirmPlan(
    app,
    `List the new note type on ${pending.length} dashboard${
      pending.length === 1 ? "" : "s"
    }?`,
    "These index notes and templates were written before the note type " +
      "existed, so they have no table for it. Only the missing tables are " +
      "added — nothing already in them is moved, rewritten or removed, and " +
      "no note you have written is touched.",
    pending.map((p) => ({
      label: p.file.basename,
      lines: p.ops.map((o) => `${o.label} — ${o.detail}`),
    })),
    "Add the tables"
  );
  if (!ok) return 0;

  const written = await applyDashboardCatchups(
    app,
    type,
    pending.map((p) => p.file)
  );
  if (written) {
    new Notice(
      `ChronoAnvil: updated ${written} dashboard${written === 1 ? "" : "s"} ✅`
    );
  }
  return written;
}
