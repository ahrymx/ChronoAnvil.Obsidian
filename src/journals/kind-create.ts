// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Adding a note kind to a journal, and taking an empty one back off — both from
// the card that lists its kinds.
//
// WHY A SECOND DOOR AT ALL
//
// A journal's note kinds could only be changed in Settings → ChronoAnvil →
// Journals → Edit journal → Structure. That is four steps from the page a
// reader is actually looking at when the thought occurs, and the page they are
// looking at is the one that draws a group per kind: *What's below* on a
// deepest index note is a list of this journal's kinds with their notes under
// them. "There should be a Risks group here too" is a thought that happens in
// front of that list, and the list is where the control belongs — the same
// argument `buildAddCategoryButton` makes for Resources one surface over, and
// the same one the "+ Add tracker" tile makes for a logging grid.
//
// WHAT THIS IS NOT: a second implementation of the kinds editor. It adds a kind
// with a name and nothing else — the emoji it opens with is `normaliseKinds`'
// own default, exactly as the Structure step's "Add kind" button produces — and
// the rating, the plural and the pages toggle stay where they are edited. A row
// on a note is the right place to say *there is another kind of note here*; it
// is the wrong place to reproduce a five-field form.
//
// EVERYTHING AFTER THE NAME IS THE PATH THE EDITOR ALREADY WALKS: normalise the
// rows, save, write the missing template, offer the dashboards their new table.
// Each of those is called rather than re-stated, so a kind added from a note and
// a kind added from Settings arrive in the vault the same way.
//
// WHAT IT DOES NOT CALL is `confirmKindChange`. That window exists because a
// SAVE bundles changes a reader may not have meant to make together — a removal
// among them, which costs notes their classification and is the reason it has a
// count in it and a warning-coloured button. This door adds exactly one kind and
// the reader typed its name to get here, so a window whose whole content would
// be "adding: the thing you just named, nothing you have written changes" is a
// confirmation that teaches readers to dismiss confirmations. The consent that
// matters is the one that writes to files, and that one is still asked:
// `offerDashboardCatchup` shows every line before a single note is touched.
//
// ── AND THE OTHER DIRECTION, AS OF 1.0.24 ────────────────────────────────
//
// The reader's ask: *"allow kinds (the titled sections for pages) to be removed
// in edit-mode of 'what's below', but only if it has no entries."* A note type
// added from this card by typing a name could only be taken off it four steps
// away in Settings, and the group it leaves behind is the most visible thing on
// the page — a head, a create button and an empty table, sitting there because
// of a decision nobody can undo from where they can see it.
//
// THE GUARD IS WHAT MAKES THE SECOND DOOR HONEST. Removing a kind that has
// notes is the destructive change `confirmKindChange` exists for: it costs every
// one of them its breadcrumbs, its place in the review queue and its row in its
// parent's tables, and that consequence deserves the window with the count in it
// rather than a button on a card. Removing a kind that has NO notes costs
// nothing that exists — which is the whole of why this door may skip that window
// and why it may not be widened.
//
// TWO QUESTIONS, ASKED WHERE EACH IS CHEAP. Whether the group is empty ON THIS
// CARD is a fact about the DOM, and it is what decides whether the control is
// drawn at all — see `below-edit.ts`. Whether the kind is empty in the JOURNAL
// is a walk of the vault, and it is asked once, here, at the press. A card
// showing no Lessons is not a journal with no Lessons, and gating the button on
// the cheap question alone would be the second door deleting a classification the
// first door would have counted.

import { App, Notice } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import type { JournalConfig, JournalKindConfig } from "./custom-journal";
import { buildJournalType, countNotesOfKind } from "./journal";
// THE ID RULE LIVES WITH THE EDITOR AND IS CALLED, NOT COPIED. A kind's id is
// the `type:` value written into every note of that kind, and deriving it a
// second way here is how two doors end up disagreeing about what a journal
// called "Field Notes" is called on disk. `normaliseKinds` also does the
// uniquing, which is the part that is easy to get subtly wrong.
import { normaliseKinds } from "../core/settings-editors";
import { offerDashboardCatchup } from "./dashboard-catchup";
import { confirmAction, promptText } from "../ui/modals";
import { repaintOpenNotes } from "../ui/livewidget";

// Ask for the name, then add it. Resolves to the kind that was added, or null
// if the reader cancelled or the name could not be used.
//
// THE NAME IS THE WHOLE QUESTION, and it is asked with `promptText` rather than
// with a form for the reason above. `description` is what a one-line prompt
// cannot say in its title: what a kind IS, and where the rest of its settings
// live — so a reader who wants the emoji changed knows there is somewhere to go
// rather than assuming this was the only chance to say.
export async function promptAddKind(
  app: App,
  plugin: ChronoAnvilPlugin,
  typeId: string
): Promise<JournalKindConfig | null> {
  const cfg = (plugin.settings.customJournals ?? []).find((j) => j.id === typeId);
  if (!cfg) return null;

  const name = await promptText(
    app,
    `Add a note type to “${cfg.name}”`,
    "e.g. Decision",
    "",
    {
      description:
        "Singular, as one note would be called. It gets its own template, its " +
        "own create button and its own group on this card. Its emoji, its " +
        "rating and whether it can be split into pages are in Settings → " +
        "ChronoAnvil → Journals.",
    }
  );
  const label = name?.trim();
  if (!label) return null;
  return addKindToJournal(plugin, cfg, label);
}

