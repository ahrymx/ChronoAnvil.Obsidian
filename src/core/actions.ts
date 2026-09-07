// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Every action the plugin offers, declared once.
//
// WHY THIS EXISTS. `main.ts` declared them twice: `registerCommands()`
// registered 31 fixed commands, and `openMenu()` built 13 menu items with each
// callback duplicated inline. The two lists were written at different times and
// had since diverged in five ways — three where the ribbon was right, one where
// the palette was, and one nobody had noticed:
//
//   - STUDY OFF: the palette offered four Study commands that opened and then
//     said "🎓 Study journals are turned off"; the ribbon hid them. Ribbon.
//   - EVENTS OFF: the ribbon hid `New special event…`; the commands worked.
//     PALETTE — and this is the one that goes the other way, because
//     `eventstore.ts` owns the rule and states it: the toggle "governs whether
//     events are drawn, not whether they exist … The gate belongs at each
//     drawing surface." A gate here would mean the only way to edit an event is
//     to turn drawing back on first.
//   - NOTE-SCOPED COMMANDS on a note with no sections or journal: offered by
//     the palette, four of them ending in a notice and two doing nothing at
//     all; not offered by the ribbon. Ribbon.
//   - `refresh-study-home`: an id that says Study, a name and behaviour that
//     say every journal. The ribbon's generic item was right. §10 renames it.
//   - NAMES. Four actions were spelled differently on the two surfaces —
//     "New diary entry (pick a date)" against "New diary entry…", "New study
//     journal (subject)" against "New study journal…", "New topic" against
//     "New topic…", and "Sync trackers into vault (template + Diary.base)"
//     against "Sync trackers into vault". §7.1 lists four divergences and this
//     is a fifth; it was invisible because nobody sees both surfaces at once.
//     One table forces one answer, and the answer here is the PALETTE's
//     wording, because it is the more informative of the two and §10 owns the
//     final scheme for all twenty-seven.
//
// WHY A TABLE IS RIGHT HERE, WHERE 3.11 §1.2 REFUSED ONE. That refusal was
// about the homepage and Search catalogues, on the grounds that a single model
// would have to carry which note it is on as a first-class field, and
// `section-model.ts` forbids exactly that. A command and a menu item are not
// two pages — they are ONE ACTION WITH TWO DOORS. They already carry the same
// name, the same icon intent, the same callback and the same availability
// conditions; the divergences above are what a duplicated list does when
// nothing holds the copies together.
//
// This is the shape `shippedNotes()` already has: one list, read twice.
//
// NO BEHAVIOUR LIVES HERE. The table is data. Both consumers are in `main.ts`
// and are about ten lines each.
//
// NAMES AND IDS WERE ALL RENAMED AT ONCE IN §10, and that was the last cheap
// moment: there is no released vault, so no hotkey binding and no
// `obsidian://` URI names any of the old ids. `vocabulary.ts` has a standing
// rule against renaming for its own sake — *"admit the mapping in one comment,
// and test the strings"* — and it is about identifiers a reader never sees. A
// command id is not one.
//
//   ids   `<group token>-<verb>-<object>`, tested (see GROUP_ID_PREFIX).
//   names `<Owner>: <what it does>`, so the palette — which is a search box
//         and not a menu — sorts a group together and filtering on
//         `chronoanvil diary` returns the diary and nothing else.
//
// The name prefix is the OWNER and the ribbon label is the GROUP: Study's four
// read `Study: …` under a **Journals** heading, because a label names a group
// and a prefix names whose action it is. Custom journal types have done this
// since they existed — `Cook Book: new recipe` — and the built-ins were the
// ones out of step.
//
// WHICH PARENTHETICALS SURVIVED, since three did and three did not. One that
// warns, or says what you are about to be asked, is kept: `(overwrites)`,
// `(pick a date)`, `(pick a month)`, `(subject)`. One that describes mechanism
// is dropped: `(template + Diary.base)`, `(asks first)`, `(it can then hold
// pages)`. A name is read in a list of twenty-seven, and mechanism is what the
// reader finds out by running it.
//
// NOT RENAMED: the BUTTON action vocabulary. `button:study:new-lesson` and its
// siblings in `button-widgets.ts` are a separate namespace that happens to
// share words — `new-topic`, `new-lesson`, `refresh` — and renaming a command
// id has never touched them. They are written into notes, where a rename would
// be a migration rather than a patch.

