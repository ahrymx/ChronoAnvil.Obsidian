// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, normalizePath } from "obsidian";
import { basename } from "./util";
import { CANVAS_HUE } from "./canvas-builder";
import type { DEFAULT_PATHS } from "./constants";

export interface ObsidianGraphColor {
  a: number;
  rgb: number;
}

export interface ObsidianGraphColorGroup {
  query: string;
  color: ObsidianGraphColor;
}

export interface ObsidianGraphConfig {
  "collapse-filter"?: boolean;
  search?: string;
  showTags?: boolean;
  showAttachments?: boolean;
  hideUnresolved?: boolean;
  showOrphans?: boolean;
  "collapse-color-groups"?: boolean;
  colorGroups?: ObsidianGraphColorGroup[];
  [key: string]: unknown;
}

/**
 * Convert a hex color string (e.g. `#d98b34` or `d98b34`) to an RGB integer.
 */
export function hexToRgbInt(hex: string): number {
  const clean = hex.replace(/^#/, "").trim();
  const num = parseInt(clean, 16);
  return isNaN(num) ? 0 : num;
}

/**
 * Build the standard set of Obsidian Graph View color groups for an Almanac vault.
 */
export function buildAlmanacGraphGroups(
  p: typeof DEFAULT_PATHS
): ObsidianGraphColorGroup[] {
  const cleanName = (path: string) => basename(path).replace(/\.md$/i, "");
  const homeName = cleanName(p.home);
  const searchName = cleanName(p.search);
  const stagingName = cleanName(p.staging);
  const diaryRootName = cleanName(p.diaryRoot);
  const journalsRootName = cleanName(p.journalsRoot);
  const entriesPath = p.diaryEntries ?? `${p.diaryRoot}/Entries`;

  return [
    // 1. Workbenches & Hub (Amber)
    {
      query: `file:${homeName} OR file:${searchName} OR file:${stagingName}`,
      color: { a: 1, rgb: hexToRgbInt(CANVAS_HUE.amber) },
    },
    // 2. Dashboards (Coral / Red)
    {
      query: `file:"${diaryRootName}" OR file:"${journalsRootName}" OR path:"${p.diaryDashboards}"`,
      color: { a: 1, rgb: hexToRgbInt(CANVAS_HUE.red) },
    },
    // 3. Diary Entries (Emerald Green)
    {
      query: `path:"${entriesPath}"`,
      color: { a: 1, rgb: hexToRgbInt(CANVAS_HUE.green) },
    },
    // 4. Journals (Indigo Blue)
    {
      query: `path:"${p.journalsRoot}" -file:"${journalsRootName}"`,
      color: { a: 1, rgb: hexToRgbInt(CANVAS_HUE.blue) },
    },
    // 5. Logbooks (Purple)
    {
      query: `path:"${p.logbooks}"`,
      color: { a: 1, rgb: hexToRgbInt(CANVAS_HUE.purple) },
    },
    // 6. Infrastructure Machinery (Slate Grey)
    {
      query: `path:"${p.infrastructureRoot}"`,
      color: { a: 1, rgb: hexToRgbInt(CANVAS_HUE.grey) },
    },
  ];
}

const ALMANAC_QUERY_PREFIXES = [
  "file:Homepage",
  "file:Search",
  "file:Staging",
  "path:02 - Diary",
  "path:03 - Journals",
  "path:00 - Infrastructure",
  "file:02 - Diary",
  "file:03 - Journals",
];

function isAlmanacQuery(query: string, p: typeof DEFAULT_PATHS): boolean {
  if (
    query.includes(p.diaryRoot) ||
    query.includes(p.journalsRoot) ||
    query.includes(p.infrastructureRoot) ||
    query.includes(p.logbooks) ||
    query.includes(p.search) ||
    query.includes(basename(p.home)) ||
    query.includes(basename(p.search)) ||
    query.includes(basename(p.staging))
  ) {
    return true;
  }
  return ALMANAC_QUERY_PREFIXES.some((prefix) => query.includes(prefix));
}

/**
 * Merge Almanac color groups into an existing Obsidian graph configuration,
 * non-destructively preserving non-Almanac user color groups and graph view settings.
 */
export function mergeGraphConfig(
  existingRaw: string | null,
  almanacGroups: ObsidianGraphColorGroup[],
  p: typeof DEFAULT_PATHS
): string {
  let config: ObsidianGraphConfig = {};
  if (existingRaw != null && existingRaw.trim() !== "") {
    try {
      config = JSON.parse(existingRaw) as ObsidianGraphConfig;
    } catch {
      config = {};
    }
  }

  const existingGroups = Array.isArray(config.colorGroups) ? config.colorGroups : [];
  // Keep user-defined custom queries that are not Almanac queries
  const userGroups = existingGroups.filter((g) => !isAlmanacQuery(g.query, p));

  config.colorGroups = [...almanacGroups, ...userGroups];
  config["collapse-color-groups"] = false;

  return JSON.stringify(config, null, 2) + "\n";
}

/**
 * Configure or update `.obsidian/graph.json` with Almanac color groups.
 */
export async function configureGraphGroups(
  app: App,
  paths: typeof DEFAULT_PATHS
): Promise<boolean> {
  const configDir = (app.vault as unknown as { configDir?: string }).configDir ?? ".obsidian";
  const graphConfigPath = normalizePath(`${configDir}/graph.json`);
  const adapter = app.vault.adapter;

  let existingRaw: string | null = null;
  if (await adapter.exists(graphConfigPath)) {
    try {
      existingRaw = await adapter.read(graphConfigPath);
    } catch {
      existingRaw = null;
    }
  }

  const groups = buildAlmanacGraphGroups(paths);
  const updated = mergeGraphConfig(existingRaw, groups, paths);

  try {
    await adapter.write(graphConfigPath, updated);
    return true;
  } catch (e) {
    console.error("[Almanac] Failed to write graph view color groups to", graphConfigPath, e);
    return false;
  }
}
