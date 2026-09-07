#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Rewrite a vault written by Almanac (<= 4.84) into ChronoAnvil's token names.
//
// WHY THIS EXISTS RATHER THAN JUST BACK-COMPAT. The plugin reads both spellings
// at the four places where losing content would be silent — body regions, the
// settings mirror, journal manifests, tracker markers — so an unmigrated vault
// opens and renders. But reading both forever means every locator in the
// codebase has to keep agreeing about it, and the vault stays a mix of two
// vocabularies that a reader sees whenever they look at their own source. One
// pass fixes it; the fallbacks are the safety net, not the plan.
//
// WHAT IT DOES NOT TOUCH. `.obsidian/` is left completely alone except for the
// plugin folder move, which is reported and never silently overwritten: the
// workspace, themes and other plugins' data have nothing to do with this and a
// find-and-replace across them is how a migration tool becomes the thing that
// broke your vault.
//
//   node tools/migrate-vault.mjs <vault>            # dry run, reports only
//   node tools/migrate-vault.mjs <vault> --write    # actually rewrite
//   node tools/migrate-vault.mjs <vault> --write --no-backup
//
// A backup copy of every file it changes is written alongside the vault unless
// --no-backup is passed. Re-running after a successful migration is a no-op.

import { readdir, readFile, writeFile, mkdir, rename, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// ── The token map ─────────────────────────────────────────────────────────
//
// Ordered exactly like tools/rename's rules and for the same reason: the
// specific compound tokens are consumed before the bare `almanac` sweep can
// shorten them into something the plugin no longer recognises. Every entry is
// a token the plugin actually writes into a vault — nothing here is cosmetic.
export const RULES = [
  ["<!--almanac:", "<!--chronoanvil:"],
  ["# almanac:trackers:start", "# chronoanvil:trackers:start"],
  ["# almanac:trackers:end", "# chronoanvil:trackers:end"],
  ["```almanac-journal-charts", "```chronoanvil-journal-charts"],
  ["```almanac-charts", "```chronoanvil-charts"],
  ["```almanac", "```chronoanvil"],
  ["%% almanac-graph %%", "%% chronoanvil-graph %%"],
  ["almanac-events:", "chronoanvil-events:"],
  ["`almanac:", "`chronoanvil:"],
  // A CSS class, but one written into the READER'S frontmatter
  // (`cssclasses: almanac-wide`) rather than emitted at render time, so it
  // is a vault token like any other and migrates with them.
  ["almanac-wide", "ca-wide"],
  ['"almanacJournal"', '"chronoanvilJournal"'],
  ['"almanacRegistry"', '"chronoanvilRegistry"'],
];

// Vault files whose NAME carries the old brand.
export const FILE_RENAMES = [
  [".almanac-registry.json", ".chronoanvil-registry.json"],
  [".almanac-journal.json", ".chronoanvil-journal.json"],
  ["Almanac.canvas", "ChronoAnvil.canvas"],
];

export const TEXT_EXT = new Set([".md", ".canvas", ".base", ".json"]);

// Apply the token map to one file's text. Exported so a test can drive the
// exact transform the tool performs without touching a disk.
export function migrateText(text) {
  let out = text;
  for (const [from, to] of RULES) out = out.split(from).join(to);
  return out;
}

// Everything below is the CLI. Guarded so importing this module for its tables
// does not walk a vault or call process.exit.
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (invokedDirectly) {
const args = process.argv.slice(2);
const vault = args.find((a) => !a.startsWith("--"));
const write = args.includes("--write");
const backup = !args.includes("--no-backup");

if (!vault) {
  console.error("usage: node tools/migrate-vault.mjs <vault> [--write] [--no-backup]");
  process.exit(1);
}
if (!existsSync(vault)) {
  console.error(`no such vault: ${vault}`);
  process.exit(1);
}

// Walk the vault, skipping `.obsidian` and other dot-directories. Dot-FILES are
// kept — `.almanac-registry.json` and `.almanac-journal.json` are both dotfiles
// and both are exactly what needs migrating.
async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      await walk(p, out);
    } else if (TEXT_EXT.has(path.extname(entry.name))) {
      out.push(p);
    }
  }
  return out;
}

