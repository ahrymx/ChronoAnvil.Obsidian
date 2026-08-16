// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Template window on a journal note's banner cog. 4.33.
//
// NOT A TAB ON `section-editor.ts`, for the reason its diary twin gives: that
// window is surface-agnostic and edits THIS FILE, and this one is about the
// note TYPE — what every future Lesson, or front page, or page is built from.
// Two questions, and the second one is the one nobody could ask.
//
// IT DECIDES NOTHING. Every judgement — what a rewrite would destroy, what this
// page says, what a layout composes to — is `journal-template.ts`'s or the
// manager's. The suite has no DOM, so anything decided in here is decided
// somewhere no test can reach; that split is what the whole release runs on.
//
// THE THREE BANDS ARE THE REQUEST'S OWN ORDER: this note type's default, saved
// layouts, and reloading one onto the page.

import { App, Modal, Notice, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";
import { createListRow } from "./list-row";
import { confirmAction } from "./modals";
import { emptyCallout } from "./empty";
import {
  JOURNAL_SECTIONS,
  detectSections,
} from "../journals/journal-sections";
import type { SectionContext } from "../journals/journal-sections";
import type { JournalVariantConfig } from "../journals/custom-journal";
import type { ReloadLoss } from "../core/reload-loss";

export function openJournalTemplateWindow(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string,
  ctx: SectionContext
): void {
  new JournalTemplateModal(app, plugin, notePath, ctx).open();
}

class JournalTemplateModal extends Modal {
  // The page as it was last read. Re-read after every write, because a save
  // that went through `refreshJournalTemplates` may have rewritten the template
  // this page is measured against.
  private text = "";

  constructor(
    app: App,
    private plugin: AlmanacPlugin,
    private notePath: string,
    private ctx: SectionContext
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("almanac-editor-modal");
    void this.refresh();
  }

  private get manager() {
    return this.plugin.journalTemplates;
  }

  // What this note is, in the reader's words. "Lesson", "Subject front page",
  // "Page" — the noun they see on the note itself rather than a template key.
  private get noun(): string {
    const { ctx } = this;
    if (ctx.noteKind === "index") return `${ctx.ownNoun} front page`;
    if (ctx.noteKind === "page") return "Page";
    return ctx.kind?.label ?? "Note";
  }

  private async refresh(): Promise<void> {
    const file = this.app.vault.getFileByPath(this.notePath);
    this.text = file ? await this.app.vault.read(file) : "";
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();

    const head = contentEl.createDiv({ cls: "almanac-editor-head" });
    head.createEl("h3", { text: `Template — ${this.noun}` });
    head.createEl("p", {
      cls: "almanac-editor-subtitle",
      text: `What a new ${this.noun.toLowerCase()} in ${
        this.ctx.type.name
      } is built from — and what this page can do about it.`,
    });

    const body = contentEl.createDiv({ cls: "almanac-editor-body" });
    this.drawDefault(body);
    this.drawLayouts(body);

    const footer = contentEl.createDiv({ cls: "almanac-editor-footer" });
    const close = footer.createEl("button", { text: "Close", cls: "mod-cta" });
    close.addEventListener("click", () => this.close());
  }

  // ── this note type's default ─────────────────────────────────────────

  private drawDefault(host: HTMLElement): void {
    host.createDiv({
      cls: "almanac-tpl-band",
      text: `This ${this.noun.toLowerCase()}'s default`,
    });

    host.createDiv({
      cls: "almanac-tpl-note",
      // Named sections rather than a count: "6 sections" tells a reader nothing
      // they can check against the page in front of them.
      text: `Every new ${this.noun.toLowerCase()} starts with ${listOf(
        bandOf(this.manager.composedFor(this.ctx), this.ctx)
      )}.`,
    });

    const row = host.createDiv({ cls: "almanac-tpl-actions" });
    const save = row.createEl("button", {
      text: "Save this page as the default",
      cls: "mod-cta",
    });
    save.addEventListener("click", () => {
      void (async () => {
        // ASKED FIRST, because this is the one control in the window that
        // changes what EVERY future note of this type looks like. The reload
        // below only touches the page in front of them, and shows a diff.
        const ok = await confirmAction(
          this.app,
          "Save this page as the default?",
          `Every new ${this.noun.toLowerCase()} in ${
            this.ctx.type.name
          } will be built from this page's sections, in this page's order. Notes you already have keep what they have.`,
          "Save as default"
        );
        if (!ok) return;
        this.close();
        await this.manager.saveDefault(this.notePath, this.ctx);
      })();
    });

    const asLayout = row.createEl("button", {
      text: "Save this page as a layout…",
    });
    asLayout.addEventListener("click", () => {
      void (async () => {
        const saved = await this.manager.promptSaveLayout(
          this.notePath,
          this.ctx
        );
        if (saved) await this.refresh();
      })();
    });
  }

  // ── saved layouts, and reloading from one ────────────────────────────

  private drawLayouts(host: HTMLElement): void {
    host.createDiv({ cls: "almanac-tpl-band", text: "Reload this page" });

    // THE GATE, ASKED ONCE FOR THE WHOLE BAND. Every reload replaces the same
    // body, so what is in the way does not vary by which template is reloaded —
    // saying it per row would be one fact repeated until it read as noise.
    const loss = this.manager.lossOf(
      this.text,
      this.manager.composedFor(this.ctx),
      this.ctx
    );
    if (loss.length) {
      this.drawLoss(host, loss);
      return;
    }

    host.createDiv({
      cls: "almanac-tpl-note",
      text: "This note holds nothing yet, so it can be rebuilt from a template. Your properties — what it is, where it belongs, any readings on it — are kept.",
    });

    const layouts = this.manager.layoutsFor(this.ctx);
    this.drawReloadRow(
      host,
      "⭐",
      `${this.noun} default`,
      `What a new ${this.noun.toLowerCase()} is built from.`,
      () => ({ text: this.manager.composedFor(this.ctx), drops: [] }),
      null
    );
    for (const layout of layouts) {
      this.drawReloadRow(
        host,
        "🧩",
        layout.label,
        describeLayout(layout),
        () => this.manager.composedFrom(this.ctx, layout),
        layout
      );
    }
    if (!layouts.length) {
      host.appendChild(
        emptyCallout(
          "layout-template",
          "No saved layouts yet",
          "“Save this page as a layout…” keeps this arrangement under a name you can reload onto a later note."
        )
      );
    }
  }

  private drawReloadRow(
    host: HTMLElement,
    token: string,
    title: string,
    subtitle: string,
    compose: () => { text: string; drops: string[] },
    layout: JournalVariantConfig | null
  ): void {
    const { actions } = createListRow(host, {
      token,
      title,
      subtitle,
      dense: true,
    });

    const reload = actions.createEl("button", {
      text: "Reload",
      cls: "almanac-tpl-toggle",
    });
    reload.addEventListener("click", () => {
      void (async () => {
        const { text, drops } = compose();
        if (drops.length) {
          // LOUD, NOT SILENT. Composing already declines to write a section it
          // cannot render here; the reader has to be told which, or a layout
          // would quietly mean something different on each surface.
          new Notice(
            `Almanac: “${title}” names ${drops.join(
              ", "
            )}, which a ${this.noun.toLowerCase()} can't carry — the rest will be written.`
          );
        }
        this.close();
        await this.manager.reload(this.notePath, this.ctx, text, title);
      })();
    });

    if (!layout) return;
    const del = actions.createEl("button", {
      cls: "almanac-tpl-toggle",
      text: "Delete",
      attr: { "aria-label": `Delete ${layout.label}` },
    });
    del.addEventListener("click", () => {
      void (async () => {
        // ASKED, unlike 4.28's capture delete, and the difference is where the
        // undo is. A deleted capture is one Ctrl+Z away in the note holding it;
        // a layout lives in data.json, which the reader has no undo for.
        const ok = await confirmAction(
          this.app,
          `Delete “${layout.label}”?`,
          "The layout is removed from your settings. Notes you built from it are not touched, and neither is its template file.",
          "Delete"
        );
        if (!ok) return;
        await this.manager.deleteLayout(this.ctx, layout.id);
        new Notice(`Almanac: deleted “${layout.label}”`);
        await this.refresh();
      })();
    });
  }

  // What is standing in the way, in the reader's own terms, and what clears it.
  private drawLoss(host: HTMLElement, loss: ReloadLoss[]): void {
    const box = host.createDiv({ cls: "almanac-tpl-loss" });
    const head = box.createDiv({ cls: "almanac-tpl-loss-head" });
    setIcon(
      head.createDiv({ cls: "almanac-tpl-loss-icon" }),
      "pencil-line"
    );
    head.createDiv({
      text: "There's something of yours on this note, so it can't be rebuilt from a template — a rebuild replaces everything below the properties.",
    });
    const list = box.createEl("ul", { cls: "almanac-tpl-loss-list" });
    for (const l of loss) {
      list.createEl("li", { text: `${l.label} — ${l.detail}` });
    }
    box.createDiv({
      cls: "almanac-tpl-note",
      // NAMES THE OTHER DOOR. A refusal that only says no sends a reader
      // looking for a control that does not exist; "Edit sections…" is the
      // non-destructive path and it is one item up the same menu.
      text: "To change this note's sections without losing any of it, use “Edit sections…” on the same menu.",
    });
  }
}

// The sections of a composed template, by label and in page order, for a
// sentence.
//
// `detectSections` RATHER THAN A SUBSTRING SEARCH OR A SECOND `locate` WALK.
// The diary's twin can look for `:<id>` because its ids are directive keywords;
// a journal section's id is not — `headings` writes plain markdown and `banner`
// writes `journal-header` — so the catalogue is the only thing that can answer
// "is this section in this text", and it already exposes one function that
// does, filtered by surface and sorted by position.
function bandOf(composed: string, ctx: SectionContext): string[] {
  const byId = new Map(JOURNAL_SECTIONS.map((s) => [s.id, s.label]));
  return detectSections(composed, ctx).map((id) => byId.get(id) ?? id);
}

function describeLayout(layout: JournalVariantConfig): string {
  const labels = (layout.sections ?? []).map(
    (id) => JOURNAL_SECTIONS.find((s) => s.id === id)?.label ?? id
  );
  return labels.length ? listOf(labels) : "the catalogue's own arrangement";
}

// "a, b and c" — the plugin says lists this way everywhere a sentence holds one.
function listOf(items: string[]): string {
  if (!items.length) return "nothing";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
