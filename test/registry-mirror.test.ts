// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  NOT_MIRRORED,
  REGISTRY_MIRROR,
  Registry,
  decodeRegistryMirror,
  describeMirror,
  encodeRegistryMirror,
  mirroredPart,
} from "../src/core/registry-mirror";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { AlmanacSettings } from "../src/core/settings";
import AlmanacPlugin from "../src/main";
import type { TrackerDef } from "../src/trackers/trackers";

// A custom DIARY tracker: the thing no journal folder carries, and the whole
// reason this file exists. Before the mirror it lived only in data.json, so
// replacing the plugin folder left every note logging it rendering
// "Unknown tracker: km".
const KM: TrackerDef = {
  id: "km",
  label: "🏃 KM",
  type: "number",
  min: 0,
  step: 0.1,
  unit: "km",
  surface: { kind: "diary", classes: ["daily"] },
  showInTemplate: false,
  showInBase: true,
};

function settings(over: Partial<AlmanacSettings> = {}): AlmanacSettings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...over,
  };
}

class FakeAdapter {
  files = new Map<string, string>();
  writes = 0;
  exists = async (p: string): Promise<boolean> => this.files.has(p);
  read = async (p: string): Promise<string> => {
    const v = this.files.get(p);
    if (v == null) throw new Error(`ENOENT ${p}`);
    return v;
  };
  write = async (p: string, d: string): Promise<void> => {
    this.writes++;
    this.files.set(p, d);
  };
}

function harness(over: Partial<AlmanacSettings> = {}) {
  const adapter = new FakeAdapter();
  const plugin = {
    settings: settings(over),
    manifest: { version: "2.50.0" },
  } as unknown as AlmanacPlugin;
  const registry = new Registry(
    { vault: { adapter } } as never,
    plugin
  );
  registry.arm();
  return { adapter, plugin, registry };
}

describe("what the mirror carries", () => {
  it("keeps a custom diary tracker", () => {
    const part = mirroredPart(settings({ trackers: [KM] }));
    expect(part.trackers).toEqual([KM]);
  });

  it("leaves out the three things that are a moment, not a configuration", () => {
    const part = mirroredPart(
      settings({
        collapsedNoteSections: { "a.md::Charts": true },
        captureDraft: "half a thought",
        collapsedSettingsGroups: { trackers: true },
      })
    );
    for (const key of NOT_MIRRORED) {
      expect(part).not.toHaveProperty(key);
    }
  });

  it("mirrors a new setting by default", () => {
    // The exclusion list is deliberately the shape it is: a setting added in
    // some later release and forgotten about must still be backed up, because
    // the other default fails silently and nothing would ever report it.
    const part = mirroredPart(
      settings({ somethingAddedIn252: true } as unknown as AlmanacSettings)
    );
    expect(part).toHaveProperty("somethingAddedIn252");
  });

  it("round trips", () => {
    const raw = encodeRegistryMirror(settings({ trackers: [KM] }), "2.50.0");
    const back = decodeRegistryMirror(raw);
    expect(back?.settings.trackers).toEqual([KM]);
    expect(back?.writtenBy).toBe("Almanac 2.50.0");
  });

  it("refuses anything that isn't a mirror", () => {
    expect(decodeRegistryMirror("not json")).toBeNull();
    expect(decodeRegistryMirror("{}")).toBeNull();
    expect(decodeRegistryMirror('{"almanacRegistry":1}')).toBeNull();
  });

  it("refuses an empty one, which is not a restore point", () => {
    // Treating `{}` as a restore would replace a fresh install's defaults with
    // nothing at all.
    expect(
      decodeRegistryMirror('{"almanacRegistry":1,"settings":{}}')
    ).toBeNull();
  });

  it("refuses one from a later release", () => {
    expect(
      decodeRegistryMirror('{"almanacRegistry":99,"settings":{"trackers":[]}}')
    ).toBeNull();
  });
});

describe("writing it", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness({ trackers: [KM] });
  });

  it("lands at the vault root", async () => {
    // Not under the infrastructure root: the mirror CONTAINS `paths`, so
    // filing it under a configured folder would mean needing the file to know
    // where to look for the file.
    await h.registry.writeNow();
    expect([...h.adapter.files.keys()]).toEqual([REGISTRY_MIRROR]);
  });

  it("writes nothing when nothing durable changed", async () => {
    await h.registry.writeNow();
    const after = h.adapter.writes;
    await h.registry.writeNow();
    expect(h.adapter.writes).toBe(after);
  });

  it("ignores a change to something it doesn't mirror", async () => {
    // saveSettings fires for folding a section and for every keystroke in the
    // capture box. Those must not churn a file at the vault root.
    await h.registry.writeNow();
    const after = h.adapter.writes;
    h.plugin.settings.captureDraft = "typing…";
    h.plugin.settings.collapsedNoteSections["a.md::Charts"] = true;
    await h.registry.writeNow();
    expect(h.adapter.writes).toBe(after);
  });

  it("writes when a tracker actually changes", async () => {
    await h.registry.writeNow();
    const after = h.adapter.writes;
    h.plugin.settings.trackers[0].max = 42;
    await h.registry.writeNow();
    expect(h.adapter.writes).toBe(after + 1);
  });

  it("writes nothing before the plugin has finished loading", async () => {
    // normalizeTrackers seeds built-ins during loadSettings, which looks
    // exactly like a settings change — and would overwrite the mirror being
    // restored from with the half-normalised state on its way through.
    const cold = harness({ trackers: [KM] });
    (cold.registry as unknown as { armed: boolean }).armed = false;
    await cold.registry.writeNow();
    expect(cold.adapter.writes).toBe(0);
  });
});

