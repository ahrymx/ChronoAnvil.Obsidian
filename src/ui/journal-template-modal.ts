// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Template window on a journal note's banner cog — the manager for this
// note type's templates. 4.33, made a manager in 1.0.46.
//
// NOT A TAB ON `section-editor.ts`, for the reason its diary twin gives: that
// window is surface-agnostic and edits THIS FILE, and this one is about the
// note TYPE — what every future Lesson, or front page, or page is built from.
// Two questions, and the second one is the one nobody could ask.
//
// IT DECIDES NOTHING. Every judgement — what a rewrite would destroy, what this
// page says, what a template composes to, whether a removal withdraws or
// deletes — is `journal-template.ts`'s, `journal-sections.ts`' or the manager's.
// The suite has no DOM, so anything decided in here is decided somewhere no test
// can reach; that split is what the whole subsystem runs on.
//
// ── WHY IT IS TWO BANDS AND NOT THREE (1.0.46) ────────────────────────────
//
// It was three: this type's default, saved layouts, and reloading one onto the
// page. Which spread one list over two bands — a saved arrangement appeared
// under "Reload this note" and nowhere else, so the only things you could do to
// one were reload it and remove it, and the window that was named after them
// could not rename one or make one the default. Worse, the whole band was hidden
// the moment the page held any writing, because reloading was the only verb it
// knew.
//
// So: one band is the TEMPLATES, with everything you can do to one, and one band
// is THIS PAGE. The writing gate now omits Apply per row instead of hiding the
// list, because renaming a template touches no markdown.
//
// NOTHING DEAD IS DRAWN. When the page holds writing, Apply is not drawn greyed
// — it is not drawn, and the box above the list names what is in the way.

import { App, Modal, Notice, setIcon } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { createListRow } from "./list-row";
import { confirmAction, promptText } from "./modals";
import { emptyCallout } from "./empty";
import {
  JOURNAL_SECTIONS,
  detectSections,
} from "../journals/journal-sections";
import type { SectionContext } from "../journals/journal-sections";
import type { JournalVariantConfig } from "../journals/custom-journal";
import { summariseLoss } from "../core/reload-loss";
import { settableRows } from "./template-rows";
import type { ReloadLoss } from "../core/reload-loss";
import { INDEX } from "../core/vocabulary";

export function openJournalTemplateWindow(
  app: App,
  plugin: ChronoAnvilPlugin,
  notePath: string,
  ctx: SectionContext
): void {
  new JournalTemplateModal(app, plugin, notePath, ctx).open();
}

// One row of the templates band. `variant` is null on the two permanent rows,
// which is also what `useAsDefault` takes as "put back what ChronoAnvil ships".
interface TemplateRow {
  token: string;
  title: string;
  subtitle: string;
  compose: () => { text: string; drops: string[] };
  variant: JournalVariantConfig | null;
  // Whether this row may become the type's default. False on the ⭐ row, which
  // already is it.
  settable: boolean;
  // Whether it may be renamed or removed. False on both permanent rows.
  editable: boolean;
}

class JournalTemplateModal extends Modal {
  // The page as it was last read. Re-read after every write, because a save
  // that went through `refreshJournalTemplates` may have rewritten the template
  // this page is measured against.
  private text = "";

  constructor(
    app: App,
    private plugin: ChronoAnvilPlugin,
    private notePath: string,
    private ctx: SectionContext
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.addClass("ca-editor-modal");
    void this.refresh();
  }

  private get manager() {
    return this.plugin.journalTemplates;
  }

  // What this note is, in the reader's words. "Lesson", "Subject index",
  // "Page" — the noun they see on the note itself rather than a template key.
  //
  // THE NOUN COMES FROM `vocabulary.ts` (1.0.38). This composed the word inline
  // and the target list composed its own copy, which is how one object came to
  // be offered as "Front page" in one window and described as an "index note" in
  // fifteen others. See `INDEX` for the collision that cost.
  private get noun(): string {
    const { ctx } = this;
    if (ctx.noteKind === "index") return `${ctx.ownNoun} ${INDEX}`;
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

    const head = contentEl.createDiv({ cls: "ca-editor-head" });
    head.createEl("h3", { text: `Templates — ${this.noun}` });
    head.createEl("p", {
      cls: "ca-editor-subtitle",
      text: `What a new ${this.noun.toLowerCase()} in ${
        this.ctx.type.name
      } is built from — and what this note can do about it.`,
    });

    const body = contentEl.createDiv({ cls: "ca-editor-body" });
    this.drawTemplates(body);
    this.drawThisPage(body);

    const footer = contentEl.createDiv({ cls: "ca-editor-footer" });
    const close = footer.createEl("button", { text: "Close", cls: "mod-cta" });
    close.addEventListener("click", () => this.close());
  }

  // ── this note type's templates ───────────────────────────────────────

