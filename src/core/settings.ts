// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import {
  App,
  Menu,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  setIcon,
} from "obsidian";
import type AlmanacPlugin from "../main";
import {
  DEFAULT_PATHS,
  DEFAULT_FOLDER_EMOJIS,
  DEFAULT_TRACKERS,
  DEFAULT_ATTACHMENT_OPTIONS,
  DEFAULT_LOGBOOKS,
  ROOT_CHILDREN,
  ART_PRESETS,
} from "./constants";
import type { LogbookDef } from "./constants";
import { remapConfiguredPaths } from "./pathwatch";
import { logbookNotePath } from "../diary/logbooks";
import { JOURNAL_PRESETS } from "../journals/journal";
import {
  CLASS_DEFS,
  JOURNAL_BUILTINS,
  OrphanResolution,
  SCALE_BUILTINS,
  TrackerDef,
  describeSurfaceLabel,
  diaryClassOf,
  diarySurface,
  normalizeTrackers,
  surfaceKey,
  TRACKER_CLASSES,
  trackersScopedToType,
  trackersToSeed,
} from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import type { SectionChoice } from "./section-model";
import { entrySectionMatrix } from "../diary/entry-sections";
import { bandWithSection } from "../diary/entry-template";
import type { EntryLayoutConfig } from "../diary/entry-template";
import type {
  EntrySection,
  EntrySectionContext,
} from "../diary/entry-sections";
import { bridgeCatalogue } from "../ui/widgets/bridge-widgets";
import { otherSurface } from "./bridge";
import {
  countReadingsOnSurface,
  journalTypeNamer,
  resurfacePrompt,
  surfacePathConfig,
} from "../trackers/entry-trackers";
import { syncTrackerConfig } from "../charts/charts";
import {
  DEFAULT_EVENT_COLOR,
  EVENT_COLORS,
  EventDef,
  describeEventDate,
  eventColor,
  eventIcon,
} from "../events/events";
import { readEvents } from "../events/eventstore";
import { draftEvent, openEventEditor } from "../events/event-ui";
import { confirmAction, promptSuggester } from "../ui/modals";
import { today } from "./util";
import { initialsOf } from "../ui/vault-banner";
import {
  BIN_FOLDER,
  binJournalFolders,
  journalFoldersOnDisk,
  removeJournal,
} from "./journal-removal";
import {
  JournalConfig,
  deriveJournalFolders,
  freshCustomJournal,
  presetAsNewJournal,
  presetTrackerDefs,
} from "../journals/custom-journal";
import type { JournalPreset } from "../journals/custom-journal";
import {
  TRACKER_TYPE_LABELS,
  createListRow,
  openJournalEditor,
  openMoodEditor,
  openFolderEmojiEditor,
  openTrackerEditor,
  rowButton,
} from "./settings-editors";

export type AttachmentLocation = "almanac" | "obsidian" | "note";

// How the `attach:` widget files anything dropped, pasted or picked into it.
// Only new files are affected — an attachment already linked from a note is
// never moved by changing these.
export interface AttachmentOptions {
  // Where a new file lands. "almanac" uses paths.attachments + `subfolder`;
  // "obsidian" hands the decision to the vault's own Files & Links attachment
  // setting (so Almanac matches the rest of the vault); "note" drops it in the
  // same folder as the note it was added to.
  location: AttachmentLocation;
  // Token pattern appended below paths.attachments in "almanac" mode.
  // Tokens: {yyyy} {yy} {mm} {dd} {date} {note}. Empty = flat folder.
  subfolder: string;
  // Token pattern for the file name (extension is appended automatically).
  // Tokens: {name} {date} {time} {yyyy} {mm} {dd} {note}.
  namePattern: string;
  // Confirm before "Remove and delete file" moves the file to the trash.
  confirmDelete: boolean;
}

// What the vault banner is allowed to vary. 4.51.
//
// TWO FIELDS, AND THE SECOND IS THE ONLY THING THE READER PICKS. The nav slots
// are fixed for this release — see `vault-banner.ts` — because configurable nav
// is a settings surface, an ordering question and a migration, and none of it is
// needed to find out whether the banner is right.
export interface BannerOptions {
  enabled: boolean;
  // What the tile shows. Empty falls back to two initials from the vault's name,
  // so a fresh vault has something in it rather than a blank square.
  //
  // A STRING RATHER THAN AN EMOJI TYPE: an emoji, one letter, three letters, a
  // symbol — the tile is 38px and the CSS scales to fit whatever is put there.
  glyph: string;
  // Whether Almanac's own head and Properties window stand in for Obsidian's
  // inline title and property panel, on the notes the bar reaches. 4.51.6.
  //
  // ON BY DEFAULT, WHICH `hideInlineTitle` WAS NOT (4.51.5, one release old).
  // That flag hid a title and put nothing in its place, so it was a subtraction
  // and had to be opted into. This is a REPLACEMENT: the page head names the
  // note, in a face that says what kind of note it is and with the name
  // editable, and the bar's Properties button holds every field the panel held.
  // Turning it off is how a reader gets Obsidian's own two back — and turning
  // the bar off does it too, which is what keeps the whole release reversible.
  //
  // SCOPED TO THE NOTES THE BAR DRAWS ON, always. A note Almanac has nothing to
  // say about keeps Obsidian's chrome whatever this says.
  absorb: boolean;
  // Background art pattern file inside `00 - Infrastructure/Art/` (or "none").
  art?: string;
  // Art pattern opacity percentage (0-100).
  artOpacity?: number;
  // Whether ambient radial accent glow is enabled.
  glowEnabled?: boolean;
}

export type MobileOverlayTogglePosition = "off" | "left" | "right";

export interface MobileOptions {
  // Position of the floating button that toggles hiding Obsidian's mobile overlay controls.
  overlayTogglePosition: MobileOverlayTogglePosition;
  // Whether mobile overlay controls start hidden when Almanac loads.
  hideOverlaysDefault: boolean;
}

export interface AlmanacSettings {
  paths: typeof DEFAULT_PATHS;
  attachments: AttachmentOptions;
  // One name→emoji map shared by both Study levels (Subject and Topic) —
  // merged from two separate maps prior to 1.8.0, since a folder only needs
  // one emoji regardless of which level it's at.
  folderEmojis: Record<string, string>;
  trackers: TrackerDef[];
  // Whether the coupled Sleep feature is on: the Wake-Up + Bedtime built-ins
  // render as one control that derives a `Sleep` (hours) property, which is
  // added as a chartable column. Off removes the derived tracker and shows the
  // two times as independent pickers.
  // The vault banner: the strip of chrome above every Almanac note. 4.51.
  //
  // OFF IS THE OLD BEHAVIOUR EXACTLY. `journal-header` and `entry-header` draw
  // their in-note banners again and nothing in any file has changed — which is
  // the whole reason this is a toggle rather than a migration. See
  // `ui/vault-banner.ts`.
  banner: BannerOptions;
  sleepEnabled: boolean;
  // Whether special events are read and drawn. Off hides every decoration and
  // the upcoming list without touching the events note itself, so turning it
  // back on restores everything exactly as it was.
  eventsEnabled: boolean;
  // Which number tracker's frontmatter value drives the diary calendar's
  // heat-map colouring and the monthly "avg mood" summary. Defaults to
  // "Mood"; point it at another tracker id (or rename this) if you colour the
  // calendar by something else. Decoupled from the literal "Mood" so renaming
  // or deleting that tracker doesn't silently break the heat map.
  moodTrackerId: string;
  // Ids the plugin itself last wrote into Diary.base as columns — lets a
  // future sync remove exactly what it added when a tracker is renamed,
  // deleted, or toggled out of showInBase, without touching anything the
  // user added to the base file by hand.
  syncedBaseTrackerIds: string[];
  // User-defined journal types (Custom Journals). The built-in Study type is
  // not stored here — it's hand-written in journal.ts. See custom-journal.ts.
  customJournals: JournalConfig[];
  // The logbooks this vault keeps — the diary's undated layer (4.52). Ships as
  // `DEFAULT_LOGBOOKS`, which is four, and is a list rather than a fixed set
  // for the reason `customJournals` is one: a reader who keeps a fifth kind of
  // standing list should not need a release.
  logbooks: LogbookDef[];
  // Per-section collapse state for header bars, keyed "<notePath>::<title>".
  // A header bar collapses everything after it up to the next header bar; this
  // remembers which sections the user has folded so they stay folded across
  // reloads. Absent key = expanded (the default).
  collapsedNoteSections: Record<string, boolean>;
  // Which page of a tabbed widget group the reader last had open, keyed
  // "<notePath>::<blockIndex>". Absent key = the first page. 4.34 §4.
  //
  // `collapsedNoteSections`' SHAPE AND ITS LOAD-TIME PRUNE, deliberately — the
  // fold state is the same kind of fact (per-note, per-place, the reader's own,
  // worthless to anyone else) and it already solved the two problems this has:
  // where to put it so the markdown is not rewritten on every click, and how to
  // stop a record that only ever grows.
  //
  // A NUMBER RATHER THAN A BOOLEAN IS THE ONE DIFFERENCE, AND IT IS THE ONE THAT
  // CAN GO STALE. A fold cannot be wrong about a note that changed; a page index
  // can, because the reader can delete a `tab` line. It is clamped where it is
  // read and the clamp does not write — see `openTabFor` in main.ts.
  openGroupTabs: Record<string, number>;
  // Unsaved quick-capture text, kept so closing the box doesn't lose it.
  // Lives here rather than in memory so it survives a restart.
  captureDraft: string;
  // Default collapsed state for the capture field in an entry. Per-entry
  // toggles are remembered individually in collapsedNoteSections; this is only
  // the starting state for one not yet touched.
  captureCollapsedByDefault: boolean;
  // Journal folders the reader has told Almanac to stop offering to import.
  // Paths, not ids — an unregistered folder has no id anyone has agreed to.
  // Moving or renaming one offers it again, which is right: to everything else
  // in the plugin that is a different folder.
  dismissedJournalFolders: string[];
  // Collapse state for the settings tab's own <details> groups (Paths /
  // Attachments / Trackers / Journal types), keyed by group id. Absent key =
  // each group's own default (see AlmanacSettingTab.group).
  collapsedSettingsGroups: Record<string, boolean>;
  // Sections this vault adds to a grain's entry template, beyond what ships.
  //
  // THE STORAGE `EntrySectionContext.extra` HAS BEEN DESCRIBING SINCE 2.60.1
  // AND DID NOT HAVE. Its comment reads "it is a setting the composer reads",
  // and there was no such setting: `extra` was a parameter no caller supplied,
  // so it was reachable only from inside entry-sections.ts rendering one
  // section into one existing note. Adding a section to every FUTURE entry of a
  // grain was not possible by any route — the editor refuses a managed
  // template (correctly: "Refresh entry templates" would overwrite it), and
  // there was nowhere else to say it.
  //
  // ADDITIVE, NOT A FULL ORDERING, which is the choice `extra` already argued
  // for: a stored ordering would freeze the shipped set at the moment someone
  // first customised theirs, so a later release adding a section to daily
  // entries would never reach them.
  //
  // CHOICES RATHER THAN IDS, because a section may carry the reader's answer to
  // its own question — which journal kind a bridge pulls. See SectionChoice;
  // the options are opaque here and are handed to the catalogue that wrote
  // them.
  //
  // Keyed by grain and sparse: an absent grain means "only what ships".
  entrySections: Partial<Record<TrackerClass, SectionChoice[]>>;
  // The order of a grain's shared band, where the reader has saved one (4.29).
  //
  // THE SECOND HALF OF `entrySections`, AND DELIBERATELY NOT INSIDE IT. That
  // list is additive by decision — see the paragraph above — so it cannot carry
  // an order without freezing the shipped set. This one carries the order and
  // nothing else, which means the two cannot contradict each other: an order
  // naming a section that is not a member is inert, and a member the order does
  // not name keeps catalogue order behind the ones it does.
  //
  // Written by "Save this page as the default" in the Template window, which is
  // the only gesture that can produce one — the settings table decides
  // membership and has never had anywhere to express a reorder.
  //
  // Sparse, and an absent grain composes byte-for-byte what it composed before
  // this key existed. That is asserted rather than assumed
  // (`test/entry-template.test.ts`), because five template files are written
  // from the function that reads it.
  entrySectionBand: Partial<Record<TrackerClass, string[]>>;
  // Named entry layouts the reader saved, offered on the grains they chose.
  //
  // A SEPARATE ARRAY FROM `customJournals[].variants`, WHICH IS THE SAME IDEA.
  // A journal variant is stored ON a journal config and scaffolds a template
  // FILE of its own, because a journal kind can be created from any of several
  // arrangements. A diary grain has exactly one template file, so half that
  // shape has nothing to do here: a diary layout is a recipe you seed a page
  // from, never a file. Sharing the storage would mean a diary layout living on
  // a journal, which is the cross-catalogue transfer `layout-transfer.ts`
  // exists to refuse.
  entryLayouts: EntryLayoutConfig[];
  // Options for mobile layout, gestures, and overlay controls.
  mobile: MobileOptions;
  // The version of Almanac recorded when settings were last saved / initialized.
  // Used to detect plugin upgrades and prompt the reader when repairs or
  // migrations are pending.
  installedVersion?: string;
}

