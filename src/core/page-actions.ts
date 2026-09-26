// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The items the banner's action menu draws, declared once.
//
// WHY THIS IS NOT `ACTIONS` (1.0.11). `actions.ts` is the right SHAPE — an id,
// a name, an icon, a `when` and a `run`, one table read by two doors — and it
// is the wrong SCOPE. Every entry there takes the plugin alone and finds the
// note through `p.actionWithNote(...)`, which resolves the ACTIVE file. A
// button drawn in a note's banner belongs to THAT note: in a split pane, in a
// hover preview, and in Obsidian's own sidebar, the note under the button is
// routinely not the active one, and a menu that quietly acts on a
// different file than the one it is drawn in is the worst kind of wrong — it
// looks like it worked.
//
// So the handlers here take a PATH, and `ctx.sourcePath` supplies it. The
// renderer never asks which file is active and has no way to.
//
// AND THE BEHAVIOUR IS STILL NOT DUPLICATED, which was the point of the split.
// `page-copy-plain` calls `copyPlainMarkdownHere(path)` — the same method
// `note-copy-plain-markdown` calls, with the path it had already resolved. Two
// tables, two scopes, one implementation. `actions.ts`'s own rule holds here
// word for word: NO BEHAVIOUR LIVES HERE. The table is data, the renderer is
// `ui/widgets/actions-bar.ts`, and anything either of them would have to think
// about belongs in the module that owns it.
//
// HOW A THIRD ACTION IS ADDED. One entry below, plus its handler wherever that
// behaviour lives. It is drawn, it is listed in Settings, and it is on for every
// reader who has not turned it off — see `pageActionsOn` for why the setting
// records the refusals rather than the acceptances.

import type { IconName } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { linkPageToDiary } from "../diary/diary-link";
import { changePageIcon } from "../ui/page-icon";
import type { ResolvedSurface } from "../ui/section-insert";

// What the menu knows about the note it is drawn in, before any item is built.
//
// THE SURFACE AND NOTHING ELSE, deliberately. A `when` that could read the
// note's text would be a second parser on the render path, and one that could
// read its frontmatter would make every button's availability a question the
// renderer has to re-ask on every metadata change. The surface is settled by
// the time a fence is being drawn and it is the only thing either shipped
// action actually needs.
export interface PageActionContext {
  path: string;
  surface: ResolvedSurface["kind"];
}

export interface PageAction {
  id: string;
  // The button's own word. Sentence case, like every other label in the tree.
  label: string;
  icon: IconName;
  // The sentence under the toggle in Settings. A reader deciding whether to
  // keep a button has the label and this, and nothing else.
  blurb: string;
  // Whether this note can be given this button at all. Absent means always.
  when?: (ctx: PageActionContext) => boolean;
  run: (p: ChronoAnvilPlugin, path: string) => void | Promise<void>;
}

export const PAGE_ACTIONS: readonly PageAction[] = [
  {
    // 4.30's clipboard copy, which has been a palette command with no button
    // since the day it shipped. What a reader wrote, as markdown anybody can
    // read, without the regions Obsidian hides in comments.
    //
    // NO `when`: every surface the menu is composed on can be copied, including
    // a managed template, whose export is its empty fields — `copyPlainMarkdown-
    // Here` states that argument at length and it is not re-made here.
    //
    // WRITES NOTHING, so no confirmation and nothing to undo.
    id: "page-copy-plain",
    label: "Copy as plain markdown",
    icon: "clipboard-copy",
    blurb:
      "Copies the page to the clipboard as ordinary markdown, with the plugin's own markup stripped out.",
    run: (p, path) => p.sections.copyPlainMarkdownHere(path),
  },
  {
    // 1.0.11, and the only new behaviour the menu ships with.
    //
    // REFUSED ON A DIARY ENTRY, which is the one `when` either action needs: an
    // entry IS the diary, and a button offering to join it to itself would be
    // asking a question with no true answer. The refusal is by surface rather
    // than by reading the note, for the reason `PageActionContext` gives.
    //
    // THE BLURB STOPPED SAYING "THAT DAY" IN 1.0.29. It was accurate while the
    // action asked for a `YYYY-MM-DD` and could not express anything else; the
    // picker offers all five grains, and a sentence in Settings promising one of
    // them is a reader deciding whether to keep a button on false information.
    id: "page-link-diary",
    label: "Link to diary",
    icon: "calendar-plus",
    blurb:
      "Dates the page and links it from a diary entry you pick — a day, week, month, quarter or year — so it turns up in search, on-this-day and the bridge.",
    when: (ctx) => ctx.surface !== "entry",
    run: (p, path) => linkPageToDiary(p, path),
  },
  {
    // 1.0.42, and the counterpart to the glyph that release put behind every
    // banner. That glyph comes from the MODEL — a level's `fallbackEmoji`, a
    // kind's `emoji`, a diary grain's — which answers "every Cheatsheet" and
    // not "this page", and the journal editor already owns the first question.
    //
    // NO `when`, and that is the deliberate half. Whether a page draws a glyph
    // at all is a question about its RUNG, which `PageActionContext` cannot ask
    // — the context is the surface and nothing else, for the reason declared on
    // that interface, and widening it to reach a note's frontmatter would make
    // every item's availability something the renderer re-asks on every
    // metadata change. So the refusal is the handler's: it resolves the glyph
    // the page would draw, and says there is none rather than opening a picker
    // whose result would be invisible.
    //
    // WRITES ONE FRONTMATTER KEY, and deletes it again when the reader picks
    // the glyph the page already had.
    id: "page-icon",
    label: "Change the page icon",
    icon: "smile-plus",
    blurb:
      "Picks the glyph this one page tiles behind its banner, overriding the one its note type or diary period would give it.",
    run: (p, path) => changePageIcon(p, path),
  },
];

// The actions this reader has left on, in table order.
//
// THE SETTING RECORDS THE REFUSALS, NOT THE ACCEPTANCES, and that is the whole
// of its design: an action added in a later release is on for everybody without
// a migration, because nobody's `off` list can name an id that did not exist
// when they last touched the settings tab. An `on` list would ship the opposite
// behaviour — every existing vault silently missing every new button — and the
// bug would be invisible, since the menu would look exactly like a menu a reader
// had chosen.
export function pageActionsOn(off: readonly string[]): PageAction[] {
  return PAGE_ACTIONS.filter((a) => !off.includes(a.id));
}