  private drawTemplates(host: HTMLElement): void {
    host.createDiv({
      cls: "ca-tpl-band",
      text: `This ${this.noun.toLowerCase()}'s templates`,
    });

    // THE GATE, ASKED ONCE FOR THE WHOLE BAND, AND IT NO LONGER HIDES IT.
    // Every Apply replaces the same body, so what is in the way does not vary by
    // which template is applied — saying it per row would be one fact repeated
    // until it read as noise. What varies is whether Apply is drawn at all.
    const loss = this.manager.lossOf(
      this.text,
      this.manager.composedFor(this.ctx),
      this.ctx
    );
    if (loss.length) this.drawLoss(host, loss);

    const rows = this.rows();
    for (const row of rows) this.drawRow(host, row, loss.length === 0);

    // SAYS THE 🧩 LIST IS EMPTY RATHER THAN BROKEN. The two rows above are
    // always there, so without this a reader cannot tell "you have saved none"
    // from "saved ones are not shown here".
    if (!rows.some((r) => r.variant)) {
      host.appendChild(
        emptyCallout(
          "layout-template",
          "No templates of your own yet",
          "Arrange a note the way you want it, then keep it under a name from “Edit sections…” → Template."
        )
      );
    }
  }

  // The rows: what ChronoAnvil shipped, then the reader's own.
  private rows(): TemplateRow[] {
    const preset = this.manager.shippedNameFor(this.ctx);
    // WHAT THIS TYPE BUILDS FROM NOW, to measure every other row against. See
    // `settableRows` below: the row that composes this is the one the type is
    // already on, and it is the one that draws no *Use as default*.
    //
    // ── AND IT IS NOT A ROW ITSELF (1.0.46) ────────────────────────────
    //
    // A ⭐ row sat above 🔒 naming it. The diary twin was the surface it was
    // reported on — *"there is ChronoAnvil default and Daily default, there only
    // needs to be one of these"* — and the reasoning is the window's rather than
    // the diary's, so both lose it: a row that composes `current` by definition
    // can never be settable, renamed or removed, and its sentence is the same
    // list of nouns the rows beneath it print. See the diary twin for the whole
    // argument and for what it costs.
    const current = this.manager.composedFor(this.ctx);
    const rows: TemplateRow[] = [
      {
        token: "🔒",
        title: "ChronoAnvil default",
        // NAMES WHICH SHIPPED ARRANGEMENT IT IS. "The catalogue's own" and
        // "Study's own" are different bytes and a reader about to press a button
        // that rewrites every future note of the type should be told which.
        subtitle: preset
          ? `The arrangement ${preset} ships with: ${listOf(
              bandOf(this.manager.shippedFor(this.ctx), this.ctx)
            )}.`
          : `The catalogue's own arrangement: ${listOf(
              bandOf(this.manager.shippedFor(this.ctx), this.ctx)
            )}.`,
        compose: () => ({ text: this.manager.shippedFor(this.ctx), drops: [] }),
        variant: null,
        settable: true,
        // NO NAME TO GIVE AND NOTHING TO REMOVE. This row is not stored: it is
        // read off the preset table, so renaming it would have nowhere to write
        // and removing it would have nothing to delete. That is what makes
        // "put it back the way it came" always available.
        editable: false,
      },
    ];
    for (const variant of this.manager.layoutsFor(this.ctx)) {
      // DESCRIBED BY WHAT IT COMPOSES TO, not by what it stores (1.0.46). The
      // two rows above are, and a row listing `variant.sections` instead read
      // as a different arrangement whenever the stored ids and the composed
      // ones differ — which they routinely do, since an id the target cannot
      // carry is stored and then dropped. `composedFrom` already tells us
      // which; the sentence should not disagree with it.
      const composed = this.manager.composedFrom(this.ctx, variant);
      rows.push({
        token: "🧩",
        title: variant.label,
        subtitle: composed.text
          ? `${listOf(bandOf(composed.text, this.ctx))}.`
          : "the catalogue's own arrangement",
        compose: () => composed,
        variant,
        settable: true,
        editable: true,
      });
    }
    return settableRows(rows, current);
  }