export const DEFAULT_SETTINGS: AlmanacSettings = {
  paths: { ...DEFAULT_PATHS },
  attachments: { ...DEFAULT_ATTACHMENT_OPTIONS },
  // A FRESH VAULT HAS NO JOURNALS (3.20). It shipped with Study registered, so
  // a reader who wanted a diary and nothing else had to find a toggle and turn
  // one off. Study is two clicks away under *Presets*, which is where a reader
  // is already thinking about the question.
  folderEmojis: { ...DEFAULT_FOLDER_EMOJIS },
  trackers: DEFAULT_TRACKERS.map((t) => ({
    ...t,
    faces: t.faces ? [...t.faces] : undefined,
  })),
  // ON BY DEFAULT, and that is a real choice rather than an oversight. The
  // banner is what 4.51 is; shipping it off would make the release a setting
  // nobody finds. Turning it off restores the in-note banners exactly, and
  // nothing in any note has to change either way.
  banner: {
    enabled: true,
    glyph: "",
    absorb: true,
    art: "topography-minimal.svg",
    artOpacity: 18,
    glowEnabled: true,
  },
  mobile: {
    overlayTogglePosition: "off",
    hideOverlaysDefault: false,
  },
  sleepEnabled: true,
  eventsEnabled: true,
  moodTrackerId: "Mood",
  syncedBaseTrackerIds: DEFAULT_TRACKERS.filter((t) => t.showInBase).map(
    (t) => t.id
  ),
  customJournals: [],
  logbooks: DEFAULT_LOGBOOKS.map((book) => ({ ...book })),
  dismissedJournalFolders: [],
  collapsedNoteSections: {},
  openGroupTabs: {},
  captureDraft: "",
  captureCollapsedByDefault: true,
  collapsedSettingsGroups: {},
  entrySections: {},
  entrySectionBand: {},
  entryLayouts: [],
  installedVersion: undefined,
};

let idCounter = 0;
function freshId(): string {
  idCounter += 1;
  return `NewTracker${idCounter}`;
}

// Display names for the paths shown read-only under their root.
const DERIVED_PATH_LABELS: Record<string, string> = {
  logbooks: "Logbooks",
  templates: "Templates",
  templatesDiary: "Diary templates",
  documentation: "Documentation",
  art: "Art & Textures",
  staging: "Staging",
  attachments: "Attachments",
  diaryDaily: "Daily entries",
  diaryWeekly: "Weekly entries",
  diaryMonthly: "Monthly entries",
  diaryQuarterly: "Quarterly entries",
  diaryYearly: "Yearly entries",
  events: "Events note",
  search: "Search note",
};

// A button in a section's header strip.
//
// The event reaches the handler so an action can open a MENU at the pointer
// rather than only a modal — which is what "Add journal" and "Presets" both do.
interface SectionAction {
  label: string;
  icon: string;
  // RETURNING THE MENU IS HOW A BUTTON GETS AN OPEN STATE (4.35.3).
  //
  // These buttons open a `Menu` and then looked exactly like buttons that had
  // not been pressed: the accent they wear is `:hover`, so moving the pointer
  // off the button — onto the menu it just opened — left nothing at all saying
  // which control the menu belonged to. And `aria-expanded` was never set, so
  // the state was absent for assistive tech in BOTH directions.
  //
  // The alternative was each action toggling a class on a button it does not
  // have a reference to. Handing the menu back instead means `sectionHeader`
  // wires this once for every action it draws, and an action that opens no menu
  // returns nothing and is untouched.
  onClick: (evt: MouseEvent) => Menu | void;
}

const actionList = (
  a: SectionAction | SectionAction[] | undefined
): SectionAction[] => (a ? (Array.isArray(a) ? a : [a]) : []);

export class AlmanacSettingTab extends PluginSettingTab {
  plugin: AlmanacPlugin;
  private syncTimer: number | null = null;

