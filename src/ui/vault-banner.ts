// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The strip above every ChronoAnvil note. 4.51.
//
// ── WHAT IT REPLACES, AND WHY IT IS NOT A DIRECTIVE ──────────────────────
//
// Every ChronoAnvil note has carried its banner IN ITS BODY: `journal-header` or
// `entry-header`, composed into the template, `required: true`, immovable. Three
// banner families, one per surface, each drawn by a directive the reader could
// see in the file and could not remove.
//
// This is that, as chrome. It is drawn from the note's IDENTITY — where it sits,
// which journal it belongs to, what its frontmatter says — and nothing in any
// file renders it. Turning it off restores the old banners exactly, because the
// directives are all still there (see `bannerSuppressed`).
//
// ── WHY IT IS NOT A POST-PROCESSOR EITHER ────────────────────────────────
//
// A markdown post-processor only ever sees blocks that EXIST IN THE FILE, and
// the whole point is that there is no directive to attach to. There is no block.
//
// And a block would be the wrong object anyway, for the reason `page-width.ts`
// paid to learn:
//
//   A READING VIEW DOES NOT KEEP THE WHOLE NOTE IN THE DOM. Obsidian renders
//   sections as they come near the viewport and drops them again... The title
//   card is the FIRST block on the page. Scroll a dashboard to the bottom and
//   the card is unloaded — *"nothing had gone wrong with the note; the evidence
//   had simply scrolled away."*
//
// ── IT MOUNTS ON THE LEAF (4.51.3) ───────────────────────────────────────
//
// 4.51 put it in the note's scroll container — `.markdown-preview-sizer` in
// reading mode, `.cm-sizer` in Live Preview — so it sat above the first block
// and scrolled with the page. **It did not always draw.** Those elements are
// created by whichever mode mounts them, so a sweep that runs before that (a
// restored workspace at `onLayoutReady`, which is startup) finds nothing to
// prepend to, and the note is left with no bar and no in-note header either.
//
// `view.containerEl` exists for as long as the view does and nothing creates it
// late. The bar goes there, above Obsidian's own view header — between the tab
// strip and the note's toolbar, which is where the reference design puts it.
// See `apply`, which holds the whole argument.
//
// ── THE HOOK IS `PageWidth`'S, VERB FOR VERB ─────────────────────────────
//
// Four events and one sweep, *"because there is no event that means 'a leaf is
// now showing a different note' on its own"* — and idempotent, so a duplicate
// event costs a re-derivation and nothing else. The one thing added is a
// `metadataCache` pass, because this banner READS frontmatter (a diary entry's
// title, a note's date) where `PageWidth` only read the body.

import { App, MarkdownView, Menu, TFile, setIcon } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import {
  BannerScope,
  BannerSurface,
  bannerSurfaceOf,
  titleTargetFor,
} from "../core/banner-scope";
import { openFile } from "../core/util";
import { ART_PRESETS } from "../core/constants";
import { BRAND_ICON_ID } from "./brand-icon";
import { resolveTarget, reviewScopes } from "../core/links";
import {
  Crumb,
  journalBannerMenu,
  journalCrumbs,
  metaFor,
  renderCrumb,
} from "../journals/study-header";
import { entryDateLabel, TITLE_PROP } from "../diary/entryheader";
import { entryContext } from "../diary/nav";
import { hueOf, journalTypeAtPath } from "../journals/journal";
import { openVaultSearch } from "./search-all";
import { openProperties } from "./properties";
import { sectionsMenuFor } from "./widgets/page-title";
import { WIDE_PAGE_CLASS } from "./page-width";
import { noteKindOf } from "../trackers/trackers";

/** The class the banner's own element carries, spelled once. */
export const BANNER_CLASS = "ca-vault-banner";

/**
 * On the LEAF, not on the banner: what it stands in for — Obsidian's inline
 * title and its property panel — are siblings of the bar rather than children
 * of it. 4.51.5, widened in 4.51.6.
 */
export const HIDE_TITLE_CLASS = "ca-absorb-host-chrome";

