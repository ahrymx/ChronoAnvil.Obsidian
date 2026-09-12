// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The window that opens before a journal type's note kinds change.
//
// WHY IT IS NOT confirmAction
//
// `confirmAction` takes a `message: string`, which is right for "delete this
// tracker?" and wrong here. This has to show a list per added kind, a list per
// removed kind with a count read off the vault, an unhedged guarantee, and —
// only when something is being removed — six consequences. Flattening that
// into one paragraph would produce the sort of wall a reader scrolls past,
// which for a destructive confirmation is worse than not asking.
//
// The tracker-orphan picker in settings.ts already established that a
// journal-shaped consequence deserves a purpose-built window rather than a
// stretched confirm.
//
// THE COUNT IS THE POINT
//
// "Those notes stop being recognised" is a sentence a reader nods at. "14
// notes on disk carry type: meeting" is one they picture. It is read from
// metadataCache at the moment the window opens, which is cheap, and it is the
// number the rest of the message is about. At zero the whole window gets much
// quieter, because at zero it should.
//
// IT COVERS FOLDER DEPTH TOO, AND THAT IS NOT A SECOND FEATURE BOLTED ON.
//
// A level is an id that becomes a `type:` value, exactly as a kind is — see
// `KindChangeSubject`. Dropping a journal from two levels to flat used to
// declassify every sub-index note it had written with no window at all, which
// is precisely the harm this one was built to refuse to do quietly. What the
// subject changes here is three things and nothing else: the title, the button
// label, and which cost function a removal prints.
//
// SAY "NOTES", NOT "PAGES"
//
// In ChronoAnvil's own vocabulary a *page* is a specific thing — the sub-notes a
// long note is split across, deliberately excluded from `kinds` so they are
// never queued, counted or listed. Using "page" here for "a note that gets
// created" would collide with the narrower meaning the reader has already been
// taught everywhere else.

import type { App } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { EditorModal } from "../ui/editor-modal";
import {
  KindChange,
  declassificationCost,
  kindChangeIsDestructive,
  levelAdditionCost,
  levelRemovalCost,
} from "./journal-plan";

export interface KindChangeCounts {
  // id -> how many notes on disk carry that `type:` value.
  [kindId: string]: number;
}

// What to call the change in the title and on the button.
//
// A reader who changed the depth and nothing else should not be asked about
// "note types" — they would reasonably answer a question they were not being
// asked. Three phrasings rather than one generic "structure" for all of them,
// because the generic word is the one that tells the reader least at the moment
// they most need telling.
function changeWords(changes: KindChange[]): { noun: string; cta: string } {
  const kinds = changes.some((c) => c.subject === "kind");
  const levels = changes.some((c) => c.subject === "level");
  if (kinds && levels) {
    return { noun: "structure", cta: "Change the structure" };
  }
  if (levels) return { noun: "folder depth", cta: "Change the depth" };
  return { noun: "note types", cta: "Change the note types" };
}

