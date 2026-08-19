// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The page's own name, large, with the control that acts on the page. 4.5 §4.
//
// ── WHAT IT IS, AND WHAT IT IS NOT ───────────────────────────────────────
//
// This answers 4.4 §4, which asked whether the homepage grows a page-level band
// or whether the diary card already is one. It grows one, and it is NOT a band:
// the reference design's masthead carries a title and two stat tiles, and this
// carries a title, its destinations and a control.
//
// ── AND IT WILL NEVER CARRY NUMBERS. SETTLED IN 4.10 §5 ──────────────────
//
// 4.5 §5 deferred the reference design's stat tiles on the grounds that "a
// masthead wanting numbers is a release with an argument about which numbers",
// and RESUME carried it as an open item for five releases. The argument, now
// that it has been had:
//
// A NUMBER HAS TO SAY WHAT IT COUNTED. Almanac's stat strip does — it sits in
// the page body beside the thing it is measuring, with room for a caption and a
// scope. A masthead tile has room for a digit and a word, so it can only be
// read against the page it is on: "12" on a weekly dashboard is twelve of
// something, and the tile cannot say which without becoming the strip.
//
// AND THE HEAD IS ABOUT THE PAGE, NOT ITS CONTENTS. Its three facts are the
// page's name, where it can go, and how to edit it — none of which change when
// the vault does. A number is the opposite kind of fact, and a head that
// sometimes reported one would stop being the thing a reader learns to ignore
// once they know where they are.
//
// This is closed rather than deferred. A release that wants numbers on a
// dashboard wants the stat strip, which already exists.
//
// The diary card's greeting stays what it is. "Good evening" is about TODAY;
// this is the name of the PAGE. They are two sentences about different things
// that happen to sit near each other.
//
// ── THE NAME IS THE FILE'S ───────────────────────────────────────────────
//
// Not a `title` property. The argument is older than this widget and is written
// where the same decision was made for journal notes: the filename is what the
// quick switcher, the graph, every backlink and every table display, and storing
// a second title in frontmatter would let those disagree. So the card shows
// `file.basename`, and editing it renames the file — through `attachNoteRename`,
// which is that same control extracted rather than copied.
//
// ── AND THE COG IS NOT BESIDE THE TITLE ──────────────────────────────────
//
// `study-header.ts` puts its ⋯ in the crumb row and says why: *"a control next
// to it would be a control one slip away from renaming the note."* The title
// here is click-to-edit for exactly the same reason it is there, so the cog goes
// to the far corner. The reference design happens to put its cog in the same
// place, which is the same answer reached for a different reason.
//
// NO COG WHERE THERE IS NOTHING TO OFFER. `sectionsMenuFor` returns false on a
// note the section machinery does not recognise, and then the card draws a title
// and no control — which is what the ⋯ already does, and for the reason
// discoverability.test.ts states: a menu that opens and then explains it cannot
// help is worse than no menu.
//
// ── AND IT CARRIES THE PAGE'S DESTINATIONS (4.10) ────────────────────────
//
// This was drawn on ONE page for five releases. `sectionsMenuFor` is gated on
// `canEditSections`, which answers yes for the homepage, Search, both folder-note
// dashboards, the four period dashboards, entries and journal notes — so the
// section editor worked on nine surfaces and was clickable on one, because only
// `home-sections.ts` composed the keyword. 4.10 composes it onto the six other
// dashboards, and a head that is going to open every one of them may as well be
// where the page says where it can go.
//
// THREE DESTINATIONS, AND THEY ARE NOT THE `links:` ROW'S. This carries where
// you are in the VAULT — Home, Diary, Journals. The `links:` row carries where
// you are in TIME — Today, and the scope ladder. They are two questions and both
// rows stay; what changes is that `home` leaves the composed `links:` line,
// because it is the one destination they both had.
//
// ── DRAWN AS ITS OWN THING, NOT AS `renderTarget`'S PILLS ────────────────
//
// `resolveTarget` is reused wholesale — it is the one table that answers "where
// does `diary` go", and a second would be the one nobody updates. `renderTarget`
// is NOT, and that is the deliberate half: it draws `.jn-pill`, and a pill row
// inside this card would make the head read as one more card with one more pill
// row in it. The head is the page; the way it says so is a face and a ground
// nothing else in the plugin uses, and small-caps links rather than pills.
//
// The cost, stated rather than hidden: an entry's `links:` row and this do not
// match, and will not until entries are brought along.

import { setIcon, TFile } from "obsidian";
import type { Menu, MarkdownPostProcessorContext } from "obsidian";

