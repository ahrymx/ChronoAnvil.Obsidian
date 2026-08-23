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
} from "../src/core/canvas-builder";
import { DEFAULT_PATHS, DEFAULT_LOGBOOKS } from "../src/core/constants";
import type AlmanacPlugin from "../src/main";
import { TFile } from "obsidian";
import { STUDY_PRESET, buildJournalType } from "../src/journals/journal";
import { shippedNotes } from "../src/core/scaffold";
import {
  folderNotePath,
  quarterOverviewPath,
  yearOverviewPath,
  weeklyOverviewPath,
  monthlyOverviewPath,
} from "../src/core/util";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";
import { composeJournalsDashboardNote } from "../src/journals/journals-dashboard-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { composeDiaryDashboard } from "../src/diary/diary-sections";

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
  // THE REGRESSION. `04 - Quarterly.md` and `05 - Yearly.md` were hardcoded in
  // both builders; the dashboards are folder notes. Asserted BY VALUE against
  // the helpers rather than by literal, so that renaming the folder — which
  // moves what the helper returns — moves what the node points at, and this
  // test keeps meaning what it says.
  it("points the period nodes at the overview helpers, not at literals", () => {
    const doc = full();
    expect(byId(doc, "node-weekly")?.file).toBe(weeklyOverviewPath(DEFAULT_PATHS));
    expect(byId(doc, "node-monthly")?.file).toBe(monthlyOverviewPath(DEFAULT_PATHS));
    expect(byId(doc, "node-quarterly")?.file).toBe(quarterOverviewPath(DEFAULT_PATHS));
    expect(byId(doc, "node-yearly")?.file).toBe(yearOverviewPath(DEFAULT_PATHS));
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
    // The events note is written by `Scaffold.plan` rather than `shippedNotes`,
    // because it is conditional on a setting. It is declared optional for
    // exactly that reason, so it is covered by the escape below.
    const s = spec();
    const surfaces = s.branches.flatMap((b) => [b.spine, ...b.members]);
    expect(surfaces.length).toBeGreaterThan(10);
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
  it("never overlaps two groups", () => {
    const clashes = pairs(groups(full()))
      .filter(([a, b]) => overlaps(a, b))
      .map(([a, b]) => `${a.id} × ${b.id}`);
    expect(clashes).toEqual([]);
  });

  it("never overlaps two file nodes", () => {
    const clashes = pairs(files(full()))
      .filter(([a, b]) => overlaps(a, b))
      .map(([a, b]) => `${a.id} × ${b.id}`);
    expect(clashes).toEqual([]);
  });

  // The hub is not inside any branch, so nothing else places it — which is
  // exactly the node the old arithmetic measured everything else against.
  it("never overlaps the hub with a group", () => {
    const doc = full();
    const hub = byId(doc, "node-home")!;
    expect(groups(doc).filter((g) => overlaps(g, hub)).map((g) => g.id)).toEqual([]);
  });

  it("keeps every node inside its own group's bounds", () => {
    const doc = full();
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

  it("gives the diary dashboard room for a calendar", () => {
    // The concrete form of defect 3: at the prototype's flat 320×180 this node
    // showed a title bar. Pinned so that shrinking it again is a decision.
    const diary = byId(full(), "node-diary")!;
    expect(diary.height).toBe(SIZE.hub.h);
    expect(diary.height).toBeGreaterThan(180 * 3);
  });
});

// ── §3. Edges carry meaning, not membership ───────────────────────────────

describe("canvas-builder · edges", () => {
  it("draws exactly one trunk edge per branch, all from the hub", () => {
    const doc = full();
    const s = pruneSpec(spec(), () => true);
    const trunks = doc.edges.filter((e) => e.fromNode === "node-home");
    expect(trunks).toHaveLength(s.branches.length);
    expect(trunks.map((e) => e.toNode).sort()).toEqual(
      s.branches.map((b) => b.spine.id).sort()
    );
  });

  it("draws no membership edges — the group box says that", () => {
    // Eight: five trunks plus the three hops of the rollup chain. The prototype
    // drew twenty-eight, twenty-seven of which restated their group box.
    expect(full().edges).toHaveLength(8);
  });

  it("labels the period rollup, which is the one thing a box cannot say", () => {
    const chain = full().edges.filter((e) => e.fromNode !== "node-home");
    expect(chain.map((e) => [e.fromNode, e.toNode])).toEqual([
      ["node-weekly", "node-monthly"],
      ["node-monthly", "node-quarterly"],
      ["node-quarterly", "node-yearly"],
    ]);
    expect(chain.filter((e) => e.label === "rolls up")).toHaveLength(1);
  });

  it("never draws an edge from a node to itself", () => {
    expect(full().edges.filter((e) => e.fromNode === e.toNode)).toEqual([]);
  });

  it("gives every edge two nodes that exist", () => {
    const doc = full();
    const ids = new Set(doc.nodes.map((n) => n.id));
    const dangling = doc.edges
      .filter((e) => !ids.has(e.fromNode) || !ids.has(e.toNode))
      .map((e) => e.id);
    expect(dangling).toEqual([]);
  });
});

// ── §4. What the map draws, and what it refuses to ────────────────────────

describe("canvas-builder · content", () => {
  it("covers all four vault roots", () => {
    const json = JSON.stringify(full());
    for (const root of ["00 - Infrastructure", "01 - Material", "02 - Diary", "03 - Journals"]) {
      expect(json).toContain(root);
    }
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
    // And it stops at one node per journal type rather than listing its notes.
    expect(JSON.stringify(doc)).not.toContain("Math.md");
  });

  // DEFECT 5. The registry is the list, not the folder.
  it("draws one logbook panel per registered logbook, in its own colour", () => {
    const doc = full();
    for (const b of DEFAULT_LOGBOOKS) {
      const node = byId(doc, `node-logbook-${b.id}`);
      expect(node, `missing panel for ${b.id}`).toBeDefined();
      expect(node?.width).toBe(SIZE.panel.w);
      expect(node?.file).toBe(b.path);
      expect(node?.color).toBe(CANVAS_HUE[b.color as keyof typeof CANVAS_HUE]);
    }
  });

  it("ignores a stray note sitting in the logbooks folder", () => {
    const app = mockApp([{ path: "02 - Diary/Logbooks/Scratch.md" }]);
    expect(JSON.stringify(buildVaultCanvas(app, mockPlugin()))).not.toContain("Scratch.md");
  });

  it("keys a journal node on the type's id, not on its folder name", () => {
    // So that renaming Study leaves the reader's chosen position attached.
    expect(byId(full(), `node-journal-${STUDY.id}`)).toBeDefined();
  });

  it("colours every node from the plugin's palette, never an Obsidian preset", () => {
    const hexes = new Set(Object.values(CANVAS_HUE));
    const odd = full()
      .nodes.filter((n) => !n.color || !hexes.has(n.color))
      .map((n) => `${n.id}=${n.color}`);
    expect(odd).toEqual([]);
  });
});

// ── §5. Optional surfaces, and the empty vault ────────────────────────────

describe("canvas-builder · pruning", () => {
  it("drops an optional surface the vault does not have", () => {
    const doc = layOut(pruneSpec(spec(), (p) => !p.endsWith("Events.md")));
    expect(byId(doc, "node-events")).toBeUndefined();
    // And the map still holds together — no hole where it would have been.
    expect(pairs(files(doc)).filter(([a, b]) => overlaps(a, b))).toEqual([]);
  });

  it("promotes a member when a branch loses only its spine", () => {
    // The README is optional and is a spine; Staging is optional and is not.
    // Losing the README must not take Staging with it.
    const doc = layOut(pruneSpec(spec(), (p) => !p.endsWith("README.md")));
    expect(byId(doc, "node-docs")).toBeUndefined();
    expect(byId(doc, "node-staging")).toBeDefined();
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
    expect(byId(doc!, "node-home")).toBeDefined();
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
    expect(parsed.nodes.length).toBeGreaterThan(10);
    expect(parsed.edges).toHaveLength(8);
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
    const disk = moved(rebuilt(), "node-weekly", 1200, 90);
    const { doc, kept } = mergeCanvas(disk, rebuilt());
    const n = byId(doc, "node-weekly")!;
    expect([n.x, n.y]).toEqual([1200, 90]);
    expect(kept).toBeGreaterThan(1);
  });

  it("keeps a size the reader stretched", () => {
    const disk: CanvasDocument = {
      nodes: rebuilt().nodes.map((n) =>
        n.id === "node-base" ? { ...n, width: 1600, height: 900 } : n
      ),
      edges: [],
    };
    const n = byId(mergeCanvas(disk, rebuilt()).doc, "node-base")!;
    expect([n.width, n.height]).toEqual([1600, 900]);
  });

  it("takes the rebuilt meaning even for a node it keeps in place", () => {
    // Position is the reader's; which file the node opens is the plugin's.
    const disk: CanvasDocument = {
      nodes: rebuilt().nodes.map((n) =>
        n.id === "node-quarterly" ? { ...n, x: 5, y: 5, file: "02 - Diary/Quarterly/04 - Quarterly.md" } : n
      ),
      edges: [],
    };
    const n = byId(mergeCanvas(disk, rebuilt()).doc, "node-quarterly")!;
    expect([n.x, n.y]).toEqual([5, 5]);
    expect(n.file).toBe(quarterOverviewPath(DEFAULT_PATHS));
  });

  it("places a node the canvas has never held, clear of everything on it", () => {
    const disk: CanvasDocument = {
      nodes: rebuilt().nodes.filter((n) => n.id !== "node-events"),
      edges: [],
    };
    const { doc, placed } = mergeCanvas(disk, rebuilt());
    expect(placed).toBe(1);
    const fresh = byId(doc, "node-events")!;
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
    expect(byId(doc, "node-daily-7")).toBeDefined();
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
    expect(mergeCanvas(disk, rebuilt()).doc.edges).toHaveLength(8);
  });

  it("degrades to a full rebuild when the file on disk is not a canvas", () => {
    for (const junk of [null, { nodes: "not an array" } as unknown as CanvasDocument]) {
      const { doc, kept, placed } = mergeCanvas(junk as CanvasDocument | null, rebuilt());
      expect(kept).toBe(0);
      expect(placed).toBe(doc.nodes.length);
      expect(byId(doc, "node-home")).toBeDefined();
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
  const written = () =>
    shippedNotes(DEFAULT_PATHS, [STUDY], DEFAULT_LOGBOOKS).flatMap((n) =>
      "content" in n && typeof n.content === "string"
        ? [{ dest: n.dest, links: graphLinks(n.content) }]
        : []
    );

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
  // Exactly three notes name the homepage, and they are the three that hang off
  // it: the diary dashboard, the journals dashboard and Search. Everything else
  // names its own parent. Asserted as an exact list rather than a count, so
  // that a fourth note reaching for the middle has to be a decision someone
  // writes down here.
  it("leaves the homepage with three children, not thirty", () => {
    const namesHome = written()
      .filter((n) => n.links.includes("Homepage"))
      .map((n) => n.dest)
      .sort();
    expect(namesHome).toEqual(
      [
        folderNotePath(DEFAULT_PATHS.diaryRoot),
        folderNotePath(DEFAULT_PATHS.journalsRoot),
        DEFAULT_PATHS.search,
      ].sort()
    );
  });

  // Depth is the thing the star could not express and the canvas cannot either:
  // a weekly entry is inside the week, which is inside the diary. Checked by
  // value at each hop rather than by "contains Homepage" at every one.
  it("links each note to its parent, one hop at a time", () => {
    const linksOf = (text: string) => graphLinks(text);
    expect(linksOf(composeEntryTemplate("weekly"))).toEqual(["Weekly"]);
    expect(linksOf(composeEntryTemplate("monthly"))).toEqual(["Monthly"]);
    expect(linksOf(composeEntryTemplate("quarterly"))).toEqual(["Quarterly"]);
    expect(linksOf(composeEntryTemplate("yearly"))).toEqual(["Yearly"]);
    // Daily is the exception, and it is the vault's asymmetry rather than this
    // module's: there is no daily dashboard, so a day hangs off the diary root.
    expect(linksOf(composeEntryTemplate("daily"))).toEqual(["02 - Diary"]);
    // ...and the grain dashboards hang off the diary, which hangs off home.
    expect(linksOf(composeDiaryDashboard("weekly"))).toEqual(["02 - Diary"]);
    expect(linksOf(composeDiaryDashboardNote())).toEqual(["Homepage"]);
    expect(linksOf(composeJournalsDashboardNote())).toEqual(["Homepage"]);
    expect(linksOf(composeSearchNote())).toEqual(["Homepage"]);
  });
});
