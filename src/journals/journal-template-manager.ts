// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The writes behind a journal note's Template window. 4.33.
//
// THE SHAPE IS `EntryTemplates`', which is `EntryTrackers`': a small manager on
// the plugin whose methods are what a menu item calls, holding no state of its
// own because the note and the settings are the state. Everything it DECIDES
// lives in `journal-template.ts`, which is pure and which the suite can reach;
// what is here is the file I/O, the confirmation and the notices.
//
// WHY THE DEFAULT SAVE GOES THROUGH `refreshJournalTemplates`. Writing
// `cfg.layout` alone changes nothing a reader can see: `newNote`, `newContainer`
// and `newPage` all read the template FILE. The file therefore has to be
// rewritten — and `refreshJournalTemplates` already surveys drift, shows the
// exact added and removed lines and asks. Writing the file directly here would
// be a second, quieter path to the same bytes, over a file the reader owns and
// may have hand-edited.

import { App, Notice } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { composeTemplate } from "./custom-journal";
import type {
  JournalConfig,
  JournalVariantConfig,
} from "./custom-journal";
import {
  layoutTargetsFor,
  sectionContext,
  sectionsFor,
  splitLayoutTargets,
  targetIdFor,
  templateKeyFor,
} from "./journal-sections";
import type { SectionContext, TemplateLayout } from "./journal-sections";
import type { JournalKind, JournalType } from "./journal";
import { configOfJournal, pageLayoutById } from "./page-default";
import {
  journalReloadLoss,
  wantFromJournalNote,
} from "./journal-template";
import type { ReloadLoss } from "../core/reload-loss";
import { replaceBody } from "../core/note-sections";
import { getFile } from "../core/util";
import { diffText } from "../core/line-diff";
import { openRepairWindow } from "../ui/repair-modal";
import { promptLayoutSave } from "../ui/modals";
import { notify } from "../core/notify";

export class JournalTemplates {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  // The stored config this note's journal is, or null.
  //
  // BY ID, NOT BY IDENTITY. `ctx.type` is a built `JournalType`, rebuilt on
  // every read; the thing that persists is the `JournalConfig` in settings, and
  // it is what a write has to reach.
  configFor(ctx: SectionContext): JournalConfig | null {
    // ONE IMPLEMENTATION, IN `page-default.ts` (4.50). `JournalManager` had the
    // same three lines, and a second copy is how "which config is this
    // journal?" comes to have two answers the day one of them learns about a
    // migration. A shared FUNCTION rather than one manager calling the other:
    // the dependency would be real, would be circular in spirit, and would put
    // a lookup out of reach of a test with no plugin.
    return this.configForType(ctx.type);
  }

  private configForType(type: JournalType): JournalConfig | null {
    return configOfJournal(this.plugin.settings.customJournals, type.id);
  }

  // The markdown a NEW PAGE of this kind is built from, when the reader picked a
  // saved layout rather than the journal's own page template. 4.50.
  //
  // NULL IS "READ THE FILE", which is what `newPage` has always done and what
  // the default still means. `page-default.ts` states why a page layout is not
  // a file: `templateTargets` emits exactly one page template per journal and a
  // saved layout claims nothing on disk — so the only two answers are the file
  // and a composition, and this returns the second or says so.
  //
  // TOKENS AND ALL. `composeTemplate` writes `{{title}}`, `{{parent}}`,
  // `{{order}}` — it is a TEMPLATE, not a note — so its output goes through the
  // same `fillTemplate` the file's does and the caller cannot tell them apart.
  pageLayoutText(
    type: JournalType,
    kind: JournalKind,
    layoutId: string
  ): string | null {
    if (!kind.pages) return null;
    const layout = pageLayoutById(this.configForType(type), layoutId);
    if (!layout) return null;
    return this.composedFrom(sectionContext(type, { page: kind }), layout).text;
  }

  // What a new note of this target is composed from today.
  composedFor(ctx: SectionContext): string {
    return composeTemplate(
      ctx,
      undefined,
      ctx.type.layout?.[templateKeyFor(ctx)]
    );
  }

