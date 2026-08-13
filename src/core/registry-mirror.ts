// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, normalizePath } from "obsidian";
import type AlmanacPlugin from "../main";
import type { AlmanacSettings } from "./settings";

// ── The registry mirror: settings that survive the plugin folder ──────────
//
// 2.48 gave each journal a manifest in its own folder, which made a JOURNAL
// portable. It did nothing for everything else in data.json, and data.json is
// inside the plugin folder — so replacing that folder still took the whole
// tracker registry with it. A custom diary tracker (kilometres run, weight)
// lived nowhere else at all: the notes logging it kept rendering "Unknown
// tracker" and no folder carried the definition back.
//
// This is the counterpart at vault scope. One file at the vault root holding
// the durable half of data.json, written as settings change and read back only
// when data.json is GONE.
//
// ── Why the vault root ───────────────────────────────────────────────────
//
// Because the mirror contains `paths`. Filing it under `00 - Infrastructure`
// would mean needing the file to know where to look for the file — and a vault
// that had moved its infrastructure root would be exactly the vault whose
// mirror could not be found. The root is the one location that is knowable
// without reading anything.
//
// ── Why "only when data.json is gone" ────────────────────────────────────
//
// This is what keeps two sources of truth from fighting. data.json stays
// authoritative in every ordinary session; the mirror is write-mostly, and its
// read path is a single unambiguous signal — the plugin has settings for this
// vault, or it has none at all. Anything softer (newer-wins, merge on
// conflict) would let two machines syncing one vault trade settings back and
// forth, which is a worse failure than the one being fixed.
//
// ── The overlap with journal manifests is deliberate ─────────────────────
//
// A journal ends up described twice: here, and in its own folder. They answer
// different questions. The mirror restores THIS VAULT, so it holds the journal
// list as part of the settings it is mirroring. A manifest makes ONE FOLDER
// portable, so it travels when that folder is copied somewhere the mirror
// isn't. Restoring from the mirror leaves nothing unclaimed, so the manifest
// pass that follows finds nothing to do and the two never both fire.

export const REGISTRY_MIRROR = ".almanac-registry.json";

export const REGISTRY_VERSION = 1;

// What NOT to mirror, rather than what to mirror.
//
// The default has to be "backed up", because the failure mode of the other
// default is silent: a setting added in some later release that nobody
// remembers to add to an allow-list is a setting that quietly stops surviving
// a reinstall, and nothing would ever report it. An exclusion list is wrong in
// the harmless direction — the worst it does is carry a little state that
// didn't need carrying.
//
// These three are excluded because they are about a moment rather than a
// configuration: which sections a note had folded, what was half-typed into
// the capture box, which settings groups were open. Restoring them onto a
// vault would be restoring somebody's scroll position.
export const NOT_MIRRORED = [
  "collapsedNoteSections",
  "captureDraft",
  "collapsedSettingsGroups",
] as const;

export type MirroredSettings = Omit<
  AlmanacSettings,
  (typeof NOT_MIRRORED)[number]
>;

export interface RegistryMirror {
  almanacRegistry: number;
  // Free-text, for whoever opens the file wondering what wrote it.
  writtenBy: string;
  settings: Partial<MirroredSettings>;
}

export function mirroredPart(
  settings: AlmanacSettings
): Partial<MirroredSettings> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if ((NOT_MIRRORED as readonly string[]).includes(key)) continue;
    out[key] = value;
  }
  return out as Partial<MirroredSettings>;
}

export function encodeRegistryMirror(
  settings: AlmanacSettings,
  version: string
): string {
  const mirror: RegistryMirror = {
    almanacRegistry: REGISTRY_VERSION,
    writtenBy: `Almanac ${version}`,
    settings: mirroredPart(settings),
  };
  return `${JSON.stringify(mirror, null, 2)}\n`;
}

// Parse a mirror, or null if it isn't one.
//
// Same tolerance and the same version rule as a journal manifest: this reads a
// file that may be hand-edited, half-written by a sync, or produced by a later
// release. A mirror that doesn't parse means "start from defaults", never
// "throw during load" — and load is the one place a throw would take the whole
// plugin down with it.
export function decodeRegistryMirror(raw: string): RegistryMirror | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const m = parsed as Partial<RegistryMirror>;
  if (typeof m.almanacRegistry !== "number") return null;
  if (m.almanacRegistry > REGISTRY_VERSION) {
    console.warn(
      `[Almanac] settings mirror is version ${m.almanacRegistry}; this release understands ${REGISTRY_VERSION}. Starting from defaults instead.`
    );
    return null;
  }
  if (!m.settings || typeof m.settings !== "object") return null;
  // A mirror with nothing in it is not a restore point, and treating it as one
  // would replace a fresh install's defaults with an empty object.
  if (Object.keys(m.settings).length === 0) return null;
  return {
    almanacRegistry: m.almanacRegistry,
    writtenBy: typeof m.writtenBy === "string" ? m.writtenBy : "Almanac",
    settings: m.settings,
  };
}