// A CONFIRMATION, on the shared frame since 2.56.11.
//
// It is not an editor and has no fields, which is the argument for leaving it
// alone — and the argument against is that it was already building
// `.ca-editor-footer` by hand, so it had decided it was a window of this
// family and was reimplementing the parts. What it takes from the frame is the
// head, the scrolling body and the footer; what it does not take is Save,
// because its commit is an answer rather than a write.
//
// The CTA is `mod-warning` when the change destroys something and `mod-cta`
// when it does not, which is why `renderFooter` is overridden rather than
// configured: a button whose colour is an argument about consequences is not a
// label the frame can be handed.
class KindChangeModal extends EditorModal {
  private decided = false;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private typeName: string,
    private changes: KindChange[],
    private counts: KindChangeCounts,
    private resolve: (ok: boolean) => void
  ) {
    const words = changeWords(changes);
    super(app, plugin, `Change the ${words.noun} of “${typeName}”?`, "", words.cta);
  }

  protected renderBody(): void {
    const contentEl = this.body;
    this.contentEl.addClass("ca-kind-change");

    const added = this.changes.filter((c) => c.kind === "added");
    const removed = this.changes.filter((c) => c.kind === "removed");
    const other = this.changes.filter(
      (c) => c.kind !== "added" && c.kind !== "removed"
    );

    if (added.length) this.section("Adding", added, "add");
    if (removed.length) this.section("Removing", removed, "remove", true);
    if (other.length) this.section("Changing", other, "other");

    // THE GUARANTEE, unhedged and in its own box. Every other paragraph in
    // this window is about what changes; this is the one about what does not,
    // and it is the reason a reader can press the button at all.
    //
    // NARROWED IN 3.18, AND THE GUARANTEE IS NOT WEAKER (§1.4). The old wording
    // was "Nothing already written changes", which was about the reader's NOTES
    // and was already slightly over-stated with respect to dashboards —
    // reconcileLayouts and previewRepair have composed and repaired those for
    // several releases. 3.18 makes a dashboard able to gain the note table this
    // very window is about, so the sentence has to say which of the two it is
    // promising about, and it has to keep promising the part that matters: a
    // reader's own writing is not touched, and nothing at all is written
    // without being shown and accepted first.
    //
    // THE SECOND HALF IS CONDITIONAL, because it is a promise about something
    // that only happens for an added KIND. `findDashboardCatchups` looks for an
    // index note missing a table for a note type; a depth change offers nothing,
    // so printing "dashboards will offer to list the new type" on a depth change
    // would promise a window that never opens — and a guarantee that says one
    // untrue thing is read as a guarantee.
    const promise = contentEl.createDiv({ cls: "ca-kind-promise" });
    promise.createEl("strong", { text: "Nothing you have written changes." });
    promise.createSpan({
      text:
        " Every note keeps the type: value it was created with, its text, its trackers and its frontmatter." +
        (added.some((c) => c.subject === "kind")
          ? " Dashboards will offer to list the new type; nothing is written until you accept the change."
          : ""),
    });

    // THE COST, only where there is one. A change that orphans nothing should
    // not get a wall of consequences that all begin "those 0 notes", which is
    // why every cost function returns an empty list at zero rather than a
    // hedged paragraph.
    //
    // WALKS EVERY CHANGE, not just the removals. That was the same loop until
    // levels arrived, and it could be, because a kind is only ever added to an
    // empty space. A level is added on top of notes that are already there.
    for (const c of this.changes) {
      const lines = this.costOf(c);
      if (!lines.length) continue;
      const cost = contentEl.createDiv({ cls: "ca-kind-cost" });
      for (const line of lines) cost.createDiv({ text: line });
    }

  }

  protected renderFooter(footer: HTMLElement): void {
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.finish(false));
    const go = footer.createEl("button", {
      text: this.saveLabel,
      cls: kindChangeIsDestructive(this.changes) ? "mod-warning" : "mod-cta",
    });
    go.addEventListener("click", () => this.finish(true));
  }

  // Nothing to refuse and nothing to write: the answer is the outcome.
  protected validate(): string | null {
    return null;
  }

  protected async commit(): Promise<void> {}

  // WHICH SENTENCES THIS CHANGE DESERVES.
  //
  // `counts[id]` MEANS TWO DIFFERENT THINGS, and this is the only place that
  // knows which. For anything being removed it is the notes carrying that id,
  // which is what the "Removing" rows print. For a level being added it is the
  // notes the new level strands — there is no id on disk to count yet, so the
  // editor fills the slot with the number the reader actually needs, and the
  // sentence built from it says so in words rather than leaving a bare figure
  // to be read as the wrong thing.
  private costOf(c: KindChange): string[] {
    const n = this.counts[c.id] ?? 0;
    if (c.subject === "level") {
      if (c.kind === "removed") return levelRemovalCost(this.typeName, c.label, n);
      if (c.kind === "added") return levelAdditionCost(c.label, n);
      return [];
    }
    return c.kind === "removed" ? declassificationCost(this.typeName, n) : [];
  }

  private section(
    title: string,
    changes: KindChange[],
    tone: string,
    withCounts = false
  ): void {
    const wrap = this.body.createDiv({
      cls: `ca-kind-group ca-kind-${tone}`,
    });
    wrap.createDiv({ cls: "ca-kind-group-title", text: title });
    for (const c of changes) {
      const row = wrap.createDiv({ cls: "ca-kind-row" });
      row.createEl("strong", { text: c.label });
      if (withCounts) {
        const n = this.counts[c.id] ?? 0;
        row.createSpan({
          cls: "ca-kind-count",
          text:
            n === 0
              ? " — no notes use it"
              : ` — ${n} note${n === 1 ? "" : "s"} on disk carry type: ${c.id}`,
        });
      }
      row.createDiv({ cls: "ca-kind-detail", text: c.detail });
    }
  }

  private finish(ok: boolean): void {
    this.decided = true;
    this.resolve(ok);
    this.close();
  }

  onClose(): void {
    super.onClose();
    // Dismissed without answering. Cancel, on the same reading the
    // tracker-orphan picker settled on: "a stray keypress should not destroy
    // trackers." Here it should not declassify notes either.
    if (!this.decided) this.resolve(false);
  }
}

export function confirmKindChange(
  app: App,
  plugin: ChronoAnvilPlugin,
  typeName: string,
  changes: KindChange[],
  counts: KindChangeCounts
): Promise<boolean> {
  return new Promise((resolve) => {
    new KindChangeModal(app, plugin, typeName, changes, counts, resolve).open();
  });
}
