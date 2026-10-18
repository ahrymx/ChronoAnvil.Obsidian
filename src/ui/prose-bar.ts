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
// ── AND THE CHEVRON, WHICH WAS REFUSED TWICE AND SHOULD NOT HAVE BEEN ───
//
// *"make the head a real bar with the collapse chevron, so it feels like any
// other section."*
//
// 1.0.75 AND 1.0.78 BOTH REFUSED IT ON A CLAIM THAT WAS TOO WIDE. The claim was
// `headerbar.ts`' — *"A SOURCE LINE IS NEVER HIDDEN, only painted"* — read as a
// fact about Live Preview. It is a fact about THAT PASS: it toggles a class on
// sibling elements and explicitly skips `.cm-line`s, so a header bar's fold in
// the editor hides the fences and leaves the reader's plain rows painted. Prose
// has no fences — its members are all `.cm-line`s — so that mechanism folds
// nothing, which is true, and is a different sentence from "CodeMirror will not
// allow it".
//
// HIDING LINES FROM A STATE FIELD IS SOMETHING THIS PLUGIN ALREADY DOES.
// `marker-lines.ts` hides every one of the plugin's markers that way:
// `hiddenRanges` returns ranges that span line breaks and `Decoration.replace({})`
// draws them as nothing. CodeMirror forbids that from a PLUGIN and not from a
// state field — `disallowBlockEffectsFor` gates both of its throws — and
// `prose-surface.ts` has been a state field since 1.0.37. So the fold is drawn
// the way the markers are, and the three guards that make that safe are
// already written and already take a callback: `protectLines` (a change filter
// over caller-supplied spans), `EditorView.atomicRanges`, and the resting-point
// rule. `prose-surface.ts` holds the arithmetic and the guards.
//
// WHAT IS GENUINELY NEW IS WHOSE TEXT IS HIDDEN. Every hidden range until now
// has been markup this plugin wrote; a folded prose block hides the reader's
// own writing. That is why the fold is keyed, persisted and reversible by one
// press, why `protectLines` is handed the collapsed rows rather than only
// `atomicRanges`, and why nothing about the FILE changes when a block is
// folded — a fold is a way of looking at a note, and this one writes no
// character of it.
//
// SAME CLASSES, SAME CHEVRON, on the reader's call: `ca-journal-header-toggle`
// and `is-collapsed` are the header bar's own, so the glyph, its box, its hover
// and the direction it points are one declaration each rather than two. It sits
// at the right-hand end AFTER the cog, which is where a fenced section puts it
// — `.ca-journal-head-tools + .ca-journal-header-toggle` is that order, written
// down in the stylesheet since 4.13.
//
// AND THE FIRST CUT SHIPPED IT BROKEN IN THE EDITOR (1.0.79 §2): *"clicking the
// chevron in edit mode completely hides the prose section."* The bar was a
// widget anchored one position INSIDE the range that hid the run, and
// CodeMirror skips every decoration strictly inside a replacement — so the only
// control a folded block has was folded away with it. The fix is structural:
// the bar is now the replacement rather than a widget beside one, which makes
// the thing that cannot be hidden the thing doing the hiding.
// `prose-surface.ts::foldedRange` carries the arithmetic and the reasoning.
//
// WHY THE DOM LIVES HERE AND NOT IN `prose-surface.ts`. That module is the
// painter — two passes that put classes where the FILE says — and 1.0.75's test
// swept it for `createDiv`/`createEl` to hold the head to an attribute. The
// head is an element now, so the sweep is spent; the module stays a painter
// anyway, because what a bar is made of and what the cog opens are a different
// question from where the bar goes.
//
// ── AND NO GRIP ON IT, WHICH WAS ASKED AND MEASURED (1.0.96) ─────────────
//
// *"the prose blocks can be moved from the section editor just fine, but they
// do not have any draggable interface like most other sections. Worth
// implementing?"* — and, on the shape: *"the editor is enough. The position
// highlighting would also be required (the boxes drawn over sections that
// indicate which side the move lands on). If implementation is too complicated
// we can skip this feature."*
//
// IT IS NOT A POLICY AND IT IS WORTH SAYING SO. 4.7 made a whole block
// draggable, 4.8.1 removed it at a vault's request — *"a block should only be
// moved from the section editor menu"* — and 4.8.5 GAVE IT BACK under a drag
// type of its own. Every fence block draws a grip and two slots today. So prose
// is not excluded on 4.8.1's argument; it simply fell out of what prose is, and
// the next reader to notice should find the measurement rather than the gap.
//
// THE HALF THAT IS CHEAP IS THE HANDLE. This bar is one builder for both
// painters with the per-mode differences already thunks (`path`, `redraw`,
// `nth`), so a control added here appears in both modes once. Locating the
// block is EASIER than for a fence: `proseSpansIn(lines)` plus `nth` answers
// from the file, where `boundsOf` has to ask `getSectionInfo` and gets null in
// an embed or an export. And `segment` already returns a prose span as a `raw`
// segment that round-trips verbatim, which `rebuild` already splices in SEGMENT
// space. The arithmetic for the move exists.
//
// THE HALF THAT IS NOT IS THE DROP, AND THE READER NAMED IT. The boxes that say
// which side a move lands on are the slots `attachBlockHead` hangs on every
// fence block, and they speak the FENCE index — `fencesOf`'s `at[]`, which
// skips raw runs. "Above fence 2" and "below fence 1" are the same fence index
// and different segment positions the moment a prose span sits between them. So
// either every slot learns to hand out a second coordinate, or `fencesOf`
// widens to count prose — which changes the number `blockIndexAt` returns, and
// that number is the stamp `moveCell` reads. `block-move.ts` states that risk
// about itself: ONE answer to "which segments are fences, and where", because
// two copies is how two files come to disagree about what block 2 is. A
// highlight that is right about the fences and wrong about the gaps between
// them is the "accept it and then explain yourself" failure, drawn.
//
// AND LIVE PREVIEW IS A SECOND IMPLEMENTATION, NOT A SECOND BRANCH. In the
// editor this bar IS a replace decoration inside `.cm-content`, so the drag
// would start inside CodeMirror's own text drag, and 1.0.79 and 1.0.80 are two
// consecutive rounds of a control inside that replacement going wrong — the
// first one folded its own chevron away. Reading-mode-only is the alternative,
// and a handle that appears and disappears with the mode, on one section type,
// is the asymmetry this round was asked about in the first place.
//
// SO THE EDITOR STAYS THE DOOR, and what a reader loses is measured too: the
// window opened FROM this block (`prose-window.ts`) carries a title, the line
// count, the `#bare` tick and Remove — and no move. Moving one prose block
// therefore means *Edit sections…*, the whole-note window. That is the friction
// behind the question. If it is worth closing later, the small shape is a move
// pair in THAT window — it already knows `nth`, already re-reads before it
// writes and already presses the same `apply` — and not a grip, which is the
// one shape that cannot be built without the coordinate change above.

