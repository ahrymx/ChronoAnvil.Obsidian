// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect, beforeEach } from "vitest";
import { TFile, TFolder } from "obsidian";
import { JournalImporter } from "../src/journals/journal-import";
import {
  encodeJournalManifest,
  manifestPathFor,
} from "../src/journals/journal-manifest";
import { parseFrontmatter } from "../src/journals/journal-infer";
import { buildJournalType, journalTemplateFiles } from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import { DEFAULT_PATHS } from "../src/core/constants";
import type ChronoAnvilPlugin from "../src/main";
import { presetAsNewJournal } from "../src/journals/custom-journal";
import { STUDY_PRESET } from "../src/journals/journal";

// ── A vault, in memory ────────────────────────────────────────────────────
//
// Enough of one for the discovery path: markdown files by path, folders by
// path, a metadata cache for the free "does this look like a journal" gate,
// and an adapter for the dotfile the vault API refuses to see. Built here
// rather than mocked per test because the thing under test is the WIRING —
// which folders get read, what gets written back, what lands in settings — and
// a mock per call would test the mock.
class FakeVault {
  files = new Map<string, string>();
  // The dotfile store. Separate from `files` on purpose: this is exactly the
  // split in the real API, where a dot-prefixed path is invisible to
  // getMarkdownFiles/getAbstractFileByPath and reachable only via the adapter.
  hidden = new Map<string, string>();
  // Every cachedRead, so a test can assert that startup did NOT read notes.
  reads: string[] = [];

  adapter = {
    exists: async (path: string): Promise<boolean> =>
      this.hidden.has(path) ||
      this.files.has(path) ||
      this.folderPaths().has(path),
    read: async (path: string): Promise<string> => {
      const value = this.hidden.get(path);
      if (value == null) throw new Error(`ENOENT ${path}`);
      return value;
    },
    write: async (path: string, data: string): Promise<void> => {
      this.hidden.set(path, data);
    },
  };

  add(path: string, content: string): void {
    this.files.set(path, content);
  }

  private folderPaths(): Set<string> {
    const out = new Set<string>();
    for (const path of this.files.keys()) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        out.add(parts.slice(0, i).join("/"));
      }
    }
    return out;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.keys()]
      .filter((p) => p.endsWith(".md"))
      .map((p) => new TFile(p));
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    if (this.files.has(path)) return new TFile(path);
    if (!this.folderPaths().has(path)) return null;
    const folder = new TFolder(path);
    const children = new Set<string>();
    for (const p of this.files.keys()) {
      if (!p.startsWith(`${path}/`)) continue;
      children.add(p.slice(path.length + 1).split("/")[0]);
    }
    folder.children = [...children].map((name) => {
      const childPath = `${path}/${name}`;
      return this.files.has(childPath)
        ? new TFile(childPath)
        : this.getAbstractFileByPath(childPath)!;
    });
    return folder;
  }

  async cachedRead(file: TFile): Promise<string> {
    const value = this.files.get(file.path);
    if (value == null) throw new Error(`ENOENT ${file.path}`);
    this.reads.push(file.path);
    return value;
  }
}

const COOKING: JournalConfig = {
  id: "cooking",
  name: "Cooking",
  emoji: "🍳",
  root: "03 - Journals/Cooking",
  templatesFolder: "00 - Infrastructure/Templates/Cooking",
  levels: [
    { id: "cuisine", noun: "Cuisine", fallbackEmoji: "📚" },
    { id: "dish", noun: "Dish", fallbackEmoji: "📂" },
  ],
  kinds: [
    { id: "recipe", emoji: "📋", label: "Recipe", rating: "difficulty", pages: true },
    { id: "attempt", emoji: "🔥", label: "Attempt", rating: "difficulty" },
  ],
};