import type AlmanacPlugin from "../../main";
import { getFile, noExt, openFile } from "../../core/util";
import { resolveTarget } from "../../core/links";
import { setPageWide } from "../../core/note-sections";
import { attachNoteRename } from "../header-title";
import { settingsButton } from "../section-frame";

// Whether this note has sections anything can edit, and the items if it does.
//
// SEPARATED FROM THE DRAWING so the "draw no control" decision is made once and
// before the button exists, rather than by a menu that opens empty.
function sectionsMenuFor(
  plugin: AlmanacPlugin,
  notePath: string,
  card: HTMLElement
): ((menu: Menu) => void) | null {
  // `editSectionsHere` and `addSectionHere` both resolve the surface themselves
  // and both report when they cannot. What is asked here is the narrower
  // question the CONTROL depends on: is this a note either of them will do
  // anything for. The homepage, Search and the two dashboards all answer yes.
  if (!plugin.sections.canEditSections(notePath)) return null;

  return (menu: Menu) => {
    menu.addItem((i) =>
      i
        .setTitle("Edit sections…")
        .setIcon("layout-list")
        .onClick(() => void plugin.sections.editSectionsHere(notePath))
    );
    menu.addItem((i) =>
      i
        .setTitle("Add a section…")
        .setIcon("plus")
        .onClick(() => void plugin.sections.addSectionHere(notePath))
    );

    // ── HOW WIDE THE PAGE IS (4.11) ──────────────────────────────────
    //
    // THE SETTING THE HOMEPAGE HAD AND NOBODY ELSE COULD ASK FOR. A page of
    // widgets is not a page of prose: a row splits the pane, so Obsidian's
    // *readable line length* silently decides whether each cell is above or
    // below the 520px at which every widget in this plugin collapses — at its
    // 700px default a two-cell row renders collapsed. The homepage has said so
    // in its frontmatter since 4.2. This is that, for every dashboard, in a
    // place a reader can reach.
    //
    // A SEPARATOR FIRST, because the two items above act on the page's SECTIONS
    // and this acts on the page. One list of three would read as three ways of
    // editing the same thing.
    //
    // CHECKED FROM THE CARD, NOT FROM THE FILE. The class was put there by the
    // render, from the note, and the menu is built on click — so by the time
    // this runs the marker *is* the note's answer, and a second read would be a
    // second source of truth for one fact. `links.ts` marks a checked item the
    // same way.
    menu.addSeparator();
    const wide = card.hasClass(WIDE_CLASS);
    menu.addItem((i) =>
      i
        .setTitle("Wide page")
        .setIcon("move-horizontal")
        .setChecked(wide)
        .onClick(() => void setWide(plugin, notePath, !wide))
    );
  };
}

// The mark the cog reads its own checkbox from. Spelled once, here and in the
// dispatcher that puts it on, so the two cannot drift.
//
// IT IS NO LONGER WHAT MAKES THE PAGE WIDE (4.45.1). The stylesheet used to
// reach up for this class with `:has()`, and stopped when the card scrolled out
// of the DOM; the width is derived from the file now, by `ui/page-width.ts`.
// What this still does is answer the menu, which is a question about the card
// in front of the reader and not about the page — see `menu` above, which
// argues for reading it here rather than reading the file a second time.
export const WIDE_CLASS = "jtc-wide";

// Write the page's width into the note that asked for it.
//
// READS THE FILE AT THE MOMENT OF THE CLICK rather than trusting what was
// rendered, which is the same shape `setTasksScope` uses one file over: the note
// may have changed since the head was drawn, and `setPageWide` splices one line
// into the text it is given.
//
// NOTHING IS WRITTEN WHEN NOTHING WOULD CHANGE. `setPageWide` returns null for
// that and for a note with no head at all — a `vault.modify` that leaves a file
// identical still moves its modified time, which is a lie about the reader's
// vault that sync then propagates.
async function setWide(
  plugin: AlmanacPlugin,
  notePath: string,
  on: boolean
): Promise<void> {
  const file = getFile(plugin.app, notePath);
  if (!(file instanceof TFile)) return;
  const text = await plugin.app.vault.read(file);
  const out = setPageWide(text, on);
  if (out === null) return;
  await plugin.app.vault.modify(file, out);
}

