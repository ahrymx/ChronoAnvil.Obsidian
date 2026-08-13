// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The repair window: what would change, and which parts of it to do.
//
// WHAT THIS REPLACES, AND WHY IT IS NOT JUST A BIGGER CONFIRM
//
// `confirmPlan` gave repair one button over four unlike things. It listed the
// notes that would be rewritten and, underneath, ran three other kinds of work
// the list never mentioned — files created, journal index notes caught up, two
// format migrations. Accepting meant accepting all of it; declining meant none
// of it, including the half that only ever adds missing files.
//
// Two things follow from that and both are in this window:
//
//   THE WORK IS GROUPED BY WHAT IT RISKS. Creating a missing folder and
//   rewriting a page a reader has edited are not the same decision, and a
//   command that treats them as one is asking for a yes it has not earned.
//
//   AND A DESCRIPTION IS NOT THE LINES. "adds open tasks" is a good sentence
//   and a reader deciding whether to let this touch a note they wrote is asking
//   about lines. Every row can be opened to show the literal added and removed
//   lines, diffed from the text the write itself produces.
//
// THE WINDOW IS STILL THE PLAN. `previewRepair`'s property is unchanged and is
// now stronger: the survey is built by the same code that does the work, minus
// the write, and the diff is computed from that code's own output rather than
// reconstructed from the op list. Nothing here summarises anything.
//
// CANCEL IS THE DEFAULT, on `PlanModal`'s rule and for its reason: Esc, the
// backdrop and the close button all decline, and the confirm button is never
// the focused control.

import { App, Modal, setIcon } from "obsidian";
import { createListRow } from "./list-row";
import { diffSummary } from "../core/line-diff";
import type { DiffLine } from "../core/line-diff";
import type {
  RepairFileChange,
  RepairGroup,
  RepairGroupId,
  RepairSurvey,
} from "../core/repair-plan";

// The groups the reader ticked, or null if they cancelled.
//
// NULL AND EMPTY ARE DIFFERENT ANSWERS. Cancelling is "do nothing"; unticking
// everything and pressing the button is also "do nothing", and the caller
// treats them the same — but the window must not turn one into the other,
// because a reader who unticked every box has said something deliberate and the
// button should say so back to them.
export type RepairChoice = Set<RepairGroupId> | null;

export function openRepairWindow(
  app: App,
  survey: RepairSurvey
): Promise<RepairChoice> {
  return new Promise((resolve) => {
    new RepairModal(app, survey, resolve).open();
  });
}

// How many items are worth showing before the list becomes the window.
//
// A fresh vault creates forty-odd files and a vault with a long diary can have
// hundreds of entries needing the banner migration. The full count is always
// stated on the group; this caps the ROWS, because a window a reader has to
// scroll for a minute to reach the button is one they will stop reading.
const ROWS_SHOWN = 12;

class RepairModal extends Modal {
  private chosen = new Set<RepairGroupId>();
  private confirmed = false;
  private go: HTMLButtonElement | null = null;

  constructor(
    app: App,
    private survey: RepairSurvey,
    private resolve: (choice: RepairChoice) => void
  ) {
    super(app);
    // EVERY GROUP STARTS TICKED, WHICH IS WHAT REPAIR ALREADY DID.
    //
    // The window's value is that a reader CAN decline a part of it, not that
    // they must now opt in to work that has run unasked-for-by-group since the
    // command existed. Defaulting the riskier groups off would quietly stop
    // doing things for every vault that upgrades — a behaviour change wearing a
    // safety feature's clothes.
    for (const g of this.pending()) this.chosen.add(g.id);
  }

  private pending(): RepairGroup[] {
    return this.survey.groups.filter((g) => g.items.length > 0);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("almanac-repair");
    contentEl.createEl("h3", { text: "Repair vault" });
    contentEl.createEl("p", {
      cls: "almanac-repair-lead",
      text:
        "Everything this would change, grouped by what it touches. Untick anything you " +
        "would rather it left alone. Nothing is written until you press the button.",
    });

    const list = contentEl.createDiv({ cls: "almanac-repair-groups" });
    for (const group of this.pending()) this.renderGroup(list, group);

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const go = btnRow.createEl("button", { cls: "mod-warning" });
    this.go = go;
    go.addEventListener("click", () => {
      this.confirmed = true;
      this.close();
    });
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    this.refreshButton();
    cancel.focus();
  }