function populate(vault: FakeVault, cfg = COOKING): void {
  for (const tpl of journalTemplateFiles(buildJournalType(cfg))) {
    vault.add(`${cfg.templatesFolder}/${tpl.name}`, tpl.content);
  }
  const r = cfg.root;
  vault.add(`${r}/Italian/Italian.md`, "---\ntype: cuisine\nstatus: in-progress\n---\n");
  vault.add(`${r}/Japanese/Japanese.md`, "---\ntype: cuisine\nstatus: in-progress\n---\n");
  vault.add(
    `${r}/Italian/Pasta/Pasta.md`,
    "---\ntype: dish\ncuisine: Italian\nstatus: in-progress\n---\n"
  );
  vault.add(
    `${r}/Italian/Pasta/Carbonara.md`,
    "---\ntype: recipe\ncuisine: Italian\ndish: Pasta\ndifficulty: 4\nstatus: completed\n---\n" +
      "```chronoanvil\njournal-header\ntracker:difficulty\ntracker:status\n```\n"
  );
  vault.add(
    `${r}/Italian/Pasta/Carbonara for four.md`,
    "---\ntype: attempt\ncuisine: Italian\ndish: Pasta\ndifficulty: 3\nstatus: in-progress\n---\n" +
      "```chronoanvil\njournal-header\ntracker:difficulty\ntracker:status\n```\n"
  );
}

interface Harness {
  vault: FakeVault;
  plugin: ChronoAnvilPlugin;
  importer: JournalImporter;
  rebuilds: number;
  saves: number;
}

// `withStudy` installs the Study preset as an ordinary journal (3.20), which
// since 3.21 is the ONLY thing that claims the Study folder — there is no
// settings toggle and no reserved path left to do it. Off by default, because
// most of these tests are about adopting a folder that belongs to nobody and an
// extra registered journal is noise in them.
function harness(withStudy = false): Harness {
  const vault = new FakeVault();
  const state = { rebuilds: 0, saves: 0 };
  const plugin = {
    settings: {
      paths: { ...DEFAULT_PATHS },
      // The four journal built-ins a reset data.json restores. `difficulty` is
      // deliberately absent — that is the state the dev vault was left in.
      //
      // `builtin` is set because the real ones carry it, and the manifest
      // filter reads it: without it these look like custom trackers scoped to
      // every journal and get copied into every manifest.
      trackers: (["status", "confidence", "accuracy", "reviewed"] as const).map(
        (id) => ({
          id,
          label: id,
          type: "number" as const,
          builtin: id,
          surface: { kind: "journal" as const, typeId: null },
          showInTemplate: false,
          showInBase: false,
        })
      ),
      customJournals: (withStudy
        ? [
            presetAsNewJournal(STUDY_PRESET, {
              journalsRoot: "03 - Journals",
              templates: "00 - Infrastructure/Templates",
            }),
          ]
        : []) as JournalConfig[],
      dismissedJournalFolders: [] as string[],
      folderEmojis: { Cooking: "🍳" },
    },
    saveSettings: async () => {
      state.saves++;
    },
    journals: {
      rebuildJournalHome: async () => {
        state.rebuilds++;
      },
    },
    notifyJournalTypesChanged: () => {},
  } as unknown as ChronoAnvilPlugin;

  const app = {
    vault,
    metadataCache: {
      getFileCache: (file: TFile) => {
        const raw = vault.files.get(file.path);
        return raw == null ? null : { frontmatter: parseFrontmatter(raw) };
      },
    },
  } as never;

  return {
    vault,
    plugin,
    importer: new JournalImporter(app, plugin),
    get rebuilds() {
      return state.rebuilds;
    },
    get saves() {
      return state.saves;
    },
  };
}

const folderNamed = (h: Harness, path: string): TFolder =>
  h.vault.getAbstractFileByPath(path) as TFolder;

// ── The rule the whole feature turns on ───────────────────────────────────
//
// Lossless restores itself; guessed asks first. A manifest is the journal's
// own record, so adopting it silently loses nothing. Inference has to guess a
// lost tracker's type and range, so it is offered instead of taken.

