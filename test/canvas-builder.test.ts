// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// The vault map, and the properties that keep it a map.
//
// WHAT THIS SUITE IS FOR. 4.68 rewrote `canvas-builder.ts` because the
// prototype drew two nodes pointing at files that have never existed — and it
// drew them because the map was built twice, by two functions that each typed
// out every vault path. So most of what follows is not about a canvas; it is
// about the properties that make that class of bug impossible to write again:
// a path is a helper's return value rather than a literal, and a layout is one
// coordinate system rather than two that happen to agree in an empty vault.
//
// THE OLD EMPTY-VAULT TEST IS THE CAUTIONARY ONE. It read:
//
//     const doc = buildVaultCanvas(app, plugin);   // async — returns a Promise
//     expect(doc).toBeDefined();
//
// which asserts that a Promise exists. It passed whether the builder returned a
// canvas, returned nothing, or rejected. `RESUME.md` records the same shape as
// the 4.16 test that "quietly stopped testing"; this file's version awaits
// nothing because the builder is no longer async, and asserts on contents.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVaultCanvas,
  initialVaultCanvas,
  layOut,
  mergeCanvas,
  pruneSpec,
  vaultSpec,
  SIZE,
  CANVAS_HUE,
  type CanvasDocument,
  type CanvasNode,
  type VaultSpec,
} from "../src/core/canvas-builder";
import { DEFAULT_PATHS, DEFAULT_LOGBOOKS } from "../src/core/constants";
import type AlmanacPlugin from "../src/main";
import { TFile, normalizePath } from "obsidian";
import { STUDY_PRESET, buildJournalType } from "../src/journals/journal";
import { shippedNotes } from "../src/core/scaffold";
import { CLASS_DEFS } from "../src/trackers/trackers";
import {
  folderNotePath,
  quarterOverviewPath,
  yearOverviewPath,
  weeklyOverviewPath,
  monthlyOverviewPath,
} from "../src/core/util";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";
import { composeJournalsDashboardNote } from "../src/journals/journals-dashboard-sections";
import { composeJournalDashboardNote } from "../src/journals/journal-dashboard-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { eventsNoteTemplate } from "../src/events/eventstore";

const STUDY = buildJournalType(STUDY_PRESET.config);

function mockApp(files: { path: string }[] = []) {
  const tfiles = files.map((f) => {
    const tf = new TFile();
    tf.path = f.path;
    return tf;
  });
  return {
    vault: {
      getMarkdownFiles: () => tfiles,
      getAbstractFileByPath: (p: string) => tfiles.find((f) => f.path === p) ?? null,
    },
    metadataCache: { getFileCache: () => null },
  } as any;
}

function mockPlugin() {
  return {
    settings: {
      paths: { ...DEFAULT_PATHS },
      customJournals: [STUDY_PRESET.config],
      logbooks: DEFAULT_LOGBOOKS.map((b) => ({ ...b })),
    },
  } as unknown as AlmanacPlugin;
}

const spec = () => vaultSpec(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS);

const full = () => layOut(pruneSpec(spec(), () => true));

// A MAP THAT IS NOT THE VAULT'S MAP, and that is the point.
//
// 4.81 shrank the shipped spec to four cards, which left the engine's members,
// its two-up wrap, its full-width table row, its labelled chain and its
// promote-a-member pruning rule with no user in the real map. None of those are
// dead code — they are the contract `layOut` and `pruneSpec` are written to,
// and the next surface that earns a node will lean on them — so they are pinned
// here against a spec declared in the test rather than against whatever §4
// happens to declare this month. The two are separate questions: what the vault
// map SHOWS is §1 and §4's business, what the engine CAN show is this.
const RICH: VaultSpec = {
  home: "Homepage.md",
  branches: [
    {
      id: "beside",
      label: "Beside",
      hue: "green",
      band: 0,
      col: 0,
      spine: { id: "n-beside", path: "Beside/Beside.md", size: "board" },
      members: [],
    },
    {
      id: "trees",
      label: "Trees",
      hue: "blue",
      band: 1,
      col: 0,
      spine: { id: "n-trunk", path: "Trees/Trees.md", size: "hub" },
      members: [
        { id: "n-a", path: "Trees/A.md", size: "panel" },
        { id: "n-b", path: "Trees/B.md", size: "panel" },
        { id: "n-c", path: "Trees/C.md", size: "panel" },
        { id: "n-table", path: "Trees/Table.md", size: "table" },
      ],
      chain: ["n-a", "n-b", "n-c"],
      chainLabel: "rolls up",
    },
    {
      // The promotion case: an optional spine over an optional member.
      id: "docs",
      label: "Docs",
      hue: "grey",
      band: 1,
      col: 1,
      spine: { id: "n-readme", path: "Docs/README.md", size: "panel", optional: true },
      members: [{ id: "n-staging", path: "Docs/Staging.md", size: "panel", optional: true }],
    },
    {
      // The table-first case: prune the optional panel ahead of it and the
      // table becomes the first member placed.
      id: "sheets",
      label: "Sheets",
      hue: "pink",
      band: 1,
      col: 2,
      spine: { id: "n-sheets", path: "Sheets/Sheets.md", size: "board" },
      members: [
        { id: "n-maybe", path: "Sheets/Maybe.md", size: "panel", optional: true },
        { id: "n-grid", path: "Sheets/Grid.md", size: "table" },
      ],
    },
  ],
};