import type { TFile } from "obsidian";
import type { IconName } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { openCapture } from "../diary/capture";
import { openEventEditor, draftEvent } from "../events/event-ui";
import { ensureEventsNote } from "../events/eventstore";
import { syncTrackerConfig } from "../charts/charts";
import { registeredJournalTypes } from "../journals/journal";
import { journalTypeOfPath } from "../trackers/trackers";
import { hasTabbedGroup, stepFocusedGroup } from "../ui/widgets/group-tabs";
import { notify } from "./notify";
import { activeMarkdownFile as resolveActiveMarkdownFile, openFile } from "./util";
import { runVaultExport } from "./vault-export-manager";

export type ActionGroup = "diary" | "journals" | "notes" | "maintenance";

export interface Action {
  // Command id, minus the plugin namespace Obsidian adds.
  id: string;
  // Shown by the palette AND the menu. One name, deliberately — see the note
  // on divergence five above.
  name: string;
  // Ribbon icon. The palette ignores it.
  icon: IconName;
  group: ActionGroup;
  // On the ribbon menu as well as in the palette. A ribbon item is a
  // convenience; THE PALETTE IS THE INTERFACE, and nothing is menu-only.
  ribbon?: boolean;
  // Availability, consulted by BOTH surfaces — which is the whole point, since
  // every gating divergence above was one surface asking and the other not.
  //
  // MUST BE CHEAP: settings and the active file's PATH, nothing else. No vault
  // reads, no metadata-cache walks, no `await`. This runs on every palette
  // keystroke for every action, because that is what `checkCallback` is.
  //
  // The rule is written down here rather than discovered later by the first
  // `when` that wants to know whether a note has a `path:` field — and it
  // already bit once in the writing: the obvious basis for the two page
  // commands, `typeOfActive()`, routes through `journalTypeOfNote`, which calls
  // `getFile`. `journalTypeOfPath` underneath it is the pure prefix match, and
  // it is what these use.
  when?: (p: ChronoAnvilPlugin) => boolean;
  // Drawn red on the ribbon (`MenuItem.setWarning`). DATA RATHER THAN AN ID
  // CHECK: `openMenu` used to ask `if (action.id === "setup-vault")`, which
  // made a property of the action a fact about the menu's source and would
  // have silently stopped being true the moment §10.3 renamed the id — which
  // it then did. A second destructive action would have had to know to add
  // itself to a condition in another file.
  warning?: boolean;
  run: (p: ChronoAnvilPlugin) => void | Promise<void>;
}

// The id token each group's actions carry, and the reason the id scheme is a
// map rather than the group name itself.
//
// `<token>-<verb>-<object>`, one scheme, applied to all twenty-seven at once
// (§10.3). Renaming half a set leaves the id shape encoding WHEN each command
// was written, which is what the four stale ids — `refresh-study-home`,
// `new-monthly-review`, `open-this-month-review`, `preview-repair` — were.
//
// THREE TOKENS MATCH THEIR GROUP AND ONE DOES NOT. `journals` carries `study`,
// because every action in that group is the built-in Study type's and a custom
// type's commands are namespaced by their own type id
// (`new-${type.id}-${kind.id}`, unchanged — see `registerCustomJournalCommands`).
// A journals-group action belonging to no type is the moment to revisit this;
// there is none today, and inventing `journal-new-study-journal` to avoid
// saying so would be a worse name for a problem nobody has.
// `journals` CARRIED THE TOKEN `study` UNTIL 3.21, which was accurate when the
// only actions in that group were Study's four and became a fossil the moment
// it was not. Now that every journal's commands are generated
// (`journal-actions.ts`), the token is applied to ids rather than chosen for
// them — so it has to name the group, like the other three do, or a reader's
// own journal would be issued commands prefixed with the name of somebody
// else's.
export const GROUP_ID_PREFIX: Record<ActionGroup, string> = {
  diary: "diary",
  journals: "journals",
  notes: "note",
  maintenance: "maint",
};

