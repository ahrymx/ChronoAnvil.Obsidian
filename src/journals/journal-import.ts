// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { JournalConfig, deriveJournalFolders } from "./custom-journal";
import { registeredJournalTypes } from "./journal";
import {
  TrackerDef,
  journalSurface,
  trackersToSeed,
} from "../trackers/trackers";
import { childFolders } from "../core/util";
import {
  JournalManifest,
  decodeJournalManifest,
  encodeJournalManifest,
  manifestPathFor,
  manifestPathsFor,
} from "./journal-manifest";
import {
  JournalScan,
  ScannedFile,
  inferJournalFromScan,
  isIndexFile,
  scanFile,
} from "./journal-infer";

// ── Finding journals the settings have lost ───────────────────────────────
//
// The IO half: reading and writing the manifest dotfile, scanning a candidate
// folder off disk, and deciding what to do with what turns up. The rules it
// applies live in journal-manifest.ts (what a manifest says) and
// journal-infer.ts (what a folder says); this file is where they meet a vault.
//
// TWO OUTCOMES, AND THE SPLIT IS THE WHOLE DESIGN as of 2.49:
//
//   A folder with a MANIFEST is adopted silently on load. The manifest is that
//   journal's own record of itself, so restoring from it loses nothing and
//   there is nothing to ask about.
//
//   A folder without one is INFERRED, and inference guesses at a lost
//   tracker's type and range. So it is offered rather than taken: Settings →
//   Journal types grows a row naming what was found, and importing it opens
//   the editor with the inferred values and a note of exactly which were
//   guessed. 2.48 adopted these automatically and reported the guesses in a
//   notice afterwards, which is the wrong way round — a guess the reader has
//   already had applied is one they have to notice, understand and undo.
//
// That split also makes startup cheap. Adopting a manifest reads one small
// dotfile per unclaimed folder; COUNTING the inferrable ones is free, because
// the metadata cache already knows which files carry a `type` and no note has
// to be read to ask. The expensive scan happens when the reader clicks Review.
//
// Discovery never edits or removes a type already in settings. If a manifest
// disagrees with settings, settings wins — it is what the user last said out
// loud.

// ── Discovery ─────────────────────────────────────────────────────────────

export interface AdoptedJournal {
  config: JournalConfig;
  trackers: TrackerDef[];
  source: "manifest" | "inferred";
  guesses: string[];
}

// Folders under the journals root that no registered type accounts for.
//
// A registered type's root is skipped, and so is anything inside one: a Study
// subject is a folder under the journals root too, and Study's own notes are
// not an unregistered journal waiting to be adopted.
export function unclaimedFolders(
  plugin: ChronoAnvilPlugin,
  root: TFolder | null
): TFolder[] {
  const claimed = registeredJournalTypes(plugin).map((t) =>
    normalizePath(t.root)
  );
  // STUDY'S ROOT IS NO LONGER CLAIMED SEPARATELY (3.21). It was, on the
  // grounds that "turning Study off is not an invitation to re-adopt its folder
  // as a custom journal" — true while Study was a toggle, because off meant
  // registered-but-hidden and the folder was still its. Removing a journal is
  // an ordinary deletion now, and a deleted journal's folder is exactly what
  // adoption is for: the reader gets their Study folder offered back as
  // something they can turn into a journal again, like any other.
  return childFolders(root).filter((folder) => {
    const path = normalizePath(folder.path);
    return !claimed.some((c) => path === c || path.startsWith(`${c}/`));
  });
}

// Which trackers a journal's manifest carries.
//
// Its OWN, obviously — a tracker scoped to this type exists for this journal
// and goes nowhere else. But also any CUSTOM tracker scoped to every journal
// (`typeId: null`), and that second clause is doing real work: a tracker the
// user scoped globally is not owned by any one journal, so on the first cut of
// this it was in no manifest at all and a full reinstall lost it while the
// notes logging it kept rendering "Unknown tracker". Worse, it was lost
// *because* there was a manifest — without one, inference would have rebuilt
// it from the readings on disk. The lossless path must not be the lossy one.
//
// Several journals each carrying a copy is the right shape for that: whichever
// is adopted first restores it, adoption skips an id the vault already has, and
// a journal imported on its own into another vault still brings what its notes
// need. The copies can only disagree if two vaults edited it independently,
// and the never-overwrite rule settles that in favour of the receiving vault.
//
// Built-ins are excluded because normalizeTrackers re-seeds every one of them
// on load, so a copy here would be dead weight that could only ever be stale.
export function manifestCarriesTracker(
  tracker: TrackerDef,
  typeId: string
): boolean {
  if (tracker.surface.kind !== "journal") return false;
  if (tracker.surface.typeId === typeId) return true;
  return tracker.surface.typeId === null && !tracker.builtin;
}