// Add a named kind to a stored journal, and carry out everything that follows.
//
// TAKES THE STORED CONFIG, NOT THE BUILT TYPE. `buildJournalType` derives
// template filenames and drops the fields the editor round-trips, so writing a
// kind back through it would be writing through a lossy projection — the same
// reason the editor's draft is a `JournalConfig` and the type is built from it
// at the last moment.
export async function addKindToJournal(
  plugin: ChronoAnvilPlugin,
  cfg: JournalConfig,
  label: string
): Promise<JournalKindConfig | null> {
  const app = plugin.app;
  const journals = plugin.settings.customJournals ?? [];
  const index = journals.findIndex((j) => j.id === cfg.id);
  if (index < 0) return null;

  // ── A NAME THIS JOURNAL ALREADY USES IS REFUSED, NOT SUFFIXED ────────
  //
  // `normaliseKinds` would take a second "Decision" and file it as
  // `decision-2`, which is correct as an ID RULE — two rows in the editor that
  // happen to collide must not overwrite each other — and wrong as an answer
  // here. The card would then draw two groups headed "⚖️ Decisions", with two
  // identical create buttons, and the only thing telling them apart would be a
  // slug the reader never sees. That is not what anyone typing the same name
  // twice meant, and the likeliest cause is that they did not notice the group
  // already there.
  const taken = cfg.kinds.find(
    (k) => k.label.trim().toLowerCase() === label.toLowerCase()
  );
  if (taken) {
    new Notice(`ChronoAnvil: “${cfg.name}” already has a ${taken.label} note type.`);
    return null;
  }

  const before = new Set(cfg.kinds.map((k) => k.id));
  // `preserveIds`, because every kind already here has notes on disk carrying
  // its id. This is the established-journal case by construction — a journal
  // with no notes has no card to press this from.
  const kinds = normaliseKinds([...cfg.kinds, { id: "", emoji: "📝", label }], {
    preserveIds: true,
  });
  const added = kinds.find((k) => !before.has(k.id));
  // Nothing new came out, which means `normaliseKinds` dropped the row — it
  // drops a row with no label, and a label of nothing but spaces is already
  // refused above. Silent rather than reported: there is no sentence to write
  // about a case that says the input was empty when it was not.
  if (!added) return null;

  const next: JournalConfig = { ...journals[index], kinds };
  journals[index] = next;
  await plugin.saveSettings();
  // The manifest is the journal's own record of itself and is what a folder
  // copied into another vault is restored from, so it learns about the kind at
  // the same moment settings does. The editor's save path does this too.
  await plugin.journalImport.writeManifest(next);

  // Only what is missing — `ensureJournalTemplates` writes no file that is
  // already there. The kind's template is written here rather than the reader
  // being told to run a repair command they have no reason to know about, which
  // is the editor's own reasoning at the same point in its save.
  const written = await plugin.scaffold.ensureJournalTemplates(next);
  if (written.length) {
    new Notice(`ChronoAnvil: wrote ${written.join(", ")} ✅`);
  }

  // The offer that writes to the reader's dashboards, shown in full first. This
  // is the one consent in the flow, and it is the shared one — see
  // `offerDashboardCatchup`.
  await offerDashboardCatchup(app, buildJournalType(next));

  await plugin.journals.rebuildJournalHome();
  plugin.notifyJournalTypesChanged();
  // The card this was pressed from is one of the notes that just gained a
  // group, and nothing it listens to fired: adding a kind rewrites settings
  // rather than the note, and a dashboard the reader declined to extend has not
  // changed on disk at all. Repainting is what makes the new group appear under
  // the reader's hand instead of on the next time they open the note.
  repaintOpenNotes(app);
  return added;
}

// ── removing an empty one ────────────────────────────────────────────────

