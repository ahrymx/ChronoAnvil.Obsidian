// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The control a KIND GROUP'S HEAD carries in "what's below this note". 1.0.33.
//
// ── THE READER'S ASK, IN THEIR WORDS ─────────────────────────────────────
//
// *"that works for defaults, but there's no over-ride per index note-kind. A
// user might have added new note types into a topic, or maybe even, changed
// their mind for what they want 'Lessons' to be rated on for that particular
// index page. I think there should be note-kind options settings in the
// edit-mode of what's below, maybe as a hamburger menu beside the New note
// button and collapse chevron."*
//
// ── IT IS 4.48'S MOVE AGAIN, ONE SCOPE UP FROM `kind-row-menu.ts` ────────
//
// That file states the rule this one inherits: *"the object being configured
// and the control that configures it can be the same object"*. A row is one
// note and carries a `⋯` about that note; a GROUP is one note type on one page
// and now carries a `⋯` about that. The group's title is what a reader points
// at when they mean "this type", which is the same sentence 1.0.24 used to put
// the removal there.
//
// ── `more-horizontal`, WHICH IS THIS PLUGIN'S HAMBURGER ──────────────────
//
// The ask says hamburger and this draws a `⋯`. `actions-menu.ts` fixes the
// glyph vocabulary and `more-horizontal` is its word for *"more things about
// this row, a cell, a card inside a page"* — which is exactly what this is, and
// what the row four pixels below it already wears for the same gesture. A ☰ on
// the group and a ⋯ on its rows would be two glyphs for one meaning on one card,
// which is the split 4.20 spent a release closing on the banners.
//
// ── IN THE MODE, NOT ON THE CARD ─────────────────────────────────────────
//
// 1.0.24's call, unchanged and for its reason: the head carries no control at
// rest. The ask put it *"in the edit-mode of what's below"* itself, so this is
// the reader's placement rather than an inference from the neighbour.
//
// ── FLAT, WITH NO SUBMENU ────────────────────────────────────────────────
//
// 4.47's outcome §5, which `kind-row-menu.ts` and `stats-band-menu.ts` both
// already apply: `setSubmenu` is not on Obsidian's public types, so it has to be
// probed, and a probe that fails must still leave the setting reachable. The
// two runs are headed by disabled titles instead.
//
// ── AND NOTHING REPAINTS ANYTHING ────────────────────────────────────────
//
// The write is `processFrontMatter` on the host note, and `liveScopedWidget`'s
// scope predicate opens with `path === ctx.sourcePath` — so the note's own
// metadata change IS the event that redraws every table on the card. A
// `repaintOpenNotes` here would be a second redraw of a table that had already
// redrawn, which is 4.48's scar read the other way round.

