// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Keeps the configured paths pointing at the right folders when the user
// renames or moves one in Obsidian.
//
// Every path Almanac uses — the diary root, the templates folder, a custom
// journal's root — is a plain string in data.json. Obsidian rewrites *links*
// on a rename, but it has no idea a plugin's settings mention the old path, so
// before this the plugin would quietly start looking in a folder that no longer
// existed: "Set up / repair vault" would helpfully recreate the old tree next
// to the renamed one, and the daily-note command would fail to find its
// template. That's a bad failure mode, because nothing about renaming a folder
// suggests you're about to break anything.
//
// Reorganising a vault is a normal thing to do, and the numbered roots invite
// it: the whole point of naming a folder for its role is that you can rename it
// when the role changes. That should cost one drag, not a trip through the
// settings tab to repair paths you didn't know were stale.
//
// Scope is deliberately narrow: it only ever *retargets* a setting that pointed
// at the moved thing (or something inside it). It never creates, deletes or
// moves anything on disk, and a path that had nothing to do with the rename is
// left alone.

import { App, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import type AlmanacPlugin from "../main";

export class PathWatch {
  constructor(private app: App, private plugin: AlmanacPlugin) {}

  register(): void {
    this.plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.onRename(file, oldPath);
      })
    );
  }

  private async onRename(file: TAbstractFile, oldPath: string): Promise<void> {
    // A folder rename can move a whole subtree; a file rename only matters for
    // the one path setting that names a file (the homepage).
    const isFolder = file instanceof TFolder;
    if (!isFolder && !(file instanceof TFile)) return;

    const changes = remapConfiguredPaths(
      this.plugin.settings,
      oldPath,
      file.path,
      isFolder
    );
    if (changes.length === 0) return;

    await this.plugin.saveSettings();
    // Worth announcing: the user renamed a folder and something *else* changed
    // as a result. Silent config edits are the kind of thing people discover
    // months later while wondering why a setting doesn't say what they set.
    new Notice(
      changes.length === 1
        ? `Almanac: updated the ${changes[0]} path to match.`
        : `Almanac: updated ${changes.length} paths to match.`
    );
  }
}

// The path settings that name a *file* rather than a folder. Everything else
// is a folder, so a file rename can't legitimately affect it — and a folder
// rename can still move one of these, which is why the check below is on the
// event's kind, not on the key alone.
const FILE_PATH_KEYS = new Set(["home", "events"]);

// Human-readable names for the path keys, used only in the notice above.
const PATH_LABELS: Record<string, string> = {
  home: "homepage",
  events: "events note",
  staging: "staging folder",
  diaryRoot: "diary root",
  diaryDaily: "daily entries",
  diaryWeekly: "weekly entries",
  diaryMonthly: "monthly entries",
  diaryQuarterly: "quarterly entries",
  diaryYearly: "yearly entries",
  materialRoot: "material root",
  journalsRoot: "journals root",
  infrastructureRoot: "infrastructure",
  templates: "templates",
  templatesDiary: "diary templates",
  documentation: "documentation",
  attachments: "attachments",
};

// Rewrite `value` if it names `oldPath` or something beneath it. Returns null
// when the path is unrelated, so callers can tell "no change" from "changed to
// the same string". Prefix matching is segment-aware: renaming `02 - Diary`
// must not touch `02 - Diary Archive`.
export function remapPath(
  value: string,
  oldPath: string,
  newPath: string
): string | null {
  if (!value) return null;
  if (value === oldPath) return newPath;
  if (value.startsWith(`${oldPath}/`)) {
    return newPath + value.slice(oldPath.length);
  }
  return null;
}

// Apply remapPath across every configured path — the `paths` record plus each
// custom journal's own root/templates folder. Mutates `settings` and returns
// the labels of what changed, so the caller can save once and report.
export function remapConfiguredPaths(
  settings: {
    paths: Record<string, string>;
    customJournals?: { name: string; root: string; templatesFolder: string }[];
    // Keyed `<notePath>::<section title>`. Not a configured path, but it holds
    // note paths, so a rename invalidates it exactly as it invalidates the rest
    // of this record.
    collapsedNoteSections?: Record<string, boolean>;
  },
  oldPath: string,
  newPath: string,
  isFolder: boolean
): string[] {
  const changed: string[] = [];

  for (const key of Object.keys(settings.paths)) {
    // A file rename can only retarget the settings that name a file (the home
    // note, the events note); a folder rename can move any of them.
    if (!isFolder && !FILE_PATH_KEYS.has(key)) continue;
    const next = remapPath(settings.paths[key], oldPath, newPath);
    if (next === null) continue;
    settings.paths[key] = next;
    changed.push(PATH_LABELS[key] ?? key);
  }

  if (isFolder) {
    for (const journal of settings.customJournals ?? []) {
      const root = remapPath(journal.root, oldPath, newPath);
      if (root !== null) {
        journal.root = root;
        changed.push(`${journal.name} root`);
      }
      const tpl = remapPath(journal.templatesFolder, oldPath, newPath);
      if (tpl !== null) {
        journal.templatesFolder = tpl;
        changed.push(`${journal.name} templates`);
      }
    }
  }

  // Fold state, keyed by note path. Renaming a note — or a folder above it —
  // silently reset every collapsed section inside it: the key still named the
  // old path, nothing matched, and every bar reopened. The rest of this
  // function has retargeted on rename since it was written; this record was
  // added later and never joined in.
  const folds = settings.collapsedNoteSections;
  if (folds) {
    let moved = 0;
    for (const key of Object.keys(folds)) {
      const sep = key.indexOf(SECTION_KEY_SEP);
      if (sep === -1) continue;
      const next = remapPath(key.slice(0, sep), oldPath, newPath);
      if (next === null) continue;
      delete folds[key];
      folds[`${next}${key.slice(sep)}`] = true;
      moved++;
    }
    if (moved > 0) changed.push("collapsed sections");
  }

  return changed;
}

// The separator between a note path and a section title in a fold key.
//
// EVERY SPLIT TAKES THE FIRST OCCURRENCE, and this comment used to say the
// last — with the reasoning that proves the opposite sitting in the same
// sentence (3.13 §6). Obsidian forbids `:` in file names, so a note path cannot
// contain `::`; a section TITLE can. The side that cannot contain it is the
// side before the separator, so the FIRST `::` is always the boundary. The last
// one is the boundary only in the case where the title has none.
//
// A bar titled `header:📊 Before :: After` on `Home.md` makes the key
// `Home.md::📊 Before :: After`. Split at the last, the path reads
// `Home.md::📊 Before`, which matches no live note — so `pruneCollapsedSections`
// deleted that section's fold state at EVERY startup, and `remapConfiguredPaths`
// never retargeted it on a rename. Two call sites, one word each.
export const SECTION_KEY_SEP = "::";

// Drop fold state for notes that no longer exist.
//
// The record only ever grew: nothing removed a key when its note was deleted,
// so a vault that had churned through notes carried their folds in data.json
// forever, unbounded. Run once at load against the paths the vault actually
// has. Pure so it can be tested without a vault.
export function pruneCollapsedSections(
  folds: Record<string, boolean>,
  livePaths: Set<string>
): number {
  let dropped = 0;
  for (const key of Object.keys(folds)) {
    const sep = key.indexOf(SECTION_KEY_SEP);
    if (sep === -1) continue;
    if (livePaths.has(key.slice(0, sep))) continue;
    delete folds[key];
    dropped++;
  }
  return dropped;
}