// The four destinations, fixed for this release.
//
// FIXED IS A DECISION (4.51, Q9). Configurable nav is a settings surface, an
// ordering question and a migration, and none of it is needed to find out
// whether the banner is right.
//
// READ FROM `resolveTarget`, NOT FROM A LIST OF OUR OWN. That is the one table
// answering *where does `today` go*, and a second would be the one nobody
// updates. Its rule comes with it: **a destination that does not resolve is not
// drawn** — no journals root, no Journals button, rather than one greyed out to
// teach a reader that this plugin's controls are decoration.
// ── THE FOUR DESTINATIONS, AND WHY THESE FOUR (4.51.8) ──────────────────
//
// `today` came off the bar on the reader's instruction, and `diary` took the
// slot: the bar is where you go to a PLACE in the vault, and the two halves of
// it — the diary and the journals — should be one press each. `today` was the
// odd one out on that reading; it is not a place but an action, it makes a note
// where the other three open one, and its destination is a click away from the
// diary dashboard's own calendar.
//
// IT IS NOT GONE FROM THE PLUGIN. The command palette still opens today's
// entry, and every diary surface's calendar still lands on it — this is a row
// of four, and which four is a composition decision rather than a claim that
// the fifth is unreachable.
const NAV_IDS = ["home", "capture", "diary", "journals"] as const;

// Lucide glyphs, where they differ from the destination table's own.
//
// `resolveTarget` carries an icon per target and these override it for exactly
// one reason: the nav is a row of four buttons read as a set, and `capture`
// resolves to a pencil that reads as "edit" beside three navigational glyphs.
// `diary` and `journals` are drawn with the table's icons, which is why they
// are not here — an entry that repeats the answer is one more place to update.
const NAV_ICONS: Record<string, string> = {
  capture: "plus",
};

