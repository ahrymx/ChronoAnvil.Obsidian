// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The "+ Add tracker" window.
//
// This was a SuggestModal — a search box over a list of labels, and nothing
// else. It answered the question "which of my trackers goes on this entry?"
// and refused to acknowledge the far more common one that comes with it:
// "…and what if the thing I want to log isn't one of them yet?" The honest
// answer used to be a Notice pointing at Settings → Trackers, which meant
// leaving the note, opening settings, finding the section, creating the
// tracker, closing settings, coming back, and pressing + Add tracker again —
// seven steps to log that you went for a run.
//
// So the picker is a window rather than a suggester, and the create path is in
// it. Two things follow from that shape rather than being bolted onto it:
//
//   the list can show what each choice WRITES (its type, its unit, its
//   property) as a second line, which a suggester's single row could only fit
//   by cramming both into one string with a separator;
//   "New tracker…" can hand the editor a surface already set to this note's,
//   so a tracker created from a Cooking note is a Cooking tracker without the
//   reader having to know what a surface is.
//
// The registry is still the only place a tracker is DEFINED — creating one
// here writes it to settings and syncs the vault exactly as the settings tab
// would, then adds it to the note. Nothing about a tracker lives on a note but
// the reference to it.

import { App, setIcon } from "obsidian";
import { EditorModal } from "../ui/editor-modal";
import type AlmanacPlugin from "../main";
import type { TrackerOption } from "./entry-trackers";
import { journalTypeNamer } from "./entry-trackers";
import type { TrackerDef, TrackerSurface } from "./trackers";
import {
  describeSurface,
  describeSurfaceLabel,
  diaryClassOf,
  diarySurface,
  propertyNameFromLabel,
  uniquePropertyName,
} from "./trackers";
import { openTrackerEditor } from "../core/settings-editors";

// What the picker resolved to: an existing tracker's directive, a request to
// open the editor, or nothing at all.
export type PickerResult =
  | { kind: "directive"; directive: string }
  | { kind: "create" }
  | null;

// ON THE FRAME SINCE 2.56.11, and this window is §5.1's exhibit.
//
// It extended `Modal` and then rebuilt `.almanac-editor-modal`,
// `.almanac-editor-head`, `.almanac-editor-subtitle` and
// `.almanac-editor-footer` by hand — its own stylesheet said so out loud: "it
// borrows .almanac-editor-modal's frame (head / scrolling body / footer) so the
// two windows read as the same kind of object". A component that wanted the
// shared frame so badly it copied the class names instead of extending the
// class, written by someone who could see the problem and had no cheap way to
// fix it. That sentence is the whole thesis of the 2.56 plan, and it was
// already in the repository.
//
// The awkward fit is real and worth naming: this window RESOLVES A PROMISE
// rather than saving anything, so `commit()` records a choice instead of
// writing one. That is a fair use of the contract — the frame's job is the
// head, the scrolling body, the footer, the error line and the Enter key, none
// of which care whether the outcome touches disk.
class TrackerPickerModal extends EditorModal {
  private resolved: PickerResult = null;
  private query = "";
  private listEl!: HTMLElement;

  constructor(
    app: App,
    plugin: AlmanacPlugin,
    private options: TrackerOption[],
    surface: TrackerSurface | null,
    surfaceLabel: string,
    private resolve: (result: PickerResult) => void
  ) {
    super(
      app,
      plugin,
      "Add a tracker to this entry",
      // Says the two true things a reader needs and neither more: this is
      // per-note, and this note's surface is what bounds the list. Without the
      // second sentence an empty list looks like a bug rather than a rule.
      surface
        ? `Adds a widget to this note only — Settings decides what a new entry starts with. Only ${surfaceLabel} trackers can be logged here.`
        : "Adds a widget to this note only — Settings decides what a new entry starts with.",
      "New tracker…"
    );
  }

  protected renderBody(): void {
    const contentEl = this.body;
    this.contentEl.addClass("almanac-tracker-picker");

    const search = contentEl.createEl("input", {
      cls: "almanac-picker-search",
      type: "text",
      attr: { placeholder: "Search trackers…", "aria-label": "Search trackers" },
    });
    search.addEventListener("input", () => {
      this.query = search.value.trim().toLowerCase();
      this.paint();
    });
    window.setTimeout(() => search.focus(), 0);

    this.listEl = contentEl.createDiv({ cls: "almanac-picker-list" });
    this.paint();
  }

  // Enter takes the first match, so the keyboard path through this window is as
  // short as the suggester's was: type, Enter. The frame already binds Enter on
  // single-line inputs and routes it here, so this is an override rather than a
  // second keydown listener on the search box.
  protected async onEnterKey(): Promise<void> {
    const first = this.matches()[0];
    if (first) this.choose({ kind: "directive", directive: first.directive });
  }