const rich = () => layOut(pruneSpec(RICH, () => true));

const files = (doc: CanvasDocument): CanvasNode[] =>
  doc.nodes.filter((n) => n.type === "file");
const groups = (doc: CanvasDocument): CanvasNode[] =>
  doc.nodes.filter((n) => n.type === "group");
const byId = (doc: CanvasDocument, id: string): CanvasNode | undefined =>
  doc.nodes.find((n) => n.id === id);

const overlaps = (a: CanvasNode, b: CanvasNode): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const pairs = <T,>(xs: T[]): [T, T][] => {
  const out: [T, T][] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  }
  return out;
};

// ── §1. Paths are helpers' return values, not literals ────────────────────

describe("canvas-builder · paths", () => {
  it("points the cards at the helpers, not at literals", () => {
    const doc = full();
    expect(byId(doc, "node-docs")?.file).toBe(
      normalizePath(`${DEFAULT_PATHS.documentation}/README.md`)
    );
    expect(byId(doc, "node-base")?.file).toBe(
      normalizePath(`${DEFAULT_PATHS.infrastructureRoot}/Diary.base`)
    );
    expect(byId(doc, "node-tpl-daily")?.file).toBe(
      normalizePath(`${DEFAULT_PATHS.templatesDiary}/${CLASS_DEFS.daily.templateFile}`)
    );
  });

  // Period dashboards and user-facing roots are not on the infrastructure canvas
  it("no longer draws the four period dashboards", () => {
    const drawn = new Set(files(full()).map((n) => n.file));
    for (const path of [
      weeklyOverviewPath(DEFAULT_PATHS),
      monthlyOverviewPath(DEFAULT_PATHS),
      quarterOverviewPath(DEFAULT_PATHS),
      yearOverviewPath(DEFAULT_PATHS),
    ]) {
      expect(drawn.has(path), path).toBe(false);
    }
  });

  it("no longer names the two files that never existed", () => {
    const json = JSON.stringify(full());
    expect(json).not.toContain("04 - Quarterly.md");
    expect(json).not.toContain("05 - Yearly.md");
  });

  // THE GATE THAT MAKES IT UNREPEATABLE. Every surface the map draws in a
  // DEFAULT vault must be a note this plugin actually writes — or be declared
  // optional, which is the honest way to say "may not be here". A new node
  // pointing anywhere else fails here rather than in a screenshot.
  it("draws only surfaces the scaffold writes, or ones declared optional", () => {
    const written = new Set(shippedNotes(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS).map((n) => n.dest));
    const s = spec();
    const surfaces = s.branches.flatMap((b) => [b.spine, ...b.members]);
    expect(surfaces.length).toBe(6);
    const orphans = surfaces
      .filter((x) => !x.optional && !written.has(x.path))
      .map((x) => `${x.id} -> ${x.path}`);
    expect(orphans).toEqual([]);
    expect(written.has(s.home)).toBe(true);
  });
});

// ── §2. One coordinate system ─────────────────────────────────────────────

