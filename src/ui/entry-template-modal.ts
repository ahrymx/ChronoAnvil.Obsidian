// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Template window: what a new entry of this grain looks like, what templates
// exist for it, and what this page can do about them. 4.29, made a manager in
// 1.0.46.
//
// NOT `section-editor.ts` WITH A TAB ADDED. That window edits the STRUCTURE of
// the file in front of it and its own header forbids it from learning which
// surface it is on. This one is about the grain — what tomorrow's entry will
// be composed from, and which saved templates exist — and the page is only
// the thing it reads from and writes to. Two questions, and putting the second
// behind a tab on the first would give an agnostic window a grain.
//
// IT DECIDES NOTHING. Every judgement — what a reload would destroy, what this
// page's want is, what a template composes to, whether a removal withdraws or
// deletes — is asked of `entry-template.ts` or of the manager. The suite has no
// DOM, so anything worked out in here is untestable, and a wrong answer looks
// like a deliberate blank rather than a bug.
//
// NOTHING DEAD IS DRAWN. When the page holds writing, Apply is not drawn greyed
// — it is not drawn, and the block above the list names what is in the way. A
// greyed button is a control that cannot do its job.
//
// THE TWO BANDS ARE ITS JOURNAL TWIN'S, and that file's header carries the case
// for the shape: one band is the templates with everything you can do to one,
// one band is this page. It used to be three, with the saved arrangements living
// under "Reload this note" and disappearing entirely the moment the entry held a
// line of writing.

import { App, Modal, Notice, setIcon } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { createListRow } from "./list-row";
import { confirmAction, promptText } from "./modals";
import { CLASS_DEFS } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { ENTRY_SECTIONS } from "../diary/entry-sections";
import { entryReloadLoss } from "../diary/entry-template";
import { summariseLoss } from "../core/reload-loss";
import type { EntryLayoutConfig, EntryLoss } from "../diary/entry-template";
import { emptyCallout } from "./empty";

export function openEntryTemplateWindow(
  app: App,
  plugin: ChronoAnvilPlugin,
  notePath: string,
  grain: TrackerClass
): void {
  new EntryTemplateModal(app, plugin, notePath, grain).open();
}

// One row of the templates band. `layout` is null on the two permanent rows,
// which is also what `useAsDefault` takes as "put back what ChronoAnvil ships".
interface TemplateRow {
  token: string;
  title: string;
  subtitle: string;
  compose: () => { text: string; drops: string[] };
  layout: EntryLayoutConfig | null;
  settable: boolean;
  editable: boolean;
}

class EntryTemplateModal extends Modal {
  // The page as it was last read. Re-read after every write, because a save
  // that went through `refreshTemplates` may have rewritten the template this
  // page is measured against.
  private text = "";

  constructor(
    app: App,
    private plugin: ChronoAnvilPlugin,
    private notePath: string,
    private grain: TrackerClass
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("ca-editor-modal");
    void this.refresh();
  }

  private get manager() {
    return this.plugin.entryTemplates;
  }

  private get noun(): string {
    return CLASS_DEFS[this.grain].label;
  }

  private async refresh(): Promise<void> {
    const file = this.app.vault.getFileByPath(this.notePath);
    this.text = file ? await this.app.vault.read(file) : "";
    this.draw();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();

    const head = contentEl.createDiv({ cls: "ca-editor-head" });
    head.createEl("h3", { text: `Templates — ${this.noun}` });
    head.createEl("p", {
      cls: "ca-editor-subtitle",
      // What the window is FOR, in one sentence, because the two halves of it
      // act on different things and a reader who mixes them up either edits
      // every future entry by accident or edits none of them by accident.
      text: `What a new ${this.noun.toLowerCase()} entry is built from — and what this note can do about it.`,
    });

    const body = contentEl.createDiv({ cls: "ca-editor-body" });
    this.drawTemplates(body);
    this.drawThisPage(body);

    const footer = contentEl.createDiv({ cls: "ca-editor-footer" });
    const close = footer.createEl("button", { text: "Close", cls: "mod-cta" });
    close.addEventListener("click", () => this.close());
  }

  // ── this grain's templates ───────────────────────────────────────────

