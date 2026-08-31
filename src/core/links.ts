// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The "Home · Weekly Overview · Monthly Overview · All Entries" quick-link row
// every dashboard/template used to hand-write as a `[!nav]` callout —
// plain wikilinks with an emoji baked into each alias. Those emoji
// couldn't become real icons without a widget (a markdown link's alias is
// just static text), and the paths inside them (e.g.
// "02 - Diary/Daily/Daily") were hardcoded, so renaming a folder in
// Settings silently broke them — unlike every other widget in the plugin.
// This one call site fixes both: real Lucide icons, matching the per-entry
// `nav` widget right below it on most pages, and paths read live from
// settings (or, for `up`, from the note's own location in the vault).
//
//   ```chronoanvil
//   links:home,week,month,quarter,year,all
//   ```
//
// Reuses .journal-nav's own pill/icon styling wholesale (same border-top/
// bottom strip, same .jn-pill/.jn-muted/.jn-icon classes) rather than
// inventing a parallel look — this row and the per-entry navigator are the
// same family of control, just with a fixed set of destinations instead of
// prev/next neighbours.

import { Menu, App, MarkdownPostProcessorContext, setIcon, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { openCapture } from "../diary/capture";
import {
  resolveOverviewPath,
  getFile,
  noExt,
  openFile,
  folderNotePath,
} from "./util";

export interface LinkTarget {
  // A destination that doesn't exist until you go there — Today's entry is
  // created on click rather than being a file to link at. When set, this runs
  // instead of opening `file`, and the pill stays live even with `file: null`
  // (which otherwise means "nowhere to go" and renders muted).
  action?: () => void;
  icon: string;
  label: string;
  file: TFile | null;
}

// "up" = the folder-note one level above the current note, resolved from
// the note's own location rather than a token baked in at creation time —
// so it stays correct even if the note (or its parent) gets moved or
// renamed later. Self-detects whether the current note IS a folder-note
// (self-titled to match its own folder, e.g. "Topic/Topic.md" — up is the
// folder above that one) or a plain leaf note living inside a folder (e.g.
// a lesson note inside "Topic/" — up is that note's own folder).
function resolveUp(app: App, file: TFile): LinkTarget {
  const parent = file.parent;
  const isFolderNote = !!parent && file.basename === parent.name;
  const target = isFolderNote ? parent?.parent ?? null : parent;
  const hasTarget = !!target && target.path !== "";
  return {
    icon: "corner-left-up",
    label: hasTarget ? target!.name : "Up",
    file: hasTarget ? getFile(app, `${target!.path}/${target!.name}.md`) : null,
  };
}

// WHERE A DESTINATION ID RESOLVES TO, AND THE ONLY PLACE IT DOES. Exported in
// 4.5 for the launcher (`ui/widgets/launcher.ts`), which draws the same
// destinations as tiles rather than as pills. Two tables would be two answers
// to "where does `search` go", and the second would be the one nobody updates.
//
// A NULL IS A DESTINATION THAT IS NOT THERE, and every caller must skip it
// rather than draw it — `nothing dead is drawn`, which for navigation means a
// tile that goes nowhere is not a tile.
export function resolveTarget(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  id: string
): LinkTarget | null {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  switch (id) {
    case "home":
      return { icon: "home", label: "Home", file: getFile(app, paths.home) };
    case "today":
      // The one entry point in a row that is otherwise six dashboards. Before
      // 2.53 there was no route from any overview to the note you actually
      // write in — you went via the calendar or the command palette.
      return {
        icon: "sun",
        label: "Today",
        file: null,
        action: () => void plugin.diary.openToday(),
      };
    case "week":
      return {
        icon: "calendar",
        label: "Week",
        file: getFile(app, resolveOverviewPath(app, paths, "weekly")),
      };
    case "month":
      return {
        icon: "calendar-days",
        label: "Month",
        file: getFile(app, resolveOverviewPath(app, paths, "monthly")),
      };
    case "all":
      // Points at the Search note's timeline, not Diary.base. The `.base`
      // table is good for scanning properties and useless for reading, because
      // the one thing it can't show is what you actually wrote — and "All
      // Entries" is a reading destination. The table is still reachable as
      // `base` below for anyone who wants the columns.
      return {
        icon: "list",
        label: "All entries",
        file: getFile(app, paths.search),
      };
    case "quarter":
      return {
        icon: "calendar",
        label: "Quarter",
        file: getFile(app, resolveOverviewPath(app, paths, "quarterly")),
      };
    case "year":
      return {
        icon: "calendar",
        label: "Year",
        file: getFile(app, resolveOverviewPath(app, paths, "yearly")),
      };
    // ── The two folder-note dashboards and the capture window (4.5) ──
    //
    // DERIVED FROM THE CONFIGURED ROOTS, not from settings keys of their own —
    // `section-insert.ts` resolves the same two notes the same way, and 4.1
    // §2.5's argument holds here too: rename the folder and the path follows,
    // where a configured one would go stale.
    case "diary":
      return {
        icon: "calendar-days",
        label: "Diary",
        file: getFile(app, folderNotePath(paths.diaryRoot)),
      };
    case "journals":
      return {
        icon: "library",
        label: "Journals",
        file: getFile(app, folderNotePath(paths.journalsRoot)),
      };
    case "capture":
      // A DESTINATION THAT IS NOT A FILE, which is the shape `today` already
      // uses: the reader is going somewhere, and where they land is a window.
      return {
        icon: "pencil-line",
        label: "Capture",
        file: null,
        action: () => openCapture(plugin, file),
      };
    case "search":
      return {
        icon: "search",
        label: "Search",
        file: getFile(app, paths.search),
      };
    case "base":
      return {
        icon: "table",
        label: "Diary Table",
        file: getFile(app, `${paths.infrastructureRoot}/Diary.base`),
      };
    case "up":
      return resolveUp(app, file);
    default:
      return null;
  }
}

// Render one resolved destination into a row. Shared by both entry points so
// the pill, the muted fallback and the hover-preview wiring exist once.
function renderTarget(
  app: App,
  wrap: HTMLElement,
  target: LinkTarget,
  sourcePath: string
): void {
  if (target.action) {
    const a = wrap.createEl("a", { cls: "ca-jn-pill", href: "#" });
    setIcon(a.createSpan({ cls: "ca-jn-icon" }), target.icon);
    a.createSpan({ text: target.label });
    a.addEventListener("click", (evt) => {
      evt.preventDefault();
      target.action?.();
    });
    return;
  }

  if (!target.file) {
    // Destination doesn't exist yet (e.g. "up" before the parent index
    // note has been created) — same muted, non-clickable treatment the
    // per-entry navigator uses for "no neighbour" instead of a dead link.
    const muted = wrap.createSpan({ cls: "ca-jn-flat ca-jn-muted" });
    setIcon(muted.createSpan({ cls: "ca-jn-icon" }), target.icon);
    muted.createSpan({ text: target.label });
    return;
  }

  const targetFile = target.file;

  // "You are here". Every period dashboard carries the full ladder from 2.52
  // — home, week, month, quarter, year, all — rather than a hand-picked subset
  // per page, and the pill for the note you are on is marked and stops
  // navigating instead of being omitted.
  //
  // Omitting it was the old behaviour, and it is what made the row unlearnable:
  // a set of pills whose contents change per page is a menu you have to read
  // every time, where six in a fixed order with one lit is a position
  // indicator you can read at a glance. It also left real holes — the year
  // could not reach the quarter, the quarter could not reach the week, and a
  // monthly review had no route to the quarter it feeds.
  if (targetFile.path === sourcePath) {
    const here = wrap.createSpan({ cls: "ca-jn-flat ca-jn-here", attr: { "aria-current": "page" } });
    setIcon(here.createSpan({ cls: "ca-jn-icon" }), target.icon);
    here.createSpan({ text: target.label });
    return;
  }

  const href = noExt(targetFile.path);
  const a = wrap.createEl("a", {
    cls: "internal-link ca-jn-pill",
    href,
    attr: { "data-href": href },
  });
  setIcon(a.createSpan({ cls: "ca-jn-icon" }), target.icon);
  a.createSpan({ text: target.label });
  a.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(app, targetFile);
  });
  a.addEventListener("mouseover", (evt) => {
    app.workspace.trigger("hover-link", {
      event: evt,
      source: "ca-links",
      hoverParent: wrap,
      targetEl: a,
      linktext: href,
      sourcePath,
    });
  });
}

