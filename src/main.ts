// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { MarkdownView, Menu, Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, AlmanacSettings, AlmanacSettingTab } from "./core/settings";
import { normalizeLogbooks } from "./diary/logbooks";
import { Diary } from "./diary/diary";
import { JournalManager, registeredJournalTypes } from "./journals/journal";
import { normalizeJournalConfigs } from "./journals/custom-journal";
import { Widgets } from "./ui/widgets";
import { Scaffold } from "./core/scaffold";
import { SectionInserter } from "./ui/section-insert";
import { wantsReadingMode } from "./core/viewmode";
import { PathWatch, pruneCollapsedSections } from "./core/pathwatch";
import { PageWidth } from "./ui/page-width";
import { VaultBanner } from "./ui/vault-banner";
import { openVaultSearch } from "./ui/search-all";
import {
  getFile,
  moment,
  monthlyOverviewPath,
  openFile,
  weeklyOverviewPath,
  quarterOverviewPath,
  yearOverviewPath,
} from "./core/util";
import { danglingTypeIds } from "./trackers/trackers";
import { Charts } from "./charts/charts-manager";
import { EntryTrackers } from "./trackers/entry-tracker-manager";
import { EntryTemplates } from "./diary/entry-template-manager";
import { JournalTemplates } from "./journals/journal-template-manager";
import { normalizeTrackers } from "./trackers/trackers";
import { JournalCharts } from "./charts/journal-charts-manager";
import { JournalImporter } from "./journals/journal-import";
import { Registry } from "./core/registry-mirror";
import type { RegistryMirror } from "./core/registry-mirror";
import { ACTIONS, menuTitle, type ActionGroup } from "./core/actions";
import { journalActions } from "./core/journal-actions";

export default class AlmanacPlugin extends Plugin {
  settings!: AlmanacSettings;
  diary!: Diary;
  // The generic journal engine — serves the built-in Study type and every
  // custom journal type. (Named `study` before custom journals existed.)
  journals!: JournalManager;
  charts!: Charts;
  // The same, for a journal note's own charts region. A separate manager over
  // a separate fence — see journal-charts.ts for why the two aren't one.
  journalCharts!: JournalCharts;
  // Per-note tracker list management: the "+ Add tracker" tile and the × on
  // each logging cell. Settings decides what every *new* entry starts with;
  // this decides what *this* entry carries.
  entryTrackers!: EntryTrackers;
  // The Template window's writes: this page as a grain's default, as a named
  // layout, or a template written back over this page. Settings decides which
  // sections a new entry starts with; `entryTrackers` decides what THIS entry
  // carries; this decides what the template itself is.
  entryTemplates!: EntryTemplates;
  // The same three gestures on a JOURNAL note (4.33): this page as its note
  // type's default, as a named layout, or a template written back over it.
  // A separate manager because the stores are separate — a grain's default is
  // a settings key and a journal's is `cfg.layout`, keyed per template target
  // — and merging them would put a diary layout on a journal, which is the
  // cross-catalogue carry `layout-transfer.ts` exists to refuse.
  journalTemplates!: JournalTemplates;
  widgets!: Widgets;
  scaffold!: Scaffold;
  sections!: SectionInserter;
  pathWatch!: PathWatch;
  pageWidth!: PageWidth;
  vaultBanner!: VaultBanner;
  // Reads and writes the per-journal manifest, and adopts a journal folder
  // that arrived without one. See journal-import.ts.
  journalImport!: JournalImporter;
  // The vault-root settings mirror: everything durable in data.json, kept in
  // the vault so a replaced plugin folder doesn't take it. See
  // registry-mirror.ts.
  registry!: Registry;

  // Listeners notified when the *set* of registered journal types changes —
  // Study toggled on or off, a custom journal added, renamed or deleted.
  //
  // Needed because the Journals section stopped being generated markdown in
  // 2.13.9. It used to repaint as a side effect: a settings change called
  // rebuildJournalHome(), which rewrote the homepage, which made Obsidian
  // re-render it. Now the section is a live widget scoped to the journal
  // *folders*, and turning Study off touches no file under them — so without
  // this signal the banner would keep showing a type the vault no longer has
  // until the note was reopened.
  private journalTypeListeners = new Set<() => void>();

  // Set by loadSettings when settings came back from the vault rather than
  // from data.json. Reported once the workspace is up — a notice raised during
  // onload can land before Obsidian has anywhere to draw it.
  private restoredFrom: RegistryMirror | null = null;

