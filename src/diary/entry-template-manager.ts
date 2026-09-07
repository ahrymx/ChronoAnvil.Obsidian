// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The writes behind the Template window. 4.29.
//
// THE SHAPE IS `EntryTrackers`', deliberately: a small manager on the plugin
// whose methods are what a menu item calls, holding no state of its own because
// the note and the settings are the state. Everything it DECIDES lives in
// `entry-template.ts`, which is pure and which the suite can reach; what is
// here is the file I/O, the confirmation and the notices.
//
// WHY THE DEFAULT SAVE GOES THROUGH `refreshTemplates`. Writing
// `settings.entrySections` alone changes nothing a reader can see: the entry
// openers read the template FILE, not the setting. The file therefore has to be
// rewritten — and `refreshTemplates` already surveys drift, shows the exact
// added and removed lines and asks. Writing the file directly here would be a
// second, quieter path to the same bytes, with no preview, over a file a reader
// may have hand-edited.

import { App, Notice } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { CLASS_DEFS, TRACKER_CLASSES } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { composeEntryTemplate, offerableEntrySections } from "./entry-sections";
import type { EntrySectionContext } from "./entry-sections";
import {
  entryReloadLoss,
  reloadEntryBody,
  wantFromEntry,
} from "./entry-template";
import type { EntryLayoutConfig, EntryLoss } from "./entry-template";
import { getFile, slugify } from "../core/util";
import { diffText } from "../core/line-diff";
import { openRepairWindow } from "../ui/repair-modal";
import { promptLayoutSave } from "../ui/modals";
import { idsOf } from "../core/section-model";
import type { SectionChoice } from "../core/section-model";
import { notify } from "../core/notify";
import { bridgeCatalogue } from "../ui/widgets/bridge-widgets";
import { otherSurface } from "../core/bridge";

export class EntryTemplates {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  // The layouts this grain may be reloaded from.
  layoutsFor(grain: TrackerClass): EntryLayoutConfig[] {
    return (this.plugin.settings.entryLayouts ?? []).filter((l) =>
      l.grains.includes(grain)
    );
  }

  // What a new entry of this grain is composed from today.
  composedFor(grain: TrackerClass): string {
    const s = this.plugin.settings;
    return composeEntryTemplate(
      grain,
      s.entrySections[grain] ?? [],
      s.entrySectionBand[grain] ?? []
    );
  }

  // What this layout composes to on this grain, and what it could not carry
  // there.
  //
  // The layout's ids are BOTH the membership and the order, which is the one
  // place the two stores are handed the same list — a saved layout is a whole
  // arrangement rather than a set of additions, so there is nothing for the
  // catalogue's own order to fill in behind it.
  //
  // DROPS ARE REPORTED, which is `layout-transfer.ts`'s rule carried onto this
  // side of the plugin: composing already drops what it cannot render, silently,
  // and silence is right for a template being built where it belongs and wrong
  // for a layout being carried somewhere new. A layout naming a section this
  // grain cannot compose is exactly that carry.
  composedFrom(
    grain: TrackerClass,
    layout: EntryLayoutConfig
  ): { text: string; drops: string[] } {
    const want: SectionChoice[] = layout.sections.map((id) =>
      layout.options?.[id] ? { id, options: layout.options[id] } : { id }
    );
    const text = composeEntryTemplate(grain, want, layout.sections);
    const offered = new Set(
      offerableEntrySections(this.ctxFor(grain)).map((s) => s.id)
    );
    return { text, drops: layout.sections.filter((id) => !offered.has(id)) };
  }

  // ── saving ───────────────────────────────────────────────────────────

  // This page becomes the grain's default.
  //
  // BOTH KEYS, ALWAYS TOGETHER. Membership goes to `entrySections` and order to
  // `entrySectionBand`; a save that wrote one without the other would leave
  // the two describing different templates, and the drift survey would then
  // offer to undo half of what the reader had just asked for.
  async saveDefault(grain: TrackerClass, notePath: string): Promise<void> {
    const file = getFile(this.app, notePath);
    if (!file) return;
    const text = await this.app.vault.read(file);
    const { want, drops } = wantFromEntry(text, this.ctxFor(grain));
    if (!want.length) {
      new Notice("ChronoAnvil: this page has no sections to save.");
      return;
    }

    const s = this.plugin.settings;
    s.entrySections[grain] = want.map((w) =>
      w.options ? { id: w.id, options: { ...w.options } } : { id: w.id }
    );
    s.entrySectionBand[grain] = idsOf(want);
    await this.plugin.saveSettings();

    if (drops.length) {
      // SAID, NOT SWALLOWED. A hand-written directive cannot become a catalogue
      // id, and `layout-transfer.ts` already settled what to do about that:
      // "drop silently, drop loudly, or refuse — and silence is the wrong one".
      new Notice(
        `ChronoAnvil: kept ${want.length} section${want.length === 1 ? "" : "s"} — ${
          drops.length
        } line${drops.length === 1 ? "" : "s"} of your own weren't carried (${drops.join(
          ", "
        )}).`
      );
    }
    // The preview and the write of the template FILE, through the one path that
    // already does both.
    await this.plugin.scaffold.refreshTemplates();
  }

