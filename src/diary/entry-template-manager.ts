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
// WHY THE DEFAULT SAVE WRITES THE TEMPLATE FILE. Writing
// `settings.entrySections` alone changes nothing a reader can see: the entry
// openers read the template FILE, not the setting. The file therefore has to be
// rewritten too, and the two writes are one gesture.
//
// ── AND WHY IT NO LONGER GOES THROUGH `refreshTemplates` (1.0.46) ────────
//
// It did, and the argument was that the vault-wide command already surveys
// drift and shows the reader the exact added and removed lines before touching
// a file they may have hand-edited. The argument is good about a command and
// wrong about this: the reader has just pressed *Use as default* and confirmed
// it. The window that follows can be DECLINED, and declining it does not undo
// the settings write that has already happened — it leaves `entrySections`
// describing one template and `Daily.md` another, with the Template window
// reporting the first and every new entry built from the second. A reader in
// that state did the gesture and watched it not take.
//
// So both doors below call `refreshDiaryTemplate(grain)`: one grain, straight
// through, creating the file if it is missing. That is what the settings table
// has always done (`renderEntrySectionCell`), and the objection was never to
// two doors — it was to two writers.

import { App, Notice } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { CLASS_DEFS } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import {
  composeEntryTemplate,
  entryBandGroups,
  entryBandIsGrouped,
  offerableEntrySections,
} from "./entry-sections";
import type { EntryBandGroup, EntrySectionContext } from "./entry-sections";
import {
  entryReloadLoss,
  reloadEntryBody,
  wantFromEntry,
} from "./entry-template";
import type { EntryLayoutConfig, EntryLoss } from "./entry-template";
import { getFile, slugify } from "../core/util";
import { diffText } from "../core/line-diff";
import { openRepairWindow } from "../ui/repair-modal";
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
      s.entrySectionBand[grain] ?? [],
      s.entrySectionGroups?.[grain] ?? []
    );
  }

  // What a new entry of this grain WOULD be composed from if nobody had ever
  // pressed "Save this note as the default" — the 🔒 row's content. 1.0.46.
  //
  // THE STORED OVERRIDE REMOVED, LITERALLY. `DEFAULT_SETTINGS` ships
  // `entrySections: {}` and `entrySectionBand: {}`, and `entrySectionBand`'s own
  // comment pins that an absent grain "composes byte-for-byte what it composed
  // before this key existed" — so `[]`/`[]` IS what the plugin ships, and
  // spelling it any other way would be a second answer to the same question.
  shippedFor(grain: TrackerClass): string {
    return composeEntryTemplate(grain, [], [], []);
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
    const text = composeEntryTemplate(
      grain,
      want,
      layout.sections,
      layout.groups ?? []
    );
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
      new Notice("ChronoAnvil: this note has no sections to save.");
      return;
    }

    const s = this.plugin.settings;
    s.entrySections[grain] = want.map((w) =>
      w.options ? { id: w.id, options: { ...w.options } } : { id: w.id }
    );
    s.entrySectionBand[grain] = idsOf(want);
    // ── AND THE THIRD HALF: HOW THE BAND IS ARRANGED (1.0.46) ──────────
    //
    // WRITTEN AND DELETED WITH THE BAND, never left behind. A partition read
    // against an order it does not cover is one `regroupBand` refuses, so a
    // stale one would sit in `data.json` doing nothing until the day a reader
    // saved a band it happened to fit.
    //
    // ONLY WHEN IT SAYS SOMETHING. `entryBandIsGrouped` is the test and carries
    // the reason: a partition of singletons composes exactly what no partition
    // composes.
    const groups = entryBandGroups(text, this.ctxFor(grain));
    if (entryBandIsGrouped(groups)) s.entrySectionGroups[grain] = groups;
    else delete s.entrySectionGroups[grain];
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
    // THE OTHER HALF OF THE GESTURE. See the header: the setting is what the
    // window reads and the file is what a new entry is built from, so a save
    // that wrote one of them wrote nothing the reader asked for.
    await this.plugin.scaffold.refreshDiaryTemplate(grain);
    new Notice(
      `ChronoAnvil: new ${CLASS_DEFS[grain].label.toLowerCase()} entries will use this note's sections.`
    );
  }

  // A saved template — or the arrangement ChronoAnvil ships — becomes this
  // grain's default. 1.0.46.
  //
  // BOTH KEYS, ALWAYS TOGETHER, for `saveDefault`'s reason above; and `null`
  // DELETES BOTH rather than writing today's composition back, because an
  // absent grain is what "shipped" means here and a written-out copy would
  // freeze this version's catalogue into the settings.
  async useAsDefault(
    grain: TrackerClass,
    layout: EntryLayoutConfig | null
  ): Promise<void> {
    const s = this.plugin.settings;
    if (!layout) {
      delete s.entrySections[grain];
      delete s.entrySectionBand[grain];
      // ALL THREE KEYS, for the reason the other two are deleted rather than
      // written back: what ChronoAnvil ships is the stored override REMOVED,
      // and a partition left behind would group a band nobody had arranged.
      delete s.entrySectionGroups[grain];
    } else {
      s.entrySections[grain] = layout.sections.map((id) =>
        layout.options?.[id] ? { id, options: { ...layout.options[id] } } : { id }
      );
      s.entrySectionBand[grain] = [...layout.sections];
      if (layout.groups?.length) {
        s.entrySectionGroups[grain] = layout.groups.map((g) => ({
          ids: [...g.ids],
          ...(g.pages?.length ? { pages: [...g.pages] } : {}),
          ...(g.title ? { title: g.title } : {}),
        }));
      } else {
        delete s.entrySectionGroups[grain];
      }
    }
    await this.plugin.saveSettings();
    await this.plugin.scaffold.refreshDiaryTemplate(grain);
    // ITS OWN SENTENCE, for `saveDefault`'s reason above.
    const noun = CLASS_DEFS[grain].label.toLowerCase();
    new Notice(
      layout
        ? `ChronoAnvil: new ${noun} entries will use “${layout.label}”.`
        : `ChronoAnvil: new ${noun} entries are back to the arrangement ChronoAnvil ships.`
    );
  }

  // A saved template's name changes; its id does not — `saveLayout` suffixes ids
  // to keep them unique and nothing would repair a collision introduced here.
  async renameLayout(id: string, label: string): Promise<boolean> {
    const s = this.plugin.settings;
    const layout = (s.entryLayouts ?? []).find((l) => l.id === id);
    const next = label.trim();
    if (!layout || !next || next === layout.label) return false;
    s.entryLayouts = (s.entryLayouts ?? []).map((l) =>
      l.id === id ? { ...l, label: next } : l
    );
    await this.plugin.saveSettings();
    return true;
  }

  // This page becomes a named layout.
  //
  // ONE FUNCTION, TWO DOORS — the Template window and the section editor's
  // "Save as layout…" button both land here, which is the precedent 3.18 §6 set
  // when the settings rail and the banner both gained the journal one.
  async saveLayout(
    label: string,
    sections: readonly SectionChoice[],
    grains: TrackerClass[],
    // HOW THE BAND IS ARRANGED, where the caller could see it (1.0.46). Both
    // doors pass it now; the default is `[]` so the parameter is byte-inert for
    // a caller that has no arrangement to hand.
    groups: readonly EntryBandGroup[] = []
  ): Promise<void> {
    const s = this.plugin.settings;
    // Suffixed rather than rejected, the same repair `saveVariant` makes: a
    // reader naming two layouts "Mondays" wants two layouts, not an error.
    const taken = new Set((s.entryLayouts ?? []).map((l) => l.id));
    const stem = slugify(label) || "template";
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
        ...(entryBandIsGrouped(groups)
          ? {
              groups: groups.map((g) => ({
                ids: [...g.ids],
                ...(g.pages?.length ? { pages: [...g.pages] } : {}),
                ...(g.title ? { title: g.title } : {}),
              })),
            }
          : {}),
        grains: [...grains],
      },
    ];
    await this.plugin.saveSettings();
    notify.ok(`ChronoAnvil: saved “${label}” ✅`);
  }

  // A saved template is taken off THIS grain — and removed only if this was the
  // last grain it was offered on. 1.0.46.
  //
  // THE JOURNAL SIDE'S RULE, AND THE SAME DEFECT IT FIXES: this used to delete
  // outright, so removing a template from Daily took it off Weekly too, from a
  // window that named one grain. `planTemplateRemoval` is the shared decision
  // where there is one to share; here there is not, because `grains` is a plain
  // required list — no "absent means every grain" default and no second field
  // for surfaces — so the whole decision is the filter below and a plan object
  // would be ceremony around one line.
  //
  // RETURNS WHAT IT DID so the notice can say it.
  async deleteLayout(
    id: string,
    grain: TrackerClass
  ): Promise<{ removed: boolean; others: TrackerClass[] } | null> {
    const s = this.plugin.settings;
    const layout = (s.entryLayouts ?? []).find((l) => l.id === id);
    if (!layout) return null;

    const others = layout.grains.filter((g) => g !== grain);
    if (!others.length) {
      s.entryLayouts = (s.entryLayouts ?? []).filter((l) => l.id !== id);
    } else {
      s.entryLayouts = (s.entryLayouts ?? []).map((l) =>
        l.id === id ? { ...l, grains: others } : l
      );
    }
    await this.plugin.saveSettings();
    return { removed: !others.length, others };
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
      new Notice("ChronoAnvil: this entry already matches that template.");
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