describe("a folder that arrived with its manifest", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
    populate(h.vault);
    h.vault.hidden.set(
      manifestPathFor(COOKING.root),
      encodeJournalManifest(COOKING, [
        {
          id: "difficulty",
          label: "Difficulty",
          type: "number",
          min: 1,
          max: 5,
          surface: { kind: "journal", typeId: "cooking" },
          showInTemplate: false,
          showInBase: false,
        },
      ])
    );
  });

  it("is adopted on load without being asked about", async () => {
    const found = await h.importer.adoptManifested();
    expect(found.map((f) => f.config.name)).toEqual(["Cooking"]);
    expect(h.plugin.settings.customJournals.map((j) => j.id)).toEqual([
      "cooking",
    ]);
  });

  it("brings the tracker its notes need", async () => {
    await h.importer.adoptManifested();
    const difficulty = h.plugin.settings.trackers.find(
      (t) => t.id === "difficulty"
    );
    expect(difficulty?.surface).toEqual({ kind: "journal", typeId: "cooking" });
  });

  it("reads no notes to do it", async () => {
    // The manifest is the whole answer, so startup should touch one small
    // dotfile per unclaimed folder and nothing else. This is what keeps a
    // vault with thousands of journal notes cheap to open.
    await h.importer.adoptManifested();
    expect(h.vault.reads).toEqual([]);
  });

  it("repaints the home page and saves", async () => {
    await h.importer.adoptManifested();
    expect(h.saves).toBe(1);
    expect(h.rebuilds).toBe(1);
  });

  it("is not offered for review as well", async () => {
    await h.importer.adoptManifested();
    expect(await h.importer.inferrableFolders()).toEqual([]);
  });

  it("is not adopted twice", async () => {
    await h.importer.adoptManifested();
    expect(await h.importer.adoptManifested()).toEqual([]);
  });

  it("is re-rooted at wherever it actually landed", async () => {
    // The point of leaving the folders out of the manifest: a journal copied
    // in under a different name must not point at the sender's paths.
    const moved = harness();
    populate(moved.vault, { ...COOKING, root: "03 - Journals/Cucina" });
    moved.vault.hidden.set(
      manifestPathFor("03 - Journals/Cucina"),
      encodeJournalManifest(COOKING, [])
    );
    const [found] = await moved.importer.adoptManifested();
    expect(found.config.root).toBe("03 - Journals/Cucina");
    expect(found.config.templatesFolder).toBe(
      "00 - Infrastructure/Templates/Cucina"
    );
  });

  it("is refused if it comes from a later release", async () => {
    // A future manifest may mean something different by the same field names,
    // so reading it under today's assumptions is worse than reading the notes.
    const raw = JSON.parse(h.vault.hidden.get(manifestPathFor(COOKING.root))!);
    raw.chronoanvilJournal = 99;
    h.vault.hidden.set(manifestPathFor(COOKING.root), JSON.stringify(raw));
    expect(await h.importer.adoptManifested()).toEqual([]);
    // ...and falls through to the offer, rather than vanishing.
    expect((await h.importer.inferrableFolders()).map((f) => f.name)).toEqual([
      "Cooking",
    ]);
  });

  it("falls back to the offer when it is corrupt", async () => {
    h.vault.hidden.set(manifestPathFor(COOKING.root), "{ half a file");
    expect(await h.importer.adoptManifested()).toEqual([]);
    expect((await h.importer.inferrableFolders()).map((f) => f.name)).toEqual([
      "Cooking",
    ]);
  });
});

