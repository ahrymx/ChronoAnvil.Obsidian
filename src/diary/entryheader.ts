// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `entry-header` widget: the titled band at the top of every diary entry,
// and — as of 3.7 — the action footer at the bottom of the same card.
//
// TWO ELEMENTS, ONE DIRECTIVE. Until 3.6 the header was a title with a control
// row stacked under it: the date stepper and the `⋯` sat immediately below the
// title, inside the header's own band, and the logging grid hung beneath them.
// So the card read title → controls → content, with its one row of chrome
// wedged into the middle of the thing it acts on.
//
// 3.6 patch 7 had already answered this on the overview masthead, for the same
// reason and in the same words: "the footer is where a control that acts on the
// whole card belongs". An entry's stepper and its `⋯` act on the whole entry.
// They move to a footer, and the two page kinds keep the shape they share.
//
//   band 1  the links card  (`links:` — Home / Today / Overviews)
//   band 2  the title       (this file's `buildEntryHeader`)
//   band 3  the logging grid
//   band 4  the footer      (this file's `buildEntryFooter`)
//
// Left of the footer:  a compact date navigator — one segmented control: a prev
//        chevron, a "Jump to day/month" trigger (opens the scrollable date
//        list), and a next chevron. The trigger does not echo the date (the
//        title carries it); the chevrons mute at the first/last entry.
// Right of the footer:  the entry's `⋯`, the same overflow control the journal
//        banner draws — same button, different menu.
//
// The header is live: the title re-reads/re-renders when this note's own
// frontmatter changes, so a rename shows immediately. Unlike a dashboard header
// bar it does NOT collapse a section — it's chrome at the top of the note, not
// a divider.
//
// The FOOTER is not live, and that is the same decision the overview footer
// made rather than a shortcut. It is built by the postprocessor that owns the
// block, because it has to sit after the logging grid — below a bar the header
// widget is not the parent of — and a control parented into a LiveWidget's
// subtree is destroyed on that widget's next rebuild. Nothing in the footer
// reads the note's title, so nothing in it needed the liveness.
//
//   ```almanac
//   entry-header
//   ```

import { App, MarkdownPostProcessorContext, setIcon, TFile, Menu, MenuItem} from "obsidian";
import { settingsButton } from "../ui/section-frame";
import { attachNoteRename } from "../ui/header-title";
import { isManagedTemplate } from "../trackers/entry-trackers";
import { openEntryTemplateWindow } from "../ui/entry-template-modal";
import type AlmanacPlugin from "../main";
import { CLASS_DEFS } from "../trackers/trackers";
import { labelForGrain, entryDateKey } from "./nav";
import type { TrackerClass } from "../trackers/trackers";
import { entryContext } from "./nav";
import type { EntryContext } from "./nav";
import {
  filesUnder,
  frontmatterOf,
  moment,
  folderNotePath,
  openFile,
} from "../core/util";

// The frontmatter property the entry title is stored in. A plain scalar, kept
// separate from Obsidian's native `aliases` (an array meant for link targets)
// so per-day titles don't flood the quick-switcher / link autocomplete.
export const TITLE_PROP = "title";

// WHAT PERIOD THIS ENTRY IS — the date, formatted, for the caption over the
// logging grid. Null when the note has no readable date, which is a real state
// and not an error: see below.
//
// IT MOVED WITH THE ALIAS IN 4.21 rather than being deleted with the banner band
// that held it, and MOVED AGAIN IN 4.21.2 down to the tracker section's caption
// row, so the alias line is a title and a navigator rather than three things
// wrapping onto two lines on a phone.
//
// ── IT USED TO FALL BACK TO THE GRAIN'S NAME, AND THAT WAS THE BUG ────
//
// The old `subtitleFor` read `journal-date` alone and returned `c.dateTitle` —
// which is `CLASS_DEFS[grain].label` when there is no key — when it found
// nothing. So the strip printed **"Daily"** where a date belongs, and on a
// weekly, quarterly or yearly entry it printed the grain's name ALWAYS, because
// those grains keep their key under `week-start` / `quarter-start` /
// `year-start` and this never looked there.
//
// TWO FIXES, AND THE SECOND IS THE ONE THAT LASTS. The key now comes from
// `entryDateKey`, which is the one function that knows where each grain keeps
// its date — the fault was a third, divergent copy of that lookup. And a missing
// date draws NOTHING: a grain label is the answer to a different question, and a
// caption that silently substitutes one for the other is worse than a caption
// that is briefly absent. It IS briefly absent, on a note Obsidian has only just
// created and not yet indexed, which is why the row that carries it is live.
export function entryDateLabel(
  app: App,
  file: TFile,
  grain: TrackerClass
): string | null {
  const key = entryDateKey(frontmatterOf(app, file), grain);
  if (!key) return null;
  // DAILY IS THE ONE GRAIN WITH ITS OWN FORMAT HERE. `labelForGrain` gives it
  // "Friday 14 August 2026" — right for a nav pill you read once, too long for a
  // caption on a note you open every day and for the phone this row exists to
  // fit. The other four are read from the shared table, so a grain whose title
  // format is retuned takes the change here too.
  if (grain === "daily") {
    const d = moment(key);
    return d.isValid() ? d.format("ddd D MMM YYYY") : null;
  }
  return labelForGrain(grain, key);
}