describe("canvas-builder · layout", () => {
  // DEFECT 11's FENCE. The old Search group was placed off the hub while every
  // other group was placed off its neighbour's width, so the two systems
  // collided as soon as the diary had ~12 daily entries — invisible in an empty
  // vault, which is why this asserts on a POPULATED one.
  // ON BOTH MAPS. The shipped one has no group box left to collide with
  // anything, so testing it alone would assert the emptiness rather than the
  // arithmetic; the fixture is the populated vault this fence was built for.
  it("never overlaps two groups", () => {
    for (const doc of [full(), rich()]) {
      const clashes = pairs(groups(doc))
        .filter(([a, b]) => overlaps(a, b))
        .map(([a, b]) => `${a.id} × ${b.id}`);
      expect(clashes).toEqual([]);
    }
  });

  it("never overlaps two file nodes", () => {
    for (const doc of [full(), rich()]) {
      const clashes = pairs(files(doc))
        .filter(([a, b]) => overlaps(a, b))
        .map(([a, b]) => `${a.id} × ${b.id}`);
      expect(clashes).toEqual([]);
    }
  });

  // The hub is not inside any branch, so nothing else places it — which is
  it("never overlaps the hub with a group", () => {
    for (const doc of [full(), rich()]) {
      const hub = byId(doc, "node-docs") || byId(doc, "node-home")!;
      expect(groups(doc).filter((g) => overlaps(g, hub)).map((g) => g.id)).toEqual([]);
    }
  });

  // A BOX IS A LABEL FOR A SET, so a set of one gets none.
  it("draws a group box only around a branch that has members", () => {
    expect(groups(full()).map((g) => g.id)).toEqual(["group-templates"]);
    expect(groups(rich()).map((g) => g.id).sort()).toEqual([
      "group-docs",
      "group-sheets",
      "group-trees",
    ]);
  });

  it("keeps every node inside its own group's bounds", () => {
    const doc = rich();
    const escaped: string[] = [];
    for (const g of groups(doc)) {
      for (const n of files(doc)) {
        // A node belongs to the group it starts inside; the check is that it
        // also ENDS inside.
        const startsIn = n.x >= g.x && n.y >= g.y && n.x < g.x + g.width && n.y < g.y + g.height;
        if (!startsIn) continue;
        if (n.x + n.width > g.x + g.width || n.y + n.height > g.y + g.height) {
          escaped.push(`${n.id} escapes ${g.id}`);
        }
      }
    }
    expect(escaped).toEqual([]);
  });

  it("sizes every node from the four classes", () => {
    const allowed = new Set(Object.values(SIZE).map((s) => `${s.w}x${s.h}`));
    const odd = files(full())
      .map((n) => ({ id: n.id, dim: `${n.width}x${n.height}` }))
      .filter((n) => !allowed.has(n.dim));
    expect(odd).toEqual([]);
  });

  it("gives the database table and template panels standard dimensions", () => {
    const base = byId(full(), "node-base")!;
    expect(base.width).toBe(SIZE.table.w);
    const tpl = byId(full(), "node-tpl-daily")!;
    expect(tpl.width).toBe(SIZE.panel.w);
  });
});

// ── §3. Edges carry meaning, not membership ───────────────────────────────

describe("canvas-builder · edges", () => {
  it("draws exactly one trunk edge per branch, all from the hub", () => {
    const doc = full();
    const s = pruneSpec(spec(), () => true);
    expect(s.branches).toHaveLength(2);
    const trunks = doc.edges.filter((e) => e.fromNode === "node-docs");
    expect(trunks).toHaveLength(s.branches.length);
    expect(trunks.map((e) => e.toNode).sort()).toEqual(
      s.branches.map((b) => b.spine.id).sort()
    );
  });

  it("draws no membership edges — the group box says that", () => {
    expect(full().edges).toHaveLength(2);

    const doc = rich();
    const spines = new Set(RICH.branches.map((b) => b.spine.id));
    const membership = doc.edges.filter(
      (e) => e.fromNode !== "node-home" && spines.has(e.fromNode)
    );
    expect(membership).toEqual([]);
    expect(doc.edges).toHaveLength(RICH.branches.length + 2);
  });

  it("labels a chain, which is the one thing a box cannot say", () => {
    // The diary's period rollup was this map's chain until 4.81 moved the four
    // dashboards off it. The engine's side of that arrangement is unchanged and
    // still tested: consecutive hops, sides worked out from where the nodes
    // actually sit, and the label on the middle hop only — on every hop it is
    // one fact three times, on the first it reads as being about the first pair
    // rather than the sequence.
    const chain = rich().edges.filter((e) => e.fromNode !== "node-docs");
    expect(chain.map((e) => [e.fromNode, e.toNode])).toEqual([
      ["n-a", "n-b"],
      ["n-b", "n-c"],
    ]);
    expect(chain.filter((e) => e.label === "rolls up")).toHaveLength(1);
    // Sides are derived, not declared: A and B sit side by side in the same row.
    expect([chain[0].fromSide, chain[0].toSide]).toEqual(["right", "left"]);
  });

  it("never draws an edge from a node to itself", () => {
    for (const doc of [full(), rich()]) {
      expect(doc.edges.filter((e) => e.fromNode === e.toNode)).toEqual([]);
    }
  });

  it("gives every edge two nodes that exist", () => {
    for (const doc of [full(), rich()]) {
      const ids = new Set(doc.nodes.map((n) => n.id));
      const dangling = doc.edges
        .filter((e) => !ids.has(e.fromNode) || !ids.has(e.toNode))
        .map((e) => e.id);
      expect(dangling).toEqual([]);
    }
  });

  // A chain hop whose node was pruned is skipped rather than dangling — the
  // case the shipped map used to reach when an optional period node was absent.
  it("skips a chain hop whose node the vault does not have", () => {
    const doc = layOut(
      pruneSpec(
        {
          ...RICH,
          branches: RICH.branches.map((b) =>
            b.id === "trees"
              ? { ...b, members: b.members.map((m) => (m.id === "n-b" ? { ...m, optional: true } : m)) }
              : b
          ),
        },
        (path) => path !== "Trees/B.md"
      )
    );
    const ids = new Set(doc.nodes.map((n) => n.id));
    expect(ids.has("n-b")).toBe(false);
    expect(doc.edges.filter((e) => !ids.has(e.fromNode) || !ids.has(e.toNode))).toEqual([]);
  });
});