describe("debouncing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses a burst of saves into one write", async () => {
    const h = harness({ trackers: [KM] });
    for (let i = 0; i < 20; i++) h.registry.schedule();
    expect(h.adapter.writes).toBe(0);
    await vi.advanceTimersByTimeAsync(2500);
    expect(h.adapter.writes).toBe(1);
  });

  it("flush writes a pending change immediately", async () => {
    const h = harness({ trackers: [KM] });
    h.registry.schedule();
    await h.registry.flush();
    expect(h.adapter.writes).toBe(1);
  });

  it("flush is safe with nothing pending", async () => {
    const h = harness({ trackers: [KM] });
    await h.registry.flush();
    await h.registry.flush();
    expect(h.adapter.writes).toBe(1);
  });
});

describe("reading it back", () => {
  it("returns what was written", async () => {
    const h = harness({ trackers: [KM] });
    await h.registry.writeNow();
    const back = await h.registry.read();
    expect(back?.settings.trackers).toEqual([KM]);
  });

  it("returns null when there is no mirror", async () => {
    expect(await harness().registry.read()).toBeNull();
  });

  it("returns null rather than throwing on a corrupt one", async () => {
    // This is read during onload, which is the one place a throw would take
    // the whole plugin down with it.
    const h = harness();
    h.adapter.files.set(REGISTRY_MIRROR, "{ half a file");
    expect(await h.registry.read()).toBeNull();
  });
});

describe("the restore notice", () => {
  it("counts what is coming back", () => {
    const mirror = decodeRegistryMirror(
      encodeRegistryMirror(
        settings({
          trackers: [KM],
          customJournals: [
            {
              id: "cooking",
              name: "Cooking",
              emoji: "🍳",
              root: "03 - Journals/Cooking",
              templatesFolder: "t",
              levels: [{ id: "cuisine", noun: "Cuisine", fallbackEmoji: "📚" }],
              kinds: [{ id: "recipe", emoji: "📋", label: "Recipe" }],
            },
          ],
        }),
        "2.50.0"
      )
    )!;
    expect(describeMirror(mirror)).toBe("1 custom tracker and 1 journal type");
  });

  it("doesn't count the built-ins, which come back on their own", () => {
    const mirror = decodeRegistryMirror(
      encodeRegistryMirror(settings(), "2.50.0")
    )!;
    // A default vault has built-in trackers and no journals, so there is
    // nothing worth itemising.
    expect(describeMirror(mirror)).toBe("your settings");
  });
});

