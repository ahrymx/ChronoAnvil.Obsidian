// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The control a TITLE'S ROW carries in "what's below this note". 4.50.
//
// ── IT IS 4.48'S MOVE, ONE SURFACE OVER ──────────────────────────────────
//
// That release took four `<select>` boxes off a section's editor row and put a
// `⋯` on the cell each one described, because *"a stats cell is the one place
// in this plugin where the object being configured and the control that
// configures it can be the same object."* A title's row in `kind-table` is the
// second such place. Everything on it — what its pages are built from, whether
// it should still exist — is a fact about that one note, and the row IS that
// note.
//
// `overflowButton` already means exactly this, in `section-frame.ts`'s own
// words: *"more things about this row, a cell, a card inside a page."*
//
// ── FLAT, WITH NO SUBMENU ────────────────────────────────────────────────
//
// 4.47's outcome §5 settled it: `setSubmenu` is not on Obsidian's public types,
// so it has to be probed, and a probe that fails must still leave the setting
// reachable. A flat menu has nothing to probe. The layout rows are headed by a
// disabled title instead, which is what a reader needs to know they are rows
// about PAGES rather than about the note.
//
// ── AND NOTHING REPAINTS ANYTHING ────────────────────────────────────────
//
// `level-index` and `kind-table` are `liveScopedWidget`s watching the folder,
// so the frontmatter write and the trash are themselves the events that redraw
// the table. A `repaintOpenNotes` here would be a second redraw of a table that
// had already redrawn — see 4.48, where the missing one was the bug.