// A single icon-only chevron — the left/right end of the segmented date
// stepper. `side` picks which outer edge is rounded so the three segments read
// as one connected control. Muted + non-interactive when there's no neighbour
// in that direction (rather than vanishing, so the stepper keeps its shape at
// the first/last entry — the tooltip explains the boundary).
function navPill(
  parent: HTMLElement,
  app: App,
  target: { file: TFile; label: string } | null,
  icon: string,
  emptyTip: string,
  side: "left" | "right"
): void {
  const sideCls = side === "left" ? "jeh-seg-start" : "jeh-seg-end";
  if (!target) {
    const muted = parent.createSpan({
      cls: `jeh-navpill ${sideCls} jeh-navpill-empty`,
      attr: { "aria-label": emptyTip, title: emptyTip },
    });
    setIcon(muted, icon);
    return;
  }
  const pill = parent.createEl("a", {
    cls: `jeh-navpill ${sideCls}`,
    attr: { "aria-label": target.label, title: target.label },
  });
  setIcon(pill, icon);
  pill.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(app, target.file);
  });
}

// One selectable entry in the "Select Date" navigator's scrollable list.
interface DateOption {
  file: TFile;
  // Sort key: ISO date (daily) or "YYYY-MM" month key (monthly).
  key: string;
  // Bold primary line, e.g. "Tue 21 Jul 2026" or "July 2026".
  label: string;
  // Faint secondary line, e.g. the note's own title if it has one.
  sub: string;
}

// Every resolvable diary entry of the same kind as `file`, newest first — the
// data behind the scrollable date list. Mirrors entryContext's own filtering
// so the picker and the prev/next arrows always agree on what counts.
function dateOptions(
  plugin: AlmanacPlugin,
  grain: TrackerClass
): DateOption[] {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const titleOf = (f: TFile): string => {
    const t = frontmatterOf(app, f)[TITLE_PROP];
    return typeof t === "string" ? t.trim() : "";
  };

  // ONE WALK, FIVE GRAINS — the same generalisation entryContext gets, and it
  // has to happen here too or the picker on a weekly entry lists DAILY ones:
  // the old shape was "monthly, or else the daily folder", so every grain added
  // in 2.57.12 fell into the else and offered the wrong notes to jump to.
  //
  // Newest first, which is the one thing this differs from entryContext in —
  // the picker reads top-down and the arrows step forward in time.
  const def = CLASS_DEFS[grain];
  const folder = paths[def.folderKey];
  const dashboard = folderNotePath(folder);

  return filesUnder(app, folder)
    .filter((f) => f.path !== dashboard)
    .map((f) => ({ file: f, key: entryDateKey(frontmatterOf(app, f), grain) }))
    .filter((x) => x.key)
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    .map((x) => ({
      file: x.file,
      key: x.key,
      label: labelForGrain(grain, x.key),
      sub: titleOf(x.file),
    }));
}