  // This page becomes a named layout.
  //
  // ONE FUNCTION, TWO DOORS — the Template window and the section editor's
  // "Save as layout…" button both land here, which is the precedent 3.18 §6 set
  // when the settings rail and the banner both gained the journal one.
  async saveLayout(
    label: string,
    sections: readonly SectionChoice[],
    grains: TrackerClass[]
  ): Promise<void> {
    const s = this.plugin.settings;
    // Suffixed rather than rejected, the same repair `saveVariant` makes: a
    // reader naming two layouts "Mondays" wants two layouts, not an error.
    const taken = new Set((s.entryLayouts ?? []).map((l) => l.id));
    const stem = slugify(label) || "layout";
    let id = stem;
    let n = 2;
    while (taken.has(id)) id = `${stem}-${n++}`;

    const options: Record<string, Record<string, unknown>> = {};
    for (const w of sections) {
      if (w.options && Object.keys(w.options).length) options[w.id] = { ...w.options };
    }

    s.entryLayouts = [
      ...(s.entryLayouts ?? []),
      {
        id,
        label,
        sections: idsOf(sections),
        ...(Object.keys(options).length ? { options } : {}),
        grains: [...grains],
      },
    ];
    await this.plugin.saveSettings();
    notify.ok(`ChronoAnvil: saved “${label}” ✅`);
  }

  // The name-and-where prompt, then the save. The two are one decision and so
  // one window — `promptNewNote`'s rule, and the reason this is not a name
  // prompt followed by a second modal a reader can cancel half-way through.
  async promptSaveLayout(grain: TrackerClass, notePath: string): Promise<boolean> {
    const file = getFile(this.app, notePath);
    if (!file) return false;
    const text = await this.app.vault.read(file);
    const { want } = wantFromEntry(text, this.ctxFor(grain));
    if (!want.length) {
      new Notice("ChronoAnvil: this page has no sections to save.");
      return false;
    }
    const details = await promptLayoutSave(
      this.app,
      "Save as layout",
      "e.g. Quiet Monday",
      TRACKER_CLASSES.map((g) => ({ id: g, label: CLASS_DEFS[g].label })),
      grain
    );
    if (!details || !details.label.trim()) return false;
    await this.saveLayout(
      details.label.trim(),
      want,
      details.kinds.filter((k): k is TrackerClass =>
        (TRACKER_CLASSES as readonly string[]).includes(k)
      )
    );
    return true;
  }

  async deleteLayout(id: string): Promise<void> {
    const s = this.plugin.settings;
    s.entryLayouts = (s.entryLayouts ?? []).filter((l) => l.id !== id);
    await this.plugin.saveSettings();
  }

  // ── reloading ────────────────────────────────────────────────────────

  // What a reload of this page as `composed` would destroy.
  //
  // ASKED HERE SO THE WINDOW DOES NOT HAVE TO READ THE FILE TWICE, and answered
  // by the pure module so nothing about it is decided in a renderer the suite
  // cannot reach.
  lossOf(text: string, composed: string, grain: TrackerClass): EntryLoss[] {
    return entryReloadLoss(text, composed, this.ctxFor(grain));
  }

  // Write a template over this page, keeping its frontmatter.
  //
  // THE GATE IS RE-ASKED HERE, not trusted from the window. The window draws no
  // control when the page holds something, and this refuses anyway: the two are
  // separated by however long the reader leaves the window open, and a capture
  // arriving in the meantime is exactly the kind of thing 4.27 exists over.
  //
  // CONFIRMED WITH A DIFF, deliberately unlike 4.28's no-confirmation capture
  // delete. That undoes one line the reader typed; this replaces a whole body
  // they did not, and the machinery for showing them which lines already
  // exists.
  async reload(
    grain: TrackerClass,
    notePath: string,
    composed: string,
    label: string
  ): Promise<boolean> {
    const file = getFile(this.app, notePath);
    if (!file) return false;
    const text = await this.app.vault.read(file);

    const loss = this.lossOf(text, composed, grain);
    if (loss.length) {
      new Notice(
        `ChronoAnvil: this entry holds ${loss[0].label} (${loss[0].detail}) — clear it first.`
      );
      return false;
    }

    const next = reloadEntryBody(text, composed);
    if (next == null) {
      new Notice("ChronoAnvil: this entry already matches that layout.");
      return false;
    }

    const chosen = await openRepairWindow(this.app, {
      groups: [
        {
          id: "entry",
          title: `Reload this entry from ${label}`,
          blurb:
            "Replaces everything below the frontmatter. Your properties — the date, the title, any events stamped on this entry — are kept exactly as they are.",
          glyph: "📋",
          noun: "entry",
          items: [
            {
              path: notePath,
              label: file.basename,
              ops: [{ kind: "template", detail: `rewritten from ${label}` }],
              diff: diffText(text, next),
            },
          ],
        },
      ],
    });
    if (!chosen || !chosen.has("entry")) return false;

    await this.app.vault.modify(file, next);
    notify.ok(`ChronoAnvil: reloaded this entry from ${label} ✅`);
    return true;
  }

  // The one question a section on an entry asks needs the vault's journal
  // kinds, and only a caller holding the plugin can supply them.
  //
  // `bridgeCatalogue` RATHER THAN A WALK OF `registeredJournalTypes` WRITTEN
  // OUT AGAIN — the same call `section-insert.ts::entryContextFor` and the
  // settings table both make, so the list this window offers and the list a
  // refusal prints cannot disagree. The target surface is the JOURNALS', said
  // through `otherSurface` rather than as a literal because a bridge reads the
  // surface its host is not on and the host here is a diary entry.
  private ctxFor(grain: TrackerClass): EntrySectionContext {
    return {
      grain,
      journalKinds: bridgeCatalogue(this.plugin, otherSurface("diary")).kinds,
    };
  }
}