import { Menu, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { overflowButton } from "../section-frame";
import { promptText } from "../modals";
import { getFile, plural } from "../../core/util";
import { notify } from "../../core/notify";
import { ratingChoices } from "../../core/settings-editors";
import type { JournalKind, JournalType } from "../../journals/journal";
import { kindColumns, ratingNoun, type KindColumn } from "../../journals/kind-columns";
import { getTracker } from "../../trackers/trackers";
import {
  RATED_NONE,
  isBlankOverride,
  kindTableOverrideOf,
  pageKind,
  withHeading,
  withRated,
  type KindTableOverride,
} from "../../journals/kind-tables";

/** Everything the menu needs that is a fact about the card, not about a group. */
export interface KindOptionsContext {
  plugin: ChronoAnvilPlugin;
  type: JournalType;
  /** The index note whose frontmatter carries the answers. */
  path: string;
}

// The `⋯` for one group, hung in its head's actions strip.
export function buildKindOptions(
  ctx: KindOptionsContext,
  host: HTMLElement,
  kind: JournalKind
): HTMLElement {
  const button = overflowButton(host, "ca-journal-kind-options", (menu) => {
    // RESOLVED WHEN THE `⋯` OPENS, which is `overflowButton`'s own rule and
    // `attachKindRowMenu`'s: the ticks describe the page as it is now rather
    // than as the head last drew it, and between two presses the reader may
    // have changed the same answer from another window.
    const file = getFile(ctx.plugin.app, ctx.path);
    if (!file) {
      menu.addItem((i) =>
        i.setTitle("This note has moved — reopen it to change its tables").setIsLabel(true)
      );
      return;
    }
    const over = kindTableOverrideOf(ctx.plugin.app, file, kind.id);
    addRatingRows(menu, ctx, file, kind, over);
    addHeadingRows(menu, ctx, file, kind, over);
    addResetRow(menu, ctx, file, kind, over);
  });
  // NAMED AFTER THE GROUP IT ACTS ON, which is 4.48's rule and `kind-row-menu`'s
  // for the same reason: `overflowButton` writes "More", and a card of four
  // groups would read out as "More, More, More, More".
  button.setAttr("aria-label", `Options for ${plural(kind.label)} on this page`);
  // NO SECOND `stopPropagation` HERE, AND `buildRemove` IS WHY THERE LOOKS LIKE
  // THERE SHOULD BE. The head folds the group when clicked, and the removal
  // beside this has to say so because it wires its own handler onto a plain
  // button. `overflowButton` already stops the event before it opens the menu —
  // and the bar's own listener returns early for anything inside
  // `.ca-journal-header-widgets` anyway. A third guard over the same click is
  // the sort of thing that reads as necessary for ever afterwards.
  return button;
}

// ── What this page scores them on ────────────────────────────────────────
//
// THE FIRST ROW IS THE JOURNAL'S OWN ANSWER AND IT IS A CHOICE LIKE THE OTHERS.
// Without it the only way back from an override would be to guess which tracker
// the note type names, which is `pageLayoutChoices`' argument for its own
// ⭐ default row — and that row names the value too, so a reader can see what
// they would be going back to before they go.
function addRatingRows(
  menu: Menu,
  ctx: KindOptionsContext,
  file: TFile,
  kind: JournalKind,
  over: KindTableOverride
): void {
  const { plugin, type } = ctx;
  const word = (id: string | undefined): string =>
    id ? trackerLabel(ctx, id) : "nothing";

  menu.addItem((item) =>
    item.setTitle(`${plural(kind.label)} on this page are rated on…`).setIsLabel(true)
  );
  menu.addItem((item) =>
    item
      .setTitle(`The note type's own (${word(kind.rating)})`)
      .setChecked(over.rated === undefined)
      .onClick(() => void setRated(ctx, file, kind, over, null))
  );
  for (const t of ratingChoices(plugin, type.id)) {
    menu.addItem((item) =>
      item
        .setTitle(t.label)
        .setChecked(over.rated === t.id)
        .onClick(() => void setRated(ctx, file, kind, over, t.id))
    );
  }
  // ONLY WHERE IT WOULD CHANGE SOMETHING. A note type that is not rated already
  // shows no rating column, so "Nothing" beside a ticked "The note type's own
  // (nothing)" would be two rows meaning one thing — and picking the second
  // would write a property that says what absence already says.
  if (kind.rating) {
    menu.addItem((item) =>
      item
        .setTitle("Nothing")
        .setChecked(over.rated === RATED_NONE)
        .onClick(() => void setRated(ctx, file, kind, over, RATED_NONE))
    );
  }
  menu.addSeparator();
}

// ── What this page calls each column ─────────────────────────────────────
//
// ONE ROW PER COLUMN, EACH OPENING A BOX. Settings draws four boxes side by side
// because it has a whole window; a menu has rows, and `promptText` already takes
// an initial value, a placeholder and the sentence that says what empty means —
// which is the three things the box in Settings says with its placeholder alone.
//
// THE COLUMNS ARE THIS PAGE'S, NOT THE NOTE TYPE'S. A page that has just re-rated
// its lessons offers the column it now draws, with the word it now shows.
function addHeadingRows(
  menu: Menu,
  ctx: KindOptionsContext,
  file: TFile,
  kind: JournalKind,
  over: KindTableOverride
): void {
  const { shown, inherited } = columnWords(ctx, kind, over);
  menu.addItem((item) =>
    item.setTitle("This page's column headings…").setIsLabel(true)
  );
  shown.forEach((col, i) => {
    const base = inherited[i]?.heading ?? col.fallback;
    menu.addItem((item) =>
      item
        .setTitle(`Rename “${col.heading}”…`)
        .setIcon("pencil")
        .onClick(() => void renameColumn(ctx, file, kind, col, base))
    );
  });
}

// The two readings of the same columns: what this page shows, and what it would
// show if the reader cleared every box on it.
//
// PAIRED BY POSITION, WHICH IS SAFE BECAUSE THE RATING IS THE SAME IN BOTH. The
// only thing that changes which columns exist is the rating, and `base` carries
// the page's rating and only the journal's WORDS — so the two lists are the same
// columns in the same order by construction rather than by luck.
function columnWords(
  ctx: KindOptionsContext,
  kind: JournalKind,
  over: KindTableOverride
): { shown: KindColumn[]; inherited: KindColumn[] } {
  const page = pageKind(kind, over);
  const base = pageKind(kind, withRated({}, over.rated ?? null));
  return {
    shown: kindColumns(ctx.plugin, page),
    inherited: kindColumns(ctx.plugin, base),
  };
}

async function renameColumn(
  ctx: KindOptionsContext,
  file: TFile,
  kind: JournalKind,
  col: KindColumn,
  inherited: string
): Promise<void> {
  const typed = await promptText(
    ctx.plugin.app,
    `What this page calls the “${inherited}” column`,
    inherited,
    // THE BOX OPENS ON THE OVERRIDE, NOT ON THE WORD ON SCREEN. Where there is
    // no override the two are the same string anyway; where there is one, an
    // empty box beside a placeholder reading the inherited word is the state
    // that makes "clear it to go back" a thing a reader can see rather than a
    // thing this sentence has to promise.
    overrideNow(ctx, file, kind).headings?.[col.key] ?? "",
    {
      description: `Leave it empty to use “${inherited}”, which is what the note type calls it.`,
    }
  );
  if (typed === null) return;
  await write(
    ctx,
    file,
    kind,
    withHeading(overrideNow(ctx, file, kind), col.key, typed, inherited)
  );
}

// ── Putting the whole group back ─────────────────────────────────────────
//
// ONE ROW RATHER THAN A RESET PER FIELD, and only where there is something to
// undo. A reader who has re-rated a group and renamed two of its columns has
// made four gestures and should not need four to take them back; a disabled row
// on every un-overridden group would be `discoverability.test.ts`' rule broken —
// *a menu that opens and then explains it cannot help is worse than no menu.*
function addResetRow(
  menu: Menu,
  ctx: KindOptionsContext,
  file: TFile,
  kind: JournalKind,
  over: KindTableOverride
): void {
  if (isBlankOverride(over)) return;
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Use the note type's own settings")
      .setIcon("rotate-ccw")
      .onClick(() => void write(ctx, file, kind, {}))
  );
}