  protected renderFooter(footer: HTMLElement): void {
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const create = footer.createEl("button", { cls: "mod-cta" });
    setIcon(create.createSpan({ cls: "almanac-picker-new-icon" }), "plus");
    create.createSpan({ text: this.saveLabel });
    create.setAttr(
      "title",
      "Define a new tracker and add it to this entry in one go"
    );
    create.addEventListener("click", () => void this.trySubmit());
  }

  // Nothing to refuse: every row in the list is a valid choice, and the CTA
  // opens the tracker editor rather than writing anything.
  protected validate(): string | null {
    return null;
  }

  protected async commit(): Promise<void> {
    this.resolved = { kind: "create" };
  }

  private matches(): TrackerOption[] {
    if (!this.query) return this.options;
    return this.options.filter(
      (o) =>
        o.label.toLowerCase().includes(this.query) ||
        o.detail.toLowerCase().includes(this.query)
    );
  }

  private paint(): void {
    this.listEl.empty();
    const rows = this.matches();
    if (rows.length === 0) {
      this.listEl.createDiv({
        cls: "almanac-picker-empty",
        text: this.options.length === 0
          ? "This note already shows every tracker it can — make another one below."
          : "Nothing matches that.",
      });
      return;
    }
    for (const o of rows) {
      const row = this.listEl.createDiv({ cls: "almanac-picker-row" });
      row.createDiv({ cls: "almanac-picker-row-label", text: o.label });
      row.createDiv({ cls: "almanac-picker-row-detail", text: o.detail });
      row.addEventListener("click", () =>
        this.choose({ kind: "directive", directive: o.directive })
      );
    }
  }

  private choose(result: PickerResult): void {
    this.resolved = result;
    this.close();
  }

  onClose(): void {
    super.onClose();
    // Resolves on close whatever route got here — a row, the CTA, Cancel or
    // Escape — so the caller's `await` always settles exactly once.
    this.resolve(this.resolved);
  }
}

export function promptTrackerPicker(
  app: App,
  plugin: AlmanacPlugin,
  options: TrackerOption[],
  surface: TrackerSurface | null
): Promise<PickerResult> {
  const label = surface
    ? describeSurfaceLabel(surface, journalTypeNamer(plugin))
    : "";
  return new Promise((resolve) => {
    new TrackerPickerModal(app, plugin, options, surface, label, resolve).open();
  });
}

// The definition a "New tracker…" starts from, seeded for the note it was
// pressed on.
//
// SURFACE FROM THE NOTE, not the daily default the settings tab uses. The
// settings tab is asked about trackers in the abstract, where "most things you
// log, you log on a day" is the right guess; here the reader is standing on a
// specific note and has just said they want to log something on it. Seeding
// anything else would make the very first save fail its own surface check.
//
// SHOWINTEMPLATE OFF, for the same reason read from the other side: pressing
// "+ Add tracker" is the gesture for a thing that happened *today*, not for a
// thing that happens every day. A reader who wants it on every entry can turn
// that on in Settings; a reader who didn't want it there is spared having to
// notice that it happened. The Diary.base column stays on, because an
// occasional tracker is still worth a column (see TrackerDef.showInBase).
export function seedTrackerFor(
  plugin: AlmanacPlugin,
  surface: TrackerSurface | null
): TrackerDef {
  const seedSurface = surface ?? diarySurface("daily");
  const label = "🆕 New tracker";
  return {
    id: uniquePropertyName(
      propertyNameFromLabel(label),
      plugin.settings.trackers.map((t) => t.id)
    ),
    label,
    type: "number",
    step: 1,
    surface: seedSurface,
    // Both flags are diary-only and forced false for a journal surface by
    // normalizeTrackers; setting them from the class keeps the editor's own
    // toggles honest about what it is going to do.
    showInTemplate: false,
    showInBase: diaryClassOf(seedSurface) != null,
  };
}

// Open the tracker editor on that seed, and report back what was saved.
// Resolves null if the editor is cancelled, so the caller can tell "no tracker
// made" from "tracker made and here it is".
export function promptNewTracker(
  app: App,
  plugin: AlmanacPlugin,
  surface: TrackerSurface | null
): Promise<TrackerDef | null> {
  return new Promise((resolve) => {
    // The editor saves through a callback and closes afterwards, so the draft
    // is captured by the time the dismiss fires — and a cancel resolves null
    // through the same path rather than leaving the caller waiting.
    let saved: TrackerDef | null = null;
    openTrackerEditor(
      app,
      plugin,
      seedTrackerFor(plugin, surface),
      { isNew: true, onClose: () => resolve(saved) },
      async (def) => {
        saved = def;
      }
    );
  });
}

// How a newly created tracker describes itself in the confirmation notice —
// enough to see it landed where it was meant to.
export function describeNewTracker(
  plugin: AlmanacPlugin,
  def: TrackerDef
): string {
  return `${def.label || def.id} (${describeSurface(
    def.surface,
    journalTypeNamer(plugin)
  )})`;
}
