// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── THE PROSE HEAD BECOMES A BAR, AND THE BAR CARRIES A COG (1.0.78) ─────
//
// *"can a collapse chevron and gear cog (for prose section editor/commands
// window) be added to the new title row on the prose blocks?"* — and then,
// when the glyph was the question: *"I'm trying to remove '...' for some
// sections, so far this has been done for attachments and what's below. I
// think prose blocks could definetely benefit from the cog."*
//
// THE COG IS THE SECTION-LEVEL DOOR AND THIS IS ITS THIRD INSTANCE. The
// Attachments cog (`attachment-widgets.ts::buildCategoriesGlyph`) and the
// What's-below cog (`note-types-window.ts::buildNoteTypesCog`) are the other
// two: the same `settings` icon, the same 1.4em box sized off `--ca-bar-glyph`,
// the same `<button>` with app.css's 30px height reset undone, and the same
// rule that the note is READ WHEN THE COG IS PRESSED rather than when the bar
// was drawn. A prose block's bar is a title row like theirs, so it gets the
// control theirs got rather than a new one.
//
// THE CHEVRON IS REFUSED, which is the other half of the ask and the same
// refusal 1.0.75 wrote into `prose-surface.ts`. Folding prose in Live Preview
// means hiding the reader's own `.cm-line`s, and `headerbar.ts` states the rule
// that forbids it — *"A SOURCE LINE IS NEVER HIDDEN, only painted"*. A fold
// arrow here would work in reading mode and sit dead in the editor, which is
// exactly the control 1.0.73 took away. Obsidian's own heading fold already
// collapses a `## ` inside the block, in both modes, and is the reader's.
//
// WHY THE DOM LIVES HERE AND NOT IN `prose-surface.ts`. That module is the
// painter — two passes that put classes where the FILE says — and 1.0.75's test
// swept it for `createDiv`/`createEl` to hold the head to an attribute. The
// head is an element now, so the sweep is spent; the module stays a painter
// anyway, because what a bar is made of and what the cog opens are a different
// question from where the bar goes.

import { setIcon } from "obsidian";

import type ChronoAnvilPlugin from "../main";
import { openProseWindow } from "./prose-window";

/** The bar, its title, and the cog on the end of it — spelled once. */
export const PROSE_BAR_CLASS = "ca-prose-bar";
export const PROSE_BAR_TITLE_CLASS = "ca-prose-bar-title";
export const PROSE_BAR_COG_CLASS = "ca-prose-bar-cog";

// The element a bar is drawn INTO, in the editor.
//
// ONE CLASS FOR THE ONE HOST THE PLUGIN BUILDS. Reading mode hands the painter
// a block per rendered block and the bar is prepended into the first of them —
// the row the 1.0.75 pseudo-element was drawn on, so the geometry is unchanged.
// Live Preview hands it `.cm-line`s CodeMirror owns, so there the bar needs a
// host of its own and gets a block widget above the writing. This names that
// widget, and the stylesheet uses it for exactly one declaration: the margins a
// `.cm-line` is given by the long selector beside it, which cannot reach a div.
export const PROSE_BAR_HOST_CLASS = "ca-prose-bar-host";

const COG_LABEL = "Prose block settings";
const COG_HINT = "Rename this block, show or hide its title, or remove it";

/** Which block the bar is on, and where to read it back from when pressed. */
export interface ProseBarSpec {
  /** The title the bar draws. */
  title: string;
  /** Which prose block of the note this is, 1-based. */
  nth: number;
  // THE PATH AS A THUNK, NOT AS A STRING, and the editor is why. A reading-mode
  // post-processor is handed `ctx.sourcePath` and a CM6 widget is handed
  // nothing: it learns its file from `editorInfoField`, which it can only ask
  // the view it was mounted into — and a widget outlives the state it was built
  // from, so the answer has to be taken at the press and not before.
  path: () => string | null;
}

// The bar, built into `host` and replacing whatever bar was there before.
//
// IDEMPOTENT, AND NOT BY EMPTYING THE HOST. In reading mode the host is the
// block holding the reader's first paragraph, and `host.empty()` there would
// delete their words — so the old bar is removed by name and the new one is
// prepended above whatever else the block holds. A post-processor runs again
// over a block Obsidian re-renders in place, which is the same reason the
// classes beside this are written as toggles.
export function buildProseBar(
  host: HTMLElement,
  spec: ProseBarSpec,
  plugin: ChronoAnvilPlugin
): HTMLElement {
  clearProseBar(host);
  const bar = createDiv({ cls: PROSE_BAR_CLASS });
  bar.createDiv({ cls: PROSE_BAR_TITLE_CLASS, text: spec.title });
  bar.appendChild(buildProseCog(spec, plugin));
  host.prepend(bar);
  return bar;
}

/** The bar this host carries taken off it, where it carries one. */
export function clearProseBar(host: HTMLElement): void {
  for (const old of Array.from(host.children)) {
    if (old instanceof HTMLElement && old.hasClass(PROSE_BAR_CLASS)) old.remove();
  }
}

// The cog, and the one gesture it answers.
//
// `stopPropagation` AND `preventDefault`, for the two surfaces this sits on. A
// title row folds on click where it has a fold, so a cog that let the click
// through would open a window and collapse the card under it — the Attachments
// cog's own reason. And in the editor the click is on DOM inside a widget: the
// default would put the cursor at the position the widget replaces, which is
// inside a marker the reader cannot see.
function buildProseCog(
  spec: ProseBarSpec,
  plugin: ChronoAnvilPlugin
): HTMLElement {
  const btn = createEl("button", {
    cls: PROSE_BAR_COG_CLASS,
    attr: { type: "button", "aria-label": COG_LABEL, title: COG_HINT },
  });
  setIcon(btn, "settings");
  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const path = spec.path();
    if (!path) return;
    void openProseWindow(plugin.app, plugin, path, spec.nth);
  });
  return btn;
}
