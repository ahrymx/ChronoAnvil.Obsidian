// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { normalizePath } from "obsidian";
import type { JournalConfig } from "./custom-journal";
import type { TrackerDef } from "../trackers/trackers";

// ── A journal's definition, stored beside its notes ───────────────────────
//
// A journal type's NOTES live in the vault and its DEFINITION lived only in
// data.json, inside the plugin folder. Those two facts are incompatible, and
// three ordinary things pulled them apart: replacing the plugin folder (the
// dev loop) deletes data.json; copying a journal folder into another vault
// carries no definition; syncing the vault without .obsidian/plugins does the
// same. In each case the folder is still there, fully populated, and
// registeredJournalTypes() — which reads settings and nothing else — has no
// idea it is a journal.
//
// The manifest is that definition, written into the journal's own root. It
// travels with the folder because it is *in* the folder.
//
// THIS FILE IS PURE. Encoding, decoding and the version rule, with no App and
// no vault: journal-import.ts does the reading and writing. Split out because
// the registry mirror planned for 2.50 needs exactly these rules and must not
// drag the importer's whole dependency graph along to get them.

// Where a journal's definition lives, relative to its root folder.
//
// A dotfile, so the file explorer stays clean and the definition reads as the
// machinery it is rather than as a note. The cost is that Obsidian's vault API
// ignores it — getAbstractFileByPath, getFiles and the metadata cache all skip
// dot-prefixed paths — so every read and write here goes through
// `vault.adapter`, which does not. That is the whole reason this file talks to
// the adapter while the rest of the plugin talks to the vault.
export const JOURNAL_MANIFEST = ".almanac-journal.json";

// Bumped only if the stored shape changes in a way a reader must branch on.
export const MANIFEST_VERSION = 1;

export function manifestPathFor(root: string): string {
  return normalizePath(`${root}/${JOURNAL_MANIFEST}`);
}

// The parts of a JournalConfig worth storing.
//
// ROOT AND TEMPLATESFOLDER ARE DELIBERATELY ABSENT. The root is wherever the
// manifest was just found — storing it would let a stale copy point the type
// at the folder it came from rather than the one it is in, which is exactly
// what breaks when the folder is copied to another vault. The templates folder
// is re-derived from the name against the receiving vault's own paths, for the
// same reason: a vault that keeps templates somewhere else should not inherit
// the sender's layout. Both are re-established on adoption.
export type StoredJournalConfig = Omit<JournalConfig, "root" | "templatesFolder">;

export interface JournalManifest {
  almanacJournal: number;
  config: StoredJournalConfig;
  // The journal-scoped trackers its notes actually use. Without these an
  // imported journal renders "Unknown tracker: difficulty" on every note that
  // logs one — the definition is only half the journal.
  trackers: TrackerDef[];
}

export function encodeJournalManifest(
  cfg: JournalConfig,
  trackers: TrackerDef[]
): string {
  const { root: _root, templatesFolder: _templates, ...stored } = cfg;
  const manifest: JournalManifest = {
    almanacJournal: MANIFEST_VERSION,
    config: stored,
    trackers,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// Parse a manifest, or null if it isn't one.
//
// Tolerant by design: this reads a file that may have been hand-edited, half
// written by a sync, or produced by a later version. A manifest that doesn't
// parse means "fall back to inference", never "throw during load".
export function decodeJournalManifest(raw: string): JournalManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const m = parsed as Partial<JournalManifest>;
  if (typeof m.almanacJournal !== "number") return null;
  // A manifest from a LATER release may mean something different by the same
  // field names, so reading it under today's assumptions is worse than not
  // reading it: the caller falls back to inference, which reads the notes
  // rather than a shape it doesn't understand. Older versions stay readable —
  // that is what a version number is for — and gain the current shape the next
  // time the journal is saved or the vault repaired.
  if (m.almanacJournal > MANIFEST_VERSION) {
    console.warn(
      `[Almanac] journal manifest is version ${m.almanacJournal}; this release understands ${MANIFEST_VERSION}. Reading the folder instead.`
    );
    return null;
  }
  const cfg = m.config;
  if (!cfg || typeof cfg !== "object") return null;
  if (typeof cfg.id !== "string" || typeof cfg.name !== "string") return null;
  if (!Array.isArray(cfg.levels) || cfg.levels.length === 0) return null;
  if (!Array.isArray(cfg.kinds) || cfg.kinds.length === 0) return null;
  return {
    almanacJournal: m.almanacJournal,
    config: {
      ...cfg,
      id: cfg.id,
      name: cfg.name,
      emoji: typeof cfg.emoji === "string" && cfg.emoji ? cfg.emoji : "📔",
      levels: cfg.levels,
      kinds: cfg.kinds,
    },
    trackers: Array.isArray(m.trackers) ? m.trackers : [],
  };
}