// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { promptChoice } from "../ui/modals";
import {
  addDirectiveToNote,
  applyDirectiveEdits,
  describeDirective,
  describeSurfaceMismatch,
  directiveAllowedOn,
  journalTypeNamer,
  noteKindOf,
  isManagedTemplate,
  noteSurfaceOf,
  readEntryState,
  readEntryTrackers,
  removeDirectiveFromNote,
  trackerDirective,
  trackerOptions,
  warnManagedTemplate,
} from "./entry-trackers";
import {
  describeNewTracker,
  promptNewTracker,
  promptTrackerPicker,
} from "./tracker-picker";
import type { TrackerSurface } from "./trackers";
import { normalizeTrackers } from "./trackers";
// Called directly rather than through charts.ts's syncTrackerConfig, which is
// a one-line pass-through to exactly this function. Going via charts/ made
// trackers/ import charts/ — the only edge in that direction, against fourteen
// the other way — and turned a clean one-way dependency into a cycle for no
// behaviour at all. Charts are defined by the tracker they plot; trackers have
// no reason to know charts exist.
import { syncTrackersIntoVault } from "./trackers";
import { notify } from "../core/notify";
import { habitWrites, type HabitDraft, type HabitRow } from "./habits";
import { getFile } from "../core/util";

// Drives the per-note tracker flows behind the "+ Add tracker" tile and the
// per-cell remove button. The counterpart of charts-manager.ts, and the same
// shape for the same reason: the note is the source of truth, so this class
// only picks, splices and reports — it holds no state of its own.
export class EntryTrackers {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  // Both questions, asked once (3.13 §9.2).
  //
  // `add-tracker-to-entry` and `remove-tracker-from-entry` were the same
  // question — WHICH TRACKERS DOES THIS ENTRY CARRY — asked twice with opposite
  // polarity. A reader swapping one for another ran two commands and answered
  // two pickers, and neither picker ever showed the other half of the answer.
  //
  // One list, present first and marked, then what could be added. Picking a
  // present row removes it; picking an absent one adds it. The state is IN the
  // list rather than in which command you chose to run, which is what makes
  // this one question rather than a menu in front of two.
  //
  // NEITHER UNDERLYING METHOD CHANGES. `addTracker` and `removeTracker` keep
  // their pre-chosen-directive paths, because the widgets call them that way —
  // the "+ Add tracker" tile, the per-cell remove button, the entry and study
  // headers. This is a third door onto the same two rooms, not a replacement
  // for them.
  //
  // STILL ASKS AT ONE. `modals.ts::only` takes a lone option rather than
  // charging a keystroke for a non-choice, and that rule is deliberately not
  // used here: on an entry with exactly one tracker it would delete it without
  // the reader ever confirming, and "there was only one" is not consent. The
  // remove picker carried that note and this inherits it.
  async manageTrackers(notePath: string): Promise<void> {
    if (isManagedTemplate(this.plugin, notePath)) return warnManagedTemplate();

    const surface = noteSurfaceOf(this.app, this.plugin, notePath);
    const { present, editedProperties } = await readEntryState(
      this.app,
      this.plugin,
      notePath
    );
    const addable = trackerOptions(
      this.plugin.settings.trackers,
      this.plugin.settings.sleepEnabled,
      present,
      surface,
      editedProperties,
      noteKindOf(this.app, this.plugin, notePath)
    );

    type Row =
      | { kind: "remove"; directive: string; label: string }
      | { kind: "add"; directive: string; label: string }
      | { kind: "create"; directive: null; label: string };

    const rows: Row[] = [
      ...present.map((d) => ({
        kind: "remove" as const,
        directive: d,
        label: `✓ ${describeDirective(this.plugin.settings.trackers, d)} — remove`,
      })),
      ...addable.map((o) => ({
        kind: "add" as const,
        directive: o.directive,
        label: `＋ ${o.label} — add${o.detail ? ` (${o.detail})` : ""}`,
      })),
      { kind: "create" as const, directive: null, label: "＋ New tracker…" },
    ];

    const pick = await promptChoice(
      this.app,
      rows,
      (r) => r.label,
      "Trackers for this entry"
    );
    if (!pick) return;

    if (pick.kind === "remove") return this.removeTracker(notePath, pick.directive);
    if (pick.kind === "add") return this.addTracker(notePath, pick.directive);
    const made = await this.createAndDirective(surface);
    if (made) await this.addTracker(notePath, made);
  }