export class JournalImporter {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  private get paths() {
    return this.plugin.settings.paths;
  }

  // ── Manifest IO ─────────────────────────────────────────────────────────

  async readManifest(root: string): Promise<JournalManifest | null> {
    // Current filename first, legacy second — see manifestPathsFor. Writing
    // still goes to manifestPathFor alone, so a journal saved once is migrated.
    for (const path of manifestPathsFor(root)) {
      try {
        if (!(await this.app.vault.adapter.exists(path))) continue;
        return decodeJournalManifest(await this.app.vault.adapter.read(path));
      } catch (e) {
        console.error(`[ChronoAnvil] could not read journal manifest at ${path}`, e);
      }
    }
    return null;
  }

  // Write (or refresh) a journal's manifest.
  //
  // Called on create, on save from the editor, and from setupVault — so a
  // journal defined before this existed gains one the next time the vault is
  // repaired, and an edited one never drifts from settings. Failures are
  // logged and swallowed: a manifest that couldn't be written is a journal
  // that behaves exactly as it did before manifests, which is not worth
  // failing a save over.
  async writeManifest(cfg: JournalConfig): Promise<void> {
    const trackers = this.plugin.settings.trackers.filter((t) =>
      manifestCarriesTracker(t, cfg.id)
    );
    const path = manifestPathFor(cfg.root);
    const next = encodeJournalManifest(cfg, trackers);
    try {
      if (!(await this.app.vault.adapter.exists(normalizePath(cfg.root)))) return;
      // Compare before writing. This now runs on the tracker-sync cadence,
      // which includes a debounce that fires while someone is typing in a
      // label field — so without this it would churn the mtime of every
      // journal's manifest several times a minute for no change at all, and
      // any file sync watching the vault would faithfully carry all of it.
      if (await this.app.vault.adapter.exists(path)) {
        if ((await this.app.vault.adapter.read(path)) === next) return;
      }
      await this.app.vault.adapter.write(path, next);
    } catch (e) {
      console.error(`[ChronoAnvil] could not write journal manifest at ${path}`, e);
    }
  }

  async writeAllManifests(): Promise<void> {
    for (const cfg of this.plugin.settings.customJournals ?? []) {
      await this.writeManifest(cfg);
    }
  }

  // ── Scanning ────────────────────────────────────────────────────────────