// What the RIBBON calls an action, given what the PALETTE calls it.
//
// THE GROUP APPEARS ONCE PER SURFACE, NEVER TWICE (§10.2). The palette has no
// headings, so it gets the group as a prefix — `ChronoAnvil: Diary: open today`,
// which is the two colons the decision accepted. The menu has a `setIsLabel`
// heading, so the item under a **Diary** label must not repeat it: the reader
// would be told twice in one glance.
//
// DERIVED RATHER THAN DECLARED, so there is still one name per action and no
// second field to keep in step. The transform is total over the table — every
// name is `<Owner>: <lowercase rest>` — and a test asserts that rather than
// trusting it, because a name that ever lacked the prefix would silently reach
// the menu with its first letter eaten.
export function menuTitle(name: string): string {
  const at = name.indexOf(": ");
  if (at === -1) return name;
  const rest = name.slice(at + 2);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// The active markdown note, or null. The one piece of workspace state a `when`
// may read — and, since 4.27, what the capture command hands the destination
// list as the note it was pressed on.
function activeMarkdownFile(p: ChronoAnvilPlugin): TFile | null {
  const file = resolveActiveMarkdownFile(p.app);
  if (!file || file.extension !== "md") return null;
  return file;
}

// Its path, for the `when` predicates that only need the string.
function activeNotePath(p: ChronoAnvilPlugin): string | null {
  return activeMarkdownFile(p)?.path ?? null;
}

// Is the active note inside a journal? Prefix matching over configured roots —
// no vault read. See the cheapness rule above.
function inJournal(p: ChronoAnvilPlugin): boolean {
  const path = activeNotePath(p);
  if (path == null) return false;
  const refs = registeredJournalTypes(p).map((t) => ({
    typeId: t.id,
    root: t.root,
  }));
  return journalTypeOfPath(refs, path) != null;
}

const hasNote = (p: ChronoAnvilPlugin): boolean => activeNotePath(p) != null;

export const ACTIONS: Action[] = [
  // ── diary ───────────────────────────────────────────────────────────
  {
    id: "diary-open-home",
    name: "Diary: open the homepage",
    icon: "home",
    group: "diary",
    ribbon: true,
    run: (p) => p.actionOpenHome(),
  },
  {
    id: "diary-open-today",
    name: "Diary: open today",
    icon: "calendar",
    group: "diary",
    ribbon: true,
    run: (p) => p.diary.openToday(),
  },
  {
    id: "diary-new-entry",
    name: "Diary: new entry (pick a date)",
    icon: "calendar-plus",
    group: "diary",
    ribbon: true,
    run: (p) => p.diary.newDiaryEntry(),
  },
  {
    id: "diary-open-month-entry",
    name: "Diary: open this month's entry",
    icon: "calendar-range",
    group: "diary",
    ribbon: true,
    run: (p) => p.diary.openThisMonth(),
  },
  {
    id: "diary-new-month-entry",
    name: "Diary: new monthly entry (pick a month)",
    icon: "calendar-plus",
    group: "diary",
    run: (p) => p.diary.newMonthlyEntry(),
  },
  {
    id: "diary-quick-capture",
    name: "Diary: quick capture",
    icon: "pencil-line",
    group: "diary",
    ribbon: true,
    // THE ONE DOOR THAT HAS TO ASK. A command and a ribbon click carry no note
    // with them, so the workspace is the only source for "where am I" — and its
    // imprecisions (the last file when the focused leaf is not a file view, null
    // in an empty workspace) both resolve to "not an entry", which is the
    // pre-4.27 destination anyway. The three widget doors pass the note they
    // were drawn in instead; see `openCapture`.
    run: (p) => openCapture(p, activeMarkdownFile(p)),
  },
  {
    id: "diary-open-week-overview",
    name: "Diary: open the weekly overview",
    icon: "calendar",
    group: "diary",
    run: (p) => void p.actionOpenOverview("week"),
  },
  {
    id: "diary-open-month-overview",
    name: "Diary: open the monthly overview",
    icon: "calendar",
    group: "diary",
    run: (p) => void p.actionOpenOverview("month"),
  },
  {
    id: "diary-open-quarter-overview",
    name: "Diary: open the quarterly overview",
    icon: "calendar",
    group: "diary",
    run: (p) => void p.actionOpenOverview("quarter"),
  },
  {
    id: "diary-open-year-overview",
    name: "Diary: open the yearly overview",
    icon: "calendar",
    group: "diary",
    ribbon: true,
    run: (p) => void p.actionOpenOverview("year"),
  },
  {
    id: "diary-search",
    name: "Diary: search",
    icon: "search",
    group: "diary",
    ribbon: true,
    run: (p) => p.actionOpenSearch(),
  },
  {
    // NO `when` ON EITHER EVENT ACTION, and the ribbon's gate is gone. See
    // divergence two above: `eventstore.ts` owns this rule and puts the gate at
    // the drawing surfaces, because a gate here empties the settings list and
    // the manager widget the moment drawing is turned off.
    id: "diary-new-event",
    name: "Diary: new special event…",
    icon: "calendar-plus",
    group: "diary",
    ribbon: true,
    run: (p) => openEventEditor(p.app, p, draftEvent()),
  },
  {
    id: "diary-open-events",
    name: "Diary: open the special events note",
    icon: "calendar",
    group: "diary",
    run: async (p) => {
      const file = await ensureEventsNote(p.app, p);
      if (file) await openFile(p.app, file);
    },
  },

  // ── journals ────────────────────────────────────────────────────────
  //
  // EVERY JOURNAL'S COMMANDS ARE DERIVED (3.21), in `journal-actions.ts`, and
  // none of them is written here. Study's four used to be — `study-new-journal`
  // and the rest — with every other journal's built by a separate loop in
  // main.ts that opened `if (type.id === "study") continue`. One idea, two code
  // paths, and they had drifted: only Study's reached the ribbon, only Study's
  // were gated on the journal existing, and the two used different id schemes.
  //
  // Nothing journal-specific belongs in this table any more. What remains here
  // is what is true of the plugin rather than of a journal.

  // ── notes ───────────────────────────────────────────────────────────
  //
  // Every action here is note-scoped, and every one of them now says so with a
  // `when` rather than by running and then apologising. Four used to end in
  // "Open a note first."; `new-page` and `convert-to-dashboard` did nothing at
  // all — no note, no notice, no error (§6).
  {
    id: "note-new-page",
    name: "Note: new page",
    icon: "file-plus",
    group: "notes",
    when: inJournal,
    run: (p) => void p.journals.newPageHere(),
  },
  // ── the pages of a widget group (4.34 §5) ───────────────────────────
  //
  // TWO COMMANDS AND NO SUGGESTED HOTKEY. Obsidian's own hotkey pane is where a
  // reader expects to bind a key, and a default chosen here would collide with
  // something in somebody's vault — these are the first two actions in the table
  // that exist to BE bound rather than to be found.
  //
  // `when` KEEPS THEM OUT OF THE PALETTE on a note with no tabbed group, which
  // is §6's rule for every note-scoped action. It is also cheap in the way that
  // rule demands: `hasTabbedGroup` reads a register of what is on screen right
  // now — no vault read, no metadata walk.
  //
  // AND THEY WRAP. `[3]` → next → `[1]`: a reader who binds one key is cycling,
  // and a switcher that stopped at the end would need the other key to get home.
  {
    id: "note-group-next-page",
    name: "Note: next page in this widget group",
    icon: "chevron-right",
    group: "notes",
    when: hasTabbedGroup,
    run: (p) => void stepFocusedGroup(p, 1),
  },
  {
    id: "note-group-prev-page",
    name: "Note: previous page in this widget group",
    icon: "chevron-left",
    group: "notes",
    when: hasTabbedGroup,
    run: (p) => void stepFocusedGroup(p, -1),
  },
  {
    id: "note-convert-to-dashboard",
    name: "Note: convert to a dashboard",
    icon: "layout-dashboard",
    group: "notes",
    when: inJournal,
    run: (p) => void p.journals.convertHere(),
  },
  {
    // ONE DOOR, AS OF §9.1. `add-section-to-note` used to sit beside this, and
    // its own comment was its defence: "it is one keystroke for the common case
    // and it cannot remove anything, which is occasionally the reason to reach
    // for it."
    //
    // The first half stopped being true when both became one keystroke from the
    // palette and the editor's first screen became the add list. The second
    // half is a real property, and the editor has taken it on rather than
    // refuted it: it shows the change before applying it, which is the same
    // guarantee by a different route — and a session that only adds never
    // passes a screen where a removal is one keypress away. That is now
    // asserted rather than merely arranged.
    id: "note-edit-sections",
    name: "Note: edit sections…",
    icon: "list",
    group: "notes",
    when: hasNote,
    run: (p) => p.actionWithNote((path: string) => p.sections.editSectionsHere(path)),
  },
  {
    // ONE PICKER, AS OF §9.2. `add-tracker-to-entry` and
    // `remove-tracker-from-entry` were the same question — which trackers does
    // this entry carry — asked twice with opposite polarity, so swapping one
    // for another meant two commands and two pickers, neither of which ever
    // showed the other half of the answer.
    //
    // Named for the question rather than for either verb, the way
    // `edit-note-sections` is.
    id: "note-edit-trackers",
    name: "Note: trackers for this entry…",
    icon: "sliders-horizontal",
    group: "notes",
    when: hasNote,
    run: (p) =>
      p.actionWithNote((path: string) => p.entryTrackers.manageTrackers(path)),
  },
  {
    // 4.30. What a reader wrote, on the clipboard, as markdown anybody can read
    // — the regions Obsidian hides in comments and the labels that only exist
    // inside a ```chronoanvil fence.
    //
    // NO ELLIPSIS. It opens nothing and asks nothing; the convention on this
    // table is that `…` promises a window (`Edit sections…`, `Template…`).
    //
    // WRITES NOTHING, which is why it needs no `warning` and no confirmation.
    id: "note-copy-plain-markdown",
    name: "Note: copy as plain markdown",
    icon: "clipboard-copy",
    group: "notes",
    when: hasNote,
    run: (p) =>
      p.actionWithNote((path: string) => p.sections.copyPlainMarkdownHere(path)),
  },

  // ── maintenance ─────────────────────────────────────────────────────
  {
    // MOVED OUT OF `journals` BY §10.3's TABLE, which put it here — and the
    // table is right. Everything else in the journals group MAKES a journal
    // note; this one reconciles the vault against the registry, which is what
    // every other maintenance action does. It was grouped by its subject
    // rather than by what it is.
    id: "maint-find-journals",
    name: "Maintenance: find unregistered journals",
    icon: "folder-search",
    group: "maintenance",
    run: (p) => void p.actionImportJournals(),
  },
  {
    // 4.31, and the vault-wide half of 4.30's clipboard copy.
    //
    // MAINTENANCE RATHER THAN NOTES, and no `when`: it is about the vault rather
    // than about whatever note happens to be open, which is the same reason
    // `maint-setup-vault` sits here. It surveys, shows and then writes — the
    // shape every other command in this group has.
    id: "maint-export-plain-markdown",
    name: "Maintenance: export as plain markdown",
    icon: "folder-down",
    group: "maintenance",
    run: (p) => runVaultExport(p),
  },
  {
    id: "maint-refresh-journals-home",
    name: "Maintenance: refresh journals on the homepage",
    icon: "refresh-cw",
    group: "maintenance",
    ribbon: true,
    run: async (p) => {
      const ok = await p.journals.rebuildJournalHome();
      if (ok) notify.ok("Journals refreshed!");
    },
  },
  {
    id: "maint-sync-trackers",
    name: "Maintenance: sync trackers into vault",
    icon: "refresh-cw",
    group: "maintenance",
    ribbon: true,
    run: (p) => syncTrackerConfig(p.app, p),
  },
  {
    // PREVIEWS ITSELF SINCE §9.3, so `preview-repair` is gone rather than
    // aliased. The preview was never a separate action — it is this one minus
    // the write, computed by the path that runs anyway. `refresh-journal-
    // templates` likewise already showed its drift plan inside its own ask,
    // which is why `preview-journal-templates` was redundant before it was
    // removed; `previewJournalTemplates` itself stays, because the Study header
    // draws a button that calls it.
    id: "maint-setup-vault",
    name: "Maintenance: set up / repair vault",
    icon: "wrench",
    group: "maintenance",
    ribbon: true,
    warning: true,
    run: (p) => p.scaffold.setupVault(),
  },
  {
    id: "maint-refresh-entry-templates",
    name: "Maintenance: refresh entry templates",
    icon: "refresh-cw",
    group: "maintenance",
    run: (p) => p.scaffold.refreshTemplates(),
  },
  {
    id: "maint-refresh-journal-templates",
    name: "Maintenance: refresh journal templates",
    icon: "refresh-cw",
    group: "maintenance",
    run: (p) => void p.scaffold.refreshJournalTemplates(),
  },
  {
    id: "maint-generate-vault-canvas",
    name: "Maintenance: generate vault canvas map",
    icon: "layout-dashboard",
    group: "maintenance",
    run: (p) => void p.scaffold.generateVaultCanvas(),
  },
  {
    id: "maint-setup-graph-groups",
    name: "Maintenance: configure graph view color groups",
    icon: "git-fork",
    group: "maintenance",
    run: (p) => void p.scaffold.configureGraphGroups(),
  },
];