  // The button says what it will do, counted from what is ticked.
  //
  // A BUTTON THAT CANNOT ACT SAYS SO BY BEING DISABLED — the house rule is that
  // nothing dead is DRAWN, and this is the narrower case that rule allows for: a
  // control that is momentarily inapplicable because of a choice the reader just
  // made, in a window where it is the only way back to acting. Removing it would
  // leave a reader who unticked everything looking at a window with one button
  // marked Cancel and no explanation.
  private refreshButton(): void {
    const go = this.go;
    if (!go) return;
    const n = this.chosen.size;
    const items = this.pending()
      .filter((g) => this.chosen.has(g.id))
      .reduce((sum, g) => sum + g.items.length, 0);
    go.disabled = n === 0;
    go.setText(
      n === 0
        ? "Nothing selected"
        : `Repair ${items} ${items === 1 ? "thing" : "things"}`
    );
  }

  private renderGroup(host: HTMLElement, group: RepairGroup): void {
    const wrap = host.createDiv({ cls: "almanac-repair-group" });

    const { row, lead } = createListRow(wrap, {
      token: group.glyph,
      title: group.title,
      subtitle: group.blurb,
      pills: [
        {
          text: `${group.items.length} ${group.noun}${
            group.items.length === 1 ? "" : "s"
          }`,
          tone: "muted",
        },
      ],
    });
    row.addClass("almanac-repair-head");

    // THE TICK GOES IN THE `lead` SLOT, which is the one `createListRow` keeps
    // in front of the token for exactly this — a row that is a choice rather
    // than a record. No second row component, no second set of paddings.
    const box = lead.createEl("input", { type: "checkbox" });
    box.checked = this.chosen.has(group.id);
    box.setAttribute("aria-label", group.title);
    const sync = (): void => {
      if (box.checked) this.chosen.add(group.id);
      else this.chosen.delete(group.id);
      wrap.toggleClass("is-off", !box.checked);
      this.refreshButton();
    };
    box.addEventListener("change", sync);
    // The whole head row toggles it, which is what a reader tries first. The
    // checkbox's own click is left alone or it would fire twice and cancel out.
    row.addEventListener("click", (e) => {
      if (e.target === box) return;
      box.checked = !box.checked;
      sync();
    });

    const items = wrap.createDiv({ cls: "almanac-repair-items" });
    for (const item of group.items.slice(0, ROWS_SHOWN)) {
      this.renderItem(items, item);
    }
    const hidden = group.items.length - ROWS_SHOWN;
    if (hidden > 0) {
      items.createDiv({
        cls: "almanac-repair-more",
        text: `…and ${hidden} more`,
      });
    }
  }

  private renderItem(host: HTMLElement, item: RepairFileChange): void {
    const wrap = host.createDiv({ cls: "almanac-repair-item" });
    const summary = item.diff ? diffSummary(item.diff) : null;
    // Only a file with a diff has anything to open. A created file has no
    // before to compare against, and "every line is an addition" is not a
    // differential — see `RepairFileChange.diff`.
    const changed = item.diff?.lines.filter((l) => l.kind !== "same") ?? [];
    const canOpen = changed.length > 0;

    const { row, lead, actions } = createListRow(wrap, {
      dense: true,
      token: "",
      title: item.label,
      subtitle: item.ops.map((o) => o.detail).join(" · "),
      cls: canOpen ? ["is-openable"] : [],
    });
    if (summary) {
      actions.createSpan({ cls: "almanac-repair-count", text: summary });
    }

    if (!canOpen) return;

    const caret = lead.createSpan({ cls: "almanac-repair-caret" });
    setIcon(caret, "chevron-right");

    const body = wrap.createDiv({ cls: "almanac-repair-diff" });
    body.hide();
    for (const line of changed) this.renderDiffLine(body, line);
    if (item.diff?.truncated) {
      body.createDiv({
        cls: "almanac-repair-truncated",
        text: "This note is too long to diff line by line — the counts are an estimate.",
      });
    }

    let open = false;
    row.addEventListener("click", () => {
      open = !open;
      if (open) body.show();
      else body.hide();
      wrap.toggleClass("is-open", open);
      setIcon(caret, open ? "chevron-down" : "chevron-right");
    });
  }

  private renderDiffLine(host: HTMLElement, line: DiffLine): void {
    const el = host.createDiv({
      cls: `almanac-repair-line is-${line.kind}`,
    });
    // A GLYPH IN ITS OWN SPAN rather than prepended to the text, so a reader
    // copying a line out of this window gets the line and not the marker.
    el.createSpan({
      cls: "almanac-repair-mark",
      text: line.kind === "add" ? "+" : "−",
    });
    // An empty line still needs to occupy one, or a diff that adds a blank
    // separator shows a gap with no marker beside it.
    el.createSpan({ cls: "almanac-repair-text", text: line.text || " " });
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed ? this.chosen : null);
  }
}