  // ACTIONS ON THEIR OWN LINE. The widest row carries four buttons and the
  // modal is about 560px; `actionsRow` is the arrangement `list-row.ts` offers
  // for exactly that, and using it on every row keeps the band from going ragged
  // where one row has one button and the next has four.
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
    if (row.editable && row.variant) {
      this.addRename(actions, row.variant);
      this.addRemove(actions, row.variant);
    }
  }

  // Rebuild this page from the row. Was called Reload until 1.0.46; the verb
  // changed because the row is now one of several things you can do to a
  // template rather than the only one.
  private addApply(actions: HTMLElement, row: TemplateRow): void {
    const apply = actions.createEl("button", {
      text: "Apply to this note",
      cls: "ca-tpl-toggle",
    });
    apply.addEventListener("click", () => {
      void (async () => {
        const { text, drops } = row.compose();
        if (drops.length) {
          // LOUD, NOT SILENT. Composing already declines to write a section it
          // cannot render here; the reader has to be told which, or a template
          // would quietly mean something different on each surface.
          new Notice(
            `ChronoAnvil: “${row.title}” names ${drops.join(
              ", "
            )}, which a ${this.noun.toLowerCase()} can't carry — the rest will be written.`
          );
        }
        this.close();
        await this.manager.reload(this.notePath, this.ctx, text, row.title);
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
        // ASKED FIRST, like the page's own save: this changes what EVERY future
        // note of the type looks like, and the Apply above it only touches the
        // page in front of the reader and shows a diff before it does.
        const ok = await confirmAction(
          this.app,
          `Use “${row.title}” as the default?`,
          `Every new ${this.noun.toLowerCase()} in ${
            this.ctx.type.name
          } will be built from it. Notes you already have keep what they have.`,
          "Use as default"
        );
        if (!ok) return;
        this.close();
        await this.manager.useAsDefault(this.ctx, row.variant);
      })();
    });
  }

  private addRename(actions: HTMLElement, variant: JournalVariantConfig): void {
    const ren = actions.createEl("button", {
      cls: "ca-tpl-toggle",
      text: "Rename",
      attr: { "aria-label": `Rename ${variant.label}` },
    });
    ren.addEventListener("click", () => {
      void (async () => {
        const next = await promptText(
          this.app,
          `Rename “${variant.label}”`,
          "Template name",
          variant.label
        );
        if (!next?.trim()) return;
        await this.manager.renameLayout(this.ctx, variant.id, next);
        await this.refresh();
      })();
    });
  }

  private addRemove(actions: HTMLElement, variant: JournalVariantConfig): void {
    const del = actions.createEl("button", {
      cls: "ca-tpl-toggle",
      text: "Remove",
      attr: { "aria-label": `Remove ${variant.label}` },
    });
    del.addEventListener("click", () => {
      void (async () => {
        // ASKED, unlike 4.28's capture delete, and the difference is where the
        // undo is. A deleted capture is one Ctrl+Z away in the note holding it;
        // a template lives in data.json, which the reader has no undo for.
        const ok = await confirmAction(
          this.app,
          `Remove “${variant.label}”?`,
          `It stops being offered on this ${this.noun.toLowerCase()}. Notes you built from it are not touched.`,
          "Remove"
        );
        if (!ok) return;
        const plan = await this.manager.deleteLayout(this.ctx, variant.id);
        // SAYS WHICH OF THE TWO HAPPENED. A shared template is withdrawn from
        // this target and kept for the others, and a reader told "removed" when
        // it is still on two other note types has been told the wrong thing.
        // `planTemplateRemoval` holds the rule and the case for it.
        if (plan?.kind === "withdraw") {
          new Notice(
            `ChronoAnvil: “${variant.label}” is no longer offered on ${this.noun.toLowerCase()} — it's still saved for ${plan.others.length} other place${
              plan.others.length === 1 ? "" : "s"
            }.`
          );
        } else if (plan) {
          new Notice(`ChronoAnvil: removed “${variant.label}”`);
        }
        await this.refresh();
      })();
    });
  }

  // ── this page ────────────────────────────────────────────────────────

  private drawThisPage(host: HTMLElement): void {
    host.createDiv({ cls: "ca-tpl-band", text: "This note" });

    const row = host.createDiv({ cls: "ca-tpl-actions" });
    const save = row.createEl("button", {
      text: "Save this note as the default",
      cls: "mod-cta",
    });
    save.addEventListener("click", () => {
      void (async () => {
        const ok = await confirmAction(
          this.app,
          "Save this note as the default?",
          `Every new ${this.noun.toLowerCase()} in ${
            this.ctx.type.name
          } will be built from this note's sections, in this note's order. Notes you already have keep what they have.`,
          "Save as default"
        );
        if (!ok) return;
        this.close();
        await this.manager.saveDefault(this.notePath, this.ctx);
      })();
    });

    host.createDiv({
      cls: "ca-tpl-note",
      // NAMES THE OTHER DOOR, the same courtesy `drawLoss` extends. "Save this
      // note as a layout…" stood here until 1.0.46 and was the second door onto
      // one write; the pane that draws the arrangement is where it is named now,
      // and a reader looking for the button they remember needs to be told where
      // it went rather than left to find the window empty of it.
      text: "To keep this note's arrangement under a name, open “Edit sections…” on the same menu and use its Template tab.",
    });
  }

  // What is standing in the way of an Apply, in the reader's own terms.
  private drawLoss(host: HTMLElement, loss: ReloadLoss[]): void {
    const box = host.createDiv({ cls: "ca-tpl-loss" });
    const head = box.createDiv({ cls: "ca-tpl-loss-head" });
    setIcon(head.createDiv({ cls: "ca-tpl-loss-icon" }), "pencil-line");
    head.createDiv({
      text: "There's something of yours on this note, so it can't be rebuilt from a template — a rebuild replaces everything below the properties. You can still rename and remove the templates below.",
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

// "a, b and c" — the plugin says lists this way everywhere a sentence holds one.
function listOf(items: string[]): string {
  if (!items.length) return "nothing";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