// ── §4. What the map draws, and what it refuses to ────────────────────────

describe("canvas-builder · content", () => {
  // WHAT REPLACED "COVERS ALL FOUR VAULT ROOTS", AND WHY (4.81).
  //
  // That test held 4.62's line — *"a map missing half the vault is not a map"* —
  // and on the canvas it was right. What it did not account for is that a
  // canvas file card IS a link: the map was also the most connected note in the
  // graph, a fifteen-spoke star of mostly-unresolved nodes sitting in the middle
  // of a picture whose subject is structure. The two surfaces also disagreed —
  // the map drew `Weekly` beside `Search` beside `Staging` as peers, the hidden
  // links say a dashboard is inside the diary — and the map was the one saying
  // it wrong.
  //
  it("draws the infrastructure documentation hub, database table, and templates, detached from user facing notes", () => {
    expect(files(full()).map((n) => n.file).sort()).toEqual(
      [
        normalizePath(`${DEFAULT_PATHS.documentation}/README.md`),
        normalizePath(`${DEFAULT_PATHS.infrastructureRoot}/Diary.base`),
        normalizePath(`${DEFAULT_PATHS.templatesDiary}/${CLASS_DEFS.daily.templateFile}`),
        normalizePath(`${DEFAULT_PATHS.templatesDiary}/${CLASS_DEFS.weekly.templateFile}`),
        normalizePath(`${DEFAULT_PATHS.templatesDiary}/${CLASS_DEFS.monthly.templateFile}`),
        normalizePath(`${DEFAULT_PATHS.templatesDiary}/${CLASS_DEFS.quarterly.templateFile}`),
        normalizePath(`${DEFAULT_PATHS.templatesDiary}/${CLASS_DEFS.yearly.templateFile}`),
      ].sort()
    );
    const drawn = new Set(files(full()).map((n) => n.file));
    expect(drawn.has(DEFAULT_PATHS.home)).toBe(false);
    expect(drawn.has(folderNotePath(DEFAULT_PATHS.diaryRoot))).toBe(false);
    expect(drawn.has(folderNotePath(DEFAULT_PATHS.journalsRoot))).toBe(false);
    expect(drawn.has(folderNotePath(DEFAULT_PATHS.logbooks))).toBe(false);
    expect(drawn.has(DEFAULT_PATHS.search)).toBe(false);
    expect(drawn.has(`${DEFAULT_PATHS.staging}/Staging.md`)).toBe(false);
  });

  // DEFECT 4. `filesUnder(diaryDaily).slice(0, 12)` pinned the twelve
  // alphabetically-first daily notes — the twelve OLDEST days — to a structural
  // diagram. A map shows structure; the instances have a calendar.
  it("pins no dated entries, however many the vault has", () => {
    const app = mockApp([
      ...Array.from({ length: 40 }, (_, i) => ({
        path: `02 - Diary/Daily/Day-2026-01-${String((i % 28) + 1).padStart(2, "0")}.md`,
      })),
      { path: "02 - Diary/02 - Diary.md" },
      { path: "03 - Journals/Study/01 - Courses/Math.md" },
    ]);
    const doc = buildVaultCanvas(app, mockPlugin());
    expect(JSON.stringify(doc)).not.toMatch(/Day-2026-01-\d\d/);
    expect(JSON.stringify(doc)).not.toContain("Math.md");
  });

  it("colours every node from the plugin's palette, never an Obsidian preset", () => {
    const hexes = new Set(Object.values(CANVAS_HUE));
    for (const doc of [full(), rich()]) {
      const odd = doc.nodes
        .filter((n) => !n.color || !hexes.has(n.color))
        .map((n) => `${n.id}=${n.color}`);
      expect(odd).toEqual([]);
    }
  });

  // The per-node hue override outlived the logbook panels that were its only
  // caller, and it is what makes the map and the time grid mean the same thing
  // by "the teal one". Kept covered so the branch hue cannot quietly win.
  it("lets a surface override its branch hue", () => {
    const tinted: VaultSpec = {
      ...RICH,
      branches: RICH.branches.map((b) =>
        b.id === "trees"
          ? { ...b, members: b.members.map((m) => (m.id === "n-a" ? { ...m, hue: "teal" as const } : m)) }
          : b
      ),
    };
    const doc = layOut(pruneSpec(tinted, () => true));
    expect(byId(doc, "n-a")?.color).toBe(CANVAS_HUE.teal);
    expect(byId(doc, "n-b")?.color).toBe(CANVAS_HUE.blue);
  });
});

