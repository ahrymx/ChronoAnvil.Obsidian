// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Template window: what a new entry of this grain looks like, and what
// this page can do about it. 4.29.
//
// NOT `section-editor.ts` WITH A TAB ADDED. That window edits the STRUCTURE of
// the file in front of it and its own header forbids it from learning which
// surface it is on. This one is about the grain — what tomorrow's entry will
// be composed from, and which saved arrangements exist — and the page is only
// the thing it reads from and writes to. Two questions, and putting the second
// behind a tab on the first would give an agnostic window a grain.
//
// IT DECIDES NOTHING. Every judgement — what a reload would destroy, what this
// page's want is, what a layout composes to — is asked of
// `entry-template.ts` or of the manager. The suite has no DOM, so anything
// worked out in here is untestable, and a wrong answer looks like a deliberate
// blank rather than a bug.
//
// NOTHING DEAD IS DRAWN. When the page holds writing, the reload controls are
// not drawn greyed — they are not drawn, and the block that replaces them names
// what is in the way. A greyed button is a control that cannot do its job.

import { App, Modal, Notice, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";
import { createListRow } from "./list-row";
import { confirmAction } from "./modals";
import { CLASS_DEFS } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { ENTRY_SECTIONS } from "../diary/entry-sections";
import { entryReloadLoss } from "../diary/entry-template";
import type { EntryLayoutConfig, EntryLoss } from "../diary/entry-template";
import { emptyCallout } from "./empty";

export function openEntryTemplateWindow(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string,
  grain: TrackerClass
): void {
  new EntryTemplateModal(app, plugin, notePath, grain).open();
}

class EntryTemplateModal extends Modal {
  // The page as it was last read. Re-read after every write, because a save
  // that went through `refreshTemplates` may have rewritten the template this
  // page is measured against.
  private text = "";

  constructor(
    app: App,
    private plugin: AlmanacPlugin,
    private notePath: string,
    private grain: TrackerClass
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("almanac-editor-modal");
    void this.refresh();
  }

  private get manager() {
    return this.plugin.entryTemplates;
  }

  private async refresh(): Promise<void> {
    const file = this.app.vault.getFileByPath(this.notePath);
    this.text = file ? await this.app.vault.read(file) : "";
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();

    const label = CLASS_DEFS[this.grain].label;
    const head = contentEl.createDiv({ cls: "almanac-editor-head" });
    head.createEl("h3", { text: `Template — ${label}` });
    head.createEl("p", {
      cls: "almanac-editor-subtitle",
      // What the window is FOR, in one sentence, because the two halves of it
      // act on different things and a reader who mixes them up either edits
      // every future entry by accident or edits none of them by accident.
      text: `What a new ${label.toLowerCase()} entry is built from — and what this page can do about it.`,
    });

    const body = contentEl.createDiv({ cls: "almanac-editor-body" });
    this.drawDefault(body);
    this.drawLayouts(body);

    const footer = contentEl.createDiv({ cls: "almanac-editor-footer" });
    const close = footer.createEl("button", { text: "Close", cls: "mod-cta" });
    close.addEventListener("click", () => this.close());
  }

  // ── this grain's default ─────────────────────────────────────────────

  private drawDefault(host: HTMLElement): void {
    host.createDiv({ cls: "almanac-tpl-band", text: "This grain's default" });
    const composed = this.manager.composedFor(this.grain);

    host.createDiv({
      cls: "almanac-entry-tpl-note",
      // Named sections rather than a count: "6 sections" tells a reader
      // nothing they can check against the page they are looking at.
      text: `Every new ${CLASS_DEFS[
        this.grain
      ].label.toLowerCase()} entry starts with ${listOf(bandOf(composed))}.`,
    });

    const row = host.createDiv({ cls: "almanac-entry-tpl-actions" });
    const save = row.createEl("button", {
      text: "Save this page as the default",
      cls: "mod-cta",
    });
    save.addEventListener("click", () => {
      void (async () => {
        // ASKED FIRST, because this is the one control in the window that
        // changes what EVERY future entry of the grain looks like. The reload
        // below only touches the page in front of them and shows a diff before
        // it does.
        const ok = await confirmAction(
          this.app,
          "Save this page as the default?",
          `Every new ${CLASS_DEFS[
            this.grain
          ].label.toLowerCase()} entry will be built from this page's sections, in this page's order. Entries you already have keep what they have.`,
          "Save as default"
        );
        if (!ok) return;
        this.close();
        await this.manager.saveDefault(this.grain, this.notePath);
      })();
    });

    const asLayout = row.createEl("button", { text: "Save this page as a layout…" });
    asLayout.addEventListener("click", () => {
      void (async () => {
        const saved = await this.manager.promptSaveLayout(this.grain, this.notePath);
        if (saved) await this.refresh();
      })();
    });
  }

  // ── saved layouts, and reloading from one ────────────────────────────

  private drawLayouts(host: HTMLElement): void {
    host.createDiv({ cls: "almanac-tpl-band", text: "Reload this page" });

    // THE GATE, ASKED ONCE FOR THE WHOLE BAND. Every reload replaces the same
    // body, so what is in the way does not vary by which template is being
    // reloaded — saying it per row would be one fact repeated until it read as
    // noise, which is the same call the settings table made in 4.27.
    const loss = entryReloadLoss(this.text, this.manager.composedFor(this.grain), {
      grain: this.grain,
    });
    if (loss.length) {
      this.drawLoss(host, loss);
      return;
    }

    host.createDiv({
      cls: "almanac-entry-tpl-note",
      text: "This entry holds nothing yet, so it can be rebuilt from a template. Your properties — the date, the title, any events on this entry — are kept.",
    });

    const layouts = this.manager.layoutsFor(this.grain);
    this.drawReloadRow(
      host,
      "⭐",
      `${CLASS_DEFS[this.grain].label} default`,
      "What a new entry of this grain is built from.",
      () => ({ text: this.manager.composedFor(this.grain), drops: [] }),
      null
    );
    for (const layout of layouts) {
      this.drawReloadRow(
        host,
        "🧩",
        layout.label,
        describeLayout(layout),
        () => this.manager.composedFrom(this.grain, layout),
        layout
      );
    }
    if (!layouts.length) {
      host.appendChild(
        emptyCallout(
          "layout-template",
          "No saved layouts yet",
          "“Save this page as a layout…” keeps this arrangement under a name you can reload onto a later entry."
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
    layout: EntryLayoutConfig | null
  ): void {
    const { actions } = createListRow(host, { token, title, subtitle, dense: true });

    const reload = actions.createEl("button", {
      text: "Reload",
      cls: "almanac-tpl-toggle",
    });
    reload.addEventListener("click", () => {
      void (async () => {
        const { text, drops } = compose();
        if (drops.length) {
          // LOUD, NOT SILENT. `composeEntryTemplate` already declines to write
          // a section it cannot render here; the reader has to be told which,
          // or a layout would quietly mean something different on each grain.
          new Notice(
            `Almanac: “${title}” names ${drops.join(", ")}, which a ${CLASS_DEFS[
              this.grain
            ].label.toLowerCase()} entry can't carry — the rest will be written.`
          );
        }
        this.close();
        await this.manager.reload(this.grain, this.notePath, text, title);
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
        // undo is. A deleted capture is one Ctrl+Z away in the note that holds
        // it; a layout lives in data.json, which the reader has no undo for.
        const ok = await confirmAction(
          this.app,
          `Delete “${layout.label}”?`,
          "The layout is removed from your settings. Entries you built from it are not touched.",
          "Delete"
        );
        if (!ok) return;
        await this.manager.deleteLayout(layout.id);
        new Notice(`Almanac: deleted “${layout.label}”`);
        await this.refresh();
      })();
    });
  }

  // What is standing in the way, in the reader's own terms, and what clears it.
  private drawLoss(host: HTMLElement, loss: EntryLoss[]): void {
    const box = host.createDiv({ cls: "almanac-entry-tpl-loss" });
    const head = box.createDiv({ cls: "almanac-entry-tpl-loss-head" });
    setIcon(head.createDiv({ cls: "almanac-entry-tpl-loss-icon" }), "pencil-line");
    head.createDiv({
      text: "You've written in this entry, so it can't be rebuilt from a template — a rebuild replaces everything below the properties.",
    });
    const list = box.createEl("ul", { cls: "almanac-entry-tpl-loss-list" });
    for (const l of loss) {
      list.createEl("li", { text: `${l.label} — ${l.detail}` });
    }
    box.createDiv({
      cls: "almanac-entry-tpl-note",
      // NAMES THE OTHER DOOR. A refusal that only says no sends a reader
      // looking for a control that does not exist; "Edit sections…" is the
      // non-destructive path and it is one item up the same menu.
      text: "To change this entry's sections without losing any of it, use “Edit sections…” on the same menu.",
    });
  }
}

// The shared band of a composed template, by label, for a sentence.
function bandOf(composed: string): string[] {
  const labels: string[] = [];
  for (const section of ENTRY_SECTIONS) {
    if (section.fence !== "shared") continue;
    if (!composed.includes(`:${section.id}`)) continue;
    labels.push(section.label);
  }
  return labels;
}

function describeLayout(layout: EntryLayoutConfig): string {
  const labels = layout.sections.map(
    (id) => ENTRY_SECTIONS.find((s) => s.id === id)?.label ?? id
  );
  return listOf(labels);
}

// "a, b and c" — the plugin says lists this way everywhere a sentence holds one.
function listOf(items: string[]): string {
  if (!items.length) return "nothing";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