  private drawTemplates(host: HTMLElement): void {
    host.createDiv({
      cls: "ca-tpl-band",
      text: `This ${this.noun.toLowerCase()}'s templates`,
    });

    // THE GATE, ASKED ONCE FOR THE WHOLE BAND, AND IT NO LONGER HIDES IT.
    // Every Apply replaces the same body, so what is in the way does not vary by
    // which template is applied — saying it per row would be one fact repeated
    // until it read as noise, which is the same call the settings table made in
    // 4.27. What varies is whether Apply is drawn at all.
    const loss = entryReloadLoss(
      this.text,
      this.manager.composedFor(this.grain),
      { grain: this.grain }
    );
    if (loss.length) this.drawLoss(host, loss);

    const rows = this.rows();
    for (const row of rows) this.drawRow(host, row, loss.length === 0);

    if (!rows.some((r) => r.layout)) {
      host.appendChild(
        emptyCallout(
          "layout-template",
          "No templates of your own yet",
          "Arrange an entry the way you want it, then keep it under a name from “Edit sections…” → Template."
        )
      );
    }
  }

  private rows(): TemplateRow[] {
    const rows: TemplateRow[] = [
      {
        token: "⭐",
        title: `${this.noun} default`,
        // Named sections rather than a count: "6 sections" tells a reader
        // nothing they can check against the page they are looking at.
        subtitle: `Every new ${this.noun.toLowerCase()} entry starts with ${listOf(
          bandOf(this.manager.composedFor(this.grain))
        )}.`,
        compose: () => ({
          text: this.manager.composedFor(this.grain),
          drops: [],
        }),
        layout: null,
        // IT IS ALREADY THE DEFAULT.
        settable: false,
        editable: false,
      },
      {
        token: "🔒",
        title: "ChronoAnvil default",
        subtitle: `The arrangement ChronoAnvil ships with: ${listOf(
          bandOf(this.manager.shippedFor(this.grain))
        )}.`,
        compose: () => ({ text: this.manager.shippedFor(this.grain), drops: [] }),
        layout: null,
        settable: true,
        // NOT STORED, so there is nothing to rename and nothing to delete — and
        // that is what makes "put it back the way it came" always available.
        editable: false,
      },
    ];
    for (const layout of this.manager.layoutsFor(this.grain)) {
      rows.push({
        token: "🧩",
        title: layout.label,
        subtitle: describeTemplate(layout),
        compose: () => this.manager.composedFrom(this.grain, layout),
        layout,
        settable: true,
        editable: true,
      });
    }
    return rows;
  }

  // ACTIONS ON THEIR OWN LINE, for the reason the journal twin states: the
  // widest row carries four buttons in a modal about 560px wide.
  private drawRow(host: HTMLElement, row: TemplateRow, canApply: boolean): void {
    const { actions } = createListRow(host, {
      token: row.token,
      title: row.title,
      subtitle: row.subtitle,
      dense: true,
      actionsRow: true,
      ...(row.editable ? {} : { locked: true }),
    });

    if (canApply) this.addApply(actions, row);
    if (row.settable) this.addUseAsDefault(actions, row);
    if (row.editable && row.layout) {
      this.addRename(actions, row.layout);
      this.addRemove(actions, row.layout);
    }
  }

  private addApply(actions: HTMLElement, row: TemplateRow): void {
    const apply = actions.createEl("button", {
      text: "Apply to this entry",
      cls: "ca-tpl-toggle",
    });
    apply.addEventListener("click", () => {
      void (async () => {
        const { text, drops } = row.compose();
        if (drops.length) {
          // LOUD, NOT SILENT. `composeEntryTemplate` already declines to write
          // a section it cannot render here; the reader has to be told which,
          // or a template would quietly mean something different on each grain.
          new Notice(
            `ChronoAnvil: “${row.title}” names ${drops.join(
              ", "
            )}, which a ${this.noun.toLowerCase()} entry can't carry — the rest will be written.`
          );
        }
        this.close();
        await this.manager.reload(this.grain, this.notePath, text, row.title);
      })();
    });
  }

  private addUseAsDefault(actions: HTMLElement, row: TemplateRow): void {
    const use = actions.createEl("button", {
      text: "Use as default",
      cls: "ca-tpl-toggle",
      attr: { "aria-label": `Use ${row.title} as the default` },
    });
    use.addEventListener("click", () => {
      void (async () => {
        // ASKED FIRST, because this changes what EVERY future entry of the grain
        // looks like. The Apply above it only touches the page in front of the
        // reader and shows a diff before it does.
        const ok = await confirmAction(
          this.app,
          `Use “${row.title}” as the default?`,
          `Every new ${this.noun.toLowerCase()} entry will be built from it. Entries you already have keep what they have.`,
          "Use as default"
        );
        if (!ok) return;
        this.close();
        await this.manager.useAsDefault(this.grain, row.layout);
      })();
    });
  }