describe("a folder with no manifest", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
    populate(h.vault);
  });

  it("is NOT adopted on load", async () => {
    // 2.48 took these automatically and reported the guesses afterwards. A
    // guess already applied is one the reader has to notice, understand and
    // undo, so now it is offered instead.
    expect(await h.importer.adoptManifested()).toEqual([]);
    expect(h.plugin.settings.customJournals).toEqual([]);
  });

  it("is offered for review", async () => {
    const offered = await h.importer.inferrableFolders();
    expect(offered.map((f) => f.name)).toEqual(["Cooking"]);
  });

  it("costs no note reads to offer", async () => {
    // The metadata cache already knows which notes declare a `type`, so the
    // question "is there anything to offer" is free. Without this, a folder
    // under the journals root that is not a journal was re-read on every
    // single load to reach the same answer.
    await h.importer.inferrableFolders();
    expect(h.vault.reads).toEqual([]);
  });

  it("reconstructs on demand, and says what it guessed", async () => {
    const found = await h.importer.inferFolder(
      folderNamed(h, "03 - Journals/Cooking")
    );
    expect(found?.source).toBe("inferred");
    expect(found?.config.kinds.map((k) => k.id)).toEqual(["recipe", "attempt"]);
    expect(found?.guesses.join(" ")).toContain("difficulty");
    // This is the path that reads notes — and the only one.
    expect(h.vault.reads.length).toBeGreaterThan(0);
  });

  it("registers only when told to", async () => {
    const found = await h.importer.inferFolder(
      folderNamed(h, "03 - Journals/Cooking")
    );
    expect(h.plugin.settings.customJournals).toEqual([]);
    await h.importer.register([found!]);
    expect(h.plugin.settings.customJournals.map((j) => j.id)).toEqual([
      "cooking",
    ]);
  });

  it("leaves a manifest behind once registered, so it is never guessed twice", async () => {
    const found = await h.importer.inferFolder(
      folderNamed(h, "03 - Journals/Cooking")
    );
    await h.importer.register([found!]);
    expect(h.vault.hidden.has(manifestPathFor(COOKING.root))).toBe(true);
    expect(await h.importer.inferrableFolders()).toEqual([]);
  });

  it("is reproducible — the same folder infers the same range twice", async () => {
    // Leaf notes are sampled, and getMarkdownFiles makes no promise about
    // order, so an unsorted sample could give a different min/max per run and
    // then write a manifest from it.
    const a = await h.importer.inferFolder(
      folderNamed(h, "03 - Journals/Cooking")
    );
    const b = await h.importer.inferFolder(
      folderNamed(h, "03 - Journals/Cooking")
    );
    expect(b!.trackers).toEqual(a!.trackers);
  });

  it("can be set aside, and stays set aside", async () => {
    await h.importer.dismiss(folderNamed(h, "03 - Journals/Cooking"));
    expect(await h.importer.inferrableFolders()).toEqual([]);
    expect(h.plugin.settings.dismissedJournalFolders).toEqual([
      "03 - Journals/Cooking",
    ]);
  });
});