// The "Jump to day/month" navigator: the middle segment of the header's date
// stepper. It no longer shows the current date — the entry title already does,
// two inches to the left — so it reads as a verb ("Jump to day") rather than a
// redundant label. On click it drops a scrollable list of every entry to jump
// straight to any day/month. Closes on outside-click or Esc.
function buildDatePicker(
  plugin: AlmanacPlugin,
  parent: HTMLElement,
  file: TFile,
  grain: TrackerClass
): void {
  const app = plugin.app;
  const wrap = parent.createDiv({ cls: "jeh-datenav" });

  const trigger = wrap.createEl("button", {
    cls: "jeh-datenav-trigger jeh-seg-mid",
    attr: {
      "aria-label": `Jump to ${CLASS_DEFS[grain].periodNoun}`,
      title: `Jump to ${CLASS_DEFS[grain].periodNoun}`,
      type: "button",
    },
  });
  setIcon(trigger.createSpan({ cls: "jeh-datenav-cal" }), "calendar-search");
  setIcon(trigger.createSpan({ cls: "jeh-datenav-caret" }), "chevrons-up-down");

  let menu: HTMLElement | null = null;
  const closeMenu = (): void => {
    if (!menu) return;
    menu.remove();
    menu = null;
    trigger.removeClass("is-open");
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onDocClick = (evt: MouseEvent): void => {
    if (!wrap.contains(evt.target as Node)) closeMenu();
  };
  const onKey = (evt: KeyboardEvent): void => {
    if (evt.key === "Escape") {
      evt.preventDefault();
      closeMenu();
    }
  };

  const openMenu = (): void => {
    menu = wrap.createDiv({ cls: "jeh-datenav-menu" });
    trigger.addClass("is-open");
    const list = menu.createDiv({ cls: "jeh-datenav-list" });

    const options = dateOptions(plugin, grain);
    if (!options.length) {
      list.createDiv({ cls: "jeh-datenav-empty", text: "No entries yet" });
    }

    let currentRow: HTMLElement | null = null;
    for (const opt of options) {
      const isCurrent = opt.file.path === file.path;
      const row = list.createEl("button", {
        cls: "jeh-datenav-row" + (isCurrent ? " is-current" : ""),
        attr: { type: "button", title: opt.label },
      });
      const text = row.createDiv({ cls: "jeh-datenav-row-text" });
      text.createSpan({ cls: "jeh-datenav-row-label", text: opt.label });
      if (opt.sub) row.createDiv({ cls: "jeh-datenav-row-sub", text: opt.sub });
      if (isCurrent) {
        currentRow = row;
        setIcon(row.createSpan({ cls: "jeh-datenav-row-mark" }), "check");
      }
      row.addEventListener("click", () => {
        closeMenu();
        if (!isCurrent) void openFile(app, opt.file);
      });
    }

    // Land the scroll on the current entry so the list opens centred on "today".
    if (currentRow) currentRow.scrollIntoView({ block: "center" });

    // Defer wiring outside-click so this same click doesn't immediately close it.
    setTimeout(() => {
      document.addEventListener("click", onDocClick, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
  };

  trigger.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (menu) closeMenu();
    else openMenu();
  });
}

// The diary entry's overflow menu.
//
// THE CORRECTION 2.55 OWED. §2 of that plan set a target of "0 features with no
// other affordance" and §0 recorded it met. It was met on JOURNAL notes: the
// `⋯` and its menu were built in study-header.ts and nowhere else, so a reader
// who lives in the diary — which is most of the plugin's daily traffic — still
// had the same palette-only commands they had in 2.54, and the release notes
// told them otherwise.
//
// NOT `attachBannerMenu` GENERALISED, which is what §2.3 of the 2.56 plan
// assumed. That function opens with `plugin.sections.contextFor(notePath)` and
// returns when it is null, which it is for every diary note — and its remaining
// items are journal-shaped: the template change preview, "Convert to a
// dashboard". Neither means anything on a daily entry. Two menus sharing some
// items is not one menu with a flag; that is the shape §4.3 declined for the
// chart models. The BUTTON is shared (`settingsButton`), the lists are not.
//
// ONE ITEM CROSSED OVER IN 3.0, and the sentence above used to say it never
// would. "Edit sections…" was journal-shaped because the editor was: it opened
// on journal notes and told an entry its sections were not editable. Patch 5
// made that false, so the comment claiming it goes rather than being left to
// mislead the next reader of this file. The item is the same command the
// journal banner offers; what changed is that it now has an answer here.
//
// WHAT A DIARY ENTRY ACTUALLY SUPPORTS:
//
//   edit its sections — as of 3.0, over the same catalogue the entry template
//   is composed from;
//   add and remove a tracker — the two commands that already name "this
//   entry" and work on any logging surface, diary or journal;
//   open the month this day belongs to. On a DAILY entry only: a monthly
//   review already is its month's review, and offering it there is offering
//   to open the note you are reading.
//
// Nothing else on the command list is contextual to the entry. The overviews
// and the search are destinations, and the banner already carries a date
// stepper and sits under a `links:` row that goes to them.
function attachEntryMenu(
  plugin: AlmanacPlugin,
  host: HTMLElement,
  notePath: string,
  grain: TrackerClass
): void {
  // §2.2's rule, unchanged: the control is not drawn where the menu would be
  // empty. On a managed template both tracker items refuse with a warning
  // (`isManagedTemplate` — the template is rewritten from the catalogue, so an
  // edit here is a change about to be overwritten), and with those two gone a
  // daily template's menu holds one navigation item and a monthly template's
  // holds nothing. A control that opens a menu to say no is worse than no
  // control.
  if (isManagedTemplate(plugin, notePath)) return;

  settingsButton(host, "jeh-more", (menu: Menu) => {
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Edit sections…")
        .setIcon("layout-list")
        .onClick(() => void plugin.sections.editSectionsHere(notePath))
    );
    // BESIDE IT, NOT INSTEAD OF IT, and the pairing is the point: the item
    // above changes THIS note and destroys nothing, and this one is about the
    // GRAIN — what tomorrow's entry will be built from. They are two questions
    // that a reader arrives at from the same thought ("this isn't the shape I
    // want"), so they are adjacent, and each window names the other.
    //
    // WITH AN ELLIPSIS, like every other item on this menu that opens a window.
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Template…")
        .setIcon("layout-template")
        .onClick(() => openEntryTemplateWindow(plugin.app, plugin, notePath, grain))
    );
    menu.addSeparator();
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Add a tracker…")
        .setIcon("plus-circle")
        .onClick(() => void plugin.entryTrackers.addTracker(notePath))
    );
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Remove a tracker…")
        .setIcon("minus-circle")
        .onClick(() => void plugin.entryTrackers.removeTracker(notePath))
    );

    if (grain === "daily") {
      menu.addSeparator();
      menu.addItem((i: MenuItem) =>
        i
          .setTitle("Open this month's entry")
          .setIcon("calendar-check")
          .onClick(() => void plugin.diary.openThisMonth())
      );
    }
  });
}

