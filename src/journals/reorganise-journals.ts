// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The window behind the Journals header's ⇅ button: what order the journals go
// in. 4.40.
//
// ── WHY THIS PAGE GETS A WINDOW AND THE HOMEPAGE GETS A DRAG ─────────────
//
// The homepage draws journals as cards — 240px objects in a row, at a size a
// hand can pick up — so there the gesture is the whole feature and this window
// would be the weaker duplicate 4.8.1 spent a release removing. The Journals
// page draws each journal as a full-width SECTION with its subject grid inside
// it and its own fold; a section is a place you are looking at, not a thing you
// lift, and dragging one past three others means dragging past their contents.
//
// So the reader's two asks are one feature on two surfaces, and each surface
// gets the affordance its shape can carry. The write is shared
// (`journal-order.ts`), which is what stops them being two features.
//
// ── ARROWS, NOT DRAG, AND THAT IS THE READER'S CALL ──────────────────────
//
// *"Drag is for cards only."* The section editor pairs drag with arrows and its
// note argues both are right — *"a button is keyboard-reachable in a way a
// handle is not"* — so what is dropped here is the half that surface already
// has, not the half that carries the keyboard. A list of four rows with ↑ and ↓
// is not a lesser control at this size; it is the one the reader asked for and
// the only one a keyboard can reach.
//
// ── NOTHING IS WRITTEN UNTIL SAVE ────────────────────────────────────────
//
// `SectionEditor`'s rule, and the reason it gives holds exactly: a reader
// nudging four rows is planning, and a window that wrote on every nudge would
// repaint the page under them four times and leave no way back. Cancel, Esc and
// the backdrop all decline; the CTA is the only thing that writes.

import { App, Modal, Notice, setIcon } from "obsidian";

import type AlmanacPlugin from "../main";
import { createListRow } from "../ui/list-row";
import { applyJournalOrder } from "./journal-order";
import { registeredJournalTypes } from "./journal";

class ReorganiseJournalsModal extends Modal {
  // The working order. A copy from the moment the window opened, which is what
  // makes Cancel free: nothing outside this array has been touched.
  private ids: string[];
  private readonly names = new Map<string, { name: string; emoji: string }>();

  constructor(app: App, private plugin: AlmanacPlugin) {
    super(app);
    const types = registeredJournalTypes(plugin);
    this.ids = types.map((t) => t.id);
    for (const t of types) this.names.set(t.id, { name: t.name, emoji: t.emoji });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("almanac-reorder-modal");
    contentEl.createEl("h3", { text: "Reorganise journals" });
    contentEl.createEl("p", {
      cls: "almanac-modal-note",
      // WHAT IT CHANGES AND WHAT IT DOES NOT, said before the reader moves
      // anything. Reordering a list that also drives a folder tree invites the
      // question "does this move my notes?", and the answer has to be on the
      // window rather than in a changelog.
      text: "The order journals appear in, on this page and on the homepage. Nothing moves on disk — no folder is renamed and no note is touched.",
    });

    this.renderList(contentEl.createDiv({ cls: "almanac-reorder-list" }));

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });
    save.addEventListener("click", () => void this.save());
  }

  private renderList(host: HTMLElement): void {
    host.empty();
    this.ids.forEach((id, at) => {
      const meta = this.names.get(id);
      const { lead } = createListRow(host, {
        // THE POSITION IS THE TOKEN. The slot holds a short glyph or number that
        // identifies the row, and on a list whose whole subject is order, the
        // number IS the subject — a reader checking their work reads the column
        // rather than counting rows.
        token: String(at + 1),
        title: `${meta?.emoji ?? ""} ${meta?.name ?? id}`.trim(),
        dense: true,
      });
      const nudge = (delta: number, label: string, icon: string): void => {
        const b = lead.createEl("button", {
          cls: "almanac-tpl-arrow",
          attr: { type: "button", "aria-label": label, title: label },
        });
        setIcon(b, icon);
        // DISABLED AT THE ENDS RATHER THAN ABSENT, which is the section editor's
        // choice one file over and its reason: a reader looking for the control
        // learns nothing from its absence, and a row missing a button reads as a
        // row of a different kind.
        b.disabled = at + delta < 0 || at + delta >= this.ids.length;
        b.addEventListener("click", () => {
          const next = [...this.ids];
          [next[at], next[at + delta]] = [next[at + delta], next[at]];
          this.ids = next;
          this.renderList(host);
        });
      };
      nudge(-1, "Move up", "chevron-up");
      nudge(1, "Move down", "chevron-down");
    });
  }

  private async save(): Promise<void> {
    // The window closes either way. A save that changed nothing is a reader who
    // opened the list, looked, and left — reporting that back would be telling
    // them what they already know.
    const moved = await applyJournalOrder(this.plugin, this.ids);
    if (moved) new Notice("Journal order saved.");
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function openReorganiseJournals(plugin: AlmanacPlugin): void {
  // NO WINDOW FOR A LIST THAT CANNOT BE REORDERED. One journal has one order,
  // and none has no list at all — a window offering to arrange it would be a
  // control that does nothing, which is `empty.ts`' rule applied to a modal.
  if (registeredJournalTypes(plugin).length < 2) {
    new Notice("Add a second journal before there is an order to change.");
    return;
  }
  new ReorganiseJournalsModal(plugin.app, plugin).open();
}