describe("what discovery must not touch", () => {
  // A Study folder complete enough that inference WOULD adopt it: two levels
  // of index notes and a rated leaf note. Written this thoroughly on purpose —
  // a thinner fixture comes back null for want of a kind, and then the guard
  // below is never the reason the test passes.
  function populateStudy(vault: FakeVault): void {
    const r = "03 - Journals/Study";
    vault.add(
      `${r}/mathematics/mathematics.md`,
      "---\ntype: subject\n---\n```chronoanvil\nheader:🗂️ Topics\nbutton:study:new-container\n```\n"
    );
    vault.add(
      `${r}/mathematics/algebra/algebra.md`,
      "---\ntype: topic\nsubject: mathematics\n---\n" +
        "```chronoanvil\nheader:📓 Lessons\nbutton:study:new-lesson\n```\n"
    );
    vault.add(
      `${r}/mathematics/algebra/Inequalities.md`,
      "---\ntype: lesson\nsubject: mathematics\ntopic: algebra\nconfidence: 3\n---\n" +
        "```chronoanvil\njournal-header\ntracker:confidence\n```\n"
    );
  }

  it("offers the Study folder when no journal claims it", async () => {
    // The control for the test below, and — since 3.21 — a claim in its own
    // right. Study's folder used to be reserved by a hardcoded path, so it was
    // ignored whether or not Study was registered. Removing a journal is an
    // ordinary deletion now, and a deleted journal's folder full of
    // classified-looking notes is exactly what adoption is for.
    const h = harness();
    populateStudy(h.vault);
    expect((await h.importer.inferrableFolders()).map((f) => f.name)).toEqual([
      "Study",
    ]);
  });

  it("ignores the Study folder while Study is installed", async () => {
    // Claimed by its own root, like every other registered journal's folder —
    // not by a reserved path, which is what it used to be.
    const h = harness(true);
    populateStudy(h.vault);
    expect(await h.importer.inferrableFolders()).toEqual([]);
  });

  it("ignores a folder of ordinary notes", async () => {
    const h = harness();
    h.vault.add("03 - Journals/Scratch/Ideas.md", "# Ideas\n\nsome thoughts");
    h.vault.add("03 - Journals/Scratch/More.md", "---\ntags: [x]\n---\n# More");
    expect(await h.importer.inferrableFolders()).toEqual([]);
  });

  it("never overwrites a tracker the vault already defines", async () => {
    const h = harness();
    populate(h.vault);
    const tuned = {
      id: "difficulty",
      label: "My difficulty",
      type: "number" as const,
      min: 0,
      max: 100,
      surface: { kind: "journal" as const, typeId: null },
      showInTemplate: false,
      showInBase: false,
    };
    h.plugin.settings.trackers.push(tuned);
    const found = await h.importer.inferFolder(
      folderNamed(h, "03 - Journals/Cooking")
    );
    await h.importer.register([found!]);
    const all = h.plugin.settings.trackers.filter((t) => t.id === "difficulty");
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe("My difficulty");
    expect(all[0].max).toBe(100);
  });

  it("gives a second copy of a journal a fresh id", async () => {
    const h = harness();
    populate(h.vault);
    h.plugin.settings.customJournals.push({
      ...COOKING,
      root: "03 - Journals/Cooking archive",
    });
    const found = await h.importer.inferFolder(
      folderNamed(h, "03 - Journals/Cooking")
    );
    expect(found?.config.id).toBe("cooking-2");
    expect(found?.guesses.join(" ")).toContain("already taken");
  });
});

describe("keeping the manifest in step", () => {
  it("writes one for every registered journal on repair", async () => {
    const h = harness();
    populate(h.vault);
    h.plugin.settings.customJournals.push(COOKING);
    await h.importer.writeAllManifests();
    expect(h.vault.hidden.has(manifestPathFor(COOKING.root))).toBe(true);
  });

  it("carries a corrected tracker range, so a reinstall can't revert it", async () => {
    // The bug this closes: correcting an inferred range in Settings left the
    // manifest saying what it was imported with, and the next reinstall put
    // the guess back. Settings → Trackers now refreshes manifests on save.
    const h = harness();
    populate(h.vault);
    h.plugin.settings.customJournals.push(COOKING);
    h.plugin.settings.trackers.push({
      id: "difficulty",
      label: "Difficulty",
      type: "number",
      min: 1,
      max: 5,
      surface: { kind: "journal", typeId: "cooking" },
      showInTemplate: false,
      showInBase: false,
    });
    await h.importer.writeAllManifests();

    const corrected = h.plugin.settings.trackers.find(
      (t) => t.id === "difficulty"
    )!;
    corrected.max = 10;
    await h.importer.writeAllManifests();

    const raw = JSON.parse(h.vault.hidden.get(manifestPathFor(COOKING.root))!);
    expect(
      raw.trackers.find((t: { id: string }) => t.id === "difficulty").max
    ).toBe(10);
  });

  it("doesn't rewrite a manifest that hasn't changed", async () => {
    // This now runs on the tracker-sync debounce, which fires while someone is
    // typing in a label field. Churning every journal's manifest several times
    // a minute would give any file sync watching the vault plenty to carry.
    const h = harness();
    populate(h.vault);
    h.plugin.settings.customJournals.push(COOKING);
    await h.importer.writeAllManifests();
    const before = h.vault.hidden.get(manifestPathFor(COOKING.root));
    let writes = 0;
    const inner = h.vault.adapter.write;
    h.vault.adapter.write = async (p: string, d: string) => {
      writes++;
      return inner.call(h.vault.adapter, p, d);
    };
    await h.importer.writeAllManifests();
    expect(writes).toBe(0);
    expect(h.vault.hidden.get(manifestPathFor(COOKING.root))).toBe(before);
  });

  it("includes the journal's own trackers and no others", async () => {
    const h = harness();
    populate(h.vault);
    h.plugin.settings.trackers.push({
      id: "difficulty",
      label: "Difficulty",
      type: "number",
      surface: { kind: "journal", typeId: "cooking" },
      showInTemplate: false,
      showInBase: false,
    });
    await h.importer.writeManifest(COOKING);
    const raw = JSON.parse(h.vault.hidden.get(manifestPathFor(COOKING.root))!);
    expect(raw.trackers.map((t: { id: string }) => t.id)).toEqual([
      "difficulty",
    ]);
  });

  it("skips a journal whose folder isn't there", async () => {
    const h = harness();
    await h.importer.writeManifest(COOKING);
    expect(h.vault.hidden.size).toBe(0);
  });
});