import { setIcon } from "obsidian";

import { collapsedAt, setCollapsedAt } from "./fold-state";
import type ChronoAnvilPlugin from "../main";
import { openProseWindow } from "./prose-window";

/** The bar, its title, and the cog on the end of it — spelled once. */
export const PROSE_BAR_CLASS = "ca-prose-bar";
export const PROSE_BAR_TITLE_CLASS = "ca-prose-bar-title";
export const PROSE_BAR_COG_CLASS = "ca-prose-bar-cog";

// THE HEADER BAR'S OWN THREE, NOT COPIES OF THEM (1.0.79). The chevron, the
// hover that lights it and the state class that turns it over are the ones
// `headerbar.ts` applies and `50-entry-header.css` draws. A prose bar wearing
// its own would be two glyphs with two declarations drifting apart, which is
// the mistake the three cogs stopped making one release ago.
export const FOLD_TOGGLE_CLASS = "ca-journal-header-toggle";
export const FOLD_HOST_CLASS = "ca-journal-header-collapsible";
export const FOLD_SHUT_CLASS = "is-collapsed";

// The class a member block of a FOLDED prose run wears in reading mode.
//
// `headerbar.ts`' OWN, for the same reason the chevron is: it means "this block
// belongs to a collapsed section" and it is already `display: none !important`.
// A second class with one declaration in it would be a second answer to a
// question that has one.
export const FOLD_HIDDEN_CLASS = "ca-journal-section-hidden";

// And the class the FIRST block wears, which is the one case a header bar never
// has: the bar is prepended INTO the first block of the writing, so that block
// cannot simply be hidden — its own children have to go and the bar has to
// stay. The stylesheet hides `> :not(.ca-prose-bar)` under this.
export const PROSE_SHUT_CLASS = "is-prose-shut";

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

const FOLD_LABEL = "Collapse this prose block";
const UNFOLD_LABEL = "Expand this prose block";

// Where a prose block's fold is remembered.
//
// SIXTH NAMESPACE IN ONE RECORD, and `settings.ts` already says what makes that
// safe: *nothing ever reads a key it did not write*. `pathwatch.ts` prunes and
// retargets on the path in front of the first `::` and never looks at the rest,
// so a note renamed takes its folds with it and a note removed takes them away
// — with no change to this and none to that.
//
// THE READER'S OWN NAME WHERE THERE IS ONE, THE ORDINAL WHERE THERE IS NOT, and
// see `ProseSurface.title` for why: a name survives a block being inserted
// above it and a number does not. The two are told apart by a prefix rather
// than left to collide — a reader who names a block `2` would otherwise own
// the key of the block that happens to be second.
export function proseFoldKey(
  path: string,
  block: { nth: number; title: string | null }
): string {
  const where = block.title ? `t:${block.title}` : `n:${block.nth}`;
  return `${path}::prose:${where}`;
}