// One destination, as a small-caps link rather than a pill.
//
// THREE CASES, AND THEY ARE `renderTarget`'S THREE — an id that opens a window
// rather than a file, the page you are already on, and a file to go to. The
// fourth, a destination that does not resolve, never reaches here: `nothing dead
// is drawn` means a Journals link on a vault with no journals root is not drawn
// at all, and that decision is made by the caller so this function has one job.
function renderLink(
  plugin: AlmanacPlugin,
  wrap: HTMLElement,
  id: string,
  sourcePath: string,
  file: TFile
): void {
  const target = resolveTarget(plugin, file, id);
  // A DESTINATION THAT IS NOT THERE IS NOT A LINK. `resolveTarget` returns null
  // for an id it does not know and a null `file` for one that does not exist —
  // no journals root, no Journals link, rather than one that opens nothing.
  if (!target || (!target.file && !target.action)) return;

  // THE PAGE YOU ARE ON IS LIT, NOT OMITTED. `links.ts` argues this at length
  // and the argument is the same here: a row whose contents change per page is a
  // menu you have to read every time, where a fixed set with one lit is a
  // position you can read at a glance.
  if (target.file?.path === sourcePath) {
    const here = wrap.createSpan({
      cls: "jtc-link is-here",
      attr: { "aria-current": "page" },
    });
    setIcon(here.createSpan({ cls: "jtc-link-icon" }), target.icon);
    here.createSpan({ text: target.label });
    return;
  }

  if (target.action) {
    const a = wrap.createEl("a", { cls: "jtc-link", href: "#" });
    setIcon(a.createSpan({ cls: "jtc-link-icon" }), target.icon);
    a.createSpan({ text: target.label });
    a.addEventListener("click", (evt) => {
      evt.preventDefault();
      target.action?.();
    });
    return;
  }

  const dest = target.file;
  if (!dest) return;
  const href = noExt(dest.path);
  const a = wrap.createEl("a", {
    cls: "internal-link jtc-link",
    href,
    attr: { "data-href": href },
  });
  setIcon(a.createSpan({ cls: "jtc-link-icon" }), target.icon);
  a.createSpan({ text: target.label });
  a.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(plugin.app, dest);
  });
  // The hover preview every other navigation row in the plugin offers.
  a.addEventListener("mouseover", (evt) => {
    plugin.app.workspace.trigger("hover-link", {
      event: evt,
      source: "almanac-page-title",
      hoverParent: wrap,
      targetEl: a,
      linktext: href,
      sourcePath,
    });
  });
}

// `ids` is what the directive asked for — `title:home,diary,journals`. Empty is
// the bare `title`, which draws the name and the cog and nothing else, and is
// what the homepage composes: it already has the launcher doing this job as
// CONTENT in a cell, and a second copy as chrome would be the same four
// destinations twice on one page.
export function buildPageTitle(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  ids: readonly string[] = []
): HTMLElement {
  const root = createDiv({ cls: "jtc-card" });
  const file = getFile(plugin.app, ctx.sourcePath);
  if (!(file instanceof TFile)) return root;

  const row = root.createDiv({ cls: "jtc-row" });
  const titleRow = row.createDiv({ cls: "jtc-titlerow" });
  attachNoteRename(plugin.app, titleRow, file, "jtc-title");

  const build = sectionsMenuFor(plugin, ctx.sourcePath, root);
  if (build) {
    // `settingsButton` builds its menu ON CLICK, which is what keeps this cheap
    // on a note that renders it on every open and correct when the note has
    // changed since it was drawn. The cog rather than a ⋯ because the control
    // acts on the PAGE — its name, its sections — and as of 4.20 it is the same
    // control on all three banners rather than this one's alone.
    settingsButton(row, "jtc-cog", build);
  }

  // THE SECOND ROW, AND ONLY WHERE THERE IS SOMETHING IN IT. An empty strip
  // under the title is height spent on nothing, which on a head whose whole
  // brief was "minimal" is the one thing it must not do. It is also what keeps
  // the homepage's bare `title` byte-identical to what it drew before.
  //
  // BUILT AFTER THE COG, so the two rows are in the order they are read; the
  // stylesheet does not depend on it, but a reader of this function should not
  // have to reconcile source order with screen order.
  const wanted = ids.map((s) => s.trim()).filter((s) => s.length > 0);
  if (!wanted.length) return root;
  const nav = createDiv({ cls: "jtc-nav" });
  for (const id of wanted) renderLink(plugin, nav, id, ctx.sourcePath, file);
  // AND AN EMPTY ROW IS NOT DRAWN EITHER. Every id can decline — a vault with no
  // journals root and no diary root leaves nothing to show — and the check is
  // made on what was BUILT rather than on what was asked for, because those are
  // different numbers and only one of them is about the page.
  if (nav.childElementCount) root.appendChild(nav);
  return root;
}