// ── THE ENTRY BANNER'S TITLE BAND (4.21) ─────────────────────────────
//
// THE FILE'S NAME, AND THAT IS THE WHOLE CHANGE. This band used to draw the
// `title` FRONTMATTER PROPERTY, falling back to a formatted date with an "Add a
// title…" hint beside it — so an entry was the one Almanac page whose banner did
// not show what the note is called.
//
// AND IT CONTRADICTED A RULE THE PLUGIN HAD ALREADY SETTLED. `page-title.ts`
// states it for the dashboards: *"THE NAME IS THE FILE'S. Not a `title`
// property… the filename is what the quick switcher, the graph, every backlink
// and every table display, and storing a second title in frontmatter would let
// those disagree."* An entry's `title:` property is exactly that second title.
// It is not deleted — a reader who wants a name for a day should have one — it
// is MOVED, onto the page-context strip where the entry's other facts live.
//
// SO THE BANNER IS THE FILE'S NAME, THE NAVIGATION ROW ABOVE IT, AND THE COG.
// The same three things a dashboard banner carries, drawn slimmer. Everything
// that was here and is not those three is on the strip: see `buildEntryContext`.
//
// `attachNoteRename` IS THE SAME CONTROL THE OTHER TWO BANNERS USE, taken
// rather than reimplemented — which also means an entry's name is renameable
// from the note for the first time, and renaming it moves the file.
export function buildEntryHeader(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  // `journal-banner-name` IS THE SHARED CLASS, and it is what makes this band
  // and a journal leaf's one object: 4.21.1 collapsed three banner drawings into
  // two, and every rule about how a slim banner's name band is inset, ruled and
  // laid out is written once against that class. See `.journal-slim-banner` in
  // `30-header-bars.css`.
  const wrap = createDiv({
    cls: "journal-header-bar journal-header-l1 journal-entry-header journal-banner-name",
  });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return wrap;
  const c = entryContext(plugin, file);

  const titleWrap = wrap.createDiv({
    cls: "jeh-title-wrap journal-banner-title",
  });
  attachNoteRename(app, titleWrap, file, "jeh-title");

  // THE COG COMES UP FROM THE FOOTER. A banner carries the control that edits
  // the page — `settingsButton` says so — and until 4.21 an entry's sat under
  // the logging grid, which is neither the banner nor near the name it acts on.
  attachEntryMenu(plugin, wrap, ctx.sourcePath, c.grain);

  return wrap;
}