  constructor(app: App, plugin: AlmanacPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // Save settings, then push the change into the vault (live template and
  // Diary.base). Structural edits (add/remove/reorder/
  // type/toggle) sync immediately; free-typed text fields (label, unit,
  // min/max...) debounce so we're not rewriting vault files on every
  // keystroke.
  private async saveAndSync(immediate: boolean): Promise<void> {
    await this.plugin.saveSettings();
    // Journal manifests ride along with the tracker sync, at the same cadence
    // and for the same reason: both are "push the tracker registry into the
    // vault". Without this a tracker correction lived only in data.json while
    // the manifest kept the value it was imported with — so correcting an
    // inferred range in this very tab, and then reinstalling, silently put the
    // guess back. The one place a change to a journal tracker can happen is
    // here, which is why the hook is here rather than in saveSettings (which
    // also fires for every collapsed section and every keystroke of capture).
    const pushToVault = async (): Promise<void> => {
      await syncTrackerConfig(this.app, this.plugin);
      await this.plugin.journalImport.writeAllManifests();
    };
    if (immediate) {
      if (this.syncTimer) {
        window.clearTimeout(this.syncTimer);
        this.syncTimer = null;
      }
      await pushToVault();
    } else {
      if (this.syncTimer) window.clearTimeout(this.syncTimer);
      this.syncTimer = window.setTimeout(() => {
        void pushToVault();
      }, 700);
    }
  }

  // Obsidian calls hide() when the settings tab closes (and on plugin
  // unload). Flush any pending debounced sync now and clear the timer, so a
  // queued setTimeout can't fire against a torn-down tab/plugin afterwards.
  //
  // Also where journal-type edits reach the Journals banner. The banner is a
  // live widget over the journal *folders*, so turning Study off or adding a
  // custom journal changes what it should show without touching anything it
  // watches. Signalling once per close rather than per field is deliberate:
  // the type editor's text inputs save on every keystroke, and each repaint
  // re-walks the vault's folder tree — and nothing behind this modal is
  // visible until it closes anyway.
  hide(): void {
    if (this.syncTimer) {
      window.clearTimeout(this.syncTimer);
      this.syncTimer = null;
      void (async () => {
        await syncTrackerConfig(this.app, this.plugin);
        await this.plugin.journalImport.writeAllManifests();
      })();
    }
    this.plugin.notifyJournalTypesChanged();
    super.hide();
  }

  private uniqueId(base: string): string {
    const existing = new Set(this.plugin.settings.trackers.map((t) => t.id));
    let id = base;
    let n = 2;
    while (!id || existing.has(id)) id = `${base}${n++}`;
    return id;
  }

  // A collapsible <details> group. `key` persists open/closed state across
  // reopening the tab (collapsedSettingsGroups); `defaultOpen` only applies the
  // first time a key is seen. Returns the body element to render into.
  //
  // The summary carries an icon token, a title and an optional count badge, so
  // a collapsed tab still tells you how many trackers, events and journal types
  // are configured without opening anything.
  private group(
    containerEl: HTMLElement,
    key: string,
    icon: string,
    title: string,
    subtitle: string,
    defaultOpen: boolean,
    badge?: string
  ): HTMLElement {
    const collapsedMap = this.plugin.settings.collapsedSettingsGroups ?? {};
    const collapsed = collapsedMap[key] ?? !defaultOpen;

    const details = containerEl.createEl("details", {
      cls: "almanac-settings-group",
    });
    details.open = !collapsed;

    const summary = details.createEl("summary", {
      cls: "almanac-settings-summary",
    });
    summary.createSpan({ cls: "almanac-settings-icon", text: icon });
    const text = summary.createDiv({ cls: "almanac-settings-heading" });
    text.createDiv({ cls: "almanac-settings-title", text: title });
    if (subtitle) {
      text.createDiv({ cls: "almanac-settings-sub", text: subtitle });
    }
    if (badge) {
      summary.createSpan({ cls: "almanac-settings-badge", text: badge });
    }
    const chevron = summary.createSpan({ cls: "almanac-settings-chevron" });
    setIcon(chevron, "chevron-down");

    const body = details.createDiv({ cls: "almanac-settings-body" });

    details.addEventListener("toggle", () => {
      this.plugin.settings.collapsedSettingsGroups[key] = !details.open;
      void this.plugin.saveSettings();
    });

    return body;
  }

  // A *foldable* section inside a group body. Same small-caps head as
  // sectionHeader, plus a chevron, an optional count badge and persisted
  // open/closed state — the same bargain group() already makes one level up,
  // for the same reason: a collapsed section should still tell you what is in
  // it, or folding trades one kind of hunting for another.
  //
  // Worth having on the tracker list specifically because that list stopped
  // being one list. Diary built-ins, journal built-ins and custom trackers are
  // three sets with different rules — a diary tracker has a template toggle
  // and a Diary.base column, a journal tracker has neither — and someone
  // working on one has no use for the other two on screen.
  //
  // Returns the body element to render rows into.
  private foldableSection(
    containerEl: HTMLElement,
    key: string,
    title: string,
    opts: {
      defaultOpen?: boolean;
      badge?: string;
      action?: SectionAction | SectionAction[];
    } = {}
  ): HTMLElement {
    const collapsedMap = this.plugin.settings.collapsedSettingsGroups ?? {};
    const collapsed = collapsedMap[key] ?? !(opts.defaultOpen ?? true);

    const details = containerEl.createEl("details", {
      cls: "almanac-section-fold",
    });
    details.open = !collapsed;

    const head = details.createEl("summary", {
      cls: "almanac-section-head almanac-section-head-fold",
    });
    const chevron = head.createSpan({ cls: "almanac-section-chevron" });
    setIcon(chevron, "chevron-right");
    head.createDiv({ cls: "almanac-section-title", text: title });
    if (opts.badge) {
      head.createSpan({ cls: "almanac-section-count", text: opts.badge });
    }
    for (const action of actionList(opts.action)) {
      const btn = head.createEl("button", { cls: "almanac-section-action" });
      setIcon(btn.createSpan({ cls: "almanac-section-action-icon" }), action.icon);
      btn.createSpan({ text: action.label });
      btn.addEventListener("click", (evt) => {
        // The button lives in the <summary>, so without this a press would
        // also toggle the fold — the section would collapse under the modal
        // it just opened, and be shut when the modal closed.
        evt.preventDefault();
        evt.stopPropagation();
        action.onClick(evt);
      });
    }

    details.addEventListener("toggle", () => {
      this.plugin.settings.collapsedSettingsGroups[key] = !details.open;
      void this.plugin.saveSettings();
    });

    return details.createDiv({ cls: "almanac-section-fold-body" });
  }

  // A section heading inside a group body: a small caps label plus an optional
  // right-aligned action button. Replaces the bare <h3>s the tracker list used.
  private sectionHeader(
    containerEl: HTMLElement,
    title: string,
    // ONE ACTION OR SEVERAL (3.20.1). A section may now carry a second button —
    // "Presets" beside "Add journal" — because the two answer different
    // questions: one starts a journal from what this vault already has, the
    // other from what the plugin ships. Folding both into one menu made the
    // shipped list and the reader's own list look like one list, which they are
    // not.
    action?: SectionAction | SectionAction[]
  ): void {
    const head = containerEl.createDiv({ cls: "almanac-section-head" });
    head.createDiv({ cls: "almanac-section-title", text: title });
    // The PRIMARY action is last in the DOM so it sits rightmost, nearest the
    // reader's expectation of where a section's main button lives.
    for (const a of actionList(action)) {
      const btn = head.createEl("button", { cls: "almanac-section-action" });
      setIcon(btn.createSpan({ cls: "almanac-section-action-icon" }), a.icon);
      btn.createSpan({ text: a.label });
      btn.addEventListener("click", (evt) => {
        const menu = a.onClick(evt);
        // An action that opens no menu returns nothing, and nothing here runs —
        // so a plain button never grows a state it cannot leave.
        if (!menu) return;
        btn.addClass("is-open");
        btn.setAttr("aria-expanded", "true");
        // `onHide` covers every way a menu closes — a pick, Escape, or a click
        // anywhere else — which is why the class is cleared there rather than in
        // each item's own handler.
        menu.onHide(() => {
          btn.removeClass("is-open");
          btn.setAttr("aria-expanded", "false");
        });
      });
    }
  }

  // A short explanatory paragraph. Grouped into one call so the long
  // multi-paragraph preambles read as a single muted note rather than three
  // free-floating descriptions.
  private note(containerEl: HTMLElement, ...paragraphs: string[]): void {
    const wrap = containerEl.createDiv({ cls: "almanac-settings-note" });
    for (const p of paragraphs) wrap.createEl("p", { text: p });
  }

  // An empty-state placeholder for a list with nothing in it yet.
  // Settings keeps its own shape deliberately.
  //
  // It is a settings-tab affordance styled for that context, and its three
  // messages already meet the rule in empty.ts — they name what will appear and
  // how. Routing it through emptyCallout would change how Settings looks in
  // order to share a function, which is a restyle wearing a refactor's clothes.
  private emptyState(
    containerEl: HTMLElement,
    icon: string,
    text: string
  ): void {
    const wrap = containerEl.createDiv({ cls: "almanac-empty-state" });
    setIcon(wrap.createSpan({ cls: "almanac-empty-icon" }), icon);
    wrap.createSpan({ text });
  }

  // A structured table container for dense, scannable lists (Trackers, Journals).
  private createTable(
    host: HTMLElement,
    headers: string[]
  ): { wrap: HTMLElement; table: HTMLElement; tbody: HTMLElement } {
    const wrap = host.createDiv({ cls: "almanac-settings-table-wrap" });
    const table = wrap.createEl("table", { cls: "almanac-settings-table" });
    const thead = table.createEl("thead");
    const tr = thead.createEl("tr");
    for (const h of headers) {
      tr.createEl("th", { text: h });
    }
    const tbody = table.createEl("tbody");
    return { wrap, table, tbody };
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("almanac-settings");

    const s = this.plugin.settings;

    // ── Header ──────────────────────────────────────────────────────────
    const hero = containerEl.createDiv({ cls: "almanac-settings-hero" });
    const heroText = hero.createDiv({ cls: "almanac-hero-text" });
    heroText.createEl("h2", { text: "Almanac" });
    heroText.createEl("p", {
      text: "Journaling, trackers and study journals, configured in one place.",
    });

    // ── Vault setup / general, above the collapsible groups because they
    // apply everywhere and are the first thing a new vault needs.
    const general = containerEl.createDiv({ cls: "almanac-settings-general" });

    new Setting(general)
      .setName("Set up / repair vault")
      .setDesc(
        "Audit and repair your Almanac vault: create missing folders, update dashboard layouts, sync journal index notes, refresh templates, and run format migrations. Safe to run anytime with full change preview."
      )
      .addButton((b) =>
        b
          .setButtonText("Set up / repair vault")
          .setIcon("wrench")
          .setCta()
          .setTooltip("Audit and repair vault files")
          .onClick(async () => {
            await this.plugin.scaffold.setupVault();
          })
      );

    // ── Collapsible groups ──────────────────────────────────────────────
    const customCount = s.trackers.filter((t) => !t.builtin).length;
    // Study is in this list now (3.20), so there is nothing to add to it.
    const journalCount = s.customJournals.length;
    const eventCount = readEvents(this.app, this.plugin).length;

    this.renderTrackers(
      this.group(
        containerEl,
        "trackers",
        "📊",
        "Trackers",
        "What each entry logs, and which of it charts",
        true,
        customCount === 1 ? "1 custom" : `${customCount} custom`
      )
    );

    this.renderJournalTypes(
      this.group(
        containerEl,
        "journals",
        "📚",
        "Journals",
        "Folder structures with their own notes, sections and commands",
        true,
        journalCount === 1 ? "1 journal" : `${journalCount} journals`
      )
    );

    this.renderEvents(
      this.group(
        containerEl,
        "events",
        "🗓️",
        "Special events",
        "Birthdays, holidays, trips — drawn on the diary calendars",
        false,
        s.eventsEnabled
          ? eventCount === 1
            ? "1 event"
            : `${eventCount} events`
          : "Off"
      )
    );

    this.renderLogbooks(
      this.group(
        containerEl,
        "logbooks",
        "🗒️",
        "Logbooks",
        "What you keep track of that isn't a day",
        false,
        s.logbooks.length === 1 ? "1 logbook" : `${s.logbooks.length} logbooks`
      )
    );

    this.renderEntrySections(
      this.group(
        containerEl,
        "entry-sections",
        "📓",
        "Diary entries",
        "What every new entry starts with, beyond what its grain ships",
        false,
        (() => {
          const n = TRACKER_CLASSES.reduce(
            (total, g) => total + (s.entrySections[g]?.length ?? 0),
            0
          );
          return n === 0 ? "Default" : n === 1 ? "1 added" : `${n} added`;
        })()
      )
    );

    this.renderCapture(
      this.group(
        containerEl,
        "capture",
        "✏️",
        "Quick capture",
        "Getting a thought into an entry without opening it",
        false,
        s.captureCollapsedByDefault ? "Collapsed" : "Expanded"
      )
    );

    this.renderAttachments(
      this.group(
        containerEl,
        "attachments",
        "📎",
        "Attachments",
        "Where dropped and pasted files are filed",
        false
      )
    );

    this.renderBanner(
      this.group(
        containerEl,
        "banner",
        "🏷️",
        "Vault banner",
        "The strip above every Almanac note",
        false,
        s.banner.enabled ? "On" : "Off"
      )
    );

    this.renderMobile(
      this.group(
        containerEl,
        "mobile",
        "📱",
        "Mobile",
        "Mobile layout options and overlay controls",
        false,
        s.mobile?.overlayTogglePosition && s.mobile.overlayTogglePosition !== "off"
          ? s.mobile.overlayTogglePosition === "left"
            ? "Bottom left"
            : "Bottom right"
          : "Off"
      )
    );

    this.renderPaths(
      this.group(
        containerEl,
        "paths",
        "📁",
        "Paths",
        "The folders Almanac reads and writes",
        false
      )
    );
  }

  // ── The vault banner ────────────────────────────────────────────────────
  //
  // TWO ROWS, AND NOT ONE MORE (4.51). The nav's four destinations are fixed
  // for this release (Q9) and the search's sort is session state that
  // deliberately never reaches `data.json` (Q13), so what is left is the only
  // two things that are genuinely the reader's: whether the strip is there, and
  // what its tile says.
  //
  // BOTH CALL `refresh()`, because every open note is already showing the old
  // answer. A setting that takes effect on the next file-open is a setting the
  // reader presses twice.
  private renderBanner(containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    this.note(
      containerEl,
      "A bar at the top of every note in your diary, your journals and your home page: search, the four places you go most, where this note sits, and its title.",
      "While it is on, the header block inside those notes draws nothing — nothing is rewritten, so turning it off puts every note back exactly as it was."
    );

    new Setting(containerEl)
      .setName("Show the banner")
      .setDesc("Off restores the in-note headers.")
      .addToggle((c) =>
        c.setValue(s.banner.enabled).onChange(async (v) => {
          s.banner.enabled = v;
          await this.plugin.saveSettings();
          this.plugin.vaultBanner.refresh();
          // REDRAWN, because the group's own badge reads On or Off.
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Use Almanac's title and properties")
      .setDesc(
        "On the notes this bar appears on, replace Obsidian's note title with Almanac's page head, and its property panel with the bar's Properties button. The note's path, which Obsidian repeats in the tab's own header, is hidden with them. Off puts all three back."
      )
      .addToggle((c) =>
        c.setValue(s.banner.absorb).onChange(async (v) => {
          s.banner.absorb = v;
          await this.plugin.saveSettings();
          this.plugin.vaultBanner.refresh();
        })
      );

    new Setting(containerEl)
      .setName("Tile")
      .setDesc(
        `What the square in the corner shows — a letter or two, or an emoji. Empty uses your vault's initials (${initialsOf(this.app.vault.getName())}).`
      )
      .addText((c) =>
        c
          .setPlaceholder(initialsOf(this.app.vault.getName()))
          .setValue(s.banner.glyph)
          .onChange(async (v) => {
            // TRIMMED AND CAPPED HERE rather than in the banner, because a
            // twelve-character tile is a broken row and the reader should see
            // it refuse in the field they typed it into.
            s.banner.glyph = v.trim().slice(0, 4);
            await this.plugin.saveSettings();
            this.plugin.vaultBanner.refresh();
          })
      );

    // ── Background Art & Texture ──────────────────────────────────────
    const artFolder = this.app.vault.getAbstractFileByPath(s.paths.art);
    const artFiles: string[] = [];
    if (artFolder instanceof TFolder) {
      for (const child of artFolder.children) {
        if (
          child instanceof TFile &&
          (child.extension === "svg" ||
            child.extension === "png" ||
            child.extension === "jpg")
        ) {
          artFiles.push(child.name);
        }
      }
    }

    const artOptions = new Set([
      "none",
      ...Object.keys(ART_PRESETS),
      ...artFiles,
    ]);

    const artLabels: Record<string, string> = {
      none: "None (Clean / Flat)",
      ...Object.fromEntries(
        Object.entries(ART_PRESETS).map(([k, v]) => [k, v.name])
      ),
    };

    new Setting(containerEl)
      .setName("Background art pattern")
      .setDesc(
        `Vector pattern or texture from ${s.paths.art}/ to layer over the banner.`
      )
      .addDropdown((d) => {
        for (const opt of artOptions) {
          d.addOption(opt, artLabels[opt] ?? opt);
        }
        d.setValue(s.banner.art || "none").onChange(async (v) => {
          s.banner.art = v;
          await this.plugin.saveSettings();
          this.plugin.vaultBanner.refresh();
        });
      });

    new Setting(containerEl)
      .setName("Art pattern opacity")
      .setDesc("Opacity of the background pattern overlay (default 18%).")
      .addSlider((sl) =>
        sl
          .setLimits(0, 60, 1)
          .setValue(s.banner.artOpacity ?? 18)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.banner.artOpacity = v;
            await this.plugin.saveSettings();
            this.plugin.vaultBanner.refresh();
          })
      );

    new Setting(containerEl)
      .setName("Ambient accent glow")
      .setDesc("A subtle soft radial gradient in your theme's accent color.")
      .addToggle((t) =>
        t.setValue(s.banner.glowEnabled ?? true).onChange(async (v) => {
          s.banner.glowEnabled = v;
          await this.plugin.saveSettings();
          this.plugin.vaultBanner.refresh();
        })
      );
  }

  // ── Special events ──────────────────────────────────────────────────────
  // A list view, not an editor: rows open the same modal the calendar's
  // right-click menu and the `events` widget open. The list itself lives in the
  // vault (see events.ts), so this reads it fresh rather than from data.json,
  // and re-renders the whole tab after an edit — the list is short and the
  // alternative is a second copy of the row-rendering code.
  // ── Logbooks (4.52) ─────────────────────────────────────────────────
  //
  // BESIDE SPECIAL EVENTS, because the two are the diary's other two layers and
  // a reader deciding where something goes is choosing between them: an event is
  // a fact about a DATE, a logbook item is a fact about no date in particular.
  private renderLogbooks(containerEl: HTMLElement): void {
    const s = this.plugin.settings;

    containerEl.createEl("p", {
      text:
        "A logbook is a standing note for what belongs to the diary but not to one day — what you worked on, what you are focused on, links to come back to, what is scheduled. Each one is a note in the Logbooks folder, and the logbook: widget draws it on any page.",
      cls: "setting-item-description",
    });

    this.sectionHeader(containerEl, "Logbooks", {
      label: "New logbook",
      icon: "plus",
      onClick: () => {
        const taken = new Set(s.logbooks.map((b) => b.id));
        let id = "logbook";
        let n = 2;
        while (taken.has(id)) id = `logbook-${n++}`;
        const name = id === "logbook" ? "New logbook" : `New logbook ${n - 1}`;
        s.logbooks.push({
          id,
          name,
          icon: "🗒️",
          source: "region",
          path: logbookNotePath(s.paths.logbooks, name),
          color: DEFAULT_EVENT_COLOR,
        });
        void this.plugin.saveSettings().then(() => this.display());
      },
    });

    if (!s.logbooks.length) {
      this.emptyState(
        containerEl,
        "notebook-pen",
        "No logbooks. Add one and its note is written the next time you run Set up / repair vault."
      );
      return;
    }

    for (const book of s.logbooks) {
      const setting = new Setting(containerEl)
        .setName(book.name)
        .setDesc(
          book.source === "events"
            ? `${book.path} · everything scheduled ahead, read from the events note`
            : book.path
        );

      setting.addText((t) =>
        t
          .setPlaceholder("🗒️")
          .setValue(book.icon)
          .onChange(async (v) => {
            book.icon = v.trim() || "🗒️";
            await this.plugin.saveSettings();
          })
      );

      setting.addText((t) =>
        t
          .setPlaceholder("Name")
          .setValue(book.name)
          .onChange(async (v) => {
            const next = v.trim();
            if (!next) return;
            // THE NOTE DOES NOT FOLLOW THE NAME, and that is the contract
            // `LogbookDef.path` is stored to keep: a label is retyped, and a
            // note full of items must not be orphaned by a retype. Rename the
            // file in the explorer to move it — PathWatch carries the setting.
            book.name = next;
            await this.plugin.saveSettings();
          })
      );

      // The swatch its items wear on the time grid (4.55).
      //
      // A DROPDOWN OF NAMES, NOT A COLOUR PICKER, which is `EVENT_COLORS`' own
      // rule said again: the stored value is a name the stylesheet resolves per
      // theme, and a free picker would let a reader choose something that
      // vanishes in one of the two.
      //
      // ON EVERY BOOK, INCLUDING MEETINGS — whose items are events and take
      // their own colours, so this one is inert. It is drawn anyway rather than
      // hidden on a `source` test: a row missing a control its neighbours have
      // reads as a bug, and the honest place for the exception is here.
      setting.addDropdown((d) => {
        for (const name of EVENT_COLORS) {
          d.addOption(name, name.charAt(0).toUpperCase() + name.slice(1));
        }
        d.setValue(book.color).onChange(async (v) => {
          book.color = v;
          await this.plugin.saveSettings();
        });
      });

      setting.addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Remove this logbook")
          .onClick(async () => {
            // THE NOTE IS LEFT ON DISK, deliberately and without asking. This
            // list says which logbooks Almanac draws; it is not a filing
            // cabinet, and a settings row that deleted a reader's writing when
            // they tidied it away would be the worst kind of surprise.
            s.logbooks = s.logbooks.filter((other) => other.id !== book.id);
            await this.plugin.saveSettings();
            this.display();
          })
      );
    }
  }

  private renderEvents(containerEl: HTMLElement): void {
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Show special events")
      .setDesc(
        "Draw recurring and one-off events on the diary calendars. Turning this off hides the decorations and stops new entries recording the day's events, but never changes the events note itself."
      )
      .addToggle((t) =>
        t.setValue(s.eventsEnabled).onChange(async (v) => {
          s.eventsEnabled = v;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Events note")
      .setDesc(
        "The note whose frontmatter holds the event list. Created on demand; follows a rename automatically."
      )
      .addText((t) =>
        t.setValue(s.paths.events).onChange(async (v) => {
          const trimmed = v.trim();
          if (!trimmed) return;
          s.paths.events = trimmed;
          await this.plugin.saveSettings();
        })
      );

    this.sectionHeader(containerEl, "Events", {
      label: "New event",
      icon: "plus",
      onClick: () =>
        openEventEditor(this.app, this.plugin, draftEvent(), () =>
          this.display()
        ),
    });

    const defs = readEvents(this.app, this.plugin);
    if (!defs.length) {
      this.emptyState(
        containerEl,
        "calendar-plus",
        "No events yet. Birthdays and holidays recur every year; trips, sick days and milestones happen once and can span several days."
      );
      return;
    }

    const ordered = [...defs].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "recurring" ? -1 : 1;
      if (a.kind === "recurring") {
        return (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0);
      }
      return (b.start ?? "").localeCompare(a.start ?? "");
    });

    const list = containerEl.createDiv({ cls: "almanac-list" });
    for (const def of ordered) {
      this.renderEventRow(list, def);
    }
  }

  private renderEventRow(containerEl: HTMLElement, def: EventDef): void {
    const { row, actions } = createListRow(containerEl, {
      token: "",
      title: def.title,
      subtitle: def.note
        ? `${describeEventDate(def)} · ${def.note}`
        : describeEventDate(def),
      pills: [
        {
          text: def.kind === "recurring" ? "Yearly" : "One-off",
          tone: "muted",
        },
      ],
    });

    // The same coloured icon token the calendar and the widgets use, so an
    // event is recognisable wherever it appears.
    const token = row.querySelector<HTMLElement>(".almanac-list-token");
    if (token) {
      token.empty();
      token.addClass(`am-ev-chip-${eventColor(def)}`);
      setIcon(token, eventIcon(def));
    }

    rowButton(actions, "pencil", "Edit event", () =>
      openEventEditor(this.app, this.plugin, def, () => this.display())
    );
  }

  // ── Paths ───────────────────────────────────────────────────────────────
  // ── Mobile ──────────────────────────────────────────────────────────────
  private renderMobile(containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    if (!s.mobile) {
      s.mobile = {
        overlayTogglePosition: "off",
        hideOverlaysDefault: false,
      };
    }
    this.note(
      containerEl,
      "Controls tailored for mobile devices and small screens.",
      "A floating corner button allows toggling Obsidian's mobile navigation bar and toolbars to maximize screen space for dashboards and journal notes."
    );

    new Setting(containerEl)
      .setName("Overlay controls toggle button")
      .setDesc(
        "Show a floating button in the bottom corner on mobile to quickly hide or reveal Obsidian's mobile navigation bar and toolbars."
      )
      .addDropdown((d) =>
        d
          .addOption("off", "Off (Disabled)")
          .addOption("left", "Bottom left")
          .addOption("right", "Bottom right")
          .setValue(s.mobile.overlayTogglePosition ?? "off")
          .onChange(async (v) => {
            s.mobile.overlayTogglePosition = v as MobileOverlayTogglePosition;
            await this.plugin.saveSettings();
            this.plugin.mobileControls?.refresh();
            this.display();
          })
      );

    if (s.mobile.overlayTogglePosition && s.mobile.overlayTogglePosition !== "off") {
      new Setting(containerEl)
        .setName("Hide overlay controls by default")
        .setDesc("Automatically start with mobile overlay controls hidden when Obsidian opens.")
        .addToggle((t) =>
          t.setValue(s.mobile.hideOverlaysDefault ?? false).onChange(async (v) => {
            s.mobile.hideOverlaysDefault = v;
            await this.plugin.saveSettings();
            this.plugin.mobileControls?.refresh();
          })
        );
    }
  }

  // ── Paths ───────────────────────────────────────────────────────────────
  //
  // Five editable roots; everything else is shown read-only beneath the root
  // that owns it.
  //
  // The stored paths are still plain concrete strings — nothing is resolved at
  // read time, and a child path is as real and as renameable as it ever was.
  // What changed is only the *editing surface*: typing a new root rewrites its
  // children by prefix (the same remap PathWatch runs when you rename a folder
  // in the file explorer, so both gestures do exactly one thing), instead of
  // asking you to retype four paths by hand and get all four right.
  //
  // The file explorer remains the better tool for reorganising, because it
  // moves the files too. These fields are for the other job: pointing Almanac
  // at folders that already exist — dropping it into a vault whose diary is
  // already at `Daily Notes/`.
  private renderPaths(containerEl: HTMLElement): void {
    const paths = this.plugin.settings.paths;

    containerEl.createEl("p", {
      text:
        "The four roots the vault is built from, plus the homepage. Everything else is filed under one of them and " +
        "follows it — change a root here and the paths listed under it move with it. " +
        "Note that these fields only point Almanac at a folder; they don't move anything on disk. " +
        "To reorganise, rename or drag the folder in the file explorer instead — Almanac follows that too, and it " +
        "moves the files.",
      cls: "setting-item-description",
    });

    const roots: {
      key: keyof typeof DEFAULT_PATHS;
      name: string;
      desc: string;
    }[] = [
      {
        key: "home",
        name: "Homepage",
        desc: "The dashboard the ribbon and every Home link open.",
      },
      {
        key: "infrastructureRoot",
        name: "00 · Infrastructure",
        desc: "The machinery: templates, documentation and .base files.",
      },
      {
        key: "materialRoot",
        name: "01 · Material",
        desc: "Raw stuff entries are made from and point at.",
      },
      {
        key: "diaryRoot",
        name: "02 · Diary",
        desc: "Dated entries. Also the default scope for the tag-index widget.",
      },
      {
        key: "journalsRoot",
        name: "03 · Journals",
        desc: "One folder per journal — Study's, and each custom journal's.",
      },
      {
        key: "exportRoot",
        name: "Plain markdown export",
        desc: "Where “Maintenance: export as plain markdown” writes. Copies only — nothing here is read back.",
      },
    ];

    for (const root of roots) {
      new Setting(containerEl)
        .setName(root.name)
        .setDesc(root.desc)
        .addText((t) =>
          t.setValue(paths[root.key]).onChange(async (v) => {
            const next = v.trim();
            // An empty path would break every create/scaffold call that builds
            // on it, so ignore it rather than storing it and failing later.
            if (!next) return;
            const before = paths[root.key];
            if (next === before) return;
            // `home` names a file; the rest are folders whose children follow.
            remapConfiguredPaths(
              this.plugin.settings,
              before,
              next,
              root.key !== "home"
            );
            paths[root.key] = next;
            await this.plugin.saveSettings();
            this.refreshDerivedPaths();
          })
        );

      const children = ROOT_CHILDREN[root.key] ?? [];
      if (children.length === 0) continue;
      const list = containerEl.createDiv({ cls: "almanac-path-children" });
      list.dataset.root = root.key;
      this.renderDerivedPaths(list, children);
    }
  }

  // The read-only rows under a root. Re-rendered in place after a root edit so
  // the displayed paths never lag the stored ones, without redrawing (and
  // collapsing) the whole settings tab mid-keystroke.
  private renderDerivedPaths(
    list: HTMLElement,
    children: (keyof typeof DEFAULT_PATHS)[]
  ): void {
    list.empty();
    for (const key of children) {
      const row = list.createDiv({ cls: "almanac-path-child" });
      row.createSpan({
        cls: "almanac-path-child-label",
        text: DERIVED_PATH_LABELS[key] ?? key,
      });
      row.createSpan({
        cls: "almanac-path-child-value",
        text: this.plugin.settings.paths[key],
      });
    }
  }

  private refreshDerivedPaths(): void {
    const lists = this.containerEl.querySelectorAll<HTMLElement>(
      ".almanac-path-children"
    );
    lists.forEach((list) => {
      const root = list.dataset.root;
      if (!root) return;
      this.renderDerivedPaths(list, ROOT_CHILDREN[root] ?? []);
    });
  }

  // ── Attachments ─────────────────────────────────────────────────────────
  // Governs where the `attach:` widget puts files dropped or pasted into it.
  // Nothing here rewrites existing links: changing a pattern only affects the
  // next file added.
  private renderCapture(containerEl: HTMLElement): void {
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Collapse captures by default")
      .setDesc(
        "Whether the Captured field in an entry starts folded. Captures accumulate all day, so folding keeps them from pushing the rest of the entry down. Folding or unfolding it in a particular entry is remembered for that entry and overrides this."
      )
      .addToggle((t) =>
        t.setValue(s.captureCollapsedByDefault).onChange(async (v) => {
          s.captureCollapsedByDefault = v;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    const draft = s.captureDraft ?? "";
    if (draft) {
      // Surfaced because an unsaved draft is invisible otherwise — it lives in
      // data.json, not the vault, so nothing else in Obsidian would reveal that
      // there's text waiting. Discarding is offered here for the same reason.
      new Setting(containerEl)
        .setName("Unsaved draft")
        .setDesc(
          `${draft.length} ${
            draft.length === 1 ? "character" : "characters"
          } waiting in the capture box. It'll be there next time you open it.`
        )
        .addButton((b) =>
          b.setButtonText("Discard").onClick(async () => {
            s.captureDraft = "";
            await this.plugin.saveSettings();
            this.display();
          })
        );
    }
  }

  // ── Diary entries ───────────────────────────────────────────────────────
  //
  // THE CONTROL §8's PATCH 6 OWED AND DID NOT SHIP. `entrySections` existed,
  // both scaffold paths composed with it, and nothing could write it: the
  // feature was reachable only by hand-editing data.json, which is the same
  // "built and unreachable" shape §1 of the 3.8 plan spent its opening section
  // on. A setting no surface can set is dead code with a default value.
  //
  // WHAT IT EDITS IS THE TEMPLATE, and that is the honest framing rather than a
  // hedge. §2.4: adding a section to every future entry is not a file edit —
  // there is no file — so this is the one place the answer can be given, and
  // the section editor correctly refuses the managed template it produces.
  //
  // ON §6's OPEN QUESTION — "does it apply retroactively?" — this answers
  // SILENCE, deliberately. Turning a section on does not reach into today's
  // note. §6 is right that a reader may read that as the feature not working,
  // and the fix for that is a sentence rather than a write: the note below says
  // where existing entries are, and "Edit this note's sections…" is already the
  // one-note path, built, tested and non-destructive. An offer that edited a
  // note the reader was not looking at would be a settings toggle writing to
  // the vault, which is the line layout.ts draws in its own header — and a
  // command would be a third way to do a thing that already has two.
  // Answers to a section's questions that are not yet a complete set. See
  // `renderEntrySectionRow`: the setting stores complete choices only, so a
  // partially answered row needs somewhere to live between renders, and this
  // window is exactly the right lifetime for it.
  private pendingSectionAnswers = new Map<string, Record<string, unknown>>();

  private renderEntrySections(containerEl: HTMLElement): void {
    this.note(
      containerEl,
      "Manage extra sections for new entry templates. Entries you already have keep what they have (to add a section, open the note and run “Edit this note's sections…”)."
    );

    new Setting(containerEl)
      .setName("Apply to the templates")
      .setDesc(
        "Rewrites the five entry templates from the catalogue and the choices below. Nothing else in the vault is touched, and no entry you have already written is read or changed."
      )
      .addButton((b) =>
        b
          .setButtonText("Refresh entry templates")
          .onClick(() => this.plugin.scaffold.refreshTemplates())
      );

    // The answers to any question a section asks, assembled once for the whole
    // list rather than per row: it is the same vault five times over, and it
    // is the same list `section-insert.ts` hands the editor and a refusal
    // prints. A bridge on an entry reads the surface its host is not on.
    const journalKinds = bridgeCatalogue(this.plugin, otherSurface("diary")).kinds;

    // ── ONE TABLE, NOT FIVE STACKS (4.27 §3) ──────────────────────────
    //
    // This was a headed stack per grain, and across all five grains exactly two
    // sections are ever offerable — so it drew "From the journals" four times
    // and "Captured" four times with a heading between each. The same facts are
    // a grid: a row per section, a column per grain.
    //
    // EVERY DECISION IS `entrySectionMatrix`'S. The two calls that used to be
    // inline here moved into the catalogue, where the suite can reach them —
    // this loop draws what it is handed and works out nothing for itself.
    //
    // HEADERS DERIVED, NEVER FIVE LITERALS. `test/tracker-grains.test.ts`
    // records the reason: "a sixth grain is a table edit away; a layout that
    // only works at five breaks silently the moment the table grows".
    const matrix = entrySectionMatrix(journalKinds);
    if (!matrix.rows.length) {
      this.emptyState(
        containerEl,
        "layout-template",
        "Every grain's template already writes every section this catalogue offers."
      );
      return;
    }

    const { tbody } = this.createTable(containerEl, [
      "Section",
      ...matrix.grains.map((g) => CLASS_DEFS[g].label),
    ]);

    for (const section of matrix.rows) {
      const tr = tbody.createEl("tr");
      const ctxFor = (grain: TrackerClass): EntrySectionContext => ({
        grain,
        journalKinds,
      });

      // Nothing in the vault to answer this section's question with — a
      // sentence in the section's own words rather than an empty menu, exactly
      // as the stacked row said it.
      //
      // SAID ONCE, IN THE ROW, rather than in each of four cells: the answer
      // does not vary by grain (it is the same vault five times over, which is
      // why `journalKinds` is assembled once above), so four copies would be
      // one fact repeated until it read as noise. The grain cells then draw no
      // control, because a dropdown whose only entry is "Not added" is a
      // control that cannot do its job.
      const offering = matrix.grains.find(
        (g) => matrix.cell(section.id, g) === "offer"
      );
      const unanswerable = offering
        ? (section.questions?.(ctxFor(offering)) ?? []).find(
            (q) => q.kind === "choice" && !q.values.length
          )
        : undefined;

      const nameCell = tr.createEl("td");
      const name = nameCell.createDiv({ cls: "col-name" });
      name.createSpan({ cls: "col-name-token", text: section.icon });
      name.createSpan({ text: section.label });
      nameCell.createDiv({
        cls: "col-name-sub",
        text:
          unanswerable && unanswerable.kind === "choice"
            ? `${section.blurb} — ${unanswerable.empty}`
            : section.blurb,
      });

      for (const grain of matrix.grains) {
        const td = tr.createEl("td", { cls: "col-grain" });
        const state = matrix.cell(section.id, grain);
        if (state === "ships") {
          // A STATEMENT OF FACT IS NOT A STATUS CHIP. Plain muted text, with
          // the reason on hover — five pills across a row is decoration where
          // the eye is looking for the one cell that has a control in it.
          td.createSpan({
            cls: "almanac-cell-ships",
            text: "Ships",
            attr: {
              title: `A new ${CLASS_DEFS[grain].adjective} entry already writes ${section.label}.`,
            },
          });
          continue;
        }
        if (state === "absent") {
          td.createSpan({
            cls: "almanac-cell-absent",
            text: "—",
            attr: {
              title: `${section.label} is not offered on ${CLASS_DEFS[grain].adjective} entries.`,
            },
          });
          continue;
        }
        if (unanswerable) continue;
        this.renderEntrySectionCell(td, grain, section, ctxFor(grain));
      }
    }
  }

  // One offerable section, for one grain.
  //
  // TWO CONTROL SHAPES, AND THE SECTION DECIDES WHICH. A section that asks the
  // reader nothing is a toggle. A section that asks something is the QUESTION,
  // with "Not added" as its first answer — because for the one section that
  // asks, the two decisions are one decision: a bridge with no journal to pull
  // is not an off bridge, it is not a bridge. Splitting them into a toggle plus
  // a dropdown would produce a fourth state (on, unanswered) that means
  // nothing, and the editor's whole patch-7 rule exists to keep that state from
  // being savable.
  //
  // AND HERE THE ANSWER STAYS EDITABLE, where in the section editor it does
  // not. That asymmetry is not an oversight and is worth stating in the one
  // place a reader might notice it: a template is COMPOSED from this setting
  // every time it is refreshed, so rewriting the answer costs nothing. An
  // entry is the reader's file, its directive line is copied out verbatim on
  // Save, and rewriting it would be this window editing prose it did not write.
  // Same field, two surfaces, and the difference is who owns the bytes.
  private renderEntrySectionCell(
    td: HTMLElement,
    grain: TrackerClass,
    section: EntrySection,
    ctx: EntrySectionContext
  ): void {
    const s = this.plugin.settings;
    const current = s.entrySections[grain] ?? [];
    const chosen = current.find((c) => c.id === section.id);
    const questions = section.questions?.(ctx) ?? [];

    // Answers given but not yet complete, held across the re-render `write`
    // triggers. Keyed by grain and section so two rows cannot read each
    // other's.
    //
    // THE SETTING IS NOT THE RIGHT PLACE TO HOLD HALF AN ANSWER, which is why
    // this is a field on the tab rather than a permissive `entrySections`. A
    // stored half-choice would compose a directive the catalogue already knows
    // will refuse, and `composeEntryTemplate` has no way to tell one from a
    // finished one. So the storage stays complete-or-absent and the partial
    // lives exactly as long as the settings window does.
    //
    // WITHOUT THIS THE SECOND QUESTION IS UNANSWERABLE. `write(null)` deletes
    // the choice, `display()` re-renders from the setting, and the first
    // dropdown comes back reading "Not added" — so answering question two
    // discards question one, forever. Unreachable today: `bridge` asks exactly
    // one thing, so `complete` is true on the first answer and `write(null)` is
    // never taken with anything worth keeping. It is a trap laid for whoever
    // adds the second question rather than a defect anyone can hit, and it is
    // cheaper to close now than to find later.
    const pendingKey = `${grain}:${section.id}`;
    const held = {
      ...(this.pendingSectionAnswers.get(pendingKey) ?? {}),
      ...(chosen?.options ?? {}),
    };

    const write = async (next: SectionChoice | null): Promise<void> => {
      const rest = current.filter((c) => c.id !== section.id);
      const list = next ? [...rest, next] : rest;
      // Sparse by grain: an empty list is an absent key, so a vault that has
      // customised nothing stores nothing and `DEFAULT_SETTINGS.entrySections`
      // stays `{}` in fact as well as in name.
      if (list.length) s.entrySections[grain] = list;
      else delete s.entrySections[grain];
      // AND THE SAVED BAND KEEPS UP (4.29).
      //
      // A grain whose reader has pressed "Save this page as the default" has a
      // BAND, and a band is authoritative: it is the shared band, membership
      // and order. So this toggle has to reach it, or ticking Captured for
      // weekly here would change a setting and nothing else — the exact
      // "built and unreachable" shape this table was added to fix, arriving by
      // the other door.
      //
      // THE DECISION IS `bandWithSection`'S, not this closure's. A rule written
      // inside a `write` handler is one the suite cannot reach, and a wrong
      // answer here looks like a setting that does nothing rather than like a
      // bug. A grain with no band gets `undefined` back and is left alone.
      const band = bandWithSection(s.entrySectionBand[grain], section.id, next != null);
      if (band) s.entrySectionBand[grain] = band;
      await this.plugin.saveSettings();
      this.display();
    };

    // The cell IS the control, and the name and blurb are the row's — see
    // `renderEntrySections`. `almanac-list-toggle` inside a `<td>` is the
    // pattern the trackers table already uses to put an Obsidian `Setting`
    // control in a cell without its two-column flex fighting the column.
    const row = new Setting(td.createDiv({ cls: "almanac-list-toggle" }));

    if (!questions.length) {
      row.addToggle((t) =>
        t.setValue(chosen != null).onChange((v) => void write(v ? { id: section.id } : null))
      );
      return;
    }

    for (const q of questions) {
      // A THIRD SURFACE THAT ASKS, and 3.15 found it by breaking it: the
      // editor, `section-insert.ts` and this row all draw whatever a section
      // declares. This one only ever meets entry sections, and the only
      // question they ask is a choice — but the narrowing is written rather
      // than assumed, because a folder question arriving here silently would
      // store a section with no answer where the other two draw a control.
      // If one ever does, this row needs the field, not a skip.
      if (q.kind !== "choice") continue;
      // Nothing in the vault to answer with. THE ROW SAYS SO, ONCE, and the
      // caller does not reach this cell at all in that case — see the
      // `unanswerable` branch in `renderEntrySections`. Kept as a guard rather
      // than deleted because this method is reachable from one caller today and
      // an empty menu is a worse failure than an early return.
      if (!q.values.length) continue;
      const answer = held[q.key];
      row.addDropdown((d) => {
        d.addOption("", "Not added");
        for (const v of q.values) d.addOption(v.value, v.label);
        d.setValue(typeof answer === "string" ? answer : "");
        d.onChange((v) => {
          const options = { ...held };
          if (v) options[q.key] = v;
          else delete options[q.key];
          // Stored only once EVERY question has an answer, which is the
          // editor's rule stated on the other surface. A half-answered choice
          // would compose a directive the catalogue already knows will refuse.
          const complete =
            Object.keys(options).length > 0 &&
            questions.every((other) => options[other.key]);
          if (complete) this.pendingSectionAnswers.delete(pendingKey);
          else this.pendingSectionAnswers.set(pendingKey, options);
          void write(complete ? { id: section.id, options } : null);
        });
      });
    }
  }

  private renderAttachments(containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    const a = s.attachments;

    containerEl.createEl("p", {
      text:
        "Where the Attachments widget files images and documents you drop, paste or pick. " +
        "Existing attachments are never moved — these apply to the next file added.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Location")
      .setDesc(
        "Almanac folder: the attachments folder below, plus the subfolder pattern. " +
          "Obsidian default: whatever Files & Links is set to, so attachments match the rest of the vault. " +
          "Beside the note: the note's own folder."
      )
      .addDropdown((d) =>
        d
          .addOption("almanac", "Almanac attachments folder")
          .addOption("obsidian", "Obsidian's default attachment location")
          .addOption("note", "Beside the note")
          .setValue(a.location)
          .onChange(async (v) => {
            a.location = v as AttachmentLocation;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (a.location === "almanac") {
      new Setting(containerEl)
        .setName("Attachments folder")
        .setDesc(
          "Root folder for attachments. Created by 'Set up / repair vault'."
        )
        .addText((t) =>
          t.setValue(s.paths.attachments).onChange(async (v) => {
            const trimmed = v.trim();
            if (!trimmed) return;
            s.paths.attachments = trimmed;
            await this.plugin.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName("Subfolder pattern")
        .setDesc(
          "Optional tree below that folder. Tokens: {yyyy} {yy} {mm} {dd} {date} {note}. " +
            "Leave empty for one flat folder — a year/month split keeps a long-running journal browsable."
        )
        .addText((t) =>
          t
            .setPlaceholder("{yyyy}/{mm}")
            .setValue(a.subfolder)
            .onChange(async (v) => {
              a.subfolder = v.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName("File name pattern")
      .setDesc(
        "Tokens: {name} (original name, or 'Pasted image') {date} {time} {yyyy} {mm} {dd} {note}. " +
          "The extension is added automatically; duplicates get a numeric suffix."
      )
      .addText((t) =>
        t
          .setPlaceholder("{name} {date} {time}")
          .setValue(a.namePattern)
          .onChange(async (v) => {
            a.namePattern = v.trim() || "{name}";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Confirm before deleting a file")
      .setDesc(
        "'Remove' only ever removes the link from the note. This asks first when you choose 'Remove and delete file', which moves it to the trash."
      )
      .addToggle((t) =>
        t.setValue(a.confirmDelete).onChange(async (v) => {
          a.confirmDelete = v;
          await this.plugin.saveSettings();
        })
      );
  }

  // ── Journal types ───────────────────────────────────────────────────────
  // A list, not an editor. Each row summarises one type — its emoji, name,
  // folder and shape — and opens the full form in a modal. Study is the first
  // row so it reads as "just another journal" rather than a separate,
  // privileged concept; unlike a custom type it can't be deleted, only turned
  // off, and its only editable field is the shared folder emoji map.
  private renderJournalTypes(containerEl: HTMLElement): void {
    this.note(
      containerEl,
      "Custom journal folder structures with dedicated note templates, homepage sections, and commands. Run “Set up / repair vault” after making structural changes."
    );

    const journals = this.plugin.settings.customJournals;

    const taken = (): Set<string> =>
      new Set<string>(journals.map((j) => j.id));

    // Open the create wizard on a draft. Every route below produces a draft and
    // hands it here; none of them writes anything until the reader saves, which
    // is what makes "start from" a starting point rather than a copy operation.
    const start = (cfg: JournalConfig, preset?: JournalPreset): void => {
      openJournalEditor(
        this.app,
        this.plugin,
        cfg,
        {
          mode: "create",
          index: -1,
          // Offered to the Structure step's "Rated on" dropdown so a preset
          // whose Workout is rated on Intensity does not read "Nothing".
          // Written nowhere — see §1.4. The scoping is irrelevant here, since
          // only the id and the label are drawn.
          pendingTrackers: preset ? presetTrackerDefs(preset, cfg) : undefined,
        },
        async (saved) => {
          journals.push(saved);
          // THE PRESET'S OWN MEASUREMENTS, SEEDED HERE AND NOWHERE ELSE.
          // 4.35 §1.3.
          //
          // Scoped to `saved`, not to `cfg`: the reader may have renamed the
          // journal on the Identity step, and `applyNameChange` re-slugs the
          // id — so the surface has to come from the config they committed or
          // every chart would refuse with a message naming a journal that
          // does not exist.
          //
          // BEFORE `saveSettings`, AND THEREFORE BEFORE
          // `scaffold.createJournalType` WRITES THE MANIFEST — which filters
          // `settings.trackers` through `manifestCarriesTracker(t, cfg.id)`.
          // So the preset's trackers land in the journal's own
          // `.almanac-journal.json` for free, and survive a `data.json` wipe,
          // a folder copy and re-adoption. That is not a side effect to be
          // discovered later; it is the argument for this hook point over any
          // other.
          if (preset) {
            this.plugin.settings.trackers.push(
              ...trackersToSeed(
                this.plugin.settings.trackers,
                presetTrackerDefs(preset, saved)
              )
            );
          }
          await this.plugin.saveSettings();
          await this.plugin.journals.rebuildJournalHome();
          this.display();
        }
      );
    };

    // A journal's ARRANGEMENT with none of its identity. 3.20.1.
    //
    // "Start from Cooking" means the levels, the note kinds and the saved
    // layouts — the part that took work to get right — and explicitly NOT the
    // id, the name or the folders, which are what make Cooking that journal
    // rather than this one. Copied deeply, so editing the new draft cannot
    // reach back into the journal it was started from.
    //
    // The name is left for the wizard's first step to demand: a draft called
    // "Cooking copy" would be a name nobody chose that a reader might keep.
    const startFrom = (src: JournalConfig): JournalConfig => {
      const ids = taken();
      let id = `${src.id}-2`;
      let n = 2;
      while (ids.has(id)) id = `${src.id}-${++n}`;
      const name = `${src.name} ${n}`;
      return {
        ...structuredClone(src),
        id,
        name,
        ...deriveJournalFolders(name, this.plugin.settings.paths),
      };
    };

    this.sectionHeader(containerEl, "Types", [
      // PRESETS ARE THEIR OWN BUTTON, not an entry in the one beside it
      // (3.20.1). "Add journal" starts from what this vault already has;
      // "Presets" starts from what the plugin ships. Folding both into one menu
      // made the reader's list and the shipped list read as one list, which
      // they are not — and it put a permanent, unfamiliar entry in a menu whose
      // other items are all things the reader made.
      {
        label: "Presets",
        icon: "sparkles",
        onClick: (evt: MouseEvent) => {
          // A preset already installed is not offered again: its id is the
          // handle its notes are classified through, so a second copy would be
          // either a rename or a collision, and neither is what the row means.
          const offered = JOURNAL_PRESETS.filter((p) => !taken().has(p.id));
          if (!offered.length) {
            new Notice(
              "Every preset is already in this vault. “Add journal” starts a new one from any of them."
            );
            return;
          }
          const menu = new Menu();
          for (const preset of offered) {
            menu.addItem((i) =>
              i
                // NO `setIcon` HERE, AND THAT IS THE POINT (4.35.1). Every row
                // carried the same `sparkles` beside the emoji that actually
                // identifies it, so one of the two glyphs was identical on all
                // four rows and told the reader nothing. The emoji IS the
                // preset's identity — it is what the journal wears on its
                // banner, its section bar and its cards — so it is the one that
                // stays. Dropping the icon also gives the rows Obsidian's icon
                // gutter back.
                .setTitle(`${preset.emoji}  ${preset.name}`)
                // OPENED IN THE EDITOR RATHER THAN INSTALLED OUTRIGHT, so a
                // preset is a starting point a reader can rename, re-level and
                // re-kind before it exists — the whole claim being made by
                // turning Study into one. Installing silently would hand back
                // the un-editable built-in under a new name.
                //
                // FOLDERS DERIVED FROM THE NAME, not taken from the shipped
                // literal: `presetAsNewJournal` is why a journal called "Study"
                // gets `Templates/Study` rather than the `Templates/Studies`
                // the built-in carried since before journals had derived
                // folders at all.
                // THE PRESET ITSELF GOES THROUGH TOO, not just its config: its
                // trackers are on the preset rather than on the config, because
                // a config is stored per journal in `data.json` and the
                // registry has one home.
                .onClick(() =>
                  start(
                    presetAsNewJournal(preset, this.plugin.settings.paths),
                    preset
                  )
                )
            );
          }
          menu.showAtMouseEvent(evt);
          return menu;
        },
      },
      {
        label: "Add journal",
        icon: "plus",
        onClick: (evt: MouseEvent) => {
          const blank = (): void =>
            start(freshCustomJournal(taken(), this.plugin.settings.paths));
          // Nothing to start from yet, so there is no choice to present.
          if (!journals.length) {
            blank();
            return;
          }
          const menu = new Menu();
          menu.addItem((i) =>
            i
              .setTitle("Blank journal")
              .setIcon("plus")
              .onClick(() => blank())
          );
          menu.addSeparator();
          // GENERALISED FROM "Start from Study" (3.20.1). Study was only ever
          // the first example of this: a journal whose shape somebody would
          // want again. Now that it is an ordinary stored journal, so is every
          // other one, and the menu says so by listing them all.
          for (const src of journals) {
            menu.addItem((i) =>
              i
                .setTitle(`Start from ${src.name}`)
                .setIcon("copy")
                .onClick(() => start(startFrom(src)))
            );
          }
          menu.showAtMouseEvent(evt);
          return menu;
        },
      },
    ]);

    if (journals.length) {
      const { tbody } = this.createTable(containerEl, [
        "Journal",
        "Identifier",
        "Root Folder",
        "Structure",
        "Actions",
      ]);
      journals.forEach((cfg, i) => this.renderJournalRow(tbody, cfg, i));
    } else {
      this.note(
        containerEl,
        "No journals yet. “Presets” starts from a ready-made one, or “Add journal” starts a blank."
      );
    }

    // Folders that look like journals but aren't set up. Rendered after the
    // registered types and looking deliberately unlike them: these are an
    // offer, not a list of what the vault has.
    void this.renderImportable(containerEl);

    // One pool for every type, so it belongs to the section rather than to a
    // row in it. It sat on the Study row until 2.39, which was where it was
    // first needed rather than where it applies.
    const emojiCount = Object.keys(this.plugin.settings.folderEmojis).length;
    new Setting(containerEl)
      .setName("Folder emojis")
      .setDesc(
        `A vault-wide name→emoji list used by every journal type and every level — ${
          emojiCount === 1 ? "1 name" : `${emojiCount} names`
        } so far. A folder that isn't listed falls back to the emoji set on its level.`
      )
      .addButton((b) =>
        b.setButtonText("Edit list").onClick(() =>
          openFolderEmojiEditor(this.app, this.plugin, async () => {
            await this.plugin.saveSettings();
            this.display();
          })
        )
      );
  }

  // The "found a journal folder" offer.
  //
  // Async and fire-and-forget, because display() is synchronous and this is
  // the only thing on the page that has to touch the disk. The rows append
  // when the answer arrives; nothing above them waits.
  private async renderImportable(containerEl: HTMLElement): Promise<void> {
    let folders;
    try {
      folders = await this.plugin.journalImport.inferrableFolders();
    } catch (e) {
      console.error("[Almanac] could not look for importable journals", e);
      return;
    }
    if (folders.length === 0) return;

    this.sectionHeader(containerEl, "Found in the vault");
    this.note(
      containerEl,
      "These folders look like journals Almanac doesn\u2019t know about \u2014 copied in from elsewhere, or defined before their settings were lost. Reviewing one reads the folder and fills the form in from it; nothing is registered until you save."
    );
    const list = containerEl.createDiv({ cls: "almanac-list" });
    for (const folder of folders) {
      const { actions } = createListRow(list, {
        token: "\u{1F4E5}",
        title: folder.name,
        subtitle: folder.path,
        pills: [{ text: "Not set up", tone: "off" }],
      });

      rowButton(actions, "search", "Review and import", () => {
        void (async () => {
          const found = await this.plugin.journalImport.inferFolder(folder);
          if (!found) {
            new Notice(
              `Almanac: couldn\u2019t read ${folder.name} as a journal. Add it with \u201CAdd journal\u201D instead.`
            );
            return;
          }
          openJournalEditor(
            this.app,
            this.plugin,
            found.config,
            { mode: "import", index: -1, guesses: found.guesses },
            async (cfg) => {
              // register() writes the manifest and repaints, so an imported
              // journal is indistinguishable from one defined here from the
              // next load on.
              await this.plugin.journalImport.register([
                { ...found, config: cfg },
              ]);
              this.display();
            }
          );
        })();
      });

      rowButton(actions, "x", "Not a journal \u2014 stop offering it", () => {
        void (async () => {
          await this.plugin.journalImport.dismiss(folder);
          this.display();
        })();
      });
    }
  }

  private renderJournalRow(
    tbody: HTMLElement,
    cfg: JournalConfig,
    index: number
  ): void {
    const journals = this.plugin.settings.customJournals;
    const kindNames = cfg.kinds.map((k) => k.label).join(", ");
    const tr = tbody.createEl("tr");

    // 1. Journal
    const tdJournal = tr.createEl("td");
    const nameWrap = tdJournal.createDiv({ cls: "col-name" });
    nameWrap.createSpan({ cls: "col-name-token", text: cfg.emoji });
    nameWrap.createSpan({ text: cfg.name });

    // 2. Identifier
    const tdId = tr.createEl("td");
    tdId.createEl("code", { text: cfg.id });

    // 3. Root Folder
    const tdFolder = tr.createEl("td");
    tdFolder.createSpan({ text: cfg.root });

    // 4. Structure
    const tdStruct = tr.createEl("td");
    const structWrap = tdStruct.createDiv({ cls: "almanac-list-pills" });
    structWrap.createSpan({
      cls: "almanac-list-pill is-muted",
      text: cfg.levels.length === 1 ? "Flat" : "Two levels",
    });
    structWrap.createSpan({
      cls: "almanac-list-pill is-muted",
      text: kindNames || "No note types",
    });

    // 5. Actions
    const tdActions = tr.createEl("td", { cls: "col-actions-cell" });
    const actions = tdActions.createDiv({ cls: "col-actions" });

    // The third door onto the section editor, after the banner control and the
    // command. A reader looking for configuration comes to Settings, and until
    // 2.55.2 the only way from here was Edit journal → Next → a row → a button.
    // Opening on the Sections step directly is one click instead of four for the
    // thing this release is mostly about.
    rowButton(actions, "layout-list", "Templates and sections", () =>
      openJournalEditor(
        this.app,
        this.plugin,
        cfg,
        { mode: "edit", index, step: 1 },
        async (next) => {
          journals[index] = next;
          await this.plugin.saveSettings();
          await this.plugin.journalImport.writeManifest(next);
          await this.plugin.journals.rebuildJournalHome();
          this.display();
        }
      )
    );

    rowButton(actions, "pencil", "Edit journal", () =>
      openJournalEditor(
        this.app,
        this.plugin,
        cfg,
        { mode: "edit", index },
        async (next) => {
          journals[index] = next;
          await this.plugin.saveSettings();
          // Keep the manifest beside the notes in step with settings, so the
          // folder still describes itself correctly after an edit.
          await this.plugin.journalImport.writeManifest(next);
          await this.plugin.journals.rebuildJournalHome();
          this.display();
        }
      )
    );

    rowButton(
      actions,
      "trash-2",
      "Delete journal",
      async () => {
        // THE FOLDERS QUESTION IS ASKED SEPARATELY, WHICH IS WHY THIS SENTENCE
        // NO LONGER ANSWERS IT (4.17 §3). It used to end "The folders and notes
        // it created stay on disk", which was true and was the whole of the
        // offer — a reader who wanted them gone had to go and do it by hand in
        // the file explorer, and doing it in the other order is what produced
        // the stale registration this release came from.
        const ok = await confirmAction(
          this.app,
          `Delete "${cfg.name}"?`,
          "This removes the journal from Almanac — its section, commands and buttons all disappear. Nothing is deleted from your vault.",
          "Delete",
          true
        );
        if (!ok) return;

        // WHERE THE FOLDERS GO, asked only when there are folders to ask about.
        // A journal whose folders the reader already deleted — the reported case
        // — skips this entirely, because a picker offering to move two folders
        // that do not exist is a question with no true answer.
        const onDisk = journalFoldersOnDisk(this.app, cfg);
        let bin = false;
        if (onDisk.length > 0) {
          const LEAVE = "Leave its folders and notes where they are";
          const BIN = `Move them to ${BIN_FOLDER}/`;
          const chosen = await promptSuggester(
            this.app,
            [LEAVE, BIN],
            `${onDisk.join(", ")} — what should happen to ${onDisk.length === 1 ? "it" : "them"}?`
          );
          // Cancelling abandons the deletion, on the same rule the tracker
          // picker below states in full: the safe reading of "I did not answer"
          // is that nothing should happen.
          if (!chosen) return;
          bin = chosen === BIN;
        }

        // Trackers scoped to this type would otherwise be orphaned: still in
        // the registry, offerable nowhere, described by a raw id. Ask, naming
        // the count — never silently strand them.
        const orphaned = trackersScopedToType(
          this.plugin.settings.trackers,
          cfg.id
        );
        let how: OrphanResolution = "widen";
        if (orphaned.length > 0) {
          // A picker rather than a confirm, because both answers are real and
          // a confirm has only one. `confirmAction` resolves false on Esc and
          // on clicking away, so wiring "delete them" to the negative branch
          // would make a stray keypress destroy trackers. Cancelling here
          // abandons the whole deletion instead — the safe reading of "I did
          // not answer" is that nothing should happen.
          const n = orphaned.length;
          const KEEP = `Keep ${n === 1 ? "it" : "them"} — widen to all journals`;
          const DROP = `Delete ${n === 1 ? "it" : "them"} with the journal type`;
          const chosen = await promptSuggester(
            this.app,
            [KEEP, DROP],
            `${n} tracker${n === 1 ? "" : "s"} scoped to ${cfg.name}: ${orphaned
              .map((t) => t.label)
              .join(", ")}`
          );
          if (!chosen) return;
          how = chosen === DROP ? "delete" : "widen";
        }

        // THE FILES MOVE FIRST, BEFORE THE REGISTRATION GOES. If the move fails
        // — a folder open elsewhere, a vault mid-sync — the journal is still
        // registered and still describes the folders it has, which is a state
        // the reader can act on. The other order leaves an unregistered journal
        // whose folders are exactly where they were, which is the stale shape
        // this whole release is about.
        let moved: string[] = [];
        if (bin) {
          try {
            moved = await binJournalFolders(this.app, cfg, today());
          } catch (err) {
            console.error("Almanac: couldn't move journal folders to the bin", err);
            new Notice(
              `Almanac: couldn't move ${cfg.name}'s folders — nothing was changed.`
            );
            return;
          }
        }

        await removeJournal(this.plugin, index, how);
        if (moved.length) {
          new Notice(
            `Almanac: deleted “${cfg.name}” — its folders are in ${BIN_FOLDER}/ 🗑️`
          );
        }
        this.display();
      },
      { danger: true }
    );
  }

  // ── Trackers ────────────────────────────────────────────────────────
  // Two lists: the locked built-ins (on/off, plus Mood's own two settings) and
  // the user's own trackers. Both are summary rows — the fields live in a modal
  // so changing a tracker's type no longer redraws the whole tab.
  private renderTrackers(containerEl: HTMLElement): void {
    this.note(
      containerEl,
      "Configure trackers across diary entries and custom journals. Additional trackers can be added to individual notes at any time with “+ Add tracker”."
    );

    // ── Built-in trackers (locked; on/off + scale/Sleep specials) ─────
    const diaryBuiltins = this.plugin.settings.trackers.filter(
      (t) => t.builtin && !JOURNAL_BUILTINS.includes(t.builtin)
    );
    const diaryOn = diaryBuiltins.filter(
      (t) => t.showInTemplate || t.showInBase
    ).length;
    const diarySection = this.foldableSection(
      containerEl,
      "trackers.builtin.diary",
      "Built-in · diary",
      { badge: `${diaryOn} on` }
    );
    const { tbody: diaryTbody } = this.createTable(diarySection, [
      "Tracker",
      "Type",
      "Surface",
      "In Entries",
      "Actions",
    ]);
    for (const kind of SCALE_BUILTINS) {
      const t = this.plugin.settings.trackers.find((x) => x.builtin === kind);
      if (t) this.renderScaleRow(diaryTbody, t);
    }
    this.renderSleepSupersetRow(diaryTbody);

    // ── Built-in journal trackers ────────────────────────────────────
    const journalSection = this.foldableSection(
      containerEl,
      "trackers.builtin.journals",
      "Built-in · journals",
      { badge: "on every journal" }
    );
    const { tbody: journalTbody } = this.createTable(journalSection, [
      "Tracker",
      "Type",
      "Surface",
      "In Entries",
      "Actions",
    ]);
    for (const kind of JOURNAL_BUILTINS) {
      const t = this.plugin.settings.trackers.find((x) => x.builtin === kind);
      if (t) this.renderJournalBuiltinRow(journalTbody, t);
    }

    // ── Custom trackers ──────────────────────────────────────────────
    const customs = this.plugin.settings.trackers.filter((t) => !t.builtin);
    const customSection = this.foldableSection(
      containerEl,
      "trackers.custom",
      "Custom",
      {
        badge: customs.length ? String(customs.length) : undefined,
        action: {
          label: "Add tracker",
          icon: "plus",
          onClick: () => {
            openTrackerEditor(
              this.app,
              this.plugin,
              {
                id: this.uniqueId(freshId()),
                label: "🆕 New tracker",
                type: "number",
                step: 1,
                surface: diarySurface("daily"),
                showInTemplate: true,
                showInBase: true,
              },
              { isNew: true },
              async (def) => {
                this.plugin.settings.trackers.push(def);
                await this.saveAndSync(true);
                this.display();
              }
            );
          },
        },
      }
    );

    if (customs.length === 0) {
      this.emptyState(
        customSection,
        "plus-circle",
        "No custom trackers yet. Add one for anything you'd like to log and chart — including things you only log now and then, which you can leave off new entries and add per-entry when they happen."
      );
    } else {
      const { tbody: customTbody } = this.createTable(customSection, [
        "Tracker",
        "Type",
        "Surface",
        "In Entries",
        "Actions",
      ]);
      customs.forEach((t) => this.renderCustomRow(customTbody, t));
    }

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc(
        "Push the current tracker list into the vault immediately (every entry template + Diary.base), instead of waiting for the debounce. Only the templates and Diary.base are rewritten — entries you have already written are never touched."
      )
      .setClass("almanac-settings-footer-action")
      .addButton((b) =>
        b.setButtonText("Sync everything into vault").onClick(async () => {
          await syncTrackerConfig(this.app, this.plugin);
        })
      );
  }

  // A scale built-in (Mood, Energy, Focus): a locked identity + one on/off
  // switch, plus a button into the two editable settings (heat-map source,
  // picker faces).
  private renderScaleRow(tbody: HTMLElement, t: TrackerDef): void {
    const enabled = t.showInTemplate || t.showInBase;
    const heat = this.plugin.settings.moodTrackerId === t.id;
    const tr = tbody.createEl("tr");
    if (!enabled) tr.addClass("is-locked");

    const tdName = tr.createEl("td");
    const nameWrap = tdName.createDiv({ cls: "col-name" });
    nameWrap.createSpan({ cls: "col-name-token", text: "🙂" });
    nameWrap.createSpan({ text: t.label });

    const tdType = tr.createEl("td");
    const typePills = tdType.createDiv({ cls: "almanac-list-pills" });
    typePills.createSpan({ cls: "almanac-list-pill is-muted", text: "Scale" });

    const tdSurface = tr.createEl("td");
    const surfacePills = tdSurface.createDiv({ cls: "almanac-list-pills" });
    const pills = [
      { text: "Daily", tone: "muted" as const },
      ...this.surfacePill(t),
    ];
    for (const p of pills) {
      surfacePills.createSpan({ cls: `almanac-list-pill is-${p.tone}`, text: p.text });
    }

    const tdStatus = tr.createEl("td");
    const statusPills = tdStatus.createDiv({ cls: "almanac-list-pills" });
    if (enabled && heat) {
      statusPills.createSpan({ cls: "almanac-list-pill is-on", text: "Heat map" });
    } else if (enabled) {
      statusPills.createSpan({ cls: "almanac-list-pill is-on", text: "Every entry" });
    } else {
      statusPills.createSpan({ cls: "almanac-list-pill is-off", text: "Disabled" });
    }

    const tdActions = tr.createEl("td", { cls: "col-actions-cell" });
    const actions = tdActions.createDiv({ cls: "col-actions" });

    if (enabled) {
      rowButton(actions, "settings-2", `${t.label} settings`, () =>
        openMoodEditor(this.app, this.plugin, t, async () => {
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }

    const toggleHost = actions.createDiv({ cls: "almanac-list-toggle" });
    new Setting(toggleHost).addToggle((c) =>
      c
        .setTooltip(`Include ${t.label} on every new entry`)
        .setValue(enabled)
        .onChange(async (v) => {
          t.showInTemplate = v;
          t.showInBase = v;
          if (!v && this.plugin.settings.moodTrackerId === t.id) {
            this.plugin.settings.moodTrackerId = "";
            t.heatmap = false;
          }
          await this.saveAndSync(true);
          this.display();
        })
    );
  }

  // The Wake-Up + Bedtime + Sleep superset as a single locked row with one
  // toggle.
  private renderSleepSupersetRow(tbody: HTMLElement): void {
    const on = this.plugin.settings.sleepEnabled;
    const bed = this.plugin.settings.trackers.find((x) => x.builtin === "bed");
    const wake = this.plugin.settings.trackers.find((x) => x.builtin === "wake");
    const name = `${bed?.label ?? "🌙 Bedtime"} + ${wake?.label ?? "😴 Wake-Up"} → Sleep`;

    const tr = tbody.createEl("tr");
    if (!on) tr.addClass("is-locked");

    const tdName = tr.createEl("td");
    const nameWrap = tdName.createDiv({ cls: "col-name" });
    nameWrap.createSpan({ cls: "col-name-token", text: "🛌" });
    nameWrap.createSpan({ text: name });

    const tdType = tr.createEl("td");
    const typePills = tdType.createDiv({ cls: "almanac-list-pills" });
    typePills.createSpan({ cls: "almanac-list-pill is-muted", text: "Derived (hours)" });

    const tdSurface = tr.createEl("td");
    const surfacePills = tdSurface.createDiv({ cls: "almanac-list-pills" });
    surfacePills.createSpan({ cls: "almanac-list-pill is-muted", text: "Daily" });

    const tdStatus = tr.createEl("td");
    const statusPills = tdStatus.createDiv({ cls: "almanac-list-pills" });
    statusPills.createSpan({
      cls: on ? "almanac-list-pill is-on" : "almanac-list-pill is-off",
      text: on ? "Every entry" : "Disabled",
    });

    const tdActions = tr.createEl("td", { cls: "col-actions-cell" });
    const actions = tdActions.createDiv({ cls: "col-actions" });

    const toggleHost = actions.createDiv({ cls: "almanac-list-toggle" });
    new Setting(toggleHost).addToggle((c) =>
      c
        .setTooltip("Turn the Sleep tracker on or off")
        .setValue(on)
        .onChange(async (v) => {
          this.plugin.settings.sleepEnabled = v;
          this.plugin.settings.trackers = normalizeTrackers(
            this.plugin.settings.trackers,
            v
          );
          await this.saveAndSync(true);
          this.display();
        })
    );
  }

  private renderJournalBuiltinRow(
    tbody: HTMLElement,
    t: TrackerDef
  ): void {
    const tr = tbody.createEl("tr");

    const tdName = tr.createEl("td");
    const nameWrap = tdName.createDiv({ cls: "col-name" });
    nameWrap.createSpan({
      cls: "col-name-token",
      text: t.builtin === "confidence" ? "🎯" : "📌",
    });
    nameWrap.createSpan({ text: t.label });

    const tdType = tr.createEl("td");
    const typePills = tdType.createDiv({ cls: "almanac-list-pills" });
    typePills.createSpan({
      cls: "almanac-list-pill is-muted",
      text: TRACKER_TYPE_LABELS[t.type].split(" ")[0],
    });

    const tdSurface = tr.createEl("td");
    const surfacePills = tdSurface.createDiv({ cls: "almanac-list-pills" });
    const pills = [
      ...this.surfacePill(t),
    ];
    for (const p of pills) {
      surfacePills.createSpan({ cls: `almanac-list-pill is-${p.tone}`, text: p.text });
    }

    const tdStatus = tr.createEl("td");
    const statusPills = tdStatus.createDiv({ cls: "almanac-list-pills" });
    statusPills.createSpan({
      cls: "almanac-list-pill is-muted",
      text: "Per-entry",
    });

    const tdActions = tr.createEl("td", { cls: "col-actions-cell" });
    const actions = tdActions.createDiv({ cls: "col-actions" });
    actions.createSpan({
      cls: "almanac-list-pill is-muted",
      text: "Built-in",
    });
  }

  // The surface pill, or nothing.
  private surfacePill(
    t: TrackerDef
  ): { text: string; tone: "muted" }[] {
    if (t.surface.kind === "diary") return [];
    return [
      {
        text: describeSurfaceLabel(t.surface, journalTypeNamer(this.plugin)),
        tone: "muted",
      },
    ];
  }

  private renderCustomRow(tbody: HTMLElement, t: TrackerDef): void {
    const trackers = this.plugin.settings.trackers;
    const customsNow = () => trackers.filter((x) => !x.builtin);
    const customPos = customsNow().indexOf(t);
    const customCount = customsNow().length;

    const tr = tbody.createEl("tr");

    // 1. Tracker
    const tdName = tr.createEl("td");
    const nameWrap = tdName.createDiv({ cls: "col-name" });
    nameWrap.createSpan({ cls: "col-name-token", text: "📈" });
    nameWrap.createSpan({ text: t.label || t.id });

    // 2. Type
    const tdType = tr.createEl("td");
    const typePills = tdType.createDiv({ cls: "almanac-list-pills" });
    typePills.createSpan({
      cls: "almanac-list-pill is-muted",
      text: TRACKER_TYPE_LABELS[t.type].split(" ")[0],
    });

    // 3. Surface
    const tdSurface = tr.createEl("td");
    const surfacePills = tdSurface.createDiv({ cls: "almanac-list-pills" });
    const pills = [
      ...(diaryClassOf(t.surface) != null
        ? [
            {
              text: describeSurfaceLabel(
                t.surface,
                journalTypeNamer(this.plugin)
              ),
              tone: "muted" as const,
            },
          ]
        : []),
      ...this.surfacePill(t),
    ];
    for (const p of pills) {
      surfacePills.createSpan({ cls: `almanac-list-pill is-${p.tone}`, text: p.text });
    }

    // 4. In Entries
    const tdStatus = tr.createEl("td");
    const statusPills = tdStatus.createDiv({ cls: "almanac-list-pills" });
    if (diaryClassOf(t.surface) != null) {
      statusPills.createSpan({
        cls: t.showInTemplate
          ? "almanac-list-pill is-on"
          : "almanac-list-pill is-off",
        text: t.showInTemplate ? "Every entry" : "Per-entry only",
      });
      if (t.showInBase) {
        statusPills.createSpan({
          cls: "almanac-list-pill is-muted",
          text: "Diary.base",
        });
      }
    } else {
      statusPills.createSpan({
        cls: "almanac-list-pill is-muted",
        text: "Per-entry",
      });
    }

    // 5. Actions
    const tdActions = tr.createEl("td", { cls: "col-actions-cell" });
    const actions = tdActions.createDiv({ cls: "col-actions" });

    rowButton(
      actions,
      "arrow-up",
      "Move up",
      async () => {
        const abs = trackers.indexOf(t);
        const prev = trackers
          .slice(0, abs)
          .reduce((acc, x, i) => (!x.builtin ? i : acc), -1);
        if (abs === -1 || prev === -1) return;
        [trackers[prev], trackers[abs]] = [trackers[abs], trackers[prev]];
        await this.saveAndSync(true);
        this.display();
      },
      { disabled: customPos <= 0 }
    );

    rowButton(
      actions,
      "arrow-down",
      "Move down",
      async () => {
        const abs = trackers.indexOf(t);
        const next = trackers.findIndex((x, i) => i > abs && !x.builtin);
        if (abs === -1 || next === -1) return;
        [trackers[next], trackers[abs]] = [trackers[abs], trackers[next]];
        await this.saveAndSync(true);
        this.display();
      },
      { disabled: customPos === -1 || customPos >= customCount - 1 }
    );

    rowButton(actions, "pencil", "Edit tracker", () =>
      openTrackerEditor(
        this.app,
        this.plugin,
        t,
        { isNew: false, original: t },
        async (def) => {
          // Moving a tracker that has already collected readings to another
          // surface is metadata-only — saveAndSync rewrites templates and
          // Diary.base, never entries — so the old readings don't move. They
          // stay under this property in the old surface's notes, where the
          // tracker will no longer read them: dormant, not deleted, and
          // re-adopted if the surface is set back (or a same-id tracker of
          // that surface is made).
          //
          // That is a defensible thing to want (fixing a surface set wrong on
          // a tracker with a few days of data) and a surprising thing to
          // trigger by accident, so it is confirmed with the actual count
          // rather than blocked or done silently. Migrating the readings is
          // deliberately *not* offered, for two different reasons depending on
          // the move: within the diary, a daily series can't become a monthly
          // one without a per-tracker reduction the data doesn't carry (mean
          // weight, sum km); between the diary and a journal, the readings are
          // simply in notes the new surface doesn't cover. resurfacePrompt
          // words each case for itself.
          const moved = surfaceKey(def.surface) !== surfaceKey(t.surface);
          if (moved) {
            const stale = countReadingsOnSurface(
              this.app,
              surfacePathConfig(this.plugin),
              t.id,
              t.surface
            );
            const prompt = resurfacePrompt(
              t.label || t.id,
              t.surface,
              def.surface,
              stale,
              journalTypeNamer(this.plugin)
            );
            if (prompt) {
              const ok = await confirmAction(
                this.app,
                prompt.title,
                prompt.message,
                prompt.confirmLabel
              );
              if (!ok) {
                // Change nothing: the draft is discarded and the registry
                // entry keeps its old surface. display() repaints the row from
                // the unchanged tracker.
                this.display();
                return;
              }
            }
          }
          const abs = trackers.indexOf(t);
          if (abs !== -1) trackers[abs] = def;
          await this.saveAndSync(true);
          this.display();
        }
      )
    );

    rowButton(
      actions,
      "trash-2",
      "Delete tracker",
      async () => {
        const ok = await confirmAction(
          this.app,
          `Delete "${t.label || t.id}"?`,
          `This removes the tracker from the daily template and from Diary.base. Entries you have already written keep their "${t.id}" property — nothing on disk is edited.`,
          "Delete",
          true
        );
        if (!ok) return;
        const abs = trackers.indexOf(t);
        if (abs !== -1) trackers.splice(abs, 1);
        await this.saveAndSync(true);
        this.display();
      },
      { danger: true }
    );
  }
}