  // Add a tracker to one entry. With `directive` given (a repeat of a choice
  // already made, or a scripted call) the picker is skipped.
  async addTracker(notePath: string, directive?: string): Promise<void> {
    if (isManagedTemplate(this.plugin, notePath)) return warnManagedTemplate();

    // The surface of the note being added to, resolved once and used twice:
    // to filter the picker, and to vet a directive that skipped it.
    const surface = noteSurfaceOf(this.app, this.plugin, notePath);

    let chosen = directive;
    if (!chosen) {
      const { present, editedProperties } = await readEntryState(
        this.app,
        this.plugin,
        notePath
      );
      const options = trackerOptions(
        this.plugin.settings.trackers,
        this.plugin.settings.sleepEnabled,
        present,
        surface,
        editedProperties,
        // Narrows the offer to what this *kind* of note measures — a Practice
        // note isn't offered Confidence. A filter only: the note may still
        // hold anything its surface admits, so nothing is refused and no
        // logged value is stranded.
        noteKindOf(this.app, this.plugin, notePath)
      );
      // An empty list is no longer a dead end, so it is no longer a Notice.
      //
      // It used to be two of them, worded to tell "you've used them all" apart
      // from "none of your trackers are monthly" — a real distinction, and
      // both messages ended by pointing at Settings, because from here there
      // was nothing else to point at. The window has "New tracker…" in it, so
      // both cases open the same window and the difference becomes a sentence
      // in the empty state rather than a reason to refuse.
      const pick = await promptTrackerPicker(
        this.app,
        this.plugin,
        options,
        surface
      );
      if (!pick) return;
      if (pick.kind === "create") {
        const made = await this.createAndDirective(surface);
        if (!made) return;
        chosen = made;
      } else {
        chosen = pick.directive;
      }
    }

    // A directive can also arrive pre-chosen — from `button:tracker-add:<id>`
    // in a note, or a scripted call — which bypasses the picker and so
    // bypasses the filtering above. Check it here rather than trusting the
    // caller: a button written into a monthly dashboard, or onto a Cooking
    // note, is exactly the way a daily module would otherwise still get in. Redundant on the picker path,
    // where the options were already filtered, and cheap enough to keep as one
    // unconditional gate rather than a rule enforced in two places.
    if (
      surface != null &&
      !directiveAllowedOn(this.plugin.settings.trackers, chosen, surface)
    ) {
      new Notice(
        describeSurfaceMismatch(
          this.plugin.settings.trackers,
          chosen,
          surface,
          journalTypeNamer(this.plugin)
        )
      );
      return;
    }

    const added = await addDirectiveToNote(
      this.app,
      this.plugin,
      notePath,
      chosen
    );
    const name = describeDirective(this.plugin.settings.trackers, chosen);
    new Notice(
      added ? `✅ ${name} added to this entry.` : `${name} is already on this entry.`
    );
  }

  // "New tracker…": define one and hand back the directive that puts it on
  // this note, or null if the editor was cancelled.
  //
  // The registry write is the settings tab's write, deliberately: push, save,
  // then syncTrackersIntoVault, which is what rewrites the entry templates and
  // Diary.base. Doing anything less here would make a tracker created from a
  // note a second-class one — present on the entry, absent from the column
  // list, and silently different from the same tracker made two screens away.
  //
  // normalizeTrackers runs over the result for the same reason load does: the
  // editor's draft is a shape the reader assembled, and the invariants it has
  // to satisfy (a journal surface carries neither flag, the built-ins keep
  // their order) are asserted in one place rather than trusted from the form.
  private async createAndDirective(
    surface: TrackerSurface | null
  ): Promise<string | null> {
    const def = await promptNewTracker(this.app, this.plugin, surface);
    if (!def) return null;
    this.plugin.settings.trackers = normalizeTrackers(
      [...this.plugin.settings.trackers, def],
      this.plugin.settings.sleepEnabled
    );
    await this.plugin.saveSettings();
    await syncTrackersIntoVault(this.app, this.plugin);
    notify.ok(`Created ${describeNewTracker(this.plugin, def)}.`);
    return trackerDirective(def.id);
  }