// Why this note type cannot go, or null if it can.
//
// SEPARATE FROM THE ACT, AND PURE, because the sentence is the whole feature. A
// refusal that only says no sends a reader looking for a setting that does not
// exist — `journal-plan.ts`' rule for `describeRefusedRemove`, and the same one
// here: what is in the way, how much of it, and where the door that CAN do it
// is. That last clause is what keeps this from reading as a capability the
// plugin lacks; the journal editor removes a kind with notes, behind the window
// with the count in it, and it says so in the reader's own vocabulary.
//
// THE LAST NOTE TYPE IS REFUSED TOO, and for a different reason: a journal with
// no kinds draws a *What's below* card with nothing in it and no way to add the
// next one except the settings step this door exists to save — the control
// would have deleted itself. `normaliseKinds` is content to return an empty
// list, so the refusal is here rather than there.
export function kindRemovalRefusal(
  typeName: string,
  kindLabel: string,
  kindsInJournal: number,
  notes: number
): string | null {
  if (kindsInJournal <= 1) {
    return `${typeName} needs at least one note type, and ${kindLabel} is the last one.`;
  }
  if (notes > 0) {
    return `${notes} note${notes === 1 ? "" : "s"} in ${typeName} ${
      notes === 1 ? "is" : "are"
    } still ${kindLabel} — removing the type would leave ${
      notes === 1 ? "it" : "them"
    } unrecognised. Move ${
      notes === 1 ? "it" : "them"
    } to another type first, or remove ${kindLabel} in Settings → ChronoAnvil → Journals, which says what that costs.`;
  }
  return null;
}

// Ask, then take it off. Resolves true if the journal was changed.
//
// THE COUNT IS TAKEN BEFORE THE QUESTION AND THE QUESTION NAMES THE OUTCOME.
// `confirmAction`'s ordinary shape everywhere else in this plugin, and the
// reason the sentence is short: there is nothing to enumerate. Nothing on disk
// carries this type, so there is no declassification to describe — which is
// exactly the condition that let this door exist.
//
// AND IT SAYS WHAT STAYS. The kind's template file is not deleted, because no
// path in this plugin deletes one: the journal editor's removal leaves it too,
// and a reader who removed a type by mistake gets it all back by adding the name
// again. Saying so in the window is what stops that being a surprise found later
// in the Templates folder.
export async function promptRemoveKind(
  app: App,
  plugin: ChronoAnvilPlugin,
  typeId: string,
  kindId: string
): Promise<boolean> {
  const cfg = (plugin.settings.customJournals ?? []).find((j) => j.id === typeId);
  if (!cfg) return false;
  const kind = cfg.kinds.find((k) => k.id === kindId);
  if (!kind) return false;

  const refusal = kindRemovalRefusal(
    cfg.name,
    kind.label,
    cfg.kinds.length,
    countNotesOfKind(app, cfg.root, kindId)
  );
  if (refusal) {
    new Notice(`ChronoAnvil: ${refusal}`);
    return false;
  }

  const ok = await confirmAction(
    app,
    `Remove the ${kind.label} note type?`,
    `No note in ${cfg.name} is a ${kind.label}, so nothing you have written changes. ` +
      `The ${kind.label} group and its create button come off this card and every other index in ${cfg.name}. ` +
      `Its template file stays in your templates folder, and adding ${kind.label} back restores the group.`,
    "Remove it"
  );
  if (!ok) return false;

  return removeKindFromJournal(plugin, cfg, kindId);
}

// Take a kind off a stored journal, and carry out everything that follows.
//
// `addKindToJournal`'s TAIL, RUN BACKWARDS, and it is called rather than
// restated for that function's own reason: a kind that arrives from a note and a
// kind that arrives from Settings have to reach the vault the same way, and so
// do the two that leave.
//
// NO `normaliseKinds`. Adding a row needs an id derived and uniqued; removing
// one needs neither, and running the normaliser over the survivors would be
// asking it to re-derive ids that are already the `type:` value on notes —
// `preserveIds` exists to stop exactly that, so the honest thing is not to ask.
//
// THE CATCH-UP IS WHY THIS IS SAFE TO OFFER AT ALL (1.0.23). Every index in the
// journal is carrying a `kind-table:` for the type that just left, and until
// this release nothing could see that block, let alone offer to take it out —
// `offerDashboardCatchup` now plans a `prune` for each one and shows the list
// before a single note is touched. Declining leaves the tables where they are,
// drawing the empty-kind error, and the offer comes back the next time.
export async function removeKindFromJournal(
  plugin: ChronoAnvilPlugin,
  cfg: JournalConfig,
  kindId: string
): Promise<boolean> {
  const app = plugin.app;
  const journals = plugin.settings.customJournals ?? [];
  const index = journals.findIndex((j) => j.id === cfg.id);
  if (index < 0) return false;

  const kinds = cfg.kinds.filter((k) => k.id !== kindId);
  if (kinds.length === cfg.kinds.length) return false;

  const next: JournalConfig = { ...journals[index], kinds };
  journals[index] = next;
  await plugin.saveSettings();
  // The manifest learns at the same moment settings does, exactly as it does on
  // the way in — a folder copied into another vault is restored from it, and one
  // still naming a type the journal has dropped would put the group back.
  await plugin.journalImport.writeManifest(next);

  await offerDashboardCatchup(app, buildJournalType(next));

  await plugin.journals.rebuildJournalHome();
  plugin.notifyJournalTypesChanged();
  repaintOpenNotes(app);
  return true;
}