describe("a tracker scoped to every journal, not to one", () => {
  // A custom tracker the user scoped to "all journals" belongs to no single
  // journal, so it was in no manifest, and a full reinstall lost it while the
  // notes logging it kept rendering "Unknown tracker". It was lost *because*
  // there was a manifest — inference would have rebuilt it — so the lossless
  // path was the lossy one.
  const global = {
    id: "enjoyment",
    label: "Enjoyment",
    type: "number" as const,
    min: 1,
    max: 5,
    surface: { kind: "journal" as const, typeId: null },
    showInTemplate: false,
    showInBase: false,
  };

  it("is carried by the manifest", async () => {
    const h = harness();
    populate(h.vault);
    h.plugin.settings.trackers.push(global);
    await h.importer.writeManifest(COOKING);
    const raw = JSON.parse(h.vault.hidden.get(manifestPathFor(COOKING.root))!);
    expect(raw.trackers.map((t: { id: string }) => t.id)).toContain("enjoyment");
  });

  it("keeps its global scope when imported", async () => {
    const h = harness();
    populate(h.vault);
    h.vault.hidden.set(
      manifestPathFor(COOKING.root),
      encodeJournalManifest(COOKING, [global])
    );
    await h.importer.adoptManifested();
    const restored = h.plugin.settings.trackers.find(
      (t) => t.id === "enjoyment"
    );
    expect(restored?.surface).toEqual({ kind: "journal", typeId: null });
  });

  it("stays global even when the journal has to take a new id", async () => {
    const h = harness();
    populate(h.vault);
    h.plugin.settings.customJournals.push({
      ...COOKING,
      root: "03 - Journals/Cooking archive",
    });
    h.vault.hidden.set(
      manifestPathFor(COOKING.root),
      encodeJournalManifest(COOKING, [
        global,
        {
          id: "difficulty",
          label: "Difficulty",
          type: "number" as const,
          surface: { kind: "journal" as const, typeId: "cooking" },
          showInTemplate: false,
          showInBase: false,
        },
      ])
    );
    const [found] = await h.importer.adoptManifested();
    expect(found.config.id).toBe("cooking-2");
    const byId = Object.fromEntries(
      found.trackers.map((t) => [t.id, t.surface])
    );
    expect(byId.difficulty).toEqual({ kind: "journal", typeId: "cooking-2" });
    expect(byId.enjoyment).toEqual({ kind: "journal", typeId: null });
  });

  it("does not copy the built-ins, which are re-seeded on load anyway", async () => {
    // The harness already holds the four journal built-ins, all scoped to
    // every journal — the same shape as `enjoyment` above, and excluded only
    // because they are built-ins.
    const h = harness();
    populate(h.vault);
    await h.importer.writeManifest(COOKING);
    const raw = JSON.parse(h.vault.hidden.get(manifestPathFor(COOKING.root))!);
    expect(raw.trackers.map((t: { id: string }) => t.id)).not.toContain(
      "confidence"
    );
  });
});