// ── THE ENTRY'S PAGE-CONTEXT STRIP (4.21) ────────────────────────────
//
// WHAT IT IS. The strip across the top of the tracker section, carrying the two
// things that are about THIS entry rather than about the note as a file: its
// alias title, and the navigator that moves between entries of this grain.
//
// WHY THEY ARE TOGETHER AND WHY THEY ARE HERE. 4.20 settled that a banner is the
// file's name, its navigation and the cog — so the alias and the date stepper
// both had to leave it, and neither is a tracker either. What they are is the
// entry's own context, which is what the tracker section became: the block that
// holds what this page type knows about itself. A journal note's strip carries
// the same kind of thing — its level and its kind — for the same reason.
//
// THE STEPPER IS PAGE-SPECIFIC NAVIGATION, which the banner has excluded since
// 4.19 on the same rule that keeps the launcher and the period navigator out of
// it: a control that moves between INSTANCES of a page is not the row that says
// where this page sits in the vault.
//
// A SIBLING THE POSTPROCESSOR OWNS, unchanged from the footer this replaces and
// for the reason that one recorded: `entry-header` is a LiveWidget, so anything
// parented into its subtree is deleted on the next frontmatter change — and the
// alias editor writes frontmatter, so it would delete itself mid-edit.
//
// LEFT AND RIGHT BY PUSHING, NOT BY SPLITTING. `justify-content: space-between`
// would strand the stepper in the middle on a note with no alias offered.
export function buildEntryContext(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  // Whether the vault banner is drawing this note's title (4.51.5). When it is,
  // the alias editor below is that same control a second time — same property,
  // same note, forty pixels apart — so the strip keeps only what the bar has
  // not got: the date, and the navigator between entries.
  //
  // A PARAMETER RATHER THAN A CALL, so this module keeps knowing nothing about
  // the bar. The dispatcher already computes the answer once per note for its
  // own filter, and passing it costs one argument where importing it would cost
  // a cycle: `vault-banner.ts` imports `TITLE_PROP` and `entryDateLabel` from
  // here.
  titleElsewhere = false
): HTMLElement | null {
  const app = plugin.app;
  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return null;

  const bar = createDiv({ cls: "journal-widget-bar journal-entry-context" });
  const c = entryContext(plugin, file);

  // ── the alias, on the left ──────────────────────────────────────────
  //
  // AND NOTHING ELSE BESIDE IT AS OF 4.21.2. The formatted date used to sit here
  // as a subtitle, which made this row a title, a date and a navigator — three
  // things that fit a desktop pane and wrap onto two lines on a phone. The date
  // is on the caption row over the grid now, where it has a row to itself.
  if (titleElsewhere) {
    // AND NOTHING TAKES THE ALIAS'S PLACE. The date already has a slot — the
    // caption row over the grid, where 4.21.2 put it precisely so this row
    // would not be a title, a date and a navigator at once — so moving it up
    // here would be that release undone in the name of filling a gap.
    //
    // The row is the navigator alone, and says so: `jec-nav-only` tightens it,
    // because a control on its own does not need a row's worth of height.
    bar.addClass("jec-nav-only");
    buildEntryNav(plugin, bar, file, c);
    return bar;
  }

  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  // ── MUTABLE, AND THAT IS THE FIX (4.21.3) ───────────────────────────
  //
  // This was a `const` captured when the strip was built, and `renderTitle` read
  // it — so the only way to see a saved title was a rebuild of the whole strip.
  // Which never came: this strip is deliberately NOT a LiveWidget (a live host
  // would rebuild the input mid-edit), so pressing Enter wrote the file and left
  // the field sitting there with the text in it. Leaving the note and coming back
  // "fixed" it, because that is the rebuild the code was waiting for.
  //
  // The editor owns the value now: it writes the file AND updates this, so the
  // band it re-renders shows what was just saved without asking anyone.
  let title = typeof fm[TITLE_PROP] === "string" ? (fm[TITLE_PROP] as string).trim() : "";
  const titleWrap = bar.createDiv({ cls: "jec-title-wrap" });
  const titleEl = titleWrap.createDiv({ cls: "jec-title" });

  const renderTitle = (): void => {
    titleEl.empty();
    // THE STATE CLASS IS CLEARED, NOT JUST SET. `titleEl` is the same element
    // across every render — the click handler is bound to it — so a note that
    // was empty when the strip was built kept `jec-title-empty` after its first
    // title was saved, and drew that title in the "nothing here yet" face.
    titleEl.removeClass("jec-title-empty");
    if (title) {
      setIcon(titleEl.createSpan({ cls: "jec-title-icon" }), "notebook");
      titleEl.createSpan({ cls: "jec-title-text", text: title });
      const pencil = titleEl.createSpan({ cls: "jec-title-edit" });
      setIcon(pencil, "pencil");
    } else {
      // NO DATE FALLBACK ANY MORE. The old band printed the formatted date here
      // when the alias was empty, which is why it read as the note's title; the
      // banner above now says what the note is called, so an empty alias is
      // simply an offer.
      titleEl.addClass("jec-title-empty");
      setIcon(titleEl.createSpan({ cls: "jec-title-icon" }), "plus");
      titleEl.createSpan({ cls: "jec-title-text", text: "Add a title…" });
    }
  };

  const beginEdit = (): void => {
    titleWrap.empty();
    const input = titleWrap.createEl("input", {
      type: "text",
      cls: "jec-title-input",
      attr: { placeholder: "Title this entry…" },
    });
    input.value = title;
    // ── THE FIELD IS THE SIZE OF THE TITLE IT REPLACES (4.21.2) ─────
    //
    // A text input's width comes from its `size` attribute — 20 characters at
    // the FORM CONTROL's font, which is not the font this input is set in — so
    // the box collapsed to roughly two thirds of the words it was editing and a
    // title that fitted on one line before the click no longer did.
    //
    // AN ATTRIBUTE RATHER THAN A CSS WIDTH, because the wrapper is shrink-to-fit
    // (it carries the `margin-right: auto` that pushes the navigator out), so a
    // percentage width on the input resolves against a box the input is itself
    // sizing. `size` is measured in characters, which is the unit the content is
    // actually in.
    //
    // AND IT TRACKS WHAT IS TYPED, so the field grows with the title rather than
    // scrolling it out of view. The floor is the placeholder's length: an empty
    // field still has to be wide enough to invite one.
    const fit = (): void => {
      input.size = Math.max(input.value.length + 1, 18);
    };
    fit();
    input.addEventListener("input", fit);

    // One commit per edit — see the note on the same guard in study-header.ts.
    // Escape calls commit(false), which empties this wrapper, which detaches a
    // focused input, which fires `blur`, which calls commit(true) and writes the
    // title the reader had just cancelled.
    let settled = false;
    const commit = async (save: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      if (save) {
        const next = input.value.trim();
        // NOTHING IS WRITTEN WHEN NOTHING WOULD CHANGE. A `processFrontMatter`
        // that leaves a file identical still moves its modified time, which is a
        // lie about the reader's vault that sync then propagates — the rule
        // `setWide` states one file over.
        if (next !== title) {
          await app.fileManager.processFrontMatter(file, (f) => {
            if (next) f[TITLE_PROP] = next;
            else delete f[TITLE_PROP];
          });
          title = next;
        }
      }
      // ── BOTH PATHS PUT THE BAND BACK (4.21.3) ─────────────────────
      //
      // Only the CANCEL path used to. Saving wrote the file and returned, on the
      // unstated assumption that something would re-render the strip; nothing
      // does, because it is not live. One restore, after either outcome, and the
      // difference between them is `title` — which the save branch has already
      // updated.
      titleWrap.empty();
      titleWrap.appendChild(titleEl);
      renderTitle();
    };

    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void commit(true);
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        void commit(false);
      }
    });
    input.addEventListener("blur", () => void commit(true));
    input.focus();
    input.select();
  };

  renderTitle();
  titleEl.addEventListener("click", beginEdit);

  buildEntryNav(plugin, bar, file, c);
  return bar;
}

// The navigator, on the right.
//
// Three connected segments — prev chevron, "Jump to day/month" trigger, next
// chevron — that read as one control.
//
// LIFTED OUT IN 4.51.5 so the two shapes of the strip cannot drift. It is the
// half the vault banner does NOT replace — the bar says which note this is and
// this says which one is next — so it is drawn on both paths, and drawing it
// twice by hand is how one of them loses a chevron.
function buildEntryNav(
  plugin: AlmanacPlugin,
  bar: HTMLElement,
  file: TFile,
  c: EntryContext
): void {
  const app = plugin.app;
  const navGroup = bar.createDiv({ cls: "jeh-nav jeh-seg" });
  navPill(navGroup, app, c.prev, "chevron-left", `Earliest ${CLASS_DEFS[c.grain].periodNoun}`, "left");
  buildDatePicker(plugin, navGroup, file, c.grain);
  navPill(navGroup, app, c.next, "chevron-right", `Latest ${CLASS_DEFS[c.grain].periodNoun}`, "right");
}
