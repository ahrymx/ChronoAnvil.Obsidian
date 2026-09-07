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
import { childFiles, frontmatterOf, getFile, plural, today } from "../../core/util";
import { BIN_FOLDER, binAway, binTogether } from "../../core/journal-removal";
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
  const { kind } = table;
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
    if (kind.pages) addPageLayoutRows(menu, table, live, path);
    addBinRows(menu, table, path);
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
  const label = kind.pages?.label ?? "Page";
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

// ── The bin ──────────────────────────────────────────────────────────────
//
// CHRONOANVIL'S BIN, NOT OBSIDIAN'S (4.50.1). 4.50 shipped this through
// `fileManager.trashFile` and was reported from a vault within the day —
// *"vault's trash doesn't seem to exist"*. The symptom is that Obsidian's
// *Deleted files* setting can be set to permanent, or to a `.trash` folder the
// file explorer does not show. The FAULT is that this plugin had already
// decided where a bin goes and why, in `journal-removal.ts`, and had written
// down the invariant the trash call broke:
//
//   *A MOVE, NEVER A DELETE. ChronoAnvil has never removed a reader's note and this
//   is not where that starts.*
//
// `00 - Infrastructure/Bin/` is an ordinary folder. The reader can open it, look
// at what is in it, drag a note back out, and empty it when they mean to.
//
// ── ONE ROW, TWO ANSWERS (4.50.2) ────────────────────────────────────────
//
// 4.50.1 drew *Move to bin* and *Move pages to bin* as two menu rows, and they
// are not two things — they are one action at two scopes. **The scope belongs in
// the dialogue, beside the sentence describing what it takes**, because a reader
// choosing between two menu rows is choosing before reading either
// consequence. Same move 4.48 made putting a control on the thing it changes.
//
// AND THE SECOND ANSWER IS ABSENT WHERE IT WOULD BE A NO-OP: a title with no
// pages gets an ordinary two-button confirm, which is what it always was.

function addBinRows(menu: Menu, table: KindRowContext, path: string): void {
  menu.addItem((item) =>
    item
      .setTitle("Move to bin")
      .setIcon("trash-2")
      .onClick(() => void bin(table, path))
  );
}

async function bin(table: KindRowContext, path: string): Promise<void> {
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
  const pageLabel = kind.pages?.label ?? "Page";
  const many = plural(pageLabel).toLowerCase();
  const promoted = isPromotedPath(file.path);

  // A PROMOTED TITLE BINS AS ITS FOLDER. `Quadratics/Quadratics.md` and its
  // pages move in ONE rename, so the pages come along by construction rather
  // than by a list that could be wrong — and what comes back out is the note
  // and its pages arranged the way they were.
  const whole: TAbstractFile = promoted ? (file.parent ?? file) : file;

  const detail = `${
    pages.length
      ? `${file.basename} and its ${pages.length} ${many} will be moved`
      : `${file.basename} will be moved`
  } to ${BIN_FOLDER}/. Nothing is deleted — links from your other notes are updated to follow, and you can drag it back out or empty the bin yourself.`;

  const choice = await promptAction(
    plugin.app,
    `Move ${file.basename} to the bin?`,
    detail,
    [
      // THE CTA IS THE WHOLE MOVE, because it is what the row's own control
      // says, and a reader who presses the highlighted button without reading
      // should get the thing they asked for rather than a narrower half of it.
      { value: "all", label: pages.length ? `Note and ${many}` : "Move to bin", cta: true },
      ...(pages.length ? [{ value: "pages", label: `${plural(pageLabel)} only` }] : []),
    ]
  );
  if (choice === "all") await binWhole(plugin, whole);
  else if (choice === "pages") await binPages(plugin, file, pages, many);
}

async function binWhole(
  plugin: ChronoAnvilPlugin,
  item: TAbstractFile
): Promise<void> {
  const target = await binAway(plugin.app, item, today());
  if (!target) {
    notify.fail(`ChronoAnvil could not move ${item.name} to ${BIN_FOLDER}/.`);
    return;
  }
  notify.ok(`Moved to ${target}`);
}

// The pages, into one folder of their own.
//
// A FOLDER RATHER THAN LOOSE FILES. *Roots*, *Graphs*, *Examples* mean something
// under their parent and nothing at the top of a bin, where next week they sit
// beside another note's *Examples*. The folder is what says which note they came
// out of — see `binTogether`, which owns that rule.
async function binPages(
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
    notify.info(`${host.basename} has no ${many} left to move.`);
    return;
  }

  const { target, moved } = await binTogether(
    plugin.app,
    files,
    `${host.basename} ${many}`,
    today()
  );
  // REPORTS WHAT MOVED, NOT WHAT WAS ASKED FOR. `renameFile` can fail per file —
  // a read-only path, a sync holding one open — and a flat "moved" over a folder
  // half of which is still there is the kind of report that costs an hour.
  const missed = files.length - moved;
  if (missed > 0) {
    notify.fail(
      `ChronoAnvil moved ${moved} of ${files.length} ${many} to ${target}/ — ${missed} could not be moved.`
    );
    return;
  }
  notify.ok(`Moved ${moved} ${many} to ${target}/`);
}