  // Markdown under a folder, in a fixed order. One pass of getMarkdownFiles()
  // per call, sorted, so every caller sees the same list in the same order.
  private markdownUnder(rootPath: string): TFile[] {
    const prefix = `${rootPath}/`;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => normalizePath(f.path).startsWith(prefix))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  // Does this folder look like a journal, without reading anything?
  //
  // The metadata cache already holds every note's frontmatter, so "is there a
  // note in here that says what type it is" is answerable for free. That is
  // not enough to BUILD a config — inference needs the bodies, for the fences
  // — but it is enough to decide whether building one is worth offering, and
  // that is the question startup asks.
  //
  // Without this, a folder under the journals root that is simply not a
  // journal — an Archive, a scratch folder — was re-read on every single load,
  // up to a hundred and twenty notes of it, to reach the same null it reached
  // last time. The cheap question has the same answer and costs no IO.
  private looksLikeAJournal(folder: TFolder): boolean {
    const rootPath = normalizePath(folder.path);
    const prefix = `${rootPath}/`;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!normalizePath(file.path).startsWith(prefix)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm && typeof fm.type === "string" && fm.type.trim() !== "") {
        return true;
      }
    }
    return false;
  }

  // Read a candidate folder into a JournalScan.
  //
  // Only ever called for a folder someone has asked about — the Review button,
  // or the manual import command. Startup does not come through here; see
  // countInferrable(), which answers "is there anything to offer?" from the
  // metadata cache without reading a single note.
  //
  // SORTED, and that is not tidiness. Leaf notes are sampled rather than read
  // in full, so which ones land in the sample decides the min and max of any
  // tracker rebuilt from them — and getMarkdownFiles() makes no promise about
  // order, so an unsorted sample gives a range that can differ between runs
  // and between machines. A manifest then gets written from a result that
  // isn't reproducible. Sorting by path costs nothing and makes the whole
  // inference a function of the folder's contents alone.
  private async scanFolder(folder: TFolder): Promise<JournalScan> {
    const rootPath = normalizePath(folder.path);
    const notes: ScannedFile[] = [];
    // Index notes settle the levels and there are only ever a handful, so they
    // are read in full. Leaf notes answer "which kinds, rated on what, in what
    // range", which a sample answers as well as a census.
    const LEAF_SAMPLE = 120;
    let leaves = 0;

    const files = this.markdownUnder(rootPath);

    for (const file of files) {
      const segments = normalizePath(file.path)
        .slice(rootPath.length + 1)
        .split("/");
      if (!isIndexFile(segments)) {
        if (leaves >= LEAF_SAMPLE) continue;
        leaves++;
      }
      try {
        notes.push(scanFile(segments, await this.app.vault.cachedRead(file)));
      } catch (e) {
        console.error(`[ChronoAnvil] could not read ${file.path} while scanning`, e);
      }
    }

    // The templates folder derived from this folder's name. Not guaranteed to
    // exist — a journal copied in without its templates is exactly the case
    // inference from notes covers — so a miss is silent.
    const templates: { name: string; file: ScannedFile }[] = [];
    const templatesRoot = deriveJournalFolders(folder.name, {
      journalsRoot: this.paths.journalsRoot,
      templates: this.paths.templates,
    }).templatesFolder;
    const templateFolder = this.app.vault.getAbstractFileByPath(
      normalizePath(templatesRoot)
    );
    if (templateFolder instanceof TFolder) {
      // `child` IS the file. This used to search getMarkdownFiles() for a path
      // it was already holding, once per template — a full scan of every
      // markdown file in the vault, five times over, to find five files.
      const children = [...templateFolder.children]
        .filter((c): c is TFile => c instanceof TFile)
        .filter((c) => c.extension === "md")
        .sort((a, b) => a.path.localeCompare(b.path));
      for (const child of children) {
        try {
          templates.push({
            name: child.name.toLowerCase(),
            file: scanFile([child.name], await this.app.vault.cachedRead(child)),
          });
        } catch (e) {
          console.error(`[ChronoAnvil] could not read template ${child.path}`, e);
        }
      }
    }

    return { folderName: folder.name, notes, templates };
  }

  // ── Adoption ────────────────────────────────────────────────────────────

  // A candidate folder, resolved as far as it can be without deciding what to
  // do about it. `source` is what the caller branches on.
  private async resolve(
    folder: TFolder,
    known: { takenIds: Set<string>; trackerIds: Set<string> },
    opts: { scan: boolean }
  ): Promise<AdoptedJournal | null> {
    const folders = deriveJournalFolders(folder.name, {
      journalsRoot: this.paths.journalsRoot,
      templates: this.paths.templates,
    });
    // Where the folder actually is, not where the name derives to: a journal
    // folder that has been renamed or nested is still that journal, and
    // pathwatch already retargets a rename this way.
    const journalRoot = normalizePath(folder.path);

    const manifest = await this.readManifest(journalRoot);
    let adopted: AdoptedJournal | null = null;

    if (manifest) {
      adopted = {
        config: {
          ...manifest.config,
          root: journalRoot,
          templatesFolder: folders.templatesFolder,
        },
        trackers: manifest.trackers,
        source: "manifest",
        guesses: [],
      };
    } else if (opts.scan) {
      const scan = await this.scanFolder(folder);
      const inferred = inferJournalFromScan(scan, {
        trackerIds: known.trackerIds,
        folderEmojis: this.plugin.settings.folderEmojis,
      });
      if (inferred) {
        adopted = {
          config: {
            ...inferred.config,
            root: journalRoot,
            templatesFolder: folders.templatesFolder,
          },
          trackers: inferred.trackers,
          source: "inferred",
          guesses: inferred.guesses,
        };
      }
    }

    if (!adopted) return null;

    // An id already in use means this folder is a second copy of a journal
    // that is registered, or an unrelated type that happens to share a slug.
    // Either way the notes in THIS folder say `button:<id>:` and would drive
    // the other type's buttons, so it takes a fresh id rather than the
    // collision.
    const was = adopted.config.id;
    if (known.takenIds.has(was)) {
      let n = 2;
      while (known.takenIds.has(`${was}-${n}`)) n++;
      const id = `${was}-${n}`;
      adopted.guesses.push(`a new id (${id}) — ${was} was already taken`);
      adopted.config = { ...adopted.config, id };
      // Only the trackers that NAMED the old id follow it. A tracker the
      // manifest carries because it is scoped to every journal
      // (`typeId: null`) must stay that way — re-pointing it here would narrow
      // a global tracker to one journal on the way in, which is a scope change
      // nobody asked for and no notice would mention.
      adopted.trackers = adopted.trackers.map((t) =>
        t.surface.kind === "journal" && t.surface.typeId === was
          ? { ...t, surface: journalSurface(id) }
          : t
      );
      known.takenIds.add(id);
    } else {
      known.takenIds.add(was);
    }
    return adopted;
  }

  private knownIds(): { takenIds: Set<string>; trackerIds: Set<string> } {
    return {
      takenIds: new Set<string>([
        "study",
        ...(this.plugin.settings.customJournals ?? []).map((j) => j.id),
      ]),
      trackerIds: new Set(this.plugin.settings.trackers.map((t) => t.id)),
    };
  }

  // Unclaimed folders that haven't been set aside by the reader.
  private candidates(): TFolder[] {
    const root = this.app.vault.getAbstractFileByPath(
      normalizePath(this.paths.journalsRoot)
    );
    if (!(root instanceof TFolder)) return [];
    const dismissed = new Set(this.plugin.settings.dismissedJournalFolders ?? []);
    return unclaimedFolders(this.plugin, root).filter(
      (f) => !dismissed.has(normalizePath(f.path))
    );
  }

  // ── What runs on load ───────────────────────────────────────────────────

  // Adopt every unclaimed folder that carries a manifest.
  //
  // Silent, and safe to be: a manifest is the journal's own record, so nothing
  // here is a guess and there is nothing to ask about. Reads one small dotfile
  // per unclaimed folder and no notes at all.
  async adoptManifested(): Promise<AdoptedJournal[]> {
    const known = this.knownIds();
    const found: AdoptedJournal[] = [];
    for (const folder of this.candidates()) {
      const adopted = await this.resolve(folder, known, { scan: false });
      if (adopted) found.push(adopted);
    }
    if (found.length === 0) return [];
    await this.register(found);
    new Notice(
      `ChronoAnvil: restored ${found.length} journal${
        found.length === 1 ? "" : "s"
      } from the vault — ${found.map((f) => f.config.name).join(", ")}.`,
      8000
    );
    return found;
  }

  // Folders that have no manifest but do look like journals.
  //
  // The count startup needs, and it is FREE: the metadata cache already knows
  // which notes declare a `type`, so nothing is read. Returns the folders
  // rather than a number so the settings row can name them.
  async inferrableFolders(): Promise<TFolder[]> {
    const out: TFolder[] = [];
    for (const folder of this.candidates()) {
      if (await this.readManifest(normalizePath(folder.path))) continue;
      if (!this.looksLikeAJournal(folder)) continue;
      out.push(folder);
    }
    return out;
  }

  // The full reconstruction for one folder, for the Review button. This is the
  // only path that reads notes.
  async inferFolder(folder: TFolder): Promise<AdoptedJournal | null> {
    return this.resolve(folder, this.knownIds(), { scan: true });
  }

  // Stop offering a folder. Recorded by path, so moving or renaming it offers
  // it again — which is right: that is a different folder as far as anything
  // else in the plugin is concerned.
  async dismiss(folder: TFolder): Promise<void> {
    const list = this.plugin.settings.dismissedJournalFolders ?? [];
    const path = normalizePath(folder.path);
    if (!list.includes(path)) list.push(path);
    this.plugin.settings.dismissedJournalFolders = list;
    await this.plugin.saveSettings();
  }

  // ── Registering ─────────────────────────────────────────────────────────

  // Push adopted journals into settings and repaint.
  //
  // ADDITIVE ONLY: a type already in settings is never touched, and a tracker
  // whose id the vault already defines is never overwritten — an import must
  // not be able to redefine `status` or clobber a tracker the user has tuned.
  async register(found: AdoptedJournal[]): Promise<void> {
    if (found.length === 0) return;
    for (const item of found) {
      this.plugin.settings.customJournals.push(item.config);
      // THE RULE LIVES IN `trackersToSeed` NOW (4.35 §1.2), and this loop is
      // where it came from. Installing a preset seeds the registry from
      // outside it too, and two callers holding one rule twice is how the two
      // drift — so the rule moved and this became a call. Still inside the
      // loop, so the ids seeded by an earlier journal in the same batch are
      // visible to a later one.
      this.plugin.settings.trackers.push(
        ...trackersToSeed(this.plugin.settings.trackers, item.trackers)
      );
      // Give an inferred journal the manifest it was missing, so the next
      // reload reads it back exactly rather than inferring again — and so a
      // correction made in Settings sticks instead of being re-guessed.
      await this.writeManifest(item.config);
    }
    await this.plugin.saveSettings();
    await this.plugin.journals.rebuildJournalHome();
    this.plugin.notifyJournalTypesChanged();
  }
}
