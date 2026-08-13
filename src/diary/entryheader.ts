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
import { overflowButton } from "../ui/section-frame";
import { isManagedTemplate } from "../trackers/entry-trackers";
import type AlmanacPlugin from "../main";
import { CLASS_DEFS } from "../trackers/trackers";
import { labelForGrain } from "./nav";
import type { TrackerClass } from "../trackers/trackers";
import { entryContext } from "./nav";
import {
  filesUnder,
  frontmatterOf,
  isoDate,
  moment,
  folderNotePath,
  openFile,
} from "../core/util";

// The frontmatter property the entry title is stored in. A plain scalar, kept
// separate from Obsidian's native `aliases` (an array meant for link targets)
// so per-day titles don't flood the quick-switcher / link autocomplete.
export const TITLE_PROP = "title";

// The date shown as the header's subtitle. Daily notes get the weekday + date;
// monthly reviews get the month name. Falls back to the entry's computed date
// title when there's no explicit date to format.
function subtitleFor(
  app: App,
  file: TFile,
  grain: TrackerClass,
  fallback: string
): string {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  if (grain === "monthly") {
    const key = (
      fm["month"] ? String(fm["month"]) : isoDate(fm["journal-date"]) ?? ""
    ).slice(0, 7);
    return key ? moment(key + "-01").format("MMMM YYYY") : fallback;
  }
  const d = isoDate(fm["journal-date"]);
  return d ? moment(d).format("ddd D MMM YYYY") : fallback;
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
  const keyOf = (fm: Record<string, unknown>): string => {
    const raw = fm[def.dateProperty];
    const primary = raw == null ? "" : String(raw);
    const value =
      (isoDate(primary) ?? primary) || (isoDate(fm["journal-date"]) ?? "");
    return grain === "monthly" ? value.slice(0, 7) : value;
  };

  return filesUnder(app, folder)
    .filter((f) => f.path !== dashboard)
    .map((f) => ({ file: f, key: keyOf(frontmatterOf(app, f)) }))
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
// chart models. The BUTTON is shared (`overflowButton`), the lists are not.
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

  overflowButton(host, "jeh-more", (menu: Menu) => {
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Edit sections…")
        .setIcon("layout-list")
        .onClick(() => void plugin.sections.editSectionsHere(notePath))
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

export function buildEntryHeader(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const wrap = createDiv({ cls: "journal-header-bar journal-header-l1 journal-entry-header" });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return wrap;

  const c = entryContext(plugin, file);
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const title = typeof fm[TITLE_PROP] === "string" ? (fm[TITLE_PROP] as string).trim() : "";
  const subtitle = subtitleFor(app, file, c.grain, c.dateTitle);

  // ── Left: editable title + date subtitle ─────────────────────────────
  const titleWrap = wrap.createDiv({ cls: "jeh-title-wrap" });
  const titleEl = titleWrap.createDiv({ cls: "journal-header-title jeh-title" });

  const renderTitle = (): void => {
    titleEl.empty();
    titleEl.removeClass("jeh-title-empty");
    if (title) {
      setIcon(titleEl.createSpan({ cls: "jeh-title-icon" }), "notebook");
      titleEl.createSpan({ cls: "jeh-title-text", text: title });
      const pencil = titleEl.createSpan({ cls: "jeh-title-edit" });
      setIcon(pencil, "pencil");
      titleWrap.createSpan({ cls: "jeh-subtitle", text: `· ${subtitle}` });
    } else {
      // No title — the date IS the title, with an "Add a title…" hint.
      setIcon(titleEl.createSpan({ cls: "jeh-title-icon" }), "calendar");
      titleEl.createSpan({ cls: "jeh-title-text", text: subtitle });
      const hint = titleWrap.createSpan({ cls: "jeh-subtitle jeh-add-hint" });
      setIcon(hint.createSpan(), "plus");
      hint.createSpan({ text: "Add a title…" });
    }
  };

  // Click the title (or the "Add a title…" hint) → inline edit.
  const beginEdit = (): void => {
    titleWrap.empty();
    const input = titleWrap.createEl("input", {
      type: "text",
      cls: "jeh-title-input",
      attr: { placeholder: "Title this entry…" },
    });
    input.value = title;
    titleWrap.createSpan({ cls: "jeh-subtitle", text: `· ${subtitle}` });

    // One commit per edit — see the note on the same guard in study-header.ts.
    // Escape calls commit(false), which empties this wrapper, which detaches a
    // focused input, which fires `blur`, which calls commit(true) and writes
    // the title the reader had just cancelled. The save path is idempotent
    // enough that nobody noticed; the cancel path was not.
    let settled = false;

    const commit = async (save: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      if (save) {
        const next = input.value.trim();
        await app.fileManager.processFrontMatter(file, (f) => {
          if (next) f[TITLE_PROP] = next;
          else delete f[TITLE_PROP];
        });
        // The LiveWidget re-render (on the frontmatter change) rebuilds the
        // whole header, so no manual repaint needed here.
      } else {
        // Cancelled — restore the static title without touching the file.
        titleWrap.empty();
        titleWrap.appendChild(titleEl);
        renderTitle();
      }
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
  titleWrap.addEventListener("click", (evt) => {
    if ((evt.target as HTMLElement).closest(".jeh-add-hint")) beginEdit();
  });

  // The stepper and the `⋯` used to be a second row inside this band. They are
  // the card's footer now — see buildEntryFooter below.
  return wrap;
}

// The card's footer band: the date stepper on the left, the entry's own `⋯` on
// the right. Returned to the block's postprocessor, which appends it after the
// logging grid; see the note at the top of this file for why it is a sibling
// the postprocessor owns rather than something this widget parents.
//
// LEFT AND RIGHT BY PUSHING, NOT BY SPLITTING. `justify-content: space-between`
// would centre-strand the stepper on a managed template, where `attachEntryMenu`
// deliberately draws nothing — the same reason the overview footer pushes its
// now-button with `margin-right: auto` instead of re-aligning the bar. The bar
// stays left-aligned and the `⋯` pushes itself to the far edge.
export function buildEntryFooter(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const app = plugin.app;
  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return null;

  const bar = createDiv({ cls: "journal-widget-bar journal-entry-actions" });
  const c = entryContext(plugin, file);

  // Three connected segments — prev chevron, "Jump to day/month" trigger, next
  // chevron — that read as one control.
  const navGroup = bar.createDiv({ cls: "jeh-nav jeh-seg" });
  navPill(navGroup, app, c.prev, "chevron-left", `Earliest ${CLASS_DEFS[c.grain].periodNoun}`, "left");
  buildDatePicker(plugin, navGroup, file, c.grain);
  navPill(navGroup, app, c.next, "chevron-right", `Latest ${CLASS_DEFS[c.grain].periodNoun}`, "right");

  attachEntryMenu(plugin, bar, ctx.sourcePath, c.grain);

  return bar;
}