  // Register a listener; returns the unsubscribe, shaped for Component.register()
  // so a widget's teardown removes it without any bookkeeping of its own.
  onJournalTypesChanged(fn: () => void): () => void {
    this.journalTypeListeners.add(fn);
    return () => this.journalTypeListeners.delete(fn);
  }

  notifyJournalTypesChanged(): void {
    for (const fn of this.journalTypeListeners) fn();
  }

  async onload(): Promise<void> {
    // Before loadSettings, which reads it when there is no data.json to read.
    this.registry = new Registry(this.app, this);
    await this.loadSettings();
    // Only now: everything above is the plugin arriving at its own settings,
    // and a mirror write during that would be the restore overwriting itself
    // with the half-normalised state it was restoring from.
    this.registry.arm();

    this.diary = new Diary(this.app, this);
    this.journals = new JournalManager(this.app, this);
    this.charts = new Charts(this.app, this);
    this.journalCharts = new JournalCharts(this.app, this);
    this.entryTrackers = new EntryTrackers(this.app, this);
    this.entryTemplates = new EntryTemplates(this.app, this);
    this.journalTemplates = new JournalTemplates(this.app, this);
    this.widgets = new Widgets(this.app, this);
    this.scaffold = new Scaffold(this.app, this);
    this.sections = new SectionInserter(this.app, this);
    this.pathWatch = new PathWatch(this.app, this);
    this.pageWidth = new PageWidth(this.app, this);
    this.vaultBanner = new VaultBanner(this.app, this);
    this.journalImport = new JournalImporter(this.app, this);

    this.widgets.register();
    this.pathWatch.register();
    this.pageWidth.register();
    this.vaultBanner.register();

    this.addSettingTab(new AlmanacSettingTab(this.app, this));
    this.registerCommands();

    this.addRibbonIcon("book-open", "Almanac", (evt) => this.openMenu(evt));

    // AN ALMANAC PAGE OPENS IN READING MODE. 4.6, and the plugin's first
    // `file-open` hook.
    //
    // `file-open` AND NOTHING ELSE. Not `active-leaf-change`, not
    // `layout-change`: this must never undo a Ctrl+E. A reader who switches an
    // open note to editing stays there for as long as that note is open, and
    // the only thing that puts it back is opening the note again — which is the
    // honest boundary of "opens in reading mode" rather than "cannot be edited".
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => this.applyReadingMode(file))
    );

    // Fold state is keyed by note path and nothing used to remove a key when
    // its note went away, so the record only ever grew. Prune once the vault
    // has finished indexing — before that getMarkdownFiles() is incomplete and
    // this would delete state for notes that simply hadn't loaded yet.
    this.app.workspace.onLayoutReady(() => {
      if (this.restoredFrom) {
        this.registry.announceRestore(this.restoredFrom);
        this.restoredFrom = null;
      }
      void this.pruneNoteState();
      // Adopt any journal folder the settings don't account for, THEN report
      // dangling tracker scopes. Order matters: a journal recovered here
      // re-registers the very type those trackers name, so reporting first
      // would warn about scopes that are about to become valid again.
      void this.importJournalsThenReport();
      void this.checkUpgrade();
    });
  }

  // Check whether Almanac was upgraded from a previous version, and prompt
  // the reader if layout repairs, format migrations, or template updates
  // are available to review.
  private async checkUpgrade(): Promise<void> {
    const installed = this.settings.installedVersion;
    const current = this.manifest.version;

    if (installed === current) return;

    // Check if the vault is initialized with any Almanac folders
    const p = this.settings.paths;
    const isInitialized = Boolean(
      this.app.vault.getAbstractFileByPath(p.staging) ||
      this.app.vault.getAbstractFileByPath(p.diaryDaily)
    );

    if (isInitialized && installed !== undefined) {
      try {
        const { survey } = await this.scaffold.surveyRepair();
        const count = survey.groups
          .filter((g) => g.id !== "create")
          .reduce((acc, g) => acc + g.items.length, 0);

        if (count > 0) {
          new Notice(
            `Almanac: updated to v${current} — ${count} update(s) available. Run 'Set up / repair vault' to review.`,
            10000
          );
        }
      } catch (e) {
        console.error("[Almanac] upgrade repair check failed", e);
      }
    }

    this.settings.installedVersion = current;
    await this.saveSettings();
  }

  // Put a recognised page into reading mode, if it is not already.
  //
  // ASKED OF THE ACTIVE VIEW, and it must be the view showing THIS file:
  // `file-open` fires for the workspace's active file, and a stale or
  // mismatched leaf would be a page flipped because a different one was opened.
  //
  // NOTHING HAPPENS TO A NOTE THAT IS ALREADY IN READING MODE, which is what
  // keeps this from writing a view state on every tab switch — and `setViewState`
  // on the mode it already has would still be a state write with a history
  // entry behind it.
  private applyReadingMode(file: TFile | null): void {
    if (!file) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.file?.path !== file.path) return;
    const state = view.leaf.getViewState();
    if (state.state?.mode === "preview") return;
    if (!wantsReadingMode(this, file)) return;
    void view.leaf.setViewState({
      ...state,
      state: { ...state.state, mode: "preview" },
    });
  }

  // Open Settings on Almanac's own tab.
  //
  // `app.setting` is not in the published typings — it is a real and stable
  // part of the desktop app that Obsidian has simply never declared — so it is
  // reached through a narrow cast and every step is guarded. A failure here
  // costs the reader a click, not the command: the caller has already said
  // what was found.
  openJournalSettings(): void {
    const setting = (
      this.app as unknown as {
        setting?: {
          open?: () => void;
          openTabById?: (id: string) => void;
        };
      }
    ).setting;
    try {
      setting?.open?.();
      setting?.openTabById?.(this.manifest.id);
    } catch (e) {
      console.error("[Almanac] could not open the settings tab", e);
    }
  }

  // Startup discovery.
  //
  // A journal's notes live in the vault and its definition lived only in
  // data.json — so replacing the plugin folder, or copying a journal folder in
  // from elsewhere, left a fully populated journal that Almanac no longer knew
  // about. This is where those are picked up, and it does two DIFFERENT things
  // depending on what the folder can prove about itself:
  //
  //   with a manifest — restored outright. The manifest is the journal's own
  //   record, so nothing is being guessed and there is nothing to ask.
  //
  //   without one — counted and pointed at, never taken. Reconstructing a
  //   journal from its notes has to guess at a lost tracker's type and range,
  //   and 2.48 applied those guesses first and reported them in a notice
  //   afterwards. That is backwards: a guess already applied is one the reader
  //   has to notice, understand and undo. Settings → Journal types offers it
  //   instead.
  //
  // Cheap on a settled vault: the manifest pass reads one small dotfile per
  // unclaimed folder, and the count consults the metadata cache, which already
  // knows which notes declare a type. No note is read until Review is clicked.
  private async importJournalsThenReport(): Promise<void> {
    try {
      await this.journalImport.adoptManifested();
      const offer = await this.journalImport.inferrableFolders();
      if (offer.length > 0) {
        new Notice(
          `Almanac: ${offer.length} journal folder${
            offer.length === 1 ? "" : "s"
          } under ${this.settings.paths.journalsRoot} ${
            offer.length === 1 ? "isn't" : "aren't"
          } set up — ${offer
            .map((f) => f.name)
            .join(", ")}. Settings → Journal types to import.`,
          12000
        );
      }
    } catch (e) {
      console.error("[Almanac] journal discovery failed", e);
    }
    this.reportDanglingTypeIds();
  }

  // A tracker scoped to a journal type that no longer exists is offerable
  // nowhere and described by a raw id. Deleting a type through Settings now
  // resolves them (see resolveOrphanedTrackers), so this only fires for a
  // hand-edited data.json or a type removed by some other route.
  //
  // REPORTED, NOT REPAIRED, the same choice pathwatch makes about a rename: a
  // dangling id can equally mean a type the user is midway through
  // re-creating, and quietly rewriting the registry would be the plugin
  // deciding that for them.
  private reportDanglingTypeIds(): void {
    const registered = new Set(
      registeredJournalTypes(this).map((t) => t.id)
    );
    const dangling = danglingTypeIds(this.settings.trackers, registered);
    if (dangling.length === 0) return;
    new Notice(
      `Almanac: ${dangling.length} tracker scope${dangling.length === 1 ? "" : "s"} name${dangling.length === 1 ? "s" : ""} a journal type that isn't registered (${dangling.join(", ")}). Settings → Trackers to re-scope.`,
      10000
    );
  }

  // Drop per-note UI state for notes that no longer exist.
  //
  // WAS `pruneFoldState`, AND THE RENAME IS THE POINT (4.34). It now prunes two
  // records that are the same kind of fact — what the reader folded, and which
  // page of a group they had open — keyed identically and worthless once the
  // note is gone. A second copy of this walk is how two records that share a key
  // format come to disagree about what a dead note is.
  private async pruneNoteState(): Promise<void> {
    const folds = this.settings.collapsedNoteSections;
    const tabs = this.settings.openGroupTabs;
    const any =
      Object.keys(folds ?? {}).length > 0 || Object.keys(tabs ?? {}).length > 0;
    if (!any) return;
    const live = new Set(this.app.vault.getMarkdownFiles().map((f) => f.path));
    let dropped = tabs ? pruneCollapsedSections(tabs, live) : 0;
    if (!folds || Object.keys(folds).length === 0) {
      if (dropped > 0) await this.saveSettings();
      return;
    }
    dropped += pruneCollapsedSections(folds, live);
    // 2.51 removed the Journals hero's fold-everything chevron, and with it the
    // only writer and only reader of `<note>::journal:list`. pruneCollapsedSections
    // can't catch these — the note they name still exists, so by its rule the key
    // is live. A record that only ever grows is what it was written to stop, so
    // the retired key goes here rather than sitting in data.json forever.
    for (const key of Object.keys(folds)) {
      if (!key.endsWith("::journal:list")) continue;
      delete folds[key];
      dropped++;
    }
    if (dropped > 0) await this.saveSettings();
  }

  // Almost nothing to clean up by hand: everything registered above went
  // through this.register*() / this.addCommand(), which Obsidian tears down
  // automatically. The one exception is the mirror's pending write.
  onunload(): void {
    // Flush any pending mirror write. The debounce exists so typing in a
    // settings field doesn't write the file on every keystroke; it must not
    // mean that the last change before Obsidian closes is the one missing from
    // the restore point.
    void this.registry.flush();
  }

  // ── the action table's handles on this plugin ───────────────────────
  //
  // `core/actions.ts` holds the list and no behaviour; these are the four
  // private methods it needs to reach. Public wrappers rather than making the
  // methods themselves public, so "what an action may call" stays a short,
  // readable list rather than the whole class.
  actionOpenHome(): Promise<void> {
    return this.openHome();
  }
  actionOpenOverview(unit: "week" | "month" | "quarter" | "year"): Promise<void> {
    return this.openOverview(unit);
  }
  actionOpenSearch(): Promise<void> {
    return this.openSearch();
  }
  actionImportJournals(): Promise<void> {
    return this.importJournals();
  }

  // Lifted out of the command's inline body in 3.13 §7, unchanged. It was the
  // longest of the thirty-one and the only one the table could not have held
  // as a one-liner.
  private async importJournals(): Promise<void> {
    const restored = await this.journalImport.adoptManifested();
    const offer = await this.journalImport.inferrableFolders();
    if (restored.length === 0 && offer.length === 0) {
      new Notice(
        "Almanac: every journal folder under the journals root is already set up."
      );
      return;
    }
    if (offer.length > 0) {
      // Straight to the list, rather than a notice pointing at it: the reader
      // asked for this one, so the answer is the screen where something can be
      // done about it.
      this.openJournalSettings();
    }
  }
  // The guard STAYS, and the notice with it. A command hidden by
  // `checkCallback` can't be reached from a hotkey either, so nothing routes
  // here from the palette any more — but the same callbacks are reachable from
  // widgets, and those have no `when` in front of them.
  actionWithNote(run: (path: string) => Promise<void>): void {
    this.withActiveNote(run);
  }

  private registerCommands(): void {
    // THE SEARCH, AND ITS SHORTCUT (4.51). A command rather than a hotkey bound
    // here: Obsidian's own settings are where a reader rebinds it, and a plugin
    // that claims `Ctrl K` outright takes it from whatever they had on it. The
    // banner's field shows that default rather than reading the reader's
    // binding, which is not on the public API — see `search-all.ts`.
    //
    // IT COLLIDES WITH CORE'S *Insert Markdown link*, KNOWINGLY. `Mod K` is a
    // requested default (4.51, Q10) and Obsidian flags the clash in its own
    // Hotkeys pane, where either side can be rebound. Declaring it as a
    // `hotkeys` DEFAULT rather than registering a keymap is what keeps that
    // true: a reader who wants the link shortcut back clears one row.
    this.addCommand({
      id: "almanac-search-everything",
      name: "Search everything",
      hotkeys: [{ modifiers: ["Mod"], key: "k" }],
      callback: () => openVaultSearch(this),
    });

    // ONE TABLE, TWO DOORS (3.13 §7). This used to be thirty-one hand-written
    // `addCommand` calls, with `openMenu` separately hand-writing thirteen menu
    // items and duplicating each callback inline. The two lists had diverged in
    // five ways — see `core/actions.ts`, which now holds the single copy.
    //
    // `when` BECOMES `checkCallback`, which is how a command hides itself from
    // the palette rather than appearing and then apologising. Six note-scoped
    // commands used to be offered on any note: four ended in "Open a note
    // first." and two — `new-page` and `convert-to-dashboard` — did nothing at
    // all, no note and no notice.
    //
    // An action WITHOUT a `when` keeps a plain `callback`, so the palette is
    // not asked a question that always answers yes.
    // EVERY JOURNAL'S COMMANDS COME THROUGH THE SAME LOOP (3.21). They used to
    // be registered by a second method below with its own shape — plain
    // callbacks, no gating, no ribbon — and Study skipped it entirely because
    // its four were written into the static table. One list now, one loop, and
    // the difference between a built-in journal and a reader's is nothing.
    for (const action of [...ACTIONS, ...journalActions(this)]) {
      const when = action.when;
      if (!when) {
        this.addCommand({
          id: action.id,
          name: action.name,
          callback: () => void action.run(this),
        });
        continue;
      }
      this.addCommand({
        id: action.id,
        name: action.name,
        checkCallback: (checking: boolean) => {
          if (!when(this)) return false;
          if (!checking) void action.run(this);
          return true;
        },
      });
    }

    // REGISTERED AGAIN WHEN THE JOURNAL LIST CHANGES (3.21), because a
    // command is registered once at load and a journal can be added at any
    // time — so a reader who made one had no commands for it until they
    // restarted Obsidian. `addCommand` keys on id, so re-running this replaces
    // a renamed journal's command in place and adds a new journal's; a deleted
    // journal's lingers as an id, and its `when` reports it gone, which is the
    // same answer the palette gives for any unavailable command.
  }

  // Register the per-journal commands again, after the journal list changes.
  //
  // The static table is not re-registered: nothing in it can change at runtime.
  registerJournalCommands(): void {
    for (const action of journalActions(this)) {
      const when = action.when;
      this.addCommand({
        id: action.id,
        name: action.name,
        checkCallback: (checking: boolean) => {
          if (when && !when(this)) return false;
          if (!checking) void action.run(this);
          return true;
        },
      });
    }
  }

  // Run a note-scoped action against whatever markdown note is in focus. The
  // widget controls get their path from the render context; a command has to
  // ask the workspace, and has to cope with there being nothing open.
  private withActiveNote(run: (path: string) => Promise<void>): void {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("Open a note first.");
      return;
    }
    void run(file.path);
  }

  private async openHome(): Promise<void> {
    const home = getFile(this.app, this.settings.paths.home);
    if (home) await openFile(this.app, home);
    else new Notice("Homepage not found — run 'Set up / repair vault'.");
  }

  // Open a period dashboard *on now*.
  //
  // Four matched commands from 2.52, where there used to be one (`open-year`,
  // which only revealed the note and left whatever period it was last browsing
  // on screen). Jumping to a dashboard and landing on last March is the same
  // failure the period-nav's "This Week" button exists to fix, so these set the
  // period first for the same reason — and they are named after the scopes
  // rather than after the notes, so they sort together in a filtered palette.
  //
  // "Open this month's entry" was renamed in the same pass: it opens the
  // monthly *entry*, and next to "Open the monthly overview" the old name gave
  // a reader no way to tell which was which.
  private async openOverview(
    unit: "week" | "month" | "quarter" | "year"
  ): Promise<void> {
    const paths = this.settings.paths;
    const now = moment();
    const spec = {
      week: {
        path: weeklyOverviewPath(paths),
        prop: "week-start" as const,
        mu: "isoWeek" as const,
      },
      month: {
        path: monthlyOverviewPath(paths),
        prop: "month-start" as const,
        mu: "month" as const,
      },
      quarter: {
        path: quarterOverviewPath(paths),
        prop: "quarter-start" as const,
        mu: "quarter" as const,
      },
      year: {
        path: yearOverviewPath(paths),
        prop: "year-start" as const,
        mu: "year" as const,
      },
    }[unit];

    const file = getFile(this.app, spec.path);
    if (!file) {
      new Notice(`${unit} overview not found — run 'Set up / repair vault'.`);
      return;
    }
    await this.diary.setPeriod(
      spec.path,
      spec.prop,
      spec.mu,
      now.clone().startOf(spec.mu).format("YYYY-MM-DD")
    );
    await openFile(this.app, file);
  }

  // The retrieval note (search + on-this-day + timeline). Created by
  // setup/repair like every other shipped note, so a missing one points at the
  // same fix rather than being silently created here — a command that writes a
  // note as a side effect of opening it is a surprise.
  //
  // MOVED HERE IN 3.13 §6. It had drifted forty lines up, to sit above
  // `openOverview`'s own comment — so a reader met two paragraphs in a row and
  // the first one described a different function. Cost: one wrong answer about
  // which function you are reading.
  private async openSearch(): Promise<void> {
    const file = getFile(this.app, this.settings.paths.search);
    if (file) await openFile(this.app, file);
    else new Notice("Search note not found — run 'Set up / repair vault'.");
  }

  private openMenu(evt: MouseEvent): void {
    // The same table the palette reads, filtered to `ribbon: true` (3.13 §7).
    // Thirteen items, unchanged in membership — this is a grouping, not a menu
    // redesign.
    //
    // LABELLED GROUPS RATHER THAN BARE SEPARATORS (§8.2). `setIsLabel(true)`
    // makes a non-clickable heading and `setSection` keeps the group together,
    // both declared in obsidian.d.ts. The group name is visible where two
    // dividers only implied one.
    //
    // NOT A SUBMENU. `setSubmenu` exists at runtime and is undeclared in the
    // typings, which is the `app.setting` situation — but the failure is not
    // equivalent. A failed `openJournalSettings` costs one click and the caller
    // has already said what it found; a `setSubmenu` returning `undefined`
    // costs the reader the item AND everything under it, silently, and writing
    // a flat fallback for that means writing the menu twice — which is what §7
    // exists to stop.
    //
    // BUILT INSIDE THE CLICK HANDLER, never on render. These banners are on
    // every journal note and every diary entry in the vault.
    const menu = new Menu();
    const groups: { key: ActionGroup; label: string }[] = [
      { key: "diary", label: "Diary" },
      { key: "journals", label: "Journals" },
      { key: "maintenance", label: "Maintenance" },
    ];

    for (const group of groups) {
      // DERIVED FRESH ON EVERY OPEN, so a journal added, renamed or deleted in
      // Settings is right the next time this menu is opened rather than after a
      // reload. It is also what finally puts a reader's own journal under the
      // Journals heading — until 3.21 only Study was here, because only Study's
      // actions were in the static table.
      const items = [...ACTIONS, ...journalActions(this)].filter(
        (a) => a.ribbon && a.group === group.key && (!a.when || a.when(this))
      );
      if (!items.length) continue;
      menu.addItem((i) =>
        i.setTitle(group.label).setIsLabel(true).setSection(group.key)
      );
      for (const action of items) {
        menu.addItem((i) => {
          // `menuTitle` STRIPS THE GROUP, because this menu already said it —
          // §10.2's rule that the group appears once per surface. The palette
          // has no headings and gets `Diary: open today`; here the heading is
          // right above the item, and "Diary: open today" under a **Diary**
          // label tells the reader the same thing twice in one glance.
          i.setTitle(menuTitle(action.name))
            .setIcon(action.icon)
            .setSection(group.key)
            .onClick(() => void action.run(this));
          // `Set up / repair vault` writes to notes a reader cannot easily get
          // back, and was drawn exactly like "Open today's diary". `previewRepair`
          // exists because the command is frightening; the menu should admit as
          // much. A confirm step and a red item answer different questions, so
          // this stays even if repair gains one.
          //
          // READ OFF THE TABLE SINCE §10.3, not off the id. This used to
          // compare `action.id` against the vault-repair id as a literal, and
          // the rename that patch performed is exactly the event that would
          // have quietly turned the red item off.
          if (action.warning) i.setWarning(true);
        });
      }
    }

    menu.showAtMouseEvent(evt);
  }

  async loadSettings(): Promise<void> {
    let loaded = await this.loadData();

    // NO data.json AT ALL is the one unambiguous signal that this plugin
    // folder has been replaced (or that Almanac has never run here). Anything
    // subtler — a data.json that merely looks sparse, or is older than the
    // mirror — would have this second-guessing a file the user's own session
    // just wrote, and two machines syncing one vault could then trade settings
    // back and forth indefinitely. So: the mirror is read here and nowhere
    // else, and in every ordinary session data.json is the only source.
    if (loaded == null) {
      const mirror = await this.registry.read();
      if (mirror) {
        loaded = mirror.settings;
        this.restoredFrom = mirror;
      }
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    // Deep-merge paths so a key added in a later version lands on its default
    // instead of arriving undefined for a vault that saved settings before it
    // existed. A path the user has actually set always wins.
    this.settings.paths = Object.assign(
      {},
      DEFAULT_SETTINGS.paths,
      this.settings.paths ?? {}
    );
    // Same for the attachment options, so a config saved before the `attach:`
    // widget existed gains its defaults instead of arriving as undefined.
    this.settings.attachments = Object.assign(
      {},
      DEFAULT_SETTINGS.attachments,
      this.settings.attachments ?? {}
    );

    // And the banner options, on the same rule (4.51). A data.json written
    // before this release has no `banner` key at all, and a shallow assign would
    // be fine for that — but a hand-edited one with `{"enabled": false}` and no
    // glyph would arrive with `glyph: undefined`, which the tile would then try
    // to render.
    this.settings.banner = Object.assign(
      {},
      DEFAULT_SETTINGS.banner,
      this.settings.banner ?? {}
    );

    // Give every journal level the stable id 2.43 introduced. Done once, here,
    // rather than as a fallback at each read: a fallback evaluated on every
    // read *is* the re-derivation this release removed, and it would quietly
    // restore the behaviour where relabelling a level renamed its `type:`
    // value. One pass on load and the id is simply there.
    this.settings.customJournals = normalizeJournalConfigs(
      this.settings.customJournals ?? []
    );

    // The logbook registry, on the same one-pass rule and for the same reason.
    // A vault that saved settings before 4.52 has no `logbooks` key at all and
    // lands on the four defaults; a hand-edited list is repaired in place rather
    // than discarded. See `normalizeLogbooks`.
    //
    // AFTER `paths` IS MERGED, and it has to be: a row with no `path` derives
    // one from the configured Logbooks folder, and reading that before the deep
    // merge above would give a vault upgrading from 4.51 the string `undefined`.
    this.settings.logbooks = normalizeLogbooks(
      this.settings.logbooks,
      this.settings.paths.logbooks
    );

    // Upgrade legacy Mood/Wake/Bed seeds into built-ins, inject any missing
    // built-in, and add/drop the derived Sleep tracker to match sleepEnabled —
    // so an older saved config lands in the current shape on first load.
    this.settings.trackers = normalizeTrackers(
      this.settings.trackers ?? [],
      this.settings.sleepEnabled
    );

    // An empty heat-map source (hand-edited data.json) leaves the calendar
    // unshaded. If Mood's heatmap flag is on, restore it as the source;
    // otherwise leave heat-mapping off (the user turned it off deliberately).
    if (!this.settings.moodTrackerId) {
      const mood = this.settings.trackers.find((t) => t.builtin === "mood");
      if (mood?.heatmap) this.settings.moodTrackerId = mood.id;
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Debounced and content-compared inside; a save that changed nothing
    // durable (a folded section, a keystroke in the capture box) costs a
    // string comparison and writes nothing.
    this.registry.schedule();
    // HERE RATHER THAN AT THE FOUR PLACES THAT EDIT THE JOURNAL LIST (3.21).
    // Commands are registered once at load, so adding a journal left it with
    // none until Obsidian restarted. This is the one choke point every settings
    // change passes through, and a call site that cannot be forgotten is worth
    // more than one that is only invoked when somebody remembers the coupling.
    //
    // Cheap enough to be unconditional: it is a handful of `addCommand` calls
    // keyed by id, which replace rather than accumulate, and it runs on a path
    // that has already written a file.
    this.registerJournalCommands();
  }
}
