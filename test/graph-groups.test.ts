// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import {
  hexToRgbInt,
  buildAlmanacGraphGroups,
  mergeGraphConfig,
  configureGraphGroups,
  GRAIN_GRAPH_HUES,
} from "../src/core/graph-groups";
import { DEFAULT_PATHS } from "../src/core/constants";
import { CANVAS_HUE } from "../src/core/canvas-builder";

describe("graph-groups", () => {
  describe("hexToRgbInt", () => {
    it("converts hex strings to integer values correctly", () => {
      expect(hexToRgbInt("#d98b34")).toBe(14256948);
      expect(hexToRgbInt("58a55c")).toBe(5809500);
      expect(hexToRgbInt("#4a8fd4")).toBe(4886484);
      expect(hexToRgbInt("#8b6fd1")).toBe(9138129);
      expect(hexToRgbInt("#d9534f")).toBe(14242639);
      expect(hexToRgbInt("#8a8f98")).toBe(9080728);
    });

    it("handles invalid or empty strings gracefully", () => {
      expect(hexToRgbInt("")).toBe(0);
      expect(hexToRgbInt("invalid")).toBe(0);
    });
  });

  describe("buildAlmanacGraphGroups", () => {
    it("builds the standard eleven Almanac color groups with green hierarchy", () => {
      const groups = buildAlmanacGraphGroups(DEFAULT_PATHS);
      expect(groups.length).toBe(11);

      const [
        workbenches,
        dashboards,
        yearly,
        quarterly,
        monthly,
        weekly,
        daily,
        entriesFallback,
        journals,
        logbooks,
        infra,
      ] = groups;

      expect(workbenches.query).toBe("file:Homepage OR file:Search OR file:Staging");
      expect(workbenches.color.rgb).toBe(hexToRgbInt(CANVAS_HUE.amber));

      expect(dashboards.query).toBe('file:"02 - Diary" OR file:"03 - Journals" OR path:"02 - Diary/Dashboards"');
      expect(dashboards.color.rgb).toBe(hexToRgbInt(CANVAS_HUE.red));

      // Hierarchical greens: Year brightest (#86efac) -> Day darkest (#166534)
      expect(yearly.query).toBe('path:"02 - Diary" file:Year-');
      expect(yearly.color.rgb).toBe(hexToRgbInt(GRAIN_GRAPH_HUES.yearly));

      expect(quarterly.query).toBe('path:"02 - Diary" file:Quarter-');
      expect(quarterly.color.rgb).toBe(hexToRgbInt(GRAIN_GRAPH_HUES.quarterly));

      expect(monthly.query).toBe('path:"02 - Diary" file:Month-');
      expect(monthly.color.rgb).toBe(hexToRgbInt(GRAIN_GRAPH_HUES.monthly));

      expect(weekly.query).toBe('path:"02 - Diary" file:Week-');
      expect(weekly.color.rgb).toBe(hexToRgbInt(GRAIN_GRAPH_HUES.weekly));

      expect(daily.query).toBe('path:"02 - Diary" file:Day-');
      expect(daily.color.rgb).toBe(hexToRgbInt(GRAIN_GRAPH_HUES.daily));

      expect(entriesFallback.query).toBe('path:"02 - Diary/Entries"');
      expect(entriesFallback.color.rgb).toBe(hexToRgbInt(CANVAS_HUE.green));

      expect(journals.query).toBe('path:"03 - Journals" -file:"03 - Journals"');
      expect(journals.color.rgb).toBe(hexToRgbInt(CANVAS_HUE.blue));

      expect(logbooks.query).toBe('path:"02 - Diary/Logbooks"');
      expect(logbooks.color.rgb).toBe(hexToRgbInt(CANVAS_HUE.purple));

      expect(infra.query).toBe('path:"00 - Infrastructure"');
      expect(infra.color.rgb).toBe(hexToRgbInt(CANVAS_HUE.grey));
    });

    it("adapts queries to renamed paths", () => {
      const customPaths = {
        ...DEFAULT_PATHS,
        home: "Vault/Home.md",
        search: "Vault/Find.md",
        staging: "Vault/Inbox",
        diaryRoot: "Journal",
        diaryEntries: "Journal/Entries",
        diaryDashboards: "Journal/Boards",
        journalsRoot: "Notebooks",
        logbooks: "Journal/Logs",
        infrastructureRoot: "System",
      };

      const groups = buildAlmanacGraphGroups(customPaths);
      expect(groups[0].query).toBe("file:Home OR file:Find OR file:Inbox");
      expect(groups[1].query).toBe('file:"Journal" OR file:"Notebooks" OR path:"Journal/Boards"');
      expect(groups[2].query).toBe('path:"Journal" file:Year-');
      expect(groups[3].query).toBe('path:"Journal" file:Quarter-');
      expect(groups[4].query).toBe('path:"Journal" file:Month-');
      expect(groups[5].query).toBe('path:"Journal" file:Week-');
      expect(groups[6].query).toBe('path:"Journal" file:Day-');
      expect(groups[7].query).toBe('path:"Journal/Entries"');
      expect(groups[8].query).toBe('path:"Notebooks" -file:"Notebooks"');
      expect(groups[9].query).toBe('path:"Journal/Logs"');
      expect(groups[10].query).toBe('path:"System"');
    });
  });

  describe("mergeGraphConfig", () => {
    it("creates a fresh config when raw is null", () => {
      const groups = buildAlmanacGraphGroups(DEFAULT_PATHS);
      const json = mergeGraphConfig(null, groups, DEFAULT_PATHS);
      const parsed = JSON.parse(json);

      expect(parsed.colorGroups).toEqual(groups);
      expect(parsed["collapse-color-groups"]).toBe(false);
    });

    it("preserves user settings and non-Almanac custom groups", () => {
      const existing = {
        repulseStrength: 15,
        linkDistance: 300,
        showArrow: true,
        colorGroups: [
          { query: "tag:#project", color: { a: 1, rgb: 123456 } },
          { query: 'path:"02 - Diary/Entries"', color: { a: 1, rgb: 999999 } }, // old group to update
          { query: "path:Archive", color: { a: 1, rgb: 654321 } },
        ],
      };

      const groups = buildAlmanacGraphGroups(DEFAULT_PATHS);
      const json = mergeGraphConfig(JSON.stringify(existing), groups, DEFAULT_PATHS);
      const parsed = JSON.parse(json);

      expect(parsed.repulseStrength).toBe(15);
      expect(parsed.linkDistance).toBe(300);
      expect(parsed.showArrow).toBe(true);

      // 11 fresh Almanac groups + 2 preserved user groups (#project and Archive)
      expect(parsed.colorGroups.length).toBe(13);
      expect(parsed.colorGroups.slice(0, 11)).toEqual(groups);
      expect(parsed.colorGroups[11]).toEqual({ query: "tag:#project", color: { a: 1, rgb: 123456 } });
      expect(parsed.colorGroups[12]).toEqual({ query: "path:Archive", color: { a: 1, rgb: 654321 } });
    });
  });

  describe("configureGraphGroups", () => {
    it("reads and writes graph.json via adapter", async () => {
      const storage: Record<string, string> = {
        ".obsidian/graph.json": JSON.stringify({
          repulseStrength: 20,
          colorGroups: [{ query: "tag:#reading", color: { a: 1, rgb: 111111 } }],
        }),
      };

      const mockApp = {
        vault: {
          configDir: ".obsidian",
          adapter: {
            exists: async (p: string) => p in storage,
            read: async (p: string) => storage[p],
            write: async (p: string, content: string) => {
              storage[p] = content;
            },
          },
        },
      } as any;

      const ok = await configureGraphGroups(mockApp, DEFAULT_PATHS);
      expect(ok).toBe(true);

      const parsed = JSON.parse(storage[".obsidian/graph.json"]);
      expect(parsed.repulseStrength).toBe(20);
      expect(parsed.colorGroups.length).toBe(12);
      expect(parsed.colorGroups[11]).toEqual({ query: "tag:#reading", color: { a: 1, rgb: 111111 } });
    });
  });
});