import { Menu, TAbstractFile, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { overflowButton } from "../section-frame";
import { promptAction } from "../modals";
import { childFiles, frontmatterOf, getFile, plural } from "../../core/util";
import {
  trashClause,
  trashDestination,
  trashItem,
  trashSeveral,
} from "../../core/trash";
import { notify } from "../../core/notify";
import type { JournalKind, JournalType } from "../../journals/journal";
import {
  isPromotedPath,
  pageLayoutChoices,
  pageLayoutOf,
  pageLayoutShown,
  pagePathsOf,
} from "../../journals/page-default";

/** Everything the menu needs that is a fact about the table, not about a row. */
export interface KindRowContext {
  plugin: ChronoAnvilPlugin;
  type: JournalType;
  kind: JournalKind;
}

// The `⋯` for one title, hung in the row's actions slot.
export function attachKindRowMenu(
  table: KindRowContext,
  actions: HTMLElement,
  file: TFile
): void {
  // THE ROW IS IDENTIFIED BY A PATH, NEVER BY THE `TFile` (4.50.2).
  //
  // Obsidian MUTATES a `TFile` in place on rename, so a menu holding the object
  // holds a live handle to wherever that note went — and a table that has not
  // repainted still shows the row. That pair is the reported bug: the row
  // survived a bin, the reader pressed it again, and the second press acted on
  // the file at its NEW path, producing
  // `The Avengers-2026-08-20-2026-08-20.md`.
  //
  // A string cannot follow the file. What identifies this row is where the note
  // was when the row was drawn; everything below resolves it again at the
  // moment it acts, and a row whose note has moved refuses.
  //
  // The stale row itself is fixed at the source — `liveScopedWidget` now watches
  // renames — and this is the half that stays correct anyway, which is
  // `block-drag.ts`'s rule for the same species of staleness: *asked at the
  // click, never captured at render.*
  const path = file.path;
  const button = overflowButton(actions, "ca-list-menu", (menu) => {
    // Resolved when the `⋯` opens, so the tick and the page count describe the
    // note as it is now rather than as the table last drew it.
    const live = getFile(table.plugin.app, path);
    if (!live) {
      menu.addItem((i) =>
        i.setTitle("This note has moved — the list is out of date").setIsLabel(true)
      );
      return;
    }
    addPageLayoutRows(menu, table, live, path);
    addDeleteRows(menu, table, path);
  });
  // NAMED AFTER THE ROW IT ACTS ON, which is 4.48's rule for the same reason:
  // `overflowButton` writes "More", and a table of ten of them would read out
  // as "More, More, More" to anybody not looking at the screen.
  button.setAttr("aria-label", `More about ${file.basename}`);
}

// ── What this title's pages are built from ───────────────────────────────

function addPageLayoutRows(
  menu: Menu,
  { plugin, type, kind }: KindRowContext,
  file: TFile,
  path: string
): void {
  const label = kind.pages.label;
  const cfg = plugin.journals.configOf(type);
  const fm = frontmatterOf(plugin.app, file);
  // TICKED ON WHAT WOULD BE USED, NOT ON WHAT IS STORED. A note naming a layout
  // that has since been deleted makes its pages from the default, and a menu
  // ticking the missing row would be describing a state the plugin will not
  // honour. `pageLayoutShown` is the one place that resolution lives.
  const shown = pageLayoutShown(cfg, pageLayoutOf(fm));

  menu.addItem((item) =>
    item.setTitle(`New ${plural(label).toLowerCase()} use…`).setIsLabel(true)
  );
  for (const row of pageLayoutChoices(cfg, label)) {
    menu.addItem((item) =>
      item
        .setTitle(row.label)
        .setChecked(row.id === shown)
        // BY PATH AGAIN, for the reason at `attachKindRowMenu`: this click is a
        // second one, and between the two the note may have moved.
        .onClick(() => void setLayout(plugin, path, row.id))
    );
  }
  menu.addSeparator();
}

async function setLayout(
  plugin: ChronoAnvilPlugin,
  path: string,
  layoutId: string
): Promise<void> {
  const file = getFile(plugin.app, path);
  if (!file) {
    notify.info("That note has already moved — this list is out of date.");
    return;
  }
  await plugin.journals.setPageLayout(file, layoutId);
}

// ── Deleting it ──────────────────────────────────────────────────────────
//
// ── THE BIN IS GONE, AND THE READER RETIRED IT (1.0.13) ──────────────────
//
// This row read *Move to bin* and moved the note to `00 - Infrastructure/Bin/`
// by a rename, which is 4.50.1's answer to 4.50 sending it to Obsidian's trash
// and being reported from a vault inside the day. The reader has now reversed
// that: *"This should be the default way for all chronoanvil's deletion
// processes; so remove the bin folder from 00 - infrastructure."* `trash.ts`
// holds the whole argument and the sentence that makes the destination knowable,
// which is the job the bin folder was doing.
//
// THE DETAIL SENTENCE IS NOT COSMETIC AND IT IS WHERE THE CARE GOES. Two things
// it must no longer say and one it must now say:
//
//   * NOT "Nothing is deleted". It was true of a rename and it is a lie about a
//     delete, and it is the single most dangerous sentence this plugin could
//     keep from the old design.
//   * NOT a folder path. `00 - Infrastructure/Bin/` told the reader where to go
//     and look; `trashClause` tells them the same thing about a destination they
//     chose themselves, and names the setting when that destination is permanent.
//   * THE LINKS WILL BREAK, which is the one real loss in the reversal.
//     `binAway` went through `fileManager.renameFile`, so every link pointing at
//     a binned note followed it. A delete cannot, and `attachment-widgets.ts`
//     already says so in these words — *"Other notes linking to it will break"* —
//     so the wording is the house's rather than this file's.
//
// ── ONE ROW, TWO ANSWERS (4.50.2), UNCHANGED ─────────────────────────────
//
// 4.50.1 drew *Move to bin* and *Move pages to bin* as two menu rows, and they
// are not two things — they are one action at two scopes. **The scope belongs in
// the dialogue, beside the sentence describing what it takes**, because a reader
// choosing between two menu rows is choosing before reading either consequence.
// Same move 4.48 made putting a control on the thing it changes.
//
// That decision was about SCOPE and survives the change of destination whole.
// The second answer is still absent where it would be a no-op: a title with no
// pages gets an ordinary two-button confirm, which is what it always was.

function addDeleteRows(menu: Menu, table: KindRowContext, path: string): void {
  menu.addItem((item) =>
    item
      // AN ELLIPSIS, BECAUSE IT OPENS A DIALOGUE — the convention every other
      // menu row in this plugin keeps, down to `attachment-widgets.ts`' own
      // *Remove and delete file…*. *Move to bin* had none, and it was the one
      // row here that acted on a reader's note.
      .setTitle("Delete note…")
      .setIcon("trash-2")
      .onClick(() => void remove(table, path))
  );
}

async function remove(table: KindRowContext, path: string): Promise<void> {
  const { plugin, kind } = table;
  const file = getFile(plugin.app, path);
  if (!file) {
    // ALREADY GONE IS NOT A FAILURE TO REPORT LOUDLY — the row was drawn before
    // somebody, possibly this reader in another window, moved it.
    notify.info("That note has already moved — this list is out of date.");
    return;
  }

  const siblings = childFiles(file.parent).map((f) => f.path);
  const pages = pagePathsOf(file.path, siblings);
  const pageLabel = kind.pages.label;
  const many = plural(pageLabel).toLowerCase();
  const promoted = isPromotedPath(file.path);

  // A PROMOTED TITLE GOES AS ITS FOLDER. `Quadratics/Quadratics.md` and its pages
  // go in ONE call, so the pages come along by construction rather than by a list
  // that could be wrong. `trashItem` takes a `TAbstractFile` for exactly this.
  const whole: TAbstractFile = promoted ? (file.parent ?? file) : file;

  // ASKED BEFORE THE QUESTION IS WRITTEN, not after the answer. The destination
  // is what the reader is agreeing to, so it has to be in the sentence they read.
  const where = trashClause(trashDestination(plugin.app));
  const subject = pages.length
    ? `${file.basename} and its ${pages.length} ${many}`
    : file.basename;
  const them = pages.length ? "them" : "it";
  const detail = `${subject} ${where}. Links from your other notes to ${them} will break.`;

  const choice = await promptAction(
    plugin.app,
    `Delete ${file.basename}?`,
    detail,
    [
      // THE CTA IS THE WHOLE DELETION, because it is what the row's own control
      // says, and a reader who presses the highlighted button without reading
      // should get the thing they asked for rather than a narrower half of it.
      // BOTH ANSWERS GO RED. 4.50.2 argued this window must not — *"red says
      // this is gone, and this files something into a folder the reader can
      // open"* — and that was an argument about the act rather than about the
      // modal. The act is now a deletion, so the red is the honest half of the
      // same rule.
      { value: "all", label: pages.length ? `Note and ${many}` : "Delete", cta: true, destructive: true },
      ...(pages.length ? [{ value: "pages", label: `${plural(pageLabel)} only`, destructive: true }] : []),
    ]
  );
  if (choice === "all") await removeWhole(plugin, whole);
  else if (choice === "pages") await removePages(plugin, file, pages, many);
}

async function removeWhole(
  plugin: ChronoAnvilPlugin,
  item: TAbstractFile
): Promise<void> {
  if (!(await trashItem(plugin.app, item))) {
    notify.fail(`ChronoAnvil could not delete ${item.name}.`);
    return;
  }
  notify.ok(`Deleted ${item.name}`);
}

// The pages, one at a time.
//
// NO FOLDER TO PUT THEM IN ANY MORE, and that is the shape of the change rather
// than a loss. `binTogether` gathered them into a folder of their own because
// *Roots*, *Graphs*, *Examples* mean something under their parent and nothing at
// the top of a bin, where next week they sit beside another note's *Examples*.
// A trash is not somewhere the reader browses by name — it is somewhere they
// undo from — so the naming problem the folder solved does not arise.
async function removePages(
  plugin: ChronoAnvilPlugin,
  host: TFile,
  pages: readonly string[],
  many: string
): Promise<void> {
  // RESOLVED AFTER THE ANSWER, NOT BEFORE THE QUESTION. A path that no longer
  // names a file is skipped rather than reported — telling a reader to do what
  // has been done is worse than silence.
  const files = pages
    .map((p) => getFile(plugin.app, p))
    .filter((f): f is TFile => f != null);
  if (files.length === 0) {
    notify.info(`${host.basename} has no ${many} left to delete.`);
    return;
  }

  const { deleted, failed } = await trashSeveral(plugin.app, files);
  // REPORTS WHAT WENT, NOT WHAT WAS ASKED FOR, and NAMES what did not. A delete
  // can fail per file — a read-only path, a sync holding one open — and a flat
  // "deleted" over a set half of which is still there is the kind of report that
  // costs an hour. The paths are in the notice because the next thing a reader
  // does with them is go and look.
  if (failed.length > 0) {
    notify.fail(
      `ChronoAnvil deleted ${deleted} of ${files.length} ${many} — these could not be deleted: ${failed.join(", ")}`
    );
    return;
  }
  notify.ok(`Deleted ${deleted} ${many}`);
}