// ── §5. Optional surfaces, and the empty vault ────────────────────────────

describe("canvas-builder · pruning", () => {
  it("promotes a member when a branch loses only its spine", () => {
    // On the fixture, because the shipped map has no branch with a member left
    // to promote. The case is a README that is optional AND a spine, over a
    // Staging note that is optional and is not: losing the README must not take
    // Staging with it, since those are unrelated facts about the vault.
    const doc = layOut(pruneSpec(RICH, (path) => path !== "Docs/README.md"));
    expect(byId(doc, "n-readme")).toBeUndefined();
    const staging = byId(doc, "n-staging");
    expect(staging).toBeDefined();
    // Promoted to the spine, so the trunk edge lands on it rather than nowhere.
    expect(doc.edges.some((e) => e.fromNode === "node-docs" && e.toNode === "n-staging")).toBe(true);
    // ...and a promoted lone member is no longer a set, so its box goes too.
    expect(byId(doc, "group-docs")).toBeUndefined();
  });

  it("drops a branch that loses its spine and has no members", () => {
    const doc = layOut(pruneSpec(RICH, (path) => !path.startsWith("Docs/")));
    expect(byId(doc, "n-readme")).toBeUndefined();
    expect(byId(doc, "n-staging")).toBeUndefined();
    expect(doc.edges.filter((e) => e.fromNode === "node-docs")).toHaveLength(3);
  });

  // THE CASE NO ONE WOULD THINK TO LOOK AT. A table takes a row of its own,
  // placed below everything so far; an earlier cut advanced by the current
  // row's height, which is zero when the table is the FIRST member — so it
  // landed on top of the spine. Only reachable once an optional member ahead of
  // it has been pruned away.
  it("places a table that pruning made the first member clear of the spine", () => {
    const doc = layOut(pruneSpec(RICH, (path) => path !== "Sheets/Maybe.md"));
    expect(byId(doc, "n-maybe")).toBeUndefined();
    const grid = byId(doc, "n-grid")!;
    const spine = byId(doc, "n-sheets")!;
    expect(overlaps(grid, spine)).toBe(false);
    expect(grid.y).toBeGreaterThanOrEqual(spine.y + spine.height);
  });

  it("builds a canvas for an empty vault without throwing", () => {
    // Replaces the test that awaited nothing and asserted a Promise existed.
    const app = mockApp([]);
    const plugin = {
      settings: { paths: { ...DEFAULT_PATHS }, customJournals: [], logbooks: [] },
    } as unknown as AlmanacPlugin;

    let doc: CanvasDocument | null = null;
    expect(() => {
      doc = buildVaultCanvas(app, plugin);
    }).not.toThrow();

    expect(doc!.nodes.length).toBeGreaterThan(0);
    expect(byId(doc!, "node-docs")).toBeDefined();
    // No `-Infinity` leaking out of a bounds() over an empty list.
    for (const n of doc!.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.width) && Number.isFinite(n.height)).toBe(true);
    }
  });

  it("serialises to JSON and back without loss", () => {
    const doc = full();
    const parsed = JSON.parse(JSON.stringify(doc));
    expect(parsed.nodes).toHaveLength(doc.nodes.length);
    expect(parsed.edges).toHaveLength(doc.edges.length);
  });
});