// ── The scenario the whole file exists for ────────────────────────────────
//
// Replace the plugin folder: data.json goes with it, the vault is untouched.
//
// Driven through main.ts's OWN loadSettings rather than a local re-statement
// of it. The interesting part is the order — the mirror is read only when
// loadData returns nothing, and writing stays disarmed until that has
// finished — and a test that re-implemented that order would be checking its
// own copy of the thing most likely to drift.
describe("surviving a full reinstall", () => {
  // A vault plus the plugin folder that comes and goes with it.
  function vault() {
    const adapter = new FakeAdapter();
    let data: unknown = null;

    async function session(
      act: (p: AlmanacPlugin) => void | Promise<void> = () => {}
    ): Promise<AlmanacPlugin> {
      const plugin = new AlmanacPlugin(
        { vault: { adapter } } as never,
        { id: "almanac", version: "2.50.0" } as never
      );
      (plugin as unknown as { _data: unknown })._data = data;

      // Exactly what onload does, in order, and nothing else.
      plugin.registry = new Registry({ vault: { adapter } } as never, plugin);
      await plugin.loadSettings();
      plugin.registry.arm();

      await act(plugin);
      await plugin.saveSettings();
      await plugin.registry.flush();
      data = (plugin as unknown as { _data: unknown })._data;
      return plugin;
    }

    return {
      adapter,
      session,
      wipePluginFolder(): void {
        data = null;
      },
      hasData(): boolean {
        return data != null;
      },
    };
  }

  it("brings back a custom diary tracker", async () => {
    const v = vault();
    await v.session((p) => {
      p.settings.trackers = [...p.settings.trackers, KM];
    });
    expect(v.adapter.files.has(REGISTRY_MIRROR)).toBe(true);

    v.wipePluginFolder();
    const after = await v.session();
    expect(after.settings.trackers.find((t) => t.id === "km")).toEqual(KM);
  });

  it("brings back the paths, so a moved vault isn't re-defaulted", async () => {
    const v = vault();
    await v.session((p) => {
      p.settings.paths.journalsRoot = "Journals";
    });
    v.wipePluginFolder();
    const after = await v.session();
    expect(after.settings.paths.journalsRoot).toBe("Journals");
  });

  it("brings back the journal list", async () => {
    const v = vault();
    await v.session((p) => {
      p.settings.customJournals.push({
        id: "cooking",
        name: "Cooking",
        emoji: "\u{1F373}",
        root: "03 - Journals/Cooking",
        templatesFolder: "00 - Infrastructure/Templates/Cooking",
        levels: [{ id: "cuisine", noun: "Cuisine", fallbackEmoji: "\u{1F4DA}" }],
        kinds: [{ id: "recipe", emoji: "\u{1F4CB}", label: "Recipe" }],
      });
    });
    v.wipePluginFolder();
    const after = await v.session();
    expect(after.settings.customJournals.map((j) => j.id)).toEqual(["cooking"]);
  });

  it("does not read the mirror when data.json is present", async () => {
    // The rule that keeps two sources of truth from fighting: in an ordinary
    // session data.json is the only one consulted, so a mirror written by
    // another machine can't reach in and change this one.
    const v = vault();
    await v.session((p) => {
      p.settings.moodTrackerId = "Mood";
    });
    expect(v.hasData()).toBe(true);
    v.adapter.files.set(
      REGISTRY_MIRROR,
      encodeRegistryMirror(
        settings({ moodTrackerId: "FromElsewhere" }),
        "2.50.0"
      )
    );
    const after = await v.session();
    expect(after.settings.moodTrackerId).toBe("Mood");
  });

  it("starts clean when the mirror is deleted too", async () => {
    // The escape hatch the restore notice names. Deleting data.json alone is
    // no longer a reset, so the notice has to say this and it has to be true.
    const v = vault();
    await v.session((p) => {
      p.settings.trackers = [...p.settings.trackers, KM];
    });
    v.wipePluginFolder();
    v.adapter.files.delete(REGISTRY_MIRROR);
    const after = await v.session();
    expect(after.settings.trackers.find((t) => t.id === "km")).toBeUndefined();
  });

  it("leaves a fresh vault on defaults", async () => {
    const v = vault();
    const after = await v.session();
    expect(after.settings.paths.journalsRoot).toBe(
      DEFAULT_SETTINGS.paths.journalsRoot
    );
    expect(after.settings.customJournals).toEqual([]);
  });

  it("still normalises what it restored", async () => {
    // The mirror feeds loadSettings' input, not its output — so a restored
    // config still goes through level-id normalisation and tracker seeding.
    const v = vault();
    await v.session((p) => {
      p.settings.customJournals.push({
        id: "reading",
        name: "Reading",
        emoji: "\u{1F4D6}",
        root: "03 - Journals/Reading",
        templatesFolder: "t",
        // No level id, as a config written before 2.43 would have.
        levels: [{ noun: "Shelf", fallbackEmoji: "\u{1F4DA}" }],
        kinds: [{ id: "book", emoji: "\u{1F4D6}", label: "Book" }],
      });
    });
    v.wipePluginFolder();
    const after = await v.session();
    expect(after.settings.customJournals[0].levels[0].id).toBe("shelf");
  });
});

describe("the link between saving settings and the mirror", () => {
  // Covered separately because the reinstall sessions above end with an
  // explicit flush — which models onunload faithfully, and would go on passing
  // if saveSettings stopped scheduling anything at all. This is the only test
  // that fails if that wire is cut.
  it("saveSettings alone eventually writes the mirror", async () => {
    vi.useFakeTimers();
    try {
      const adapter = new FakeAdapter();
      const plugin = new AlmanacPlugin(
        { vault: { adapter } } as never,
        { id: "almanac", version: "2.50.0" } as never
      );
      plugin.registry = new Registry({ vault: { adapter } } as never, plugin);
      await plugin.loadSettings();
      plugin.registry.arm();

      plugin.settings.trackers = [...plugin.settings.trackers, KM];
      await plugin.saveSettings();
      expect(adapter.files.has(REGISTRY_MIRROR)).toBe(false);

      await vi.advanceTimersByTimeAsync(2500);
      expect(adapter.files.has(REGISTRY_MIRROR)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