// ── The writes ───────────────────────────────────────────────────────────

async function setRated(
  ctx: KindOptionsContext,
  file: TFile,
  kind: JournalKind,
  over: KindTableOverride,
  rated: string | null
): Promise<void> {
  await write(ctx, file, kind, withRated(over, rated));
}

// RE-READ AT THE CLICK, NEVER CAPTURED AT DRAW. `block-drag.ts`' rule and
// `kind-row-menu.ts`': the menu was built when the `⋯` opened and the click is a
// second gesture, so the answer it merges into has to be the one on disk now.
function overrideNow(
  ctx: KindOptionsContext,
  file: TFile,
  kind: JournalKind
): KindTableOverride {
  return kindTableOverrideOf(ctx.plugin.app, file, kind.id);
}

async function write(
  ctx: KindOptionsContext,
  file: TFile,
  kind: JournalKind,
  next: KindTableOverride
): Promise<void> {
  const live = getFile(ctx.plugin.app, file.path);
  if (!live) {
    notify.info("That note has moved — reopen it to change its tables.");
    return;
  }
  await ctx.plugin.journals.setKindTable(live, kind.id, next);
}

// The registry's word for a tracker, or its id where the registry has no entry.
//
// THROUGH `ratingNoun` AND `getTracker`, WHICH IS WHAT `kindColumns` READS. Not
// through `ratingChoices`, which is the journal's OFFER — a kind rated on a
// tracker that has since left that offer still draws its column, and a menu
// naming it by its raw id while the heading above named it properly would be two
// answers to one question on one card.
function trackerLabel(ctx: KindOptionsContext, id: string): string {
  return ratingNoun(getTracker(ctx.plugin, id) ?? null, id);
}