export class VaultBanner {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  register(): void {
    const sweep = (): void => this.sweep();
    this.plugin.registerEvent(this.app.workspace.on("file-open", sweep));
    this.plugin.registerEvent(this.app.workspace.on("layout-change", sweep));
    this.plugin.registerEvent(
      this.app.workspace.on("active-leaf-change", sweep)
    );
    // THE BANNER READS FRONTMATTER, which `PageWidth` does not — a diary entry's
    // title and a journal note's date are both properties, and both are on the
    // strip. Scoped to the views showing that file, on its rule: a vault-wide
    // sweep on every metadata change would redraw every open note each time the
    // reader stops typing.
    this.plugin.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        for (const view of this.markdownViews()) {
          if (view.file?.path === file.path) this.apply(view);
        }
      })
    );
    this.app.workspace.onLayoutReady(() => this.sweep());
  }

  /** Re-derive every open note. Called by settings when the toggle or glyph changes. */
  refresh(): void {
    this.sweep();
  }

  private markdownViews(): MarkdownView[] {
    return this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((v): v is MarkdownView => v instanceof MarkdownView);
  }

  private sweep(): void {
    for (const view of this.markdownViews()) this.apply(view);
  }

  // Paint the banner onto one view.
  //
  // THE MOUNT POINT IS THE VIEW'S ROOT (`view.containerEl`). 4.51.3.
  //
  // It was the scroll container (`.markdown-preview-sizer` / `.cm-sizer`), and
  // there the bar lands **above Obsidian's view header** — between the tab strip
  // and the note's own toolbar, which is where the reference design the reader
  // asked this to follow puts it, and which is what they asked for by name.
  //
  // AND IT IS BETTER CHROME THERE. It is no longer part of the note's scroll,
  // so it stays put while the note moves under it; it spans the whole leaf
  // rather than the text column, which is the width the reference has and the
  // one a `.markdown-preview-sizer` child can only fake; and reading view's
  // section unloading — the bug `page-width.ts` paid to learn — cannot reach it
  // at all rather than merely not applying to it.
  //
  // THE OLD BANNER IS REMOVED BEFORE ANYTHING ELSE, on `PageWidth`'s rule: a
  // leaf is REUSED across file switches, so a banner left behind is one that
  // outlives the note that caused it. Every path through here removes first.
  private apply(view: MarkdownView): void {
    const host = view.containerEl;
    host.querySelector(`:scope > .${BANNER_CLASS}`)?.remove();
    // CLEARED ON THE SAME LINE AS THE REMOVAL, for the same reason and it is
    // the same trap: a leaf is reused across file switches, so a class left on
    // it hides the title and properties of whatever note arrives next —
    // including notes this plugin has nothing to do with.
    host.removeClass(HIDE_TITLE_CLASS);
    host.removeAttribute("data-ca-surface");
    host.removeAttribute("data-ca-grain");
    host.removeAttribute("data-ca-journal");

    const file = view.file;
    if (!(file instanceof TFile)) return;
    const surface = bannerSurfaceOf(file.path, bannerScopeOf(this.plugin));
    if (!surface) return;

    host.prepend(this.build(file, surface, host));
    host.addClass(HIDE_TITLE_CLASS);
  }

  // ── the strip ──────────────────────────────────────────────────────────

  private build(
    file: TFile,
    surface: BannerSurface,
    view: HTMLElement
  ): HTMLElement {
    const root = createDiv({ cls: BANNER_CLASS });
    root.setAttr("data-surface", surface);
    root.setAttr("data-ca-surface", surface);
    view.setAttr("data-ca-surface", surface);

    if (surface === "diary") {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const kind = noteKindOf(
        this.plugin.settings.paths,
        file.path,
        fm["journal"],
        fm["type"]
      );
      const grain = kind?.surface === "diary" ? kind.grain : "daily";
      root.setAttr("data-ca-grain", grain);
      view.setAttr("data-ca-grain", grain);
    } else if (surface === "journal") {
      const type = journalTypeAtPath(this.plugin, file.path);
      if (type) {
        root.setAttr("data-ca-journal", type.id);
        view.setAttr("data-ca-journal", type.id);
        const hue = `hsl(${hueOf(type.id)}, 65%, 55%)`;
        root.style.setProperty("--ca-journal-accent", hue);
        view.style.setProperty("--ca-journal-accent", hue);
      }
    }

    this.applyArt(root);
    this.buildGlobal(root, file, surface);
    this.buildContext(root, file, surface, view);
    return root;
  }

  private applyArt(root: HTMLElement): void {
    const banner = this.plugin.settings.banner;
    // A PRESET ID OR "none", NEVER A FILENAME. `normalizeBannerArt` settles
    // that once on load; before 4.80 this read a file out of the vault's Art
    // folder and had to cope with the file having been renamed or deleted
    // under it. There is no file now — the pattern is a data URI in
    // `97-vault-banner.css`, selected by the attribute set below.
    const preset = ART_PRESETS[banner.art ?? "none"];
    if (preset) {
      root.setAttr("data-ca-art", preset.id);
      // THE ONE VISUAL FACT STILL SET FROM HERE, because it is the one the
      // reader drags a slider for. Everything else about a preset — its
      // geometry, its tiling, its blend mode — is a declaration in the
      // stylesheet, where a stylesheet's facts belong.
      const opacity = banner.artOpacity ?? preset.defaultOpacity;
      root.style.setProperty("--ca-header-art-opacity", String(opacity / 100));
    }
    // NO ATTRIBUTE IS THE OFF STATE, and it needs no branch of its own:
    // `--ca-header-art-pattern` defaults to `none` in `00-tokens.css`, so the
    // `::after` layer paints nothing until a preset rule gives it something.

    if (banner.glowEnabled === false) {
      root.style.setProperty("--ca-header-bg-gradient", "none");
    } else if (banner.glowEnabled === true) {
      root.style.setProperty(
        "--ca-header-bg-gradient",
        "radial-gradient(circle at 85% 20%, rgba(var(--interactive-accent-rgb), 0.15) 0%, transparent 60%)"
      );
    }
  }

  // Row one: the tile, the search, the four destinations. Identical on every
  // note, which is what makes it chrome.
  private buildGlobal(
    root: HTMLElement,
    file: TFile,
    surface: BannerSurface
  ): void {
    const row = root.createDiv({ cls: "ca-avb-global" });

    // THE TILE IS A LOCKUP, NOT A LONE SQUARE (4.51.2).
    //
    // A coloured square with two letters in it, alone in the corner, is a
    // bookmark — it says a plugin is here and nothing else. The reference the
    // reader asked this to follow puts the workspace's NAME beside its mark,
    // with a second line under it saying which part of the workspace you are
    // in, and that second line is the half doing real work: it is the only
    // place on the bar that names the surface.
    //
    // THE WHOLE LOCKUP IS THE BUTTON, and what it opens is where its own glyph
    // is set (4.51, Q6/Q7) — the thing you press to configure it is the thing
    // it configures.
    const id = row.createDiv({
      cls: "ca-avb-id",
      attr: { "aria-label": "ChronoAnvil settings", role: "button", tabindex: "0" },
    });
    // The tile is the mark unless the reader has put something of their own
    // there. `setIcon` rather than text, so it inherits the tile's colour the
    // same way the glyph did.
    const tile = id.createDiv({ cls: "ca-avb-tile" });
    const glyph = this.glyph();
    if (glyph) tile.setText(glyph);
    else setIcon(tile, BRAND_ICON_ID);
    const idText = id.createDiv({ cls: "ca-avb-id-text" });
    idText.createDiv({ cls: "ca-avb-id-name", text: this.app.vault.getName() });
    idText.createDiv({ cls: "ca-avb-id-sub", text: this.surfaceName(file, surface) });
    const openSettings = (): void => this.openSettings();
    id.addEventListener("click", openSettings);
    id.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        openSettings();
      }
    });

    // A BUTTON STYLED AS A FIELD, not an input. An input here would be a second
    // search to keep in step with the one it opens — see `search-all.ts`, which
    // is the whole of the searching.
    const search = row.createDiv({
      cls: "ca-avb-search",
      attr: { role: "button", tabindex: "0", "aria-label": "Search ChronoAnvil" },
    });
    setIcon(search.createSpan({ cls: "ca-avb-search-icon" }), "search");
    search.createSpan({ cls: "ca-avb-search-text", text: "Search everything…" });
    // NO KEY CHIP (5.0.1). A `⌘ K` / `Ctrl K` chip sat here and spelled the
    // command's default binding for the platform. The command no longer claims
    // a default — see `main.ts`, and Obsidian's guidance against plugins taking
    // a shortcut in every vault that installs them — so the chip would now name
    // a key that does nothing, which is worse than naming none.
    //
    // AND IT COULD NOT SIMPLY BE TAUGHT TO READ THE REAL BINDING. A reader's
    // own hotkeys are not on the public API; the only way to draw a true chip
    // here is through an internal one, which is its own review finding. The
    // field is a button, it says what it does, and it opens on click.
    const open = (): void => openVaultSearch(this.plugin);
    search.addEventListener("click", open);
    search.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        open();
      }
    });

    const nav = row.createDiv({ cls: "ca-avb-nav" });
    // THE DIARY'S FIFTH, AND ONLY THE DIARY'S (4.51.5). A diary note's `links:`
    // row is gone — it was the four destinations beside this one, drawn again
    // in a card — and the scope menu is the one thing it carried that this row
    // does not. It arrives here rather than being lost, and it arrives ONLY
    // where it means something: a journal note has no weekly overview.
    if (surface === "diary") this.buildScopes(nav, file);
    for (const id of NAV_IDS) {
      const target = resolveTarget(this.plugin, file, id);
      // NOTHING DEAD IS DRAWN — `launcher.ts`'s rule, spelled the way that file
      // spells it: **a file OR an action.**
      //
      // HALF THIS RULE WAS THE 4.51 BUG (4.51.1). The first vault render drew
      // two buttons out of four, because `today` and `capture` are the two
      // targets in the table with `file: null` — a destination that is not a
      // file, which `resolveTarget` documents in as many words at both of them:
      // *the reader is going somewhere, and where they land is a window.*
      // Asking only about `.file` silently deletes exactly the two destinations
      // a reader reaches for most.
      if (!target || (!target.file && !target.action)) continue;
      const dest = target.file;
      // WHERE YOU ALREADY ARE, and only a FILE can be that. `today` opens the
      // day's entry and `capture` opens a window; neither is a note this bar can
      // be sitting on.
      const on = !!dest && dest.path === file.path;
      const btn = nav.createDiv({
        cls: "ca-avb-btn" + (on ? " is-on" : ""),
        attr: { role: "button", tabindex: "0", "aria-label": target.label },
      });
      setIcon(
        btn.createSpan({ cls: "ca-avb-btn-icon" }),
        NAV_ICONS[id] ?? target.icon
      );
      btn.createSpan({ cls: "ca-avb-btn-label", text: target.label });
      // THE ACTION WINS WHERE THERE IS ONE, which is `launcher.ts`'s order and
      // matters for `today`: it OPENS OR CREATES the day's entry, where opening
      // a file could only ever do the first half.
      const go = (): void => {
        if (target.action) target.action();
        else if (dest) void openFile(this.app, dest);
      };
      btn.addEventListener("click", go);
      btn.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          go();
        }
      });
    }
  }

  // The review ladder, as one tile that opens a menu.
  //
  // LABELLED WITH WHERE YOU ARE, which is the rule `renderScopes` settled when
  // it folded five pills into one control: *"the button is labelled with the
  // scope you are on rather than with a generic Overviews, which keeps the
  // indicator and the compactness both."* On an entry there is no position to
  // show, so it degrades to the generic word — the same degradation, in the
  // same place.
  //
  // NOTHING DEAD IS DRAWN, again: a vault with no period overviews on disk
  // resolves none of the five and gets no tile.
  private buildScopes(nav: HTMLElement, file: TFile): void {
    const { targets, here } = reviewScopes(this.plugin, file, file.path);
    if (targets.length === 0) return;

    const btn = nav.createDiv({
      cls: "ca-avb-btn ca-avb-btn-menu" + (here ? " is-on" : ""),
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Choose a review scope",
        "aria-haspopup": "menu",
      },
    });
    setIcon(btn.createSpan({ cls: "ca-avb-btn-icon" }), here?.icon ?? "calendar");
    btn.createSpan({ cls: "ca-avb-btn-label", text: here?.label ?? "Overviews" });
    setIcon(btn.createSpan({ cls: "ca-avb-btn-caret" }), "chevron-down");

    const show = (evt: MouseEvent | KeyboardEvent): void => {
      const menu = new Menu();
      for (const target of targets) {
        const dest = target.file;
        if (!dest) continue;
        menu.addItem((i) =>
          i
            .setTitle(target.label)
            .setIcon(target.icon)
            .setChecked(dest.path === file.path)
            .onClick(() => void openFile(this.app, dest))
        );
      }
      if (evt instanceof MouseEvent) menu.showAtMouseEvent(evt);
      else menu.showAtPosition({ x: 0, y: 0 });
    };
    btn.addEventListener("click", show);
    btn.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        show(evt);
      }
    });
  }

  // Row two: where this note sits, ending in what it is called.
  //
  // ── ONE ROW, NOT TWO, AND THE TRAIL'S TAIL IS THE TITLE (4.51.2) ───────
  //
  // 4.51 drew a trail and then a large serif title under it. Both name the
  // note, and **Obsidian draws the note's name itself**, in its inline title,
  // directly below where this bar sits — so a reader opening the homepage got
  // *Homepage* three times in four centimetres. That is what the vault render
  // showed and it is not a spacing problem.
  //
  // The reference this was asked to follow does not carry a title row either:
  // it carries a trail whose LAST crumb is the note, emphasised, and lets the
  // page's own head be the big name. That is the version kept.
  //
  // **THE TITLE IS STILL ON THE BAR AND IS STILL CLICK-TO-EDIT** — Q2 and Q11
  // are unchanged. It is the tail of the trail rather than a line of its own,
  // which is where a reader looks for "what is this note called" anyway once
  // there is a trail above it.
  private buildContext(
    root: HTMLElement,
    file: TFile,
    surface: BannerSurface,
    view: HTMLElement
  ): void {
    const trail = root.createDiv({ cls: "ca-avb-trail" });
    const isIndex = !!file.parent && file.basename === file.parent.name;

    for (const crumb of this.crumbsFor(file, surface, isIndex)) {
      renderCrumb(trail, this.app, crumb, file.path);
      trail.createSpan({ cls: "ca-avb-sep", text: "›" });
    }

    // TEXT, NOT AN EDITOR (4.51.6). The trail's last step is a breadcrumb — it
    // says where you are — and the page head below now carries the note's name
    // in a page's face with the pencil on it. Two editors for one name is the
    // doubling this release has spent five patches removing; the breadcrumb is
    // the copy that gives it up, because a trail is a place and not a control.
    trail
      .createDiv({ cls: "ca-avb-here" })
      .createSpan({ cls: "ca-avb-here-text", text: this.hereText(file, surface) });

    const meta = this.metaText(file, surface, isIndex);
    if (meta) trail.createDiv({ cls: "ca-avb-meta", text: meta });

    // THE NOTE'S PROPERTIES, BEHIND A BUTTON (4.51.6). Obsidian draws them as
    // six rows between the title and the first block, above everything the
    // reader opened the note to write in — and on a ChronoAnvil note most of what
    // is in them is already on screen as a tracker cell or a crumb. What is
    // left is plumbing, so it goes in a window and the note opens with the
    // note. See `properties.ts`.
    //
    // COUNTED ON THE BUTTON, because a control that opens a list should say
    // whether the list has anything in it — and because with Obsidian's own
    // panel hidden this is the only place that count exists.
    const props = Object.keys(
      this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}
    ).length;
    const propsBtn = trail.createDiv({
      cls: "ca-avb-props",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": `Properties (${props})`,
      },
    });
    setIcon(propsBtn.createSpan({ cls: "ca-avb-props-icon" }), "list");
    // A COUNT OF NOTHING IS NOT A COUNT (4.51.7). Both dashboards drew `≡ 0`,
    // which is a figure a reader has to read before learning it means there is
    // nothing to read. The button stays — it is still where a property is ADDED
    // — and its label still says the number for anything not looking at it.
    if (props > 0) {
      propsBtn.createSpan({ cls: "ca-avb-props-count", text: String(props) });
    }
    const openProps = (): void => openProperties(this.app, file);
    propsBtn.addEventListener("click", openProps);
    propsBtn.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        openProps();
      }
    });

    // THE COG IS IN THE FAR CORNER, AWAY FROM THE TITLE. `study-header`'s rule
    // and its reason: *"a control next to it would be a control one slip away
    // from renaming the note."* The title is click-to-edit here for exactly the
    // reason it is there.
    const build = this.menuFor(file, surface, isIndex, view);
    if (build) {
      const cog = trail.createDiv({
        cls: "ca-avb-cog",
        attr: { "aria-label": "Page settings", role: "button", tabindex: "0" },
      });
      setIcon(cog, "settings");
      const show = (evt: MouseEvent | KeyboardEvent): void => {
        const menu = new Menu();
        build(menu);
        if (evt instanceof MouseEvent) menu.showAtMouseEvent(evt);
        else menu.showAtPosition({ x: 0, y: 0 });
      };
      cog.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        show(evt);
      });
      cog.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          show(evt);
        }
      });
    }
  }

  // ── the title moved out (4.51.6) ───────────────────────────────────────
  //
  // `buildTitle` and `buildPropertyTitle` lived here and are gone. The page
  // head owns the note's name now, and the pair of controls they were is one
  // pair in `header-title.ts` — `attachNoteRename` and `attachPropertyRename`
  // — chosen between by `titleTargetFor`, exactly as they were here. What the
  // bar keeps is the breadcrumb, which is text.

  // ── the facts each surface has ─────────────────────────────────────────

  private crumbsFor(
    file: TFile,
    surface: BannerSurface,
    isIndex: boolean
  ): Crumb[] {
    // THE JOURNAL TRAIL IS `study-header`'S, NOT A SECOND ONE. It knows about
    // the journals root, the journal's own page, the `isIndex` rule and a crumb
    // whose file is missing — four rules that took four releases to get right.
    if (surface === "journal") {
      return journalCrumbs(this.app, this.plugin, file, isIndex);
    }
    // A DIARY ENTRY'S ONE ANCESTOR IS THE DIARY. Not the month above it: that is
    // a SIBLING grain, and `journalCrumbs`' own rule is that *"a trail names a
    // note's ancestors, never the note itself"* — nor anything alongside it.
    if (surface === "diary") {
      const target = resolveTarget(this.plugin, file, "diary");
      // NOT WHEN IT IS THIS NOTE (4.51.3). The diary's own folder note is in
      // the diary, so the one ancestor resolves to itself — and `journalCrumbs`
      // states the rule this borrows: *a trail names a note's ancestors, never
      // the note itself.* Without this the diary dashboard's trail reads
      // "Diary › Diary".
      if (!target?.file || target.file.path === file.path) return [];
      return [{ label: target.label, file: target.file }];
    }
    // THE HOMEPAGE IS THE ROOT. A trail above it would be a trail to itself.
    return [];
  }

  // Which part of the vault this note is in, under the vault's own name.
  //
  // THE ONE PLACE ON THE BAR THAT NAMES THE SURFACE, and on a journal it names
  // the JOURNAL rather than the word "journal" — a reader in Study wants to see
  // Study, and the word they would otherwise read is one they already know from
  // having opened it.
  // What the trail's last step says — the note's own name, by whichever rule
  // names it. Asked by `metaText` so the two cannot disagree about whether the
  // date is already on screen.
  private hereText(file: TFile, surface: BannerSurface): string {
    if (titleTargetFor(surface, this.dateLabel(file) !== null) === "filename") {
      return file.basename;
    }
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const v = fm[TITLE_PROP];
    const title = typeof v === "string" ? v.trim() : "";
    return title || this.dateLabel(file) || file.basename;
  }

  private surfaceName(file: TFile, surface: BannerSurface): string {
    if (surface === "journal") {
      // BY PATH (4.51.7). This read `journalTypeOfNote`, which wants the note's
      // own `type:` as well — so a journal's DASHBOARD, which declares none,
      // read as the bare word *Journal* on the one page in that folder whose
      // subject is the journal. Every note inside it said *Study*. The head
      // asks the same question through the same function now.
      const type = journalTypeAtPath(this.plugin, file.path);
      if (type) return type.name;
    }
    return surface === "diary" ? "Diary" : surface === "home" ? "Home" : "Journal";
  }

  // WHICH GRAIN THIS ENTRY IS, THROUGH `entryContext` — the one walk that knows
  // all five, and the same one the diary's own banner asks. Two answers to
  // "is this a weekly entry?" is the bug that release fixed.
  private dateLabel(file: TFile): string | null {
    return entryDateLabel(this.app, file, entryContext(this.plugin, file).grain);
  }

  private metaText(
    file: TFile,
    surface: BannerSurface,
    isIndex: boolean
  ): string {
    if (surface === "journal") {
      const type = journalTypeAtPath(this.plugin, file.path);
      return metaFor(this.app, file, isIndex, (type?.kinds ?? []).map((k) => k.id));
    }
    // NOT WHEN IT IS THE TITLE (4.51.5). An entry with no title of its own is
    // called by its date, and the trail's last step already says so — printing
    // it again a few pixels to the right is the same fact twice, which is what
    // a meta slot exists to avoid rather than to produce.
    if (surface === "diary") {
      const date = this.dateLabel(file);
      return !date || date === this.hereText(file, surface) ? "" : date;
    }
    return "";
  }

  private menuFor(
    file: TFile,
    surface: BannerSurface,
    isIndex: boolean,
    host: HTMLElement
  ): ((menu: Menu) => void) | null {
    const build =
      surface === "journal"
        ? journalBannerMenu(this.plugin, file.path, isIndex)
        : sectionsMenuFor(this.plugin, file.path, () =>
            host.hasClass(WIDE_PAGE_CLASS)
          );

    return (menu: Menu) => {
      if (build) build(menu);
      if (build) menu.addSeparator();
      menu.addItem((i) =>
        i
          .setTitle("Banner art & settings…")
          .setIcon("palette")
          .onClick(() => this.openSettings())
      );
    };
  }

  // ── the tile ───────────────────────────────────────────────────────────

  // The reader's own glyph, or "" when they have not set one — in which case
  // the caller draws the ChronoAnvil mark instead.
  //
  // THE VAULT'S INITIALS USED TO BE THE FALLBACK, and they were the wrong
  // answer twice over: two letters derived from a folder name say nothing about
  // this plugin, and the square they sat in is the button you press to open
  // ChronoAnvil's settings. A mark is what that button should carry.
  private glyph(): string {
    return this.plugin.settings.banner.glyph.trim();
  }

  private openSettings(): void {
    // Obsidian's own settings window, opened at this plugin's tab. Not on the
    // public API, so it is probed and the failure is silent rather than a
    // thrown handler on a click — the tile is chrome and must never break a
    // note.
    const app = this.app as unknown as {
      setting?: {
        open?: () => void;
        openTabById?: (id: string) => void;
      };
    };
    try {
      app.setting?.open?.();
      app.setting?.openTabById?.(this.plugin.manifest.id);
    } catch {
      /* nothing to say: the tile is decoration if this is unavailable */
    }
  }
}