// ── §6. The baseline and the live map are one map ─────────────────────────

describe("canvas-builder · entry points", () => {
  it("gives the baseline and the live map the same shape", () => {
    // The property the rewrite exists for: two entry points, one arrangement.
    // A vault holding everything the scaffold writes, PLUS the events note,
    // which `Scaffold.plan` writes separately — so nothing is pruned and the
    // two maps have to agree down to the pixel.
    const app = mockApp([
      ...shippedNotes(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS).map((n) => ({ path: n.dest })),
      { path: DEFAULT_PATHS.events },
    ]);
    const live = buildVaultCanvas(app, mockPlugin());
    const baseline = initialVaultCanvas(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS);
    const shape = (d: CanvasDocument) =>
      d.nodes.map((n) => `${n.id}@${n.x},${n.y} ${n.width}x${n.height}`).sort();
    expect(shape(live)).toEqual(shape(baseline));
    expect(live.edges).toEqual(baseline.edges);
  });

  it("registers Almanac.canvas in shippedNotes for automatic vault setup", () => {
    const shipped = shippedNotes(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS);
    const canvasNote = shipped.find(
      (n) => n.dest === `${DEFAULT_PATHS.infrastructureRoot}/Almanac.canvas`
    );
    expect(canvasNote).toBeDefined();
    const parsed = JSON.parse(canvasNote?.content ?? "{}");
    // 7 file nodes + 1 group node = 8 nodes, and 2 trunk edges
    expect(parsed.nodes).toHaveLength(8);
    expect(parsed.edges).toHaveLength(2);
  });
});

// ── §7. Regeneration keeps what the reader moved ──────────────────────────

describe("canvas-builder · mergeCanvas", () => {
  const rebuilt = (): CanvasDocument => full();

  const moved = (doc: CanvasDocument, id: string, x: number, y: number): CanvasDocument => ({
    nodes: doc.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    edges: doc.edges,
  });

  it("keeps the geometry of a node the reader moved", () => {
    const disk = moved(rebuilt(), "node-base", 1200, 90);
    const { doc, kept } = mergeCanvas(disk, rebuilt());
    const n = byId(doc, "node-base")!;
    expect([n.x, n.y]).toEqual([1200, 90]);
    expect(kept).toBeGreaterThan(1);
  });

  it("keeps a size the reader stretched", () => {
    const disk: CanvasDocument = {
      nodes: rebuilt().nodes.map((n) =>
        n.id === "node-tpl-daily" ? { ...n, width: 1600, height: 900 } : n
      ),
      edges: [],
    };
    const n = byId(mergeCanvas(disk, rebuilt()).doc, "node-tpl-daily")!;
    expect([n.width, n.height]).toEqual([1600, 900]);
  });

  it("takes the rebuilt meaning even for a node it keeps in place", () => {
    // Position is the reader's; which file the node opens is the plugin's.
    const disk: CanvasDocument = {
      nodes: rebuilt().nodes.map((n) =>
        n.id === "node-base" ? { ...n, x: 5, y: 5, file: "00 - Infrastructure/Old.base" } : n
      ),
      edges: [],
    };
    const n = byId(mergeCanvas(disk, rebuilt()).doc, "node-base")!;
    expect([n.x, n.y]).toEqual([5, 5]);
    expect(n.file).toBe(`${DEFAULT_PATHS.infrastructureRoot}/Diary.base`);
  });

  it("places a node the canvas has never held, clear of everything on it", () => {
    const disk: CanvasDocument = {
      nodes: rebuilt().nodes.filter((n) => n.id !== "node-base"),
      edges: [],
    };
    const { doc, placed } = mergeCanvas(disk, rebuilt());
    expect(placed).toBe(1);
    const fresh = byId(doc, "node-base")!;
    const below = disk.nodes.every((n) => fresh.y >= n.y + n.height);
    expect(below).toBe(true);
  });

  it("drops an id the plugin no longer emits", () => {
    const disk: CanvasDocument = {
      nodes: [...rebuilt().nodes, { id: "node-daily-7", type: "file", file: "x.md", x: 0, y: 0, width: 320, height: 180 }],
      edges: [],
    };
    // A retired id is one the PLUGIN put there — prefixed like the rest — so it
    // is dropped rather than treated as the reader's own.
    const { doc } = mergeCanvas(disk, rebuilt());
    expect(byId(doc, "node-daily-7")).toBeUndefined();
  });

  // THE RULE THAT MAKES THE FILE SAFE TO WORK IN.
  it("never touches a node the reader added themselves", () => {
    const mine: CanvasNode = {
      id: "my-own-note",
      type: "file",
      file: "Notes/Thinking.md",
      x: -400,
      y: -200,
      width: 400,
      height: 300,
      color: "#ff00ff",
    };
    const disk: CanvasDocument = { nodes: [...rebuilt().nodes, mine], edges: [] };
    const { doc, foreign } = mergeCanvas(disk, rebuilt());
    expect(foreign).toBe(1);
    expect(byId(doc, "my-own-note")).toEqual(mine);
  });

  it("rebuilds edges rather than merging them", () => {
    const disk: CanvasDocument = { nodes: rebuilt().nodes, edges: [] };
    expect(mergeCanvas(disk, rebuilt()).doc.edges).toHaveLength(2);
  });

  it("degrades to a full rebuild when the file on disk is not a canvas", () => {
    for (const junk of [null, { nodes: "not an array" } as unknown as CanvasDocument]) {
      const { doc, kept, placed } = mergeCanvas(junk as CanvasDocument | null, rebuilt());
      expect(kept).toBe(0);
      expect(placed).toBe(doc.nodes.length);
      expect(byId(doc, "node-docs")).toBeDefined();
    }
  });
});