/** Is this block folded, as far as the reader's settings are concerned? */
export function proseFolded(
  plugin: ChronoAnvilPlugin,
  path: string | null,
  block: { nth: number; title: string | null }
): boolean {
  if (!path) return false;
  return collapsedAt(plugin, proseFoldKey(path, block));
}

/** Which block the bar is on, and where to read it back from when pressed. */
export interface ProseBarSpec {
  /** The title the bar draws. */
  title: string;
  /** Which prose block of the note this is, 1-based. */
  nth: number;
  /** The name on the marker, or null — half of the fold's key. See `proseFoldKey`. */
  name: string | null;
  /** Whether this block is folded right now. */
  shut: boolean;
  // WHAT TO REDRAW, WHICH IS THE ONE THING THE TWO PAINTERS CANNOT SHARE. The
  // fold itself is one line in the settings record and this file writes it; what
  // has to happen next differs by mode. Reading mode gets no second pass from
  // Obsidian, so the handler walks the block's own siblings (`applyProseFold`).
  // The editor gets a state effect, which makes the field recompute and the
  // replace range appear — a fold changes no document, so without it nothing
  // would ask the field anything.
  redraw: (shut: boolean) => void;
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
  bar.addClass(FOLD_HOST_CLASS);
  bar.toggleClass(FOLD_SHUT_CLASS, spec.shut);
  bar.createDiv({ cls: PROSE_BAR_TITLE_CLASS, text: spec.title });
  // COG FIRST, THEN THE CHEVRON, which is the order a fenced section's bar has:
  // `.ca-journal-head-tools + .ca-journal-header-toggle` puts the tools before
  // the fold and gives the fold the end of the row.
  bar.appendChild(buildProseCog(spec, plugin));
  bar.appendChild(buildProseFold(bar, spec, plugin));
  // AND THE WHOLE TITLE STRIP IS A HIT TARGET, like a header bar's — the cog
  // stops its own click, so the only thing left to press is the title.
  bar.addEventListener("click", (evt) => {
    if (evt.target instanceof Element && evt.target.closest(`.${PROSE_BAR_COG_CLASS}`)) {
      return;
    }
    evt.preventDefault();
    toggleProseFold(bar, spec, plugin);
  });
  host.prepend(bar);
  return bar;
}

// The chevron, which is the header bar's glyph and the header bar's rotation.
function buildProseFold(
  bar: HTMLElement,
  spec: ProseBarSpec,
  plugin: ChronoAnvilPlugin
): HTMLElement {
  const toggle = createDiv({
    cls: FOLD_TOGGLE_CLASS,
    attr: { "aria-label": spec.shut ? UNFOLD_LABEL : FOLD_LABEL },
  });
  setIcon(toggle, "chevron-down");
  toggle.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    toggleProseFold(bar, spec, plugin);
  });
  return toggle;
}

// One press: the record, then the mode's own redraw.
//
// THE RECORD FIRST, BECAUSE BOTH REDRAWS READ IT. Reading mode's walks the
// siblings from this bar and the editor's dispatches a state effect that makes
// the field ask `proseFolded` again — neither is handed the new value, so a
// redraw before the write would paint the old answer.
//
// AND `spec.shut` IS NOT UPDATED IN PLACE. It is what the bar was built with;
// the next build is what carries the new one. In the editor that build is the
// widget's, driven by the effect; in reading mode `applyProseFold` toggles the
// classes and the bar's own `is-collapsed`, so the DOM is correct without the
// spec being mutable.
function toggleProseFold(
  bar: HTMLElement,
  spec: ProseBarSpec,
  plugin: ChronoAnvilPlugin
): void {
  const path = spec.path();
  if (!path) return;
  // THE BAR'S OWN CLASS IS THE STATE, not `spec.shut` — the spec is what this
  // bar was built with and a reader may press the chevron twice without a
  // rebuild in between. Flipped here, because this function owns the bar; the
  // host and the blocks under it are the painter's, through `redraw`.
  const shut = !bar.hasClass(FOLD_SHUT_CLASS);
  bar.toggleClass(FOLD_SHUT_CLASS, shut);
  for (const toggle of Array.from(bar.children)) {
    if (toggle instanceof HTMLElement && toggle.hasClass(FOLD_TOGGLE_CLASS)) {
      toggle.setAttribute("aria-label", shut ? UNFOLD_LABEL : FOLD_LABEL);
    }
  }
  setCollapsedAt(plugin, proseFoldKey(path, { nth: spec.nth, title: spec.name }), shut);
  spec.redraw(shut);
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