  // ── THE HABITS WINDOW'S ONE WRITE (1.0.49) ────────────────────────────
  //
  // `HabitsEditor` holds a draft and this applies it. Everything the window
  // can change is in that draft and all of it lands here, in this order and
  // for these reasons:
  //
  //   1. THE REGISTRY FIRST. A habit typed into the window does not exist yet,
  //      and a directive naming a tracker the registry has never heard of
  //      renders as "Unknown tracker". So new rows are defined and renames
  //      applied before the note is touched, through the settings tab's own
  //      write — push, normalize, save, sync — for the reason
  //      `createAndDirective` gives one screen up: anything less would make a
  //      habit created from a note a second-class one, present on the entry and
  //      absent from the column list.
  //
  //   2. THEN THE NOTE'S MEMBERSHIP, as ONE edit. `applyDirectiveEdits` does
  //      the whole batch in a single read-modify-write with the property
  //      seeding and pruning the single-directive paths do.
  //
  //   3. THEN THE READINGS, in one frontmatter transaction, and only the ones
  //      that changed (`habitWrites`). After the seeding, so a habit that
  //      arrived ticked is written over its own blank rather than under it.
  //
  // ONE NOTICE AT THE END, counting what actually moved. Four habits behind one
  // Save is one gesture, and four notices for it is the thing a reader reads as
  // a bug.
  async applyHabitDraft(
    notePath: string,
    before: readonly HabitRow[],
    draft: HabitDraft
  ): Promise<void> {
    if (isManagedTemplate(this.plugin, notePath)) return warnManagedTemplate();

    const renames = Object.entries(draft.renamed);
    if (draft.created.length > 0 || renames.length > 0) {
      const named = new Map(renames);
      this.plugin.settings.trackers = normalizeTrackers(
        [...this.plugin.settings.trackers, ...draft.created].map((t) => {
          const next = named.get(t.id);
          return next == null ? t : { ...t, label: next };
        }),
        this.plugin.settings.sleepEnabled
      );
      await this.plugin.saveSettings();
      await syncTrackersIntoVault(this.app, this.plugin);
    }

    const { add, remove, values } = habitWrites(before, draft);
    const { added, removed, keptProperties } = await applyDirectiveEdits(
      this.app,
      this.plugin,
      notePath,
      { add, remove }
    );

    if (values.length > 0) {
      const file = getFile(this.app, notePath);
      if (file) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          for (const [key, value] of values) {
            // Null DELETES the key rather than writing a zero, which is the
            // difference between "not kept" and "not answered" — see
            // `HabitState`. A habit cycled back to unset should leave the entry
            // reading exactly as it did before anyone answered it.
            if (value == null) delete fm[key];
            else fm[key] = value;
          }
        });
      }
    }

    const parts: string[] = [];
    if (draft.created.length > 0) {
      parts.push(
        `${draft.created.length} defined`
      );
    }
    if (added.length > 0) parts.push(`${added.length} added`);
    if (removed.length > 0) parts.push(`${removed.length} removed`);
    if (renames.length > 0) parts.push(`${renames.length} renamed`);
    if (values.length > 0) parts.push(`${values.length} logged`);
    if (parts.length === 0) {
      // SAID RATHER THAN SWALLOWED. A Save that changed nothing is a reader
      // who ticked something back to where it started, and silence there is
      // indistinguishable from a write that failed.
      notify.info("Nothing to change — this entry's habits are as they were.");
      return;
    }
    notify.ok(`Habits updated — ${parts.join(", ")}.`);
    if (keptProperties.length > 0) {
      // Removing a widget must never remove a reading, and a property left in
      // the panel looks like a failed delete unless it is named.
      notify.info(`Logged values kept in ${keptProperties.join(", ")}.`);
    }
  }

  // Remove a tracker from one entry. The widget's own × passes its directive;
  // the command-palette entry picks from what the note currently shows.
  async removeTracker(notePath: string, directive?: string): Promise<void> {
    if (isManagedTemplate(this.plugin, notePath)) return warnManagedTemplate();

    let chosen = directive;
    if (!chosen) {
      const present = await readEntryTrackers(this.app, notePath);
      if (present.length === 0) {
        new Notice("This entry has no trackers to remove.");
        return;
      }
      // Same reason as the add picker: describeDirective renders a label, and
      // two directives on one entry can render the same one.
      //
      // KEEPS ASKING AT ONE. Elsewhere a picker with a single option takes it
      // rather than charging a keystroke for a non-choice — see modals.ts::only
      // — and doing that here would delete a tracker the reader never confirmed.
      // "There was only one" is not consent, and this is the branch where the
      // convenient rule would have been the destructive one.
      const pick = await promptChoice(
        this.app,
        present,
        (d) => describeDirective(this.plugin.settings.trackers, d),
        "🗑️ Remove which tracker from this entry?"
      );
      if (!pick) return;
      chosen = pick;
    }

    const { removed, keptProperties } = await removeDirectiveFromNote(
      this.app,
      this.plugin,
      notePath,
      chosen
    );
    const name = describeDirective(this.plugin.settings.trackers, chosen);
    if (!removed) {
      new Notice(`${name} isn't on this entry.`);
      return;
    }
    // Removing a widget must never remove a reading. Say so explicitly, or the
    // property lingering in the frontmatter panel looks like a failed delete.
    new Notice(
      keptProperties.length > 0
        ? `🗑️ ${name} removed — logged value kept in ${keptProperties.join(", ")}.`
        : `🗑️ ${name} removed from this entry.`
    );
  }
}