// ── §8. The graph links the map does not draw ─────────────────────────────
//
// The canvas and the hidden `almanac-graph` wikilinks are two answers to one
// question — how does a reader see the vault's shape — and until 4.68 they gave
// the same answer twice. A canvas file node IS a link, so a map pointing at
// eighteen surfaces is an eighteen-spoke star in the graph; every composed note
// ALSO named `Homepage`, which is a second star over nearly the same set. The
// graph had two hubs on top of each other and neither said anything the other
// did not.
//
// So the two now divide the work: the canvas draws the star, and these links
// draw the DEPTH — entry inside grain inside diary — which is the one thing a
// group box cannot express. That is what this section pins.

describe("almanac-graph links", () => {
  // Every name inside an `almanac-graph` block, per note the scaffold writes.
  const graphLinks = (text: string): string[] => {
    const m = /%% almanac-graph %%\n(.*)/.exec(text);
    return m
      ? [...m[1].matchAll(/\[\[([^\]|]+)\|/g)].map((x) => x[1])
      : [];
  };
  // COMPOSED NOTES AND COPIED ONES, WHICH THE GATE BELOW USED TO SEE HALF OF.
  // A shipped note is either composed (a `content` string, right here in the
  // process) or copied from a file in `assets/`, and only the first half was
  // ever read — so a stale name inside `staging.md` or the documentation README
  // was invisible to the anti-phantom test that exists to catch exactly that.
  // 4.81 gave both of those files a hidden parent link, which is what made the
  // hole worth closing rather than noting.
  const assetText = (name: string): string =>
    readFileSync(join(__dirname, "..", "assets", name), "utf8");
  const written = () =>
    shippedNotes(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS).flatMap((n) => {
      const text =
        typeof n.content === "string"
          ? n.content
          : typeof n.asset === "string" && n.asset.endsWith(".md")
            ? assetText(n.asset)
            : null;
      return text === null ? [] : [{ dest: n.dest, links: graphLinks(text) }];
    });

  it("still embeds hidden zero-width links in the composed notes", () => {
    const linked = written().filter((n) => n.links.length);
    // Not a threshold for its own sake: the dashboards, the search note, the
    // five entry templates and the logbooks all carry them, and a refactor that
    // silently stopped emitting any would otherwise pass everything below by
    // having nothing left to check.
    expect(linked.length).toBeGreaterThan(10);
    for (const n of linked) {
      expect(n.links.every((l) => l.length > 0), n.dest).toBe(true);
    }
  });

  // ── THE ANTI-PHANTOM GATE ───────────────────────────────────────────────
  //
  // An unresolved wikilink is NOT inert: Obsidian's graph draws a node for it.
  // So a stale literal here does not fail quietly, it invents notes the vault
  // does not have — and five of them survived for eleven releases.
  // `02 - Weekly`, `03 - Monthly`, `04 - Quarterly` and `05 - Yearly` are the
  // folder names the diary had before 2.57; `06 - Logbooks` never named
  // anything at all. Every vault's graph carried all five.
  //
  // The same gate as §1's "draws only surfaces the scaffold writes", pointed at
  // the other mechanism — because it was the same class of bug, a literal
  // standing in for a name the vault owns, and fixing it in one place would
  // have left the other to be found by screenshot again.
  it("names only notes the scaffold actually writes", () => {
    const names = new Set(
      shippedNotes(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS)
        .map((n) => n.dest)
        .filter((d) => d.endsWith(".md"))
        // Obsidian resolves `[[Name]]` by basename, which is how a folder note
        // deep in the tree is nameable at all.
        .map((d) => d.slice(d.lastIndexOf("/") + 1, -3))
    );
    const phantoms = written()
      .flatMap((n) => n.links.map((l) => ({ from: n.dest, l })))
      .filter((x) => !names.has(x.l))
      .map((x) => `${x.from} -> [[${x.l}]]`);
    expect(phantoms).toEqual([]);
  });

  // ── ONE HUB, NOT TWO ────────────────────────────────────────────────────
  //
  // Five notes name the homepage, and they are the ones that genuinely hang off
  // it. Everything else names its own parent. Asserted as an exact list rather
  // than a count, so that a note reaching for the middle has to be a decision
  // someone writes down here.
  //
  // THE THREE WERE FIVE AS OF 4.81. Staging and the documentation README were
  // on the vault map and nowhere else, and when §4 shrank the map to four cards
  // they became loose dots in the graph — a note with no hidden link has no
  // edges. Neither sits inside the diary or the journals, so the homepage IS
  // their parent; this is not the old spoke-to-the-middle star returning, which
  // was every composed note naming it regardless of where it lived.
  //
  // WRITTEN INTO THE ASSETS, so an existing vault's copies stay loose until
  // they are re-created: repair converges directive lines in those two files,
  // it does not overwrite them.
  it("leaves the homepage with four children, not thirty", () => {
    const namesHome = written()
      .filter((n) => n.links.includes("Homepage"))
      .map((n) => n.dest)
      .sort();
    expect(namesHome).toEqual(
      [
        folderNotePath(DEFAULT_PATHS.diaryRoot),
        folderNotePath(DEFAULT_PATHS.journalsRoot),
        DEFAULT_PATHS.search,
        `${DEFAULT_PATHS.staging}/Staging.md`,
      ].sort()
    );
  });

  // The events note is not in `shippedNotes` — `Scaffold.plan` writes it
  // separately, because it is conditional — so it gets its own hop. It sits
  // beside the entries it decorates and names the diary, and the name comes
  // from the root the caller passes rather than the literal `02 - Diary`: a
  // reader who renames the folder renames the note this has to resolve to, and
  // an unresolved name is a phantom node rather than a missing edge.
  it("hangs the events note off the diary, by the root's own name", () => {
    expect(graphLinks(eventsNoteTemplate(DEFAULT_PATHS.diaryRoot))).toEqual(["02 - Diary"]);
    expect(graphLinks(eventsNoteTemplate("Journal/My days"))).toEqual(["My days"]);
  });

  // Depth is the thing the star could not express and the canvas cannot either:
  // a dashboard is inside the diary, which is inside home. Templates carry no
  // graph links so they do not pollute the overviews in the graph.
  it("links each note to its parent, one hop at a time", () => {
    const linksOf = (text: string) => graphLinks(text);
    // Templates carry no hidden graph links (entries receive them upon creation)
    expect(linksOf(composeEntryTemplate("weekly"))).toEqual([]);
    expect(linksOf(composeEntryTemplate("monthly"))).toEqual([]);
    expect(linksOf(composeEntryTemplate("quarterly"))).toEqual([]);
    expect(linksOf(composeEntryTemplate("yearly"))).toEqual([]);
    expect(linksOf(composeEntryTemplate("daily"))).toEqual([]);
    // ...and the grain dashboards hang off the diary, which hangs off home.
    expect(linksOf(composeDiaryDashboard("weekly"))).toEqual(["02 - Diary"]);
    expect(linksOf(composeDiaryDashboard("monthly"))).toEqual(["02 - Diary"]);
    expect(linksOf(composeDiaryDashboard("quarterly"))).toEqual(["02 - Diary"]);
    expect(linksOf(composeDiaryDashboard("yearly"))).toEqual(["02 - Diary"]);
    expect(linksOf(composeDiaryDashboardNote())).toEqual(["Homepage"]);
    expect(linksOf(composeJournalsDashboardNote())).toEqual(["Homepage"]);
    expect(linksOf(composeSearchNote())).toEqual(["Homepage"]);
    // ...and named journal dashboards start their own tree, detached from 03 - Journals
    expect(linksOf(composeJournalDashboardNote(STUDY))).toEqual([]);
  });
});
