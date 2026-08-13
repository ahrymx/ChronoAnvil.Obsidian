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

import { App, TFile } from "obsidian";
import {
  SectionContext,
  detectSections,
  sectionContext,
} from "./journal-sections";
import { applySections, planSections } from "./journal-plan";
import type { JournalType } from "./journal";
import type { SectionOp } from "../core/section-model";

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
    const raw = app.metadataCache.getFileCache(file)?.frontmatter?.["type"];
    if (typeof raw !== "string") continue;
    const depth = depthOf.get(raw.trim().toLowerCase());
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
  type: JournalType
): Promise<DashboardCatchup[]> {
  const out: DashboardCatchup[] = [];
  for (const { file, ctx } of indexSurfaces(app, type)) {
    const text = await app.vault.read(file);
    const want = detectSections(text, ctx);
    const ops = planSections(text, ctx, want).filter((o) => o.kind === "extend");
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