  private addRename(actions: HTMLElement, layout: EntryLayoutConfig): void {
    const ren = actions.createEl("button", {
      cls: "ca-tpl-toggle",
      text: "Rename",
      attr: { "aria-label": `Rename ${layout.label}` },
    });
    ren.addEventListener("click", () => {
      void (async () => {
        const next = await promptText(
          this.app,
          `Rename “${layout.label}”`,
          "Template name",
          layout.label
        );
        if (!next?.trim()) return;
        await this.manager.renameLayout(layout.id, next);
        await this.refresh();
      })();
    });
  }

  private addRemove(actions: HTMLElement, layout: EntryLayoutConfig): void {
    const del = actions.createEl("button", {
      cls: "ca-tpl-toggle",
      text: "Remove",
      attr: { "aria-label": `Remove ${layout.label}` },
    });
    del.addEventListener("click", () => {
      void (async () => {
        // ASKED, unlike 4.28's capture delete, and the difference is where the
        // undo is. A deleted capture is one Ctrl+Z away in the note that holds
        // it; a template lives in data.json, which the reader has no undo for.
        const ok = await confirmAction(
          this.app,
          `Remove “${layout.label}”?`,
          `It stops being offered on ${this.noun.toLowerCase()} entries. Entries you built from it are not touched.`,
          "Remove"
        );
        if (!ok) return;
        const plan = await this.manager.deleteLayout(layout.id, this.grain);
        // SAYS WHICH OF THE TWO HAPPENED, for the reason the journal side gives:
        // "removed" is the wrong word for a template still saved on two other
        // grains, and this window names one.
        if (plan && !plan.removed) {
          new Notice(
            `ChronoAnvil: “${layout.label}” is no longer offered on ${this.noun.toLowerCase()} entries — it's still saved for ${plan.others
              .map((g) => CLASS_DEFS[g].label.toLowerCase())
              .join(", ")}.`
          );
        } else if (plan) {
          new Notice(`ChronoAnvil: removed “${layout.label}”`);
        }
        await this.refresh();
      })();
    });
  }

  // ── this page ────────────────────────────────────────────────────────

  private drawThisPage(host: HTMLElement): void {
    host.createDiv({ cls: "ca-tpl-band", text: "This entry" });

    const row = host.createDiv({ cls: "ca-tpl-actions" });
    const save = row.createEl("button", {
      text: "Save this entry as the default",
      cls: "mod-cta",
    });
    save.addEventListener("click", () => {
      void (async () => {
        const ok = await confirmAction(
          this.app,
          "Save this entry as the default?",
          `Every new ${this.noun.toLowerCase()} entry will be built from this entry's sections, in this entry's order. Entries you already have keep what they have.`,
          "Save as default"
        );
        if (!ok) return;
        this.close();
        await this.manager.saveDefault(this.grain, this.notePath);
      })();
    });

    host.createDiv({
      cls: "ca-tpl-note",
      // NAMES THE OTHER DOOR. "Save this note as a layout…" stood here until
      // 1.0.46 and was the second door onto one write; the pane that draws the
      // arrangement is where it is named now.
      text: "To keep this entry's arrangement under a name, open “Edit sections…” on the same menu and use its Template tab.",
    });
  }

  // What is standing in the way of an Apply, in the reader's own terms.
  private drawLoss(host: HTMLElement, loss: EntryLoss[]): void {
    const box = host.createDiv({ cls: "ca-tpl-loss" });
    const head = box.createDiv({ cls: "ca-tpl-loss-head" });
    setIcon(head.createDiv({ cls: "ca-tpl-loss-icon" }), "pencil-line");
    head.createDiv({
      text: "You've written in this entry, so it can't be rebuilt from a template — a rebuild replaces everything below the properties. You can still rename and remove the templates below.",
    });
    // SUMMARISED, NOT ENUMERATED (1.0.46). `summariseLoss` has the argument: the
    // list is one entry per loose line, so a note somebody wrote in put sixty
    // rows of their own markdown above the templates this window manages.
    const list = box.createEl("ul", { cls: "ca-tpl-loss-list" });
    for (const line of summariseLoss(loss)) {
      list.createEl("li", { text: line });
    }
    box.createDiv({
      cls: "ca-tpl-note",
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
    if (section.band !== "shared") continue;
    if (!composed.includes(`:${section.id}`)) continue;
    labels.push(section.label);
  }
  return labels;
}

function describeTemplate(layout: EntryLayoutConfig): string {
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