const files = await walk(vault);
const changed = [];
const renames = [];
const hits = new Map();

for (const f of files) {
  const before = await readFile(f, "utf8");
  let after = before;
  for (const [from, to] of RULES) {
    if (!after.includes(from)) continue;
    const n = after.split(from).length - 1;
    hits.set(from, (hits.get(from) ?? 0) + n);
    after = after.split(from).join(to);
  }
  const base = path.basename(f);
  const renameTo = FILE_RENAMES.find(([from]) => base === from)?.[1];
  if (after !== before) changed.push({ file: f, after });
  if (renameTo) renames.push({ from: f, to: path.join(path.dirname(f), renameTo) });
}

// The plugin folder itself: settings live in `.obsidian/plugins/<id>/data.json`
// and the id changed, so without this the first launch finds no data.json.
// (The plugin can recover from the vault-root mirror, but only if one exists —
// moving the folder is the direct fix and keeps the reader's data.json intact.)
const newPlugin = path.join(vault, ".obsidian/plugins/chronoanvil");
// The one previous id readers actually have. Almanac shipped through 4.84, so
// this is the only plugin folder a vault outside this machine can be carrying.
const oldPlugin = [".obsidian/plugins/ahrymx.almanac"]
  .map((p) => path.join(vault, p))
  .find((p) => existsSync(p));
const movePlugin = oldPlugin != null && !existsSync(newPlugin);
const pluginConflict = oldPlugin != null && existsSync(newPlugin);

console.log(`vault:          ${path.resolve(vault)}`);
console.log(`files scanned:  ${files.length}`);
console.log(`files to edit:  ${changed.length}`);
if (hits.size) {
  console.log("\ntokens found:");
  for (const [from, to] of RULES) {
    const n = hits.get(from) ?? 0;
    if (n) console.log(`  ${from.padEnd(30)} -> ${to.padEnd(32)} ${n}`);
  }
}
if (renames.length) {
  console.log("\nfiles to rename:");
  for (const r of renames) {
    console.log(`  ${path.relative(vault, r.from)} -> ${path.basename(r.to)}`);
  }
}
if (movePlugin) {
  console.log(
    `\nplugin folder:  ${path.basename(oldPlugin)}/ -> chronoanvil/ (data.json preserved)`
  );
}
if (pluginConflict) {
  console.log(
    `\nplugin folder:  BOTH ${path.basename(oldPlugin)}/ and chronoanvil/ exist — left alone.`
  );
  console.log(
    "                Check which data.json you want, then remove the other by hand."
  );
}

if (!write) {
  console.log("\nDry run. Nothing was written. Re-run with --write to apply.");
  process.exit(0);
}

if (backup && (changed.length || renames.length)) {
  const dest = `${path.resolve(vault)}.pre-chronoanvil-backup`;
  if (existsSync(dest)) {
    console.error(`\nbackup target already exists: ${dest}`);
    console.error("Move or remove it first, or pass --no-backup.");
    process.exit(1);
  }
  await cp(path.resolve(vault), dest, { recursive: true });
  console.log(`\nbackup:         ${dest}`);
}

for (const { file, after } of changed) await writeFile(file, after);
for (const r of renames) {
  if (existsSync(r.to)) {
    console.log(`  skipped rename, target exists: ${path.relative(vault, r.to)}`);
    continue;
  }
  await rename(r.from, r.to);
}
if (movePlugin) {
  await mkdir(path.dirname(newPlugin), { recursive: true });
  await rename(oldPlugin, newPlugin);
}

console.log(`\n${changed.length} files rewritten, ${renames.length} renamed.`);
console.log("Reload Obsidian, then run ChronoAnvil: Maintenance: set up / repair vault.");
}
