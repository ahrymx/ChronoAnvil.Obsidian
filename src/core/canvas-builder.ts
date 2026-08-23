// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, normalizePath } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  folderNotePath,
  getFile,
  monthlyOverviewPath,
  quarterOverviewPath,
  weeklyOverviewPath,
  yearOverviewPath,
} from "./util";
import { registeredJournalTypes } from "../journals/journal";
import type { JournalType } from "../journals/journal";
import type { EventColor } from "../events/events";
import type { DEFAULT_PATHS, LogbookDef } from "./constants";

export type CanvasSide = "top" | "bottom" | "left" | "right";

export interface CanvasNode {
  id: string;
  type: "file" | "text" | "group";
  file?: string;
  text?: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: CanvasSide;
  toNode: string;
  toSide: CanvasSide;
  color?: string;
  label?: string;
  toEnd?: "arrow" | "none";
}

export interface CanvasDocument {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ── §1. ONE SPEC, ONE ENGINE, TWO ENTRY POINTS ───────────────────────────
//
// This file used to hold the map TWICE: `buildVaultCanvas` walked a live vault
// and `initialVaultCanvas` wrote the baseline for a fresh one, and the two were
// ninety per cent the same arithmetic typed out twice. Every vault path
// appeared in both, which is not a tidiness complaint — it is the mechanism by
// which the quarterly and yearly nodes pointed at files that have never
// existed:
//
//     `${p.diaryQuarterly}/04 - Quarterly.md`     what both builders said
//     `02 - Diary/Quarterly/Quarterly.md`         what the vault actually has
//
// `quarterOverviewPath()` has returned the second since 2.57 and neither
// builder called it. The bug was written down twice, and reviewed twice as if
// it had been written once — so a reader opening the map got Obsidian's
// "could not be found — Create new note / Swap file / Remove" placeholder in
// two of the five period slots.
//
// The shape below removes the opportunity rather than the instance. A surface
// is DECLARED once, with its path built from the helpers `links.ts` already
// uses for the nav tiles; the engine turns declarations into geometry; and the
// two entry points are callers of the same two functions. A path cannot be
// written wrongly twice because it is not written twice.
//
// THE SECOND THING ONE ENGINE BUYS is one coordinate system. The old Search
// group was placed at `homeX + 460` — off the HUB — while every other group was
// placed off its neighbour's WIDTH, so the two systems collided the moment a
// vault had enough daily entries to widen the diary group. That is invisible in
// an empty vault and reproducible at twelve entries, which is why the fence
// around it is `test/canvas-builder.test.ts`'s group-overlap assertion rather
// than someone's eye.

// A note the map draws, and how big its node is.
export interface SurfaceSpec {
  // STABLE, AND THAT IS THE WHOLE CONTRACT. `mergeCanvas` keys a reader's
  // chosen position on this id, so renaming one moves their node back to
  // wherever the engine would have put it. Ids derived from a journal type or a
  // logbook use that thing's OWN id — both of which are assigned once and never
  // rewritten (see `LogbookDef.id`) — rather than its name, which is a label a
  // reader retypes.
  id: string;
  path: string;
  size: SizeClass;
  // A surface a vault may legitimately not have. Absent ones are dropped before
  // layout rather than drawn as a placeholder: a map is a statement about what
  // IS here, and Obsidian's missing-file node is a statement about what a
  // plugin expected. The prototype had no way to say this, which is half of
  // why it drew two of them.
  optional?: boolean;
  // Overrides the branch hue for this one node. Only logbooks use it, so that
  // the map and the time grid mean the same thing by "the teal one".
  hue?: EventColor;
}

// The whole map: the one node that is not part of any branch, and the branches.
//
// THE HUB IS A FIELD RATHER THAN A ONE-MEMBER BRANCH, because a branch draws a
// group box and a box around the homepage would be a label saying "Homepage"
// over a node that already says so. It is a field rather than a module scalar
// for the reason this file exists at all: state set by one function and read by
// another is how the two old builders drifted.
export interface VaultSpec {
  home: string;
  branches: BranchSpec[];
}

// A group box: one spine, its members, and what they are called.
export interface BranchSpec {
  id: string;
  label: string;
  hue: EventColor;
  // The note the trunk edge from the hub lands on.
  spine: SurfaceSpec;
  members: SurfaceSpec[];
  // Which band the branch sits in (0 = beside the hub, 1 = below it) and where
  // in that band, left to right. Declared rather than computed because the
  // arrangement is a design decision about what belongs beside what, and a
  // packer that inferred it would be inventing one.
  band: 0 | 1;
  col: number;
  // Ids to join in sequence with a labelled edge. The one relationship on this
  // map that a box around four nodes cannot express — see §4.
  chain?: string[];
  chainLabel?: string;
}

// ── §2. FOUR SIZE CLASSES ────────────────────────────────────────────────
//
// The prototype drew every node at a flat 320×180 and embedded a whole note in
// it. A diary dashboard is a banner, a month calendar, a period summary, an
// open-tasks list and a rollup; at 180px a reader sees the title bar and one
// pill of the first of those. The node was not too small for the LAYOUT, it was
// too small for its CONTENTS, and nothing in the old file distinguished those.
//
// Four classes rather than a number per surface, because twelve magic numbers
// are twelve things a later reader cannot check. Each of these carries the
// reason it is that big, and a correction is one edit here.
export type SizeClass = "hub" | "board" | "panel" | "table";

export const SIZE: Record<SizeClass, { w: number; h: number }> = {
  // A month calendar and its banner have to fit, or the node is a title bar.
  hub: { w: 560, h: 720 },
  // A period summary plus the one list under it, unclipped.
  board: { w: 460, h: 600 },
  // One widget. A logbook's own viewport has been capped at 440px since 4.65,
  // so a taller node would draw its own empty space.
  panel: { w: 380, h: 480 },
  // Wide and short: a table wants columns, not height. The only wide node here.
  table: { w: 940, h: 360 },
};

// ── §3. THE PALETTE ──────────────────────────────────────────────────────
//
// The prototype coloured nodes "1", "2", "4", "5", "6" — Obsidian's preset
// slots, which are a palette this plugin has no relationship with. The map's
// blue and the time grid's blue were unrelated facts about the same vault.
//
// Canvas `color` also takes a hex string, so this maps the EVENT COLOUR NAMES —
// the vocabulary a logbook and an event already use — onto the hexes
// `styles/00-tokens.css` defines as `--am-ev-*`.
//
// IT IS A SECOND COPY AND THERE IS NO WAY AROUND IT: canvas JSON is not styled
// by our stylesheet and cannot read a custom property. So it gets the guard
// this project already uses for exactly this shape — `test/canvas-palette.test.ts`
// parses the token file and fails on drift, the same mechanism
// `test/tokens.test.ts` uses to keep a reference and a definition together.
export const CANVAS_HUE: Record<EventColor, string> = {
  red: "#d9534f",
  amber: "#d98b34",
  green: "#58a55c",
  teal: "#3fa3a3",
  blue: "#4a8fd4",
  purple: "#8b6fd1",
  pink: "#cc6699",
  grey: "#8a8f98",
};

// The hub's own colour, named once. Amber because it is the one node that is
// not a branch, and every branch hue is therefore free to mean a branch.
const HUB_HUE: EventColor = "amber";
const HUB_ID = "node-home";

// Layout constants. GAP separates nodes, PAD insets a group from its contents,
// BRANCH_GAP separates two group boxes, BAND_GAP separates the two rows of
// branches.
const GAP = 48;
const PAD = 48;
const BRANCH_GAP = 72;
const BAND_GAP = 120;

// ── §4. THE SPEC ─────────────────────────────────────────────────────────
//
// GROUPED BY ROLE, NOT BY FOLDER, which is what the prototype already did
// without saying so: `Search.md` lives under `02 - Diary/` and was drawn in a
// group of its own. Stating the rule lets `Diary.base` sit where it belongs —
// its role is "read every entry as a table", and `links.ts` already files
// `base` beside `search` and `all` in the tile vocabulary.
//
// COVERAGE IS THE OTHER HALF. The prototype represented two of the vault's four
// roots: nothing stood for `00 - Infrastructure` or `01 - Material`, and
// `Events.md` — a whole workbench since 4.62 — was absent. A map missing half
// the vault is not a map.
//
// AND IT SHOWS STRUCTURE, NEVER INSTANCES. The old builder pinned
// `filesUnder(diaryDaily).slice(0, 12)` to the canvas: the twelve
// ALPHABETICALLY first daily notes, which is the twelve oldest days in the
// vault, on a diagram that is stale by morning. The instances already have a
// calendar, a timeline and a `.base` table. The same rule one level in stops
// the journals branch at one node per registered type — a type's own dashboard
// draws its level cards, so listing its subjects here would be the same mistake
// with a different folder. This is the call 4.58 made when widgets stopped at
// dashboards.
export function vaultSpec(
  p: typeof DEFAULT_PATHS,
  types: readonly JournalType[],
  books: readonly LogbookDef[]
): VaultSpec {
  const s = (
    id: string,
    path: string,
    size: SizeClass,
    extra: Partial<SurfaceSpec> = {}
  ): SurfaceSpec => ({ id, path: normalizePath(path), size, ...extra });

  return {
    home: normalizePath(p.home),
    branches: [
      {
        id: "infra",
        label: "⚙️ Infrastructure & material",
        hue: "grey",
        band: 0,
        col: 0,
        // Both optional: a vault whose reader deleted the shipped README, or who
        // has never captured anything, should show a smaller map rather than two
        // apologies.
        spine: s("node-docs", `${p.documentation}/README.md`, "panel", {
          optional: true,
        }),
        members: [
          s("node-staging", `${p.staging}/Staging.md`, "panel", { optional: true }),
        ],
      },
      {
        id: "find",
        label: "🔎 Find & retrieve",
        hue: "green",
        band: 0,
        col: 2,
        spine: s("node-search", p.search, "board"),
        members: [
          // OPTIONAL, because `Events.md` is written only when
        // `settings.eventsEnabled` — see `Scaffold.plan`. The baseline canvas
        // carries it (the setting ships on, and scaffolding writes both files
        // in the same pass); a vault that turns events off loses the node the
        // next time the map is rebuilt, rather than keeping a placeholder,
        // which is the whole reason this flag exists.
        s("node-events", p.events, "board", { optional: true }),
          s("node-base", `${p.infrastructureRoot}/Diary.base`, "table", {
            optional: true,
          }),
        ],
      },
      {
        id: "diary",
        label: "📆 The diary",
        hue: "blue",
        band: 1,
        col: 0,
        spine: s("node-diary", folderNotePath(p.diaryRoot), "hub"),
        // THE FOUR OVERVIEW HELPERS, NOT FOUR PATH LITERALS. This is the line the
        // whole of §1 is about; see `test/canvas-builder.test.ts`, which asserts
        // these nodes carry exactly what the helpers return.
        members: [
          s("node-weekly", weeklyOverviewPath(p), "board"),
          s("node-monthly", monthlyOverviewPath(p), "board"),
          s("node-quarterly", quarterOverviewPath(p), "board"),
          s("node-yearly", yearOverviewPath(p), "board"),
        ],
        // WHAT THE BOX CANNOT SAY. A group around four period dashboards says
        // they are the diary's; it cannot say a week rolls up into a month into a
        // quarter into a year, which is the actual relationship between them and
        // the reason there are four rather than one.
        chain: ["node-weekly", "node-monthly", "node-quarterly", "node-yearly"],
        chainLabel: "rolls up",
      },
      {
        id: "journals",
        label: "📚 Journals",
        hue: "purple",
        band: 1,
        col: 1,
        spine: s("node-journals", folderNotePath(p.journalsRoot), "board"),
        members: types.map((t) =>
          // KEYED ON THE TYPE'S ID, which is stable across a rename; the folder
          // is not. A reader who renames Study to Studies and re-runs the command
          // keeps the node where they put it.
          s(`node-journal-${t.id}`, folderNotePath(`${p.journalsRoot}/${t.name}`), "board")
        ),
      },
      {
        id: "logbooks",
        label: "🗒 Logbooks",
        hue: "teal",
        band: 1,
        col: 2,
        spine: s("node-logbooks", folderNotePath(p.logbooks), "board"),
        // FROM THE REGISTRY, NOT FROM A FOLDER SCAN. The prototype used
        // `filesUnder(p.logbooks)`, which finds any stray note a reader dropped in
        // the folder and misses a registered logbook whose note has not been
        // written yet — so the map disagreed with the settings tab in both
        // directions. `LogbookDef` carries the path, and it carries the colour.
        members: books.map((b) =>
          s(`node-logbook-${b.id}`, b.path, "panel", { hue: hueOfBook(b) })
        ),
      },
    ],
  };
}

// A logbook's registered colour, narrowed to the palette. A hand-edited
// data.json can hold anything; `parseLogbooks` already validates on read, and
// this is the second belt because an unknown name here would emit `undefined`
// into the canvas JSON rather than a colour.
function hueOfBook(b: LogbookDef): EventColor {
  return (b.color in CANVAS_HUE ? b.color : "grey") as EventColor;
}

// Drop the optional surfaces this vault does not have. Runs BEFORE layout, so
// an absent note costs no space rather than leaving a hole where it would have
// been — which is what makes the map a statement about this vault.
export function pruneSpec(
  spec: VaultSpec,
  exists: (path: string) => boolean
): VaultSpec {
  const keep = (x: SurfaceSpec): boolean => !x.optional || exists(x.path);
  const out: BranchSpec[] = [];
  for (const b of spec.branches) {
    const members = b.members.filter(keep);
    if (!keep(b.spine)) {
      // A branch whose SPINE is gone but which still has members promotes the
      // first member rather than vanishing — the alternative is losing the
      // Staging node because the README was deleted, which are unrelated facts.
      if (!members.length) continue;
      const [spine, ...rest] = members;
      out.push({ ...b, spine, members: rest });
      continue;
    }
    out.push({ ...b, members });
  }
  return { ...spec, branches: out };
}

// ── §5. THE ENGINE ───────────────────────────────────────────────────────
//
// One `bounds()` where the old file had eight copies of
// `Math.max(...nodes.map((n) => n.x + n.width)) + GROUP_PAD` — four per builder.
// Eight copies of one expression is eight chances to write `y` where `x` was
// meant, and the expression is the one thing in a layout that must be right.
function bounds(rects: { x: number; y: number; w: number; h: number }[]): {
  w: number;
  h: number;
} {
  return {
    w: Math.max(...rects.map((r) => r.x + r.w)),
    h: Math.max(...rects.map((r) => r.y + r.h)),
  };
}

interface Placed extends SurfaceSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Pack one branch at its own origin: the spine on the left, its members flowing
// two-up to the right of it and wrapping. A `table` takes a row of its own,
// aligned under the spine, because a 940-wide node beside a 460-wide one is not
// a column of anything.
function packBranch(b: BranchSpec): { nodes: Placed[]; w: number; h: number } {
  const nodes: Placed[] = [];
  const sp = SIZE[b.spine.size];
  nodes.push({ ...b.spine, x: PAD, y: PAD, w: sp.w, h: sp.h });

  const colX = PAD + sp.w + GAP;
  const PER_ROW = 2;
  let cx = colX;
  let cy = PAD;
  let rowH = 0;
  let col = 0;

  for (const m of b.members) {
    const d = SIZE[m.size];
    if (m.size === "table") {
      // BELOW EVERYTHING PLACED SO FAR, INCLUDING THE SPINE. An earlier cut
      // advanced by the current row's height, which is zero when the table is
      // the FIRST member — so it landed on top of the spine. That is only
      // reachable when an optional member ahead of it has been pruned away
      // (`node-events` off, `node-base` promoted to first), which is exactly
      // the case no one would think to look at: pinned by
      // "drops an optional surface the vault does not have".
      const below = bounds(nodes).h + GAP;
      nodes.push({ ...m, x: PAD, y: below, w: d.w, h: d.h });
      cy = below + d.h + GAP;
      cx = colX;
      col = 0;
      rowH = 0;
      continue;
    }
    nodes.push({ ...m, x: cx, y: cy, w: d.w, h: d.h });
    rowH = Math.max(rowH, d.h);
    col++;
    if (col === PER_ROW) {
      col = 0;
      cx = colX;
      cy += rowH + GAP;
      rowH = 0;
    } else {
      cx += d.w + GAP;
    }
  }

  const { w, h } = bounds(nodes);
  return { nodes, w: w + PAD, h: h + PAD };
}

// Which sides two nodes should be joined on, from where they actually sit. Used
// for the rollup chain, whose third hop wraps down and left and would otherwise
// need its sides hand-written per member count.
function sidesBetween(a: Placed, b: Placed): [CanvasSide, CanvasSide] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

// Turn a spec into a canvas document.
export function layOut(spec: VaultSpec): CanvasDocument {
  const packed = spec.branches.map((b) => ({ b, ...packBranch(b) }));
  const inBand = (n: 0 | 1): typeof packed =>
    packed.filter((p) => p.b.band === n).sort((x, y) => x.b.col - y.b.col);

  const origin = new Map<string, { x: number; y: number }>();

  // Band 1 — the content trees — sets the overall width, because it is the
  // widest thing on the map and everything above it is aligned to it.
  const lower = inBand(1);
  let x = 0;
  for (const p of lower) {
    origin.set(p.b.id, { x, y: 0 });
    x += p.w + BRANCH_GAP;
  }
  const totalW = Math.max(x - BRANCH_GAP, SIZE.hub.w);

  // Band 0 — the hub with a branch to either side of it, pinned to band 1's
  // outer edges. ONE COORDINATE SYSTEM: the hub is placed FROM the total width
  // rather than the width being placed from the hub, which is the inversion the
  // old Search group got wrong.
  const upper = inBand(0);
  let upperH = SIZE.hub.h;
  for (const p of upper) {
    const left = p.b.col < 1;
    origin.set(p.b.id, { x: left ? 0 : totalW - p.w, y: 0 });
    upperH = Math.max(upperH, p.h);
  }
  const band1Y = upperH + BAND_GAP;
  for (const p of lower) origin.get(p.b.id)!.y = band1Y;

  const hubX = Math.round((totalW - SIZE.hub.w) / 2);

  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  let edgeCounter = 0;
  const addEdge = (
    fromNode: string,
    fromSide: CanvasSide,
    toNode: string,
    toSide: CanvasSide,
    color: string,
    label?: string,
    toEnd: "arrow" | "none" = "arrow"
  ): void => {
    edges.push({
      id: `edge-${++edgeCounter}`,
      fromNode,
      fromSide,
      toNode,
      toSide,
      color,
      ...(label ? { label } : {}),
      toEnd,
    });
  };

  nodes.push({
    id: HUB_ID,
    type: "file",
    file: normalizePath(spec.home),
    x: hubX,
    y: 0,
    width: SIZE.hub.w,
    height: SIZE.hub.h,
    color: CANVAS_HUE[HUB_HUE],
  });

  for (const p of packed) {
    const at = origin.get(p.b.id)!;
    const hue = CANVAS_HUE[p.b.hue];

    // The group box comes first so it sits behind its contents.
    nodes.push({
      id: `group-${p.b.id}`,
      type: "group",
      label: p.b.label,
      x: at.x,
      y: at.y,
      width: p.w,
      height: p.h,
      color: hue,
    });

    const placed = new Map<string, Placed>();
    for (const n of p.nodes) {
      const abs = { ...n, x: n.x + at.x, y: n.y + at.y };
      placed.set(n.id, abs);
      nodes.push({
        id: n.id,
        type: "file",
        file: n.path,
        x: abs.x,
        y: abs.y,
        width: abs.w,
        height: abs.h,
        color: n.hue ? CANVAS_HUE[n.hue] : hue,
      });
    }

    // ── §6. EDGES CARRY MEANING, NOT MEMBERSHIP ──────────────────────────
    //
    // The prototype drew an arrow from every branch root to every one of its
    // members: twenty-eight edges, all of them saying "is inside", which is
    // what the group box around them already says. The one relationship that
    // was NOT drawable as a box — the period rollup — was drawn identically to
    // the twenty-seven that were, so the map's only real information was
    // camouflaged by its decoration.
    //
    // What is left: one trunk edge per branch, and the chain.
    const down = p.b.band === 1;
    const left = p.b.col < 1;
    addEdge(
      HUB_ID,
      down ? "bottom" : left ? "left" : "right",
      p.b.spine.id,
      down ? "top" : left ? "right" : "left",
      hue
    );

    if (p.b.chain) {
      for (let i = 0; i < p.b.chain.length - 1; i++) {
        const a = placed.get(p.b.chain[i]);
        const c = placed.get(p.b.chain[i + 1]);
        if (!a || !c) continue;
        const [fs, ts] = sidesBetween(a, c);
        // The label rides the middle hop only. On every hop it would be three
        // repetitions of one fact; on the first it reads as being about the
        // first pair rather than the sequence.
        addEdge(a.id, fs, c.id, ts, hue, i === 1 ? p.b.chainLabel : undefined);
      }
    }
  }

  return { nodes, edges };
}

// ── §7. THE TWO ENTRY POINTS ─────────────────────────────────────────────

// The baseline map, for a vault being scaffolded.
//
// TAKES THE TYPES AND THE BOOKS, which `shippedNotes` already has in hand. The
// old baseline drew a bare four-node stub because it had no App to scan with —
// but a fresh vault's journals and logbooks are not discovered, they are the
// ones scaffolding is about to WRITE. Passing them means the baseline and the
// live map are the same map, and there is no longer a second arrangement to
// keep in step.
export function initialVaultCanvas(
  p: typeof DEFAULT_PATHS,
  types: readonly JournalType[] = [],
  books: readonly LogbookDef[] = []
): CanvasDocument {
  // Nothing exists yet, so an optional surface is judged by whether scaffolding
  // is going to write it — which for all three of them it is.
  return layOut(pruneSpec(vaultSpec(p, types, books), () => true));
}

// The live map, for a vault that exists.
//
// NOT `async`, as of this rewrite. It never awaited anything; the keyword made
// every caller await a value that was already computed, and it made
// `test/canvas-builder.test.ts`'s empty-vault case assert that a Promise is
// defined rather than that a canvas is.
export function buildVaultCanvas(
  app: App,
  plugin: AlmanacPlugin
): CanvasDocument {
  const p = plugin.settings.paths;
  const spec = vaultSpec(
    p,
    registeredJournalTypes(plugin),
    plugin.settings.logbooks ?? []
  );
  return layOut(pruneSpec(spec, (path) => getFile(app, path) != null));
}

// ── §8. REGENERATION KEEPS WHAT THE READER MOVED ─────────────────────────
//
// `generateVaultCanvas` used to be `vault.modify(existing, rebuilt)`: ten
// minutes of arranging a map, gone to one command, with no ask and no way back.
// Every other destructive path in this plugin asks first — `refreshTemplates`
// names the files it would overwrite and stops.
//
// Asking is the wrong shape here, though, because the answer is always "yes,
// but keep my layout": the plugin owns what a node MEANS (which file, which
// colour, which group) and the reader owns where it SITS. So this merges rather
// than prompting, on four rules, one per id case:
//
//   KNOWN AND ON DISK   keep the disk geometry, take the rebuilt meaning
//   KNOWN AND NEW       place it, below everything already on the canvas
//   ON DISK, RETIRED    drop it — the plugin put it there and no longer would
//   UNKNOWN             leave it exactly alone
//
// THE LAST RULE IS THE ONE THAT MATTERS. Because an id the plugin has never
// heard of is never touched, a reader can add their own nodes to the generated
// map and keep them — which is the difference between a file you regenerate and
// a file you own. Every id this builder emits is prefixed `node-` or `group-`,
// and nothing here relies on that: the test is membership of the rebuilt set,
// not the shape of the string.
//
// Edges are always rebuilt. They carry no reader state — position is the only
// thing a person adjusts on a canvas, and an edge has none.
export function mergeCanvas(
  disk: CanvasDocument | null,
  rebuilt: CanvasDocument
): { doc: CanvasDocument; kept: number; placed: number; foreign: number } {
  if (!disk || !Array.isArray(disk.nodes)) {
    return {
      doc: rebuilt,
      kept: 0,
      placed: rebuilt.nodes.length,
      foreign: 0,
    };
  }

  const onDisk = new Map<string, CanvasNode>();
  for (const n of disk.nodes) {
    if (n && typeof n.id === "string") onDisk.set(n.id, n);
  }
  const rebuiltIds = new Set(rebuilt.nodes.map((n) => n.id));

  // Where a node the reader has never seen should go: below everything the
  // canvas currently holds, so it cannot land on top of their arrangement. One
  // row, left to right, in the order the engine emitted them.
  const extent = disk.nodes.reduce(
    (acc, n) => Math.max(acc, (n?.y ?? 0) + (n?.height ?? 0)),
    0
  );
  let newX = 0;
  let kept = 0;
  let placed = 0;

  const nodes: CanvasNode[] = [];
  for (const node of rebuilt.nodes) {
    const prior = onDisk.get(node.id);
    if (prior && typeof prior.x === "number" && typeof prior.y === "number") {
      kept++;
      nodes.push({
        ...node,
        x: prior.x,
        y: prior.y,
        // Width and height are the reader's too — a node they stretched to read
        // a longer table stays stretched. Falling back to the rebuilt size
        // rather than trusting the file, because a hand-edited canvas may hold
        // anything.
        width: typeof prior.width === "number" ? prior.width : node.width,
        height: typeof prior.height === "number" ? prior.height : node.height,
      });
      continue;
    }
    placed++;
    nodes.push({ ...node, x: newX, y: extent + BAND_GAP });
    newX += node.width + GAP;
  }

  const foreign = disk.nodes.filter((n) => n && !rebuiltIds.has(n.id));
  return {
    doc: { nodes: [...nodes, ...foreign], edges: rebuilt.edges },
    kept,
    placed,
    foreign: foreign.length,
  };
}
