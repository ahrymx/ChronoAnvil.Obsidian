// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The page's cog, and the width it writes. What is LEFT of 4.5 §4.
//
// ── THIS FILE DREW THE PAGE HEAD, AND HAS NOT SINCE 4.10 ─────────────────
//
// `buildPageTitle` was the head: the note's name, large, click-to-edit, a cog in
// the far corner, and under it a row of small-caps links to Home, Diary and
// Journals composed from the `title:` directive's argument. 4.10 replaced it
// with `livePageHead` — an eyebrow, the name and a context strip, repainting on
// the note's own frontmatter — and pointed the dispatcher's `case "title"` at
// that instead. The old head was never deleted. It sat here unreferenced for a
// year while the grammar went on documenting `title:home,diary,journals`, eight
// catalogues went on composing it, and nine assertions went on describing a pill
// row nothing drew, all of them passing because every one of them read what this
// file SAID rather than what any page rendered.
//
// It was deleted in 5.2, with the argument that fed it. `test/dead-code.test.ts`
// is what would have caught it: no module imported this one's head, and the
// import graph says so in a way a source sweep cannot.
//
// ── WHAT SURVIVED, AND WHY IT LIVES HERE ─────────────────────────────────
//
// The cog outlived the card it sat in. `sectionsMenuFor` is the menu behind it —
// *Edit sections…*, *Add a section…*, *Wide page* — and since 4.51.1 the vault
// banner opens THIS menu rather than a second one, on the argument that the cog
// may move but what it offers must not fork. `setWide` is the write behind its
// one checkable item.
//
// NO COG WHERE THERE IS NOTHING TO OFFER. `sectionsMenuFor` returns null on a
// note the section machinery does not recognise, and the caller then draws no
// control at all — the rule `discoverability.test.ts` states: a menu that opens
// and then explains it cannot help is worse than no menu.
//
// AND THE DESTINATIONS ARE NOT LOST: `resolveTarget` still answers for all
// three ids, so `links:home,diary,journals` draws that row for a reader who
// asks. (Not "the launcher already draws them" — that claim is in three
// comments in this tree and is false: the launcher's default is the four period
// dashboards. See `PAGE_TITLE_LINE` in note-sections.ts.)

import { TFile } from "obsidian";
import type { Menu } from "obsidian";

import type ChronoAnvilPlugin from "../../main";
import { getFile } from "../../core/util";
import { setPageWide } from "../../core/note-sections";

// Whether this note has sections anything can edit, and the items if it does.
//
// SEPARATED FROM THE DRAWING so the "draw no control" decision is made once and
// before the button exists, rather than by a menu that opens empty.
// EXPORTED SINCE 4.51.1, SO THE VAULT BANNER'S COG OPENS THIS MENU AND NOT A
// SECOND ONE. That banner drew its own two items — *Edit sections…* and *Add a
// section…* — and silently dropped *Wide page*, which is the setting a
// dashboard's reader is most likely to want and the one with no other door. The
// same argument `journalBannerMenu` was split out for, on the other surface: the
// cog moves, what it offers must not fork.
//
// `isWide` IS A CALLBACK, NOT THE CARD. It was the card only to read one class
// off it, and the vault banner has no card — it has the view, which
// `page-width.ts` marks with `WIDE_PAGE_CLASS`. Both are the same argument this
// function already made about reading the RENDER rather than the file: *the
// menu is built on click, so by the time this runs the marker is the note's
// answer.* A callback is what lets each caller name its own marker without this
// function learning about either.
export function sectionsMenuFor(
  plugin: ChronoAnvilPlugin,
  notePath: string,
  isWide: () => boolean
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
    const wide = isWide();
    menu.addItem((i) =>
      i
        .setTitle("Wide page")
        .setIcon("move-horizontal")
        .setChecked(wide)
        .onClick(() => void setWide(plugin, notePath, !wide))
    );
  };
}

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
  plugin: ChronoAnvilPlugin,
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
