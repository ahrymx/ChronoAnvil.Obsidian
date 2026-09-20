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

import { App, Notice, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import type { JournalConfig, JournalKindConfig } from "./custom-journal";
import { buildJournalType, countNotesOfKind } from "./journal";
import { kindPlural } from "./journal-sections";
// THE ID RULE LIVES WITH THE EDITOR AND IS CALLED, NOT COPIED. A kind's id is
// the `type:` value written into every note of that kind, and deriving it a
// second way here is how two doors end up disagreeing about what a journal
// called "Field Notes" is called on disk. `normaliseKinds` also does the
// uniquing, which is the part that is easy to get subtly wrong.
import { normaliseKinds } from "../core/settings-editors";
import { catchUpIndexNote, offerDashboardCatchup } from "./dashboard-catchup";
import { pageTypesOf } from "./kind-tables";
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
  typeId: string,
  // The index note the control was pressed from — the ONLY page that gains a
  // group for the new type. See `addKindToJournal`, where the reader's ask is
  // quoted and the two scopes are told apart.
  host: TFile | null = null
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
        "own create button and its own group on this card — and on this card " +
        "only. Its emoji, its rating, whether it can be split into pages, and " +
        "which index notes list it are in Settings → ChronoAnvil → Journals.",
    }
  );
  const label = name?.trim();
  if (!label) return null;
  return addKindToJournal(plugin, cfg, label, host);
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
  label: string,
  // ── WHICH PAGES GET A GROUP FOR IT (1.0.33) ─────────────────────────
  //
  // The reader's ask: *"adding a new note-type to a table should not add this
  // type to all index pages. The only place the defaults should be configured
  // like this is from chronanvil's journal settings."*
  //
  // A NOTE HERE MEANS "THIS PAGE ONLY". The card's door hands the note it was
  // pressed from and nothing else is written; a null means the vault-wide offer,
  // which is what the Settings editor's save has always meant and still means.
  // The kind itself joins the journal either way — a kind is what a note's
  // `type:` names, what a template is written for and what a create button
  // resolves to, so there is no such thing as one that exists on one page.
  //
  // WHICH IS WHY THE SENTENCE IS ABOUT DEFAULTS RATHER THAN ABOUT EXISTENCE.
  // The journal's kinds are what a NEW index note composes a group per, and
  // Settings → Journals is where that list is edited. What this door stopped
  // doing is reaching back through every index note already on disk.
  host: TFile | null = null
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
    // ── UNLESS IT IS A PAGE-ADDED TYPE AND THIS PAGE IS NOT LISTING IT ───
    //
    // A `local` kind exists on the journal and is offered to nobody: it draws a
    // group only on the pages naming it in `notetypes`. So a reader on a SECOND
    // index note who types "Risk" is not typing a name that is already taken
    // from where they are standing — there is no Risks group on their card and
    // no row for one in Settings. Refusing them would be the plugin saying the
    // type exists while showing them nowhere it does, and leaving them no way
    // to reach it.
    //
    // The name is still not used twice: they get THIS kind, listed here. One
    // `type:` value, one template, two cards that list it.
    if (host && taken.local && !pageTypesOf(app, host).includes(taken.id)) {
      const listing = await plugin.journals.listKindOnPage(host, taken.id);
      await catchUpIndexNote(app, buildJournalType(cfg), host, listing);
      repaintOpenNotes(app);
      return taken;
    }
    new Notice(`ChronoAnvil: “${cfg.name}” already has a ${taken.label} note type.`);
    return null;
  }

  const before = new Set(cfg.kinds.map((k) => k.id));
  // `preserveIds`, because every kind already here has notes on disk carrying
  // its id. This is the established-journal case by construction — a journal
  // with no notes has no card to press this from.
  const kinds = normaliseKinds(
    [
      ...cfg.kinds,
      // ── `local` IS WHAT MAKES THE DOOR THE DOOR (1.0.33) ──────────────
      //
      // *"test!!! was added directly into Web Design index page, but its
      // appearing on the settings page (where only the defaults should be,
      // Lesson & Cheatsheet)"*. A kind added from a card is not one of the
      // journal's defaults: Settings' NOTE TYPES step draws no row for it, and
      // `childrenParts` composes a group for it only on a page that names it.
      //
      // Set from the caller's `host` rather than from a parameter of its own,
      // because they are the same fact: the door that hands a note is the door
      // that means "this page", and one that hands none is the editor's save.
      { id: "", emoji: "📝", label, ...(host ? { local: true } : {}) },
    ],
    { preserveIds: true }
  );
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

  // The group for the new type, written where the door says it belongs.
  //
  // ONE CALL SITE, TWO SCOPES, chosen by the caller rather than by a flag read
  // in here: `catchUpIndexNote` writes the card the reader pressed and asks
  // nothing, because the prompt they just answered said it would; the offer
  // writes every dashboard and shows the whole plan first, because that is the
  // journal's defaults changing under notes nobody is looking at. See `host`.
  const type = buildJournalType(next);
  if (host) {
    // THE CLAIM IS WRITTEN FIRST, and the order is load-bearing: the planner
    // reads `notetypes` off this note to decide whether a `local` kind's group
    // belongs on it (`indexSurfaces` → `ctx.localKinds` → `listedKinds`).
    // Reconcile before claiming and it is asked about a kind this page has not
    // claimed, composes nothing, and the reader's button does nothing visible.
    // THE WRITE'S OWN ANSWER, HANDED OVER. Re-reading the claim would read
    // Obsidian's metadata cache, which is an event behind this write — see
    // `catchUpIndexNote`, and *"adding a new-note type no longer automatically
    // updates the table"*.
    const listing = await plugin.journals.listKindOnPage(host, added.id);
    await catchUpIndexNote(app, type, host, listing);
  } else await offerDashboardCatchup(app, type);

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
  kindId: string,
  // The index note the control was pressed from, where there is one. See
  // `unlistKindHere` — a page-added type on two cards leaves one of them.
  host: TFile | null = null
): Promise<boolean> {
  const cfg = (plugin.settings.customJournals ?? []).find((j) => j.id === typeId);
  if (!cfg) return false;
  const kind = cfg.kinds.find((k) => k.id === kindId);
  if (!kind) return false;

  // ── A PAGE-ADDED TYPE LEAVES ONE CARD AT A TIME ─────────────────────
  //
  // The reader's report: *"removing a non-default page-kind that happens to have
  // been created on two different index page is getting removed from both on
  // repair"* — they took `examples` off Web Design, and the next Repair vault
  // offered to take its table off Spreadsheets too, because the kind itself had
  // left the journal and every card listing it was now carrying a table for a
  // type that no longer existed.
  //
  // The claim is what is removed, not the kind. The kind goes only with the LAST
  // card that lists it, which is the same act this door has always performed and
  // the same window it has always asked it behind.
  if (host && kind.local) {
    const others = pagesListingKind(app, cfg, kindId).filter(
      (f) => f.path !== host.path
    );
    if (others.length) return unlistKindHere(plugin, cfg, kind, host, others);
  }

  // ── WHAT "THE LAST ONE" COUNTS (1.0.33) ──────────────────────────────
  //
  // The guard exists because a journal with no note types draws a *What's
  // below* card with nothing in it and no way to add the next one, so the
  // question it asks is about what EVERY index note has — the defaults. A
  // page-added type is not one of those: removing it leaves the defaults
  // standing on every card, and it must never be the thing that keeps a default
  // from being removable either.
  //
  // A journal always has at least one default — this guard is what guarantees
  // it, and a journal is created with one — so the whole count is safe to pass
  // when the kind going is a local one.
  const remaining = kind.local
    ? cfg.kinds.length
    : cfg.kinds.filter((k) => !k.local).length;
  const refusal = kindRemovalRefusal(
    cfg.name,
    kind.label,
    remaining,
    countNotesOfKind(app, cfg.root, kindId)
  );
  if (refusal) {
    new Notice(`ChronoAnvil: ${refusal}`);
    return false;
  }

  // WHERE IT GOES FROM IS NOT ALWAYS EVERYWHERE, as of 1.0.33. A page-added
  // type is only on the cards that list it in `notetypes`, and telling a reader
  // it is coming off "every other index" would be describing a reach it never
  // had. The sentence says what is true of the type in front of them.
  //
  // THE STALE ID IN `notetypes` IS LEFT, DELIBERATELY. It names a kind the
  // journal no longer has, so `listedKinds` ignores it and no group is drawn —
  // and it is what makes the last clause of this sentence true for a local type
  // too: adding the name back restores the group on exactly the cards that had
  // it, rather than on none of them.
  const reach = kind.local
    ? `The ${kind.label} group and its create button come off the cards listing it.`
    : `The ${kind.label} group and its create button come off this card and every other index in ${cfg.name}.`;
  const ok = await confirmAction(
    app,
    `Remove the ${kind.label} note type?`,
    `No note in ${cfg.name} is a ${kind.label}, so nothing you have written changes. ` +
      `${reach} ` +
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
// Which index notes claim this note type, by their own frontmatter. 1.0.33.
//
// THE VAULT IS THE RECORD, because the claim is. A page-added type is listed by
// the pages that list it and by nothing else — there is no second register to
// keep in step, which is the property that makes a claim survive a rename, a
// move and a folder copied into another vault.
//
// A WALK, AND CHEAP ENOUGH BECAUSE IT IS ASKED ONCE AT A PRESS.
// `countNotesOfKind` directly below is the same walk for the same reason, and
// `below-edit.ts` states the rule both follow: the cheap DOM question decides
// whether the control is drawn, the vault walk decides what the press does.
export function pagesListingKind(
  app: App,
  cfg: JournalConfig,
  kindId: string
): TFile[] {
  const root = cfg.root;
  return app.vault
    .getMarkdownFiles()
    .filter(
      (f) =>
        (!root || f.path.startsWith(`${root}/`)) &&
        pageTypesOf(app, f).includes(kindId)
    );
}

// This card stops listing it; the journal keeps it for the cards that still do.
//
// THE COUNT IS THIS INDEX'S OWN FOLDER, not the journal's root. Nothing is being
// declassified — the type still exists, its template still exists, and a note
// filed under another card's index still has its group — so the question the
// guard has to ask is the narrower one it is actually about: are there notes of
// this type HERE, which is what would be left unlisted by taking the table off
// this page.
async function unlistKindHere(
  plugin: ChronoAnvilPlugin,
  cfg: JournalConfig,
  kind: JournalKindConfig,
  host: TFile,
  others: TFile[]
): Promise<boolean> {
  const app = plugin.app;
  const here = host.parent?.path ?? "";
  const notes = countNotesOfKind(app, here, kind.id);
  if (notes > 0) {
    new Notice(
      `ChronoAnvil: ${notes} note${notes === 1 ? "" : "s"} under ${
        host.parent?.name ?? here
      } ${notes === 1 ? "is" : "are"} still ${kind.label} — move ${
        notes === 1 ? "it" : "them"
      } first, or this card would stop listing ${
        notes === 1 ? "it" : "them"
      }.`
    );
    return false;
  }

  // THE WINDOW SAYS WHERE IT SURVIVES, which is the whole difference between
  // this act and the other one. A reader who reads "removed" and means it is
  // owed the sentence telling them the type is still one press away on the other
  // card, and the reader who wanted it gone everywhere is told how to get there.
  const elsewhere = others.length === 1 ? "1 other index note" : `${others.length} other index notes`;
  const ok = await confirmAction(
    app,
    `Stop listing ${kindPlural(kind)} on this note?`,
    `${kind.label} was added to this card rather than to ${cfg.name}, and ${elsewhere} still ${
      others.length === 1 ? "lists" : "list"
    } it — so the note type stays and only this card's group goes. ` +
      `Nothing you have written changes. Remove it from the last card listing it and it leaves ${cfg.name} altogether.`,
    "Stop listing it"
  );
  if (!ok) return false;

  const listing = await plugin.journals.unlistKindOnPage(host, kind.id);
  await catchUpIndexNote(app, buildJournalType(cfg), host, listing);
  repaintOpenNotes(app);
  return true;
}

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