// Whether an in-note banner directive should draw nothing.
//
// THE FILE IS NOT REWRITTEN AND THAT IS THE POINT (4.51). `journal-header` and
// `entry-header` stay in every note; while the vault banner is on they render
// nothing, so turning it off restores every note exactly as it was. Nothing is
// migrated, nothing is retired, and a reader who dislikes the banner loses
// nothing by saying so.
//
// A LATER RELEASE MAKES THESE A SMALLER SECONDARY BANNER rather than deleting
// them — which is the other reason not to retire the words now.
export function bannerSuppressed(plugin: ChronoAnvilPlugin, path: string): boolean {
  return bannerSurfaceOf(path, bannerScopeOf(plugin)) !== null;
}

// The folders that decide who gets a banner, read off settings.
//
// ONE READING, TWO CALLERS, AND THEY MUST AGREE. The banner draws where this
// says, and the in-note directives go quiet where this says. If those were two
// readings of `settings.paths` that drifted by one folder, a reader would land
// on a note with NO banner of either kind — the failure nobody reports because
// it looks like nothing.
//
// REBUILT PER CALL RATHER THAN CACHED: a journal added in Settings changes this,
// and a cache would need telling.
export function bannerScopeOf(plugin: ChronoAnvilPlugin): BannerScope {
  const paths = plugin.settings.paths;
  return {
    flatNotes: [paths.home, paths.search].filter(Boolean),
    // THE ROOT FIRST AND THE GRAINS AFTER, and both are wanted even though the
    // grains normally sit under the root: a reader may point one grain outside
    // the diary, and `bannerSurfaceOf` takes the LONGEST match, so listing both
    // costs nothing and covers the folder note the grains do not.
    diaryFolders: [
      paths.diaryRoot,
      paths.diaryDaily,
      paths.diaryMonthly,
      paths.diaryWeekly,
      paths.diaryQuarterly,
      paths.diaryYearly,
    ].filter(Boolean),
    journalRoots: [
      paths.journalsRoot,
      ...(plugin.settings.customJournals ?? []).map((j) => j.root),
    ].filter(Boolean),
  };
}