  // The saved layouts this target may be reloaded from.
  //
  // A KIND READS ITS KINDS; A FRONT PAGE AND A PAGE READ THEIR SURFACE. The two
  // lists are kept apart in storage for the reason `JournalVariantConfig`
  // states — `kinds` absent means every kind, and that default is wrong for a
  // surface — so they are read apart here too rather than merged into one
  // membership test that would have to know which default applied.
  layoutsFor(ctx: SectionContext): JournalVariantConfig[] {
    const cfg = this.configFor(ctx);
    if (!cfg) return [];
    const target = targetIdFor(ctx);
    return (cfg.variants ?? []).filter((v) => {
      if (ctx.noteKind === "index") return !!v.surfaces?.includes("index");
      if (ctx.noteKind === "page") return !!v.surfaces?.includes("page");
      return (v.kinds ?? cfg.kinds.map((k) => k.id)).includes(target);
    });
  }

  // What this layout composes to on this target, and what it could not carry.
  //
  // DROPS ARE REPORTED, which is `layout-transfer.ts`'s rule: composing already
  // drops what it cannot render, silently, and silence is right for a template
  // built where it belongs and wrong for a layout carried somewhere new.
  composedFrom(
    ctx: SectionContext,
    layout: JournalVariantConfig
  ): { text: string; drops: string[] } {
    const text = composeTemplate(ctx, layout.sections, {
      ...(layout.sections ? { sections: [...layout.sections] } : {}),
      ...(layout.options ? { options: { ...layout.options } } : {}),
    });
    const offered = new Set(sectionsOfferedOn(ctx));
    return {
      text,
      drops: (layout.sections ?? []).filter((id) => !offered.has(id)),
    };
  }

  // ── saving ───────────────────────────────────────────────────────────

  // This page becomes the target's default.
  //
  // MERGED INTO THE EXISTING LAYOUT, NEVER WRITTEN OVER IT. `TemplateLayout`
  // holds two different questions — `order` says where the catalogue's sections
  // go and lets the catalogue keep deciding WHICH there are; `sections` says
  // which as well — and its own comment calls the distinction load-bearing:
  // Study's Topic Index carries `order` precisely so that "Study's dashboards
  // gain a section the day the catalogue does". A `{sections, options}` write
  // over that object deletes `order` and freezes Study's Topic index membership
  // for good. `sectionsFor` prefers `order` when both are present, so merging
  // keeps the ordering and still records the reader's selection.
  //
  // A FRESH OBJECT, NOT A PROPERTY WRITE — AND THIS IS DEFENCE IN DEPTH RATHER
  // THAN THE GUARD THAT DOES THE WORK. `presetConfig` used to share `layout` by
  // reference with the shipped `STUDY_CONFIG`, so a property write here would
  // have edited the plugin's own default for the rest of the process; that is
  // fixed at the source, in `presetConfig`, and pinned there. A mutation
  // turning this line back into `cfg.layout[key] = next` leaves the suite
  // green, and it is written this way anyway because it is the shape
  // `saveVariant` already uses for `variants` and because a manager that
  // mutates settings objects in place is one aliasing bug from doing damage
  // again.
  async saveDefault(notePath: string, ctx: SectionContext): Promise<boolean> {
    const cfg = this.configFor(ctx);
    if (!cfg) {
      new Notice(
        "ChronoAnvil: templates are stored on a journal you defined, and this journal is not one of them."
      );
      return false;
    }
    const file = getFile(this.app, notePath);
    if (!file) return false;
    const text = await this.app.vault.read(file);
    const { sections, options, drops } = wantFromJournalNote(text, ctx);
    if (!sections.length) {
      new Notice("ChronoAnvil: this page has no sections to save.");
      return false;
    }

    const key = templateKeyFor(ctx);
    const prev = cfg.layout?.[key];
    const next: TemplateLayout = {
      ...(prev ?? {}),
      ...(prev?.order ? { order: [...sections] } : {}),
      sections: [...sections],
      ...(Object.keys(options).length
        ? { options: { ...(prev?.options ?? {}), ...options } }
        : {}),
    };
    cfg.layout = { ...(cfg.layout ?? {}), [key]: next };
    await this.plugin.saveSettings();

    if (drops.length) {
      // SAID, NOT SWALLOWED — `layout-transfer.ts`'s rule again.
      new Notice(
        `ChronoAnvil: kept ${sections.length} section${
          sections.length === 1 ? "" : "s"
        } — ${drops.length} line${
          drops.length === 1 ? "" : "s"
        } of your own weren't carried (${drops.join(", ")}).`
      );
    }

    // The preview and the write of the template FILE, through the one path that
    // already does both.
    await this.plugin.scaffold.refreshJournalTemplates();
    return true;
  }