// How many trackers and journals a mirror would bring back, for the notice.
// Counted rather than described because the notice's job is to make a silent
// restore visible, not to itemise it.
export function describeMirror(mirror: RegistryMirror): string {
  const trackers = Array.isArray(mirror.settings.trackers)
    ? mirror.settings.trackers.filter((t) => !t.builtin).length
    : 0;
  const journals = Array.isArray(mirror.settings.customJournals)
    ? mirror.settings.customJournals.length
    : 0;
  const parts: string[] = [];
  if (trackers > 0) {
    parts.push(`${trackers} custom tracker${trackers === 1 ? "" : "s"}`);
  }
  if (journals > 0) {
    parts.push(`${journals} journal type${journals === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" and ") : "your settings";
}

export class Registry {
  // The last content written, so a scheduled write that would change nothing
  // costs one string comparison instead of a disk write.
  private lastWritten: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Writing is suppressed until the plugin has finished loading. Otherwise
  // normalizeTrackers seeding built-ins during loadSettings would look like a
  // settings change and overwrite the very mirror being restored from.
  private armed = false;

  constructor(private app: App, private plugin: AlmanacPlugin) {}

  private get path(): string {
    return normalizePath(REGISTRY_MIRROR);
  }

  arm(): void {
    this.armed = true;
  }

  // Read the mirror. Only ever called when data.json is absent.
  async read(): Promise<RegistryMirror | null> {
    try {
      if (!(await this.app.vault.adapter.exists(this.path))) return null;
      return decodeRegistryMirror(await this.app.vault.adapter.read(this.path));
    } catch (e) {
      console.error("[Almanac] could not read the settings mirror", e);
      return null;
    }
  }

  // Write it now, if the durable half of settings has actually changed.
  async writeNow(): Promise<void> {
    if (!this.armed) return;
    let next: string;
    try {
      next = encodeRegistryMirror(
        this.plugin.settings,
        this.plugin.manifest.version
      );
    } catch (e) {
      console.error("[Almanac] could not encode the settings mirror", e);
      return;
    }
    if (next === this.lastWritten) return;
    try {
      // Compare against the file as well as against the last write: a fresh
      // session has no lastWritten, and a sync may have replaced the file.
      if (await this.app.vault.adapter.exists(this.path)) {
        if ((await this.app.vault.adapter.read(this.path)) === next) {
          this.lastWritten = next;
          return;
        }
      }
      await this.app.vault.adapter.write(this.path, next);
      this.lastWritten = next;
    } catch (e) {
      console.error("[Almanac] could not write the settings mirror", e);
    }
  }

  // Queue a write.
  //
  // Called from saveSettings, which fires for things that are not settings in
  // any meaningful sense — folding a section, typing in the capture box. That
  // is exactly why this is debounced AND content-compared rather than hooked
  // to the deliberate-change points the way journal manifests are: the mirror
  // has to be COMPLETE to be worth having, and a restore point missing the
  // last thing you changed is one you can't trust. Hooking the places I could
  // think of would have meant a list to keep in step with every future
  // setting; comparing content means a save that changed nothing durable
  // costs a string comparison and stops there.
  // Bare setTimeout rather than window.setTimeout, which is what the rest of
  // the plugin writes. Identical at runtime in Obsidian; the difference is
  // that this file can then be exercised off-platform, and the debounce is
  // precisely the part worth exercising — a mirror that writes on every
  // keystroke, or never flushes, both fail quietly.
  schedule(): void {
    if (!this.armed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.writeNow();
    }, 2000);
  }

  // Flush a pending write. Called on unload so a change made a moment before
  // Obsidian closes isn't the one the mirror is missing.
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.writeNow();
  }

  // Tell the reader their settings came back, and how to refuse that.
  //
  // Loud on purpose. A silent restore is indistinguishable from "the reinstall
  // didn't lose anything", which is a comforting thing to believe and the
  // wrong thing to learn — and someone who deleted data.json ON PURPOSE, to
  // start clean, needs to be told why they didn't. Naming the file is the
  // whole remedy: delete it too, and the next load really is a fresh start.
  announceRestore(mirror: RegistryMirror): void {
    new Notice(
      `Almanac: no plugin settings found, so ${describeMirror(mirror)} ` +
        `${describeMirror(mirror) === "your settings" ? "was" : "were"} ` +
        `restored from ${REGISTRY_MIRROR} in this vault. ` +
        `To start from scratch instead, delete that file and reload.`,
      15000
    );
  }
}
