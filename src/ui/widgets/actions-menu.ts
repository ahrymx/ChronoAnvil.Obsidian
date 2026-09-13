// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The banner's action menu. 1.0.11.
//
// ONE ITEM PER ENABLED ACTION, in `PAGE_ACTIONS` order, and no other source of
// truth: the menu does not know what any action DOES and cannot be made to
// care. Adding a third is an entry in that table.
//
// ── WHY IT IS A MENU AND NOT THE ROW OF BUTTONS IT WAS ──────────────────
//
// The first cut drew one `.ca-journal-btn` per action as a band of the banner,
// and the vault answered in one screenshot: *"the button is appearing on the
// page without a stack group. It should also be a drop down context menu,
// similar to the cog wheel on the header banner."* Both halves of that are
// right. A row of call-to-action buttons under the page's own name outshouts
// the name; and a band needs a CARD to be a band of, which an unwelded banner
// fence does not have — `chromeClasses` withholds every banner class unless the
// block is a stack, so the row rendered loose on the page background between
// two boxes.
//
// A CONTROL IN THE CORNER NEEDS NEITHER. It is one glyph beside the name on
// every surface, welded or not, and it scales: a fourth action is a fourth item
// rather than a wider row.
//
// ── THE GLYPH IS NOT THE COG, AND THAT IS DELIBERATE ────────────────────
//
// `section-frame.ts` states the vocabulary and it is worth keeping: the cog
// "acts on the PAGE — its name, its sections", the ⋯ means "more things about
// this row". This menu is neither. It does things TO the note — copies it out,
// joins it to a day — and the vault banner's cog is on screen at the same time
// opening a different list, so wearing the same glyph would fork a meaning the
// plugin has been careful about since 4.20. `zap` is used nowhere else.
//
// ── THE PATH COMES FROM THE NOTE THE HEAD IS DRAWN FOR ──────────────────
//
// Not from the workspace. The active file is a different question with a
// different answer in a split pane, a hover preview or a sidebar leaf, and
// `core/page-actions.ts` opens with why that distinction is the reason this
// table is not `ACTIONS`. The head already resolved its own file; this takes
// the path from there.
//
// ── AND AN EMPTY MENU IS NO CONTROL AT ALL ──────────────────────────────
//
// `discoverability.test.ts`'s rule, which `sectionsMenuFor` and
// `journalBannerMenu` both already follow: *a menu that opens and then explains
// it cannot help is worse than no menu.* Turning both actions off in Settings,
// or landing on a surface where both refuse, draws nothing — so the decision is
// made before the button exists rather than by a menu that opens empty.

import { Menu, setIcon } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { pageActionsOn } from "../../core/page-actions";
import type { PageAction } from "../../core/page-actions";

export const ACTIONS_CONTROL_CLASS = "ca-jph-actions";

// Draw the control into the head's title row, or draw nothing.
export function addPageActionsControl(
  host: HTMLElement,
  plugin: ChronoAnvilPlugin,
  path: string
): HTMLElement | null {
  const actions = drawable(plugin, path);
  if (!actions.length) return null;

  const button = host.createDiv({
    cls: ACTIONS_CONTROL_CLASS,
    attr: { "aria-label": "Page actions" },
  });
  setIcon(button, "zap");
  // BUILT ON CLICK, which is `overflowButton`'s rule and for its reason: this
  // control is on every ChronoAnvil page in the vault, so the menu describes the
  // note as it is when opened rather than as it was when the head rendered.
  button.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new Menu();
    for (const action of drawable(plugin, path)) {
      menu.addItem((item) =>
        item
          .setTitle(action.label)
          .setIcon(action.icon)
          .onClick(() => void action.run(plugin, path))
      );
    }
    menu.showAtMouseEvent(evt);
  });
  return button;
}

// Which actions this note gets, settings and `when` both applied.
//
// AN UNRECOGNISED NOTE GETS NOTHING. The line is composed by a banner, so the
// surface is normally settled — but a reader who copied a banner fence into an
// ordinary note has a page no catalogue reads, and every action here is defined
// in terms of a surface. Offering items whose `when` could not be asked would be
// guessing on the reader's file.
function drawable(
  plugin: ChronoAnvilPlugin,
  path: string
): readonly PageAction[] {
  const opts = plugin.settings.pageActions;
  if (!opts.enabled) return [];
  const surface = plugin.sections.modelForNote(path)?.surface;
  if (!surface) return [];
  return pageActionsOn(opts.off).filter(
    (a) => !a.when || a.when({ path, surface })
  );
}