  // This page becomes a named layout.
  //
  // THROUGH `JournalManager.saveVariant`, WHICH IS THE ONE WRITER. The section
  // editor's "Save as layout…" lands there too, from two doors, and a third
  // spelling of "append a variant and write its file" is how the three would
  // start disagreeing about id collisions.
  async promptSaveLayout(
    notePath: string,
    ctx: SectionContext
  ): Promise<boolean> {
    const file = getFile(this.app, notePath);
    if (!file) return false;
    const text = await this.app.vault.read(file);
    const { sections, options } = wantFromJournalNote(text, ctx);
    if (!sections.length) {
      new Notice("ChronoAnvil: this page has no sections to save.");
      return false;
    }
    const details = await promptLayoutSave(
      this.app,
      "Save as layout",
      "e.g. Math Lesson",
      layoutTargetsFor(ctx.type),
      targetIdFor(ctx)
    );
    if (!details || !details.label.trim()) return false;

    const split = splitTargets(ctx, details.kinds);
    await this.plugin.journals.saveVariant(
      ctx.type.id,
      details.label.trim(),
      sections,
      options,
      split.kinds,
      split.surfaces
    );
    return true;
  }

  async deleteLayout(ctx: SectionContext, id: string): Promise<void> {
    const cfg = this.configFor(ctx);
    if (!cfg) return;
    cfg.variants = (cfg.variants ?? []).filter((v) => v.id !== id);
    await this.plugin.saveSettings();
  }

  // ── reloading ────────────────────────────────────────────────────────

  // What a reload of this page as `composed` would destroy.
  lossOf(text: string, composed: string, ctx: SectionContext): ReloadLoss[] {
    return journalReloadLoss(text, composed, ctx);
  }

  // Write a template over this page, keeping its frontmatter.
  //
  // THE GATE IS RE-ASKED HERE, not trusted from the window. The window draws no
  // control when the page holds something, and this refuses anyway: the two are
  // separated by however long the reader leaves the window open.
  //
  // AND A PAGE WITH NO FRONTMATTER IS REFUSED OUTRIGHT. `replaceBody` treats a
  // file with none as "the whole file is the body" and replaces all of it,
  // which is defensible on an entry and destructive here: a page's `parent:` is
  // the only thing tying it to the note it belongs to, and nothing in the body
  // could rebuild it.
  async reload(
    notePath: string,
    ctx: SectionContext,
    composed: string,
    label: string
  ): Promise<boolean> {
    const file = getFile(this.app, notePath);
    if (!file) return false;
    const text = await this.app.vault.read(file);

    if (!text.startsWith("---\n")) {
      new Notice(
        "ChronoAnvil: this note has no properties block, so there is nothing to keep — open it and add one before reloading."
      );
      return false;
    }

    const loss = this.lossOf(text, composed, ctx);
    if (loss.length) {
      new Notice(
        `ChronoAnvil: this note holds ${loss[0].label} (${loss[0].detail}) — clear it first.`
      );
      return false;
    }

    const next = replaceBody(text, composed);
    if (next == null) {
      new Notice("ChronoAnvil: this note already matches that layout.");
      return false;
    }

    const chosen = await openRepairWindow(this.app, {
      groups: [
        {
          id: "entry",
          title: `Reload this note from ${label}`,
          blurb:
            "Replaces everything below the properties. Your properties — the type, the folders it belongs to, any readings on it — are kept exactly as they are.",
          glyph: "📋",
          noun: "note",
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
    notify.ok(`ChronoAnvil: reloaded this note from ${label} ✅`);
    return true;
  }
}

// Which section ids this target can compose at all — what `composedFrom`
// reports its drops against.
//
// `sectionsFor` is the catalogue filtered by surface and by each section's own
// `applies(ctx)`, which is exactly the question "could this target render it".
function sectionsOfferedOn(ctx: SectionContext): string[] {
  return sectionsFor(ctx).map((s) => s.id);
}

// Split the window's ticked ids the same way the two other doors do.
function splitTargets(
  ctx: SectionContext,
  targets: string[]
): { kinds: string[]; surfaces: ("index" | "page")[] } {
  return splitLayoutTargets(
    ctx.type.kinds.map((k) => k.id),
    targets
  );
}
