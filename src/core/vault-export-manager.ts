// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Running a whole-vault export: gather, survey, ask, write (4.31).
//
// A SMALL MANAGER WHOSE ONE METHOD IS WHAT A COMMAND CALLS, the shape
// `EntryTemplates` set in 4.29. Everything that can be decided without a vault
// is decided in `vault-export.ts`, which has no Obsidian import and holds every
// rule this file merely obeys.
//
// THE ONE GUARD THAT MAKES A BUG HERE RECOVERABLE is that every path this
// writes is under the export root, checked AT THE WRITE and not only at the
// plan. A plan is data and can be wrong; the check beside the write is the one
// that cannot be skipped by a caller. The worst case is then a bad folder the
// reader deletes, which is a very different worst case from a bad note.

import { App, Notice, TFile, normalizePath } from "obsidian";

import type ChronoAnvilPlugin from "../main";
import { toPlainMarkdown } from "./plain-markdown";
import {
  exportPathFor,
  exportSurvey,
  isUnderExportRoot,
  tally,
  type ExportPlanItem,
} from "./vault-export";
import { openRepairWindow } from "../ui/repair-modal";
import { pendingGroups } from "./repair-plan";
import { mapWithLimit } from "../ui/tables";
import { notify } from "./notify";
import type { SectionModel } from "./section-model";

export class VaultExport {
  constructor(
    private app: App,
    private plugin: ChronoAnvilPlugin
  ) {}

  private root(): string {
    return normalizePath(this.plugin.settings.paths.exportRoot);
  }

  // What the export would write, for every note a catalogue reads.
  //
  // THE SCOPE IS ENTRIES AND JOURNAL NOTES, which is the scope the reader set:
  // the pages somebody WRITES on. A dashboard is a view built from those, so
  // exporting one writes near-empty scaffolding beside the real thing —
  // `plainSections` on a subject index returns zero sections, because every
  // band on it is a derived view.
  private async plan(): Promise<ExportPlanItem[]> {
    const root = this.root();

    // Anything already under the root is skipped by NAME. It is also skipped by
    // consequence — a demoted copy has no `journal:` and no `type:`, so nothing
    // classifies it — but a loop that terminates only because of a derived
    // property is a loop that stops terminating the day the property changes.
    const sources: { file: TFile; model: SectionModel }[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (isUnderExportRoot(root, file.path)) continue;
      const model = this.modelOf(file.path);
      if (model) sources.push({ file, model });
    }

    // `cachedRead`, not `read`: nothing writes during a survey, and a vault with
    // a year of entries in it must not open a thousand file handles to answer a
    // question the reader has not said yes to yet.
    return mapWithLimit(sources, 12, async ({ file, model }) => {
      const text = await this.app.vault.cachedRead(file);
      const path = exportPathFor(root, file.path);
      const existing = this.app.vault.getAbstractFileByPath(path);
      const before =
        existing instanceof TFile ? await this.app.vault.cachedRead(existing) : null;
      return {
        source: file.path,
        path,
        content: toPlainMarkdown(text, model, "demote"),
        before,
      };
    });
  }

  private modelOf(notePath: string): SectionModel | null {
    const resolved = this.plugin.sections.modelForNote(notePath);
    if (!resolved) return null;
    // Entries and journal notes only. `managed` is an entry TEMPLATE, which is
    // generated rather than written in, so a copy of one is a copy of nobody's
    // words.
    return resolved.surface === "entry" || resolved.surface === "journal"
      ? resolved.model
      : null;
  }

  async run(): Promise<void> {
    const items = await this.plan();
    if (items.length === 0) {
      notify.info(
        "ChronoAnvil: nothing to export — no diary entries or journal notes were found."
      );
      return;
    }

    const survey = exportSurvey(items);
    const counts = tally(items);
    if (pendingGroups(survey).length === 0) {
      notify.ok(
        `Already exported — all ${counts.unchanged} files are up to date in ${this.root()}.`
      );
      return;
    }

    // Null is the reader closing the window, and an unticked group is the reader
    // saying no to this one. Both mean nothing is written.
    const choice = await openRepairWindow(this.app, survey);
    if (!choice || !choice.has("export")) return;

    let written = 0;
    for (const item of items) {
      if (item.before === item.content) continue;
      // AT THE WRITE. See the header: the plan is data and could be wrong; this
      // is the check a caller cannot skip.
      if (!isUnderExportRoot(this.root(), item.path)) continue;
      try {
        await this.writeOne(item.path, item.content);
        written++;
      } catch (e) {
        console.error("[ChronoAnvil] could not export", item.source, e);
      }
    }

    notify.report(
      `Exported ${written} file${written === 1 ? "" : "s"} to ${this.root()} — ` +
        `${counts.created} new, ${counts.rewritten} refreshed, ${counts.unchanged} unchanged.`
    );
  }

  // One file, and the folders above it.
  private async writeOne(path: string, content: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }
    // EVERY ANCESTOR, IN ORDER. The export mirrors a note's whole vault path, so
    // a first run has to make `ChronoAnvil Export`, then the diary root inside it,
    // then the grain folder, then the year — and `createFolder` is not promised
    // to be recursive. Creating only the immediate parent works on a flat vault
    // and fails on every real one.
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      if (this.app.vault.getAbstractFileByPath(folder)) continue;
      try {
        await this.app.vault.createFolder(folder);
      } catch {
        // Already there, or a race with another write in this same run. Both are
        // fine — `create` below is the call whose failure matters.
      }
    }
    await this.app.vault.create(path, content);
  }
}

// The command's one line, kept beside the class so a caller needs no notice
// text of its own.
export async function runVaultExport(plugin: ChronoAnvilPlugin): Promise<void> {
  try {
    await new VaultExport(plugin.app, plugin).run();
  } catch (e) {
    console.error("[ChronoAnvil] export failed", e);
    new Notice("ChronoAnvil: the export could not finish. See the console for why.");
  }
}