// links:<id>[,<id>...][#<area>] — ids: home | week | month | quarter | year |
// all | search | base | up
//
// With no `#area`, the pills render bare (`.ca-journal-links`) — the inline form
// the overview header bars anchor, and the shape callers appended straight into
// a header group. With `#diary` (or `#journals`), the pills are wrapped in a
// contained bar capped by that area's titlebar (the same `ca-titlebar` the home
// page uses on its Diary/Journals cards), forming one standalone card — the
// block a diary entry carries up under the spacer, distinct from the entry card
// below it.
// The review scopes, in ladder order, as the `scopes` control offers them.
//
// The row used to carry all five as pills alongside Home. At the labels they
// needed — "Quarterly Overview" is eighteen characters — six pills could not
// fit one row on a desktop pane, let alone a phone: the bar wrapped to two
// ragged lines with the second half empty, and on mobile to three or four.
//
// Folding them into one menu costs the thing 2.52 widened the ladder *for* —
// six pills in a fixed order with one lit is a position you can read at a
// glance, where a subset is a menu you have to open. So the button is labelled
// with the scope you are on rather than with a generic "Overviews", which keeps
// the indicator and the compactness both. It only degrades to a generic label
// on a note that is none of the scopes, where there is no position to show.
const SCOPES = ["week", "month", "quarter", "year", "all"] as const;

// The scopes that exist in this vault, and which of them this note IS.
//
// EXPORTED IN 4.51.5 so the vault banner offers the same five in the same order
// with the same "you are here" reading, rather than listing them again. The row
// this control used to sit on is gone from a diary entry — the bar draws its
// four destinations — and the scope menu is the one thing that row had which
// the bar had not. Moving a control is not a reason to re-derive what it holds.
export function reviewScopes(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  sourcePath: string
): { targets: LinkTarget[]; here: LinkTarget | undefined } {
  const targets = SCOPES.map((id) => resolveTarget(plugin, file, id)).filter(
    (t): t is LinkTarget => t != null
  );
  return { targets, here: targets.find((t) => t.file?.path === sourcePath) };
}

// The scope menu, anchored to the row's right edge.
//
// Right rather than left because the two pills beside it are fixed
// destinations — Home and Today are where you *go*, and the scope control is
// where you *are*. Splitting them across the row says which is which without a
// separator, and matches `up`, the row's other trailing control.
function renderScopes(
  plugin: ChronoAnvilPlugin,
  wrap: HTMLElement,
  file: TFile,
  sourcePath: string
): void {
  const { targets: resolved, here } = reviewScopes(plugin, file, sourcePath);

  const btn = wrap.createEl("a", {
    cls: "ca-jn-pill ca-jn-scopes" + (here ? " is-here" : ""),
    href: "#",
    attr: { "aria-label": "Choose a review scope" },
  });
  setIcon(btn.createSpan({ cls: "ca-jn-icon" }), here?.icon ?? "calendar");
  btn.createSpan({ text: here?.label ?? "Overviews" });
  setIcon(btn.createSpan({ cls: "ca-jn-caret" }), "chevron-down");

  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    const menu = new Menu();
    for (const target of resolved) {
      menu.addItem((i) => {
        i.setTitle(target.label).setIcon(target.icon);
        // The scope you are on is checked rather than hidden — a menu whose
        // contents change per page is the thing this control exists to avoid.
        if (target.file?.path === sourcePath) i.setChecked(true);
        const dest = target.file;
        i.setDisabled(dest == null);
        i.onClick(() => {
          if (dest) void openFile(plugin.app, dest);
        });
      });
    }
    menu.showAtMouseEvent(evt);
  });
}

// Which vault root a links row belongs to, from the `#area` token.
//
// MOVED HERE IN 4.8.1, when `area-titlebar.ts` was deleted. It named a strip
// that no longer exists; what survives it is the token `links:…#diary` — which
// now decides one thing only, the tint of the card the row is welded into. A
// type with one meaning belongs beside its one reader.
export type VaultArea = "diary" | "journals";

export function buildLinks(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  ids: string[],
  area?: VaultArea
): HTMLElement {
  const app = plugin.app;

  const nav = createDiv({ cls: "ca-journal-nav ca-journal-links" });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return area ? wrapInCard(nav, area) : nav;

  // "up" is a step out of the current container, not a fixed jump like Home —
  // it reads better anchored to the row's right edge (the direction "out"
  // points, and where a breadcrumb's own "back up a level" implication sits)
  // than shoulder-to-shoulder with Home on the left. Reuses `.ca-jn-right`
  // (margin-left: auto), the same right-anchoring the per-entry navigator
  // already uses for its own trailing control.
  let right: HTMLElement | null = null;
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (id === "scopes") {
      right ??= nav.createSpan({ cls: "ca-jn-right" });
      renderScopes(plugin, right, file, ctx.sourcePath);
      continue;
    }
    const target = resolveTarget(plugin, file, id);
    if (!target) continue;
    if (id === "up") {
      right ??= nav.createSpan({ cls: "ca-jn-right" });
      renderTarget(app, right, target, ctx.sourcePath);
    } else {
      renderTarget(app, nav, target, ctx.sourcePath);
    }
  }

  return area ? wrapInCard(nav, area) : nav;
}

// Wrap a bare links row in a card, so it reads as one contained object rather
// than a row of pills floating between two rules. Adds `.ca-journal-links-bar` so
// the pills drop their own `.ca-journal-nav` border strip.
//
// THE TITLEBAR IT WAS BUILT AROUND IS GONE (4.8.1). The card was capped by a
// tinted strip naming the vault root — `DIARY … Daily entry` — and above it the
// block's own head now says what the block is. Two bars over one row, and the
// tinted one was the weaker: it named a FOLDER, where the head names the thing.
// The breadcrumb trail went with it, along with the two functions that computed
// one; nothing else read them.
//
// `plugin` and `file` are gone with the trail rather than kept "in case": an
// unused parameter is a promise that this function still knows something about
// the note, and it does not.
function wrapInCard(nav: HTMLElement, area: VaultArea): HTMLElement {
  const card = createDiv({ cls: `ca-journal-links-card ca-journal-links-card-${area}` });
  nav.addClass("ca-journal-links-bar");
  card.appendChild(nav);
  return card;
}


// The banner's own utility nav (2.21.1) — the destination that doesn't map onto
// a calendar surface. Since 2.21 the calendar *is* the overview navigator (its
// month title opens the Monthly Overview, the year opens The Year, and each week
// gutter opens that week's Weekly Overview), so the old five-pill `diary-links`
// block below the stats had nothing left to carry but "All Entries" and
// "Search". Those folded into the greeting's header row instead of standing as a
// bordered block of their own — the point of the move being that the banner
// keeps only "what do I do today" and hands every jump-to-an-overview to the
// calendar under it.
//
// AND "ALL" WENT IN 4.13.2 §1, which is the same argument one step further. The
// row sits on a card that is a month grid, under a page head whose whole job is
// naming where you are in the vault — and *All entries* is the diary folder,
// which that head links. The move that took the overview links off this row for
// being reachable from the calendar takes this one off for being reachable from
// the head.
//
// A LIST OF ONE IS STILL A LIST. `buildBannerLinks` takes an `ids` override and
// this is its default; narrowing the default rather than passing `["search"]` at
// the single call site keeps one statement of what the row is, instead of a
// constant saying one thing and the only caller saying another.
//
// Rendered bare with the `.ca-jdh-nav` class so diary-header.ts can place it in the
// strip; it reuses the same pill/hover wiring as every other nav row
// (renderTarget) rather than inventing a parallel look.
const BANNER_LINK_IDS = ["search"];

export function buildBannerLinks(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  ids?: string[]
): HTMLElement {
  const app = plugin.app;
  const wrap = createDiv({ cls: "ca-journal-nav ca-journal-links ca-jdh-nav" });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return wrap;

  const list = (ids ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const id of list.length ? list : BANNER_LINK_IDS) {
    const target = resolveTarget(plugin, file, id);
    if (!target) continue;
    renderTarget(app, wrap, target, ctx.sourcePath);
  }

  return wrap;
}
