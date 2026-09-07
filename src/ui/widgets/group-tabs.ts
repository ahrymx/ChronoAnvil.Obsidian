// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Which page of a widget group the reader has open, and which group a keypress
// drives. 4.34 §4 and §5.1.
//
// ── WHY THIS IS NOT IN `row.ts` ──────────────────────────────────────────
//
// That file draws a group out of a list of children and can be tested with
// neither a vault nor a settings object — `cellPlan` and `tabPlan` are the two
// pieces of this feature a suite with no DOM can actually hold, and the moment
// `row.ts` imports a plugin they stop being reachable. So it takes a `TabHandle`
// and this file is what supplies one, which is `FoldStore`'s arrangement
// (section-frame.ts) and its argument, unchanged.
//
// ── AND WHY THE KEY IS A NOTE POSITION ───────────────────────────────────
//
// A `LiveWidget` rebuilds its own subtree whenever anything in its scope
// changes, so the `.ca-journal-group` element the reader clicked can be gone by the
// time a key is pressed — which rules out holding the element as the identity of
// anything. `"<notePath>::<blockIndex>"` survives a rebuild, is what
// `collapsedNoteSections` already keys on, and is the same number `indexNow`
// computes for every drag.

import { MarkdownView } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { blockIndexAt } from "../../core/block-move";
import { splitPageIn } from "../../core/cell-move";
import { getFile } from "../../core/util";
import { SECTION_KEY_SEP } from "../../core/pathwatch";
import { boundsOf } from "../header-title";
import type { TabControl, TabHandle } from "./row";

// The key one group's open page is stored under.
//
// `SECTION_KEY_SEP` RATHER THAN A SECOND `"::"`, because the prune walks both
// records by splitting on it and a key format that is written in two places is
// a key format that has two meanings the first time one of them is edited.
export function tabKey(notePath: string, block: number): string {
  return `${notePath}${SECTION_KEY_SEP}${block}`;
}

// This block's key, or null where it has none.
//
// NULL IN AN EMBED, AN EXPORT AND ANY RENDER OUTSIDE A LIVE NOTE, which is what
// `boundsOf` already declines to locate and what `attachBlockHead` already
// treats as "this block cannot be pointed at". A group rendered there still
// draws its strip and still switches; it simply opens on page 1 every time,
// which is the honest behaviour for a copy of a note rather than the note.
export function groupKey(
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement
): string | null {
  const bounds = boundsOf(ctx, el);
  if (!bounds) return null;
  const text = ctx.getSectionInfo(el)?.text;
  if (text === undefined) return null;
  const block = blockIndexAt(text.split("\n"), bounds.from);
  return block === null ? null : tabKey(ctx.sourcePath, block);
}

// Which page this group should open on, given how many it has.
//
// CLAMPED HERE, AND THE CLAMP DOES NOT WRITE. A stored index can go stale in the
// one way a fold cannot: the reader deletes a `tab` line and the record still
// says 3. Reading that as page 1 is obvious; REPAIRING it is not, and the
// argument against is 3.15 §2.3's — a store that rewrites itself on every render
// is a reconciler correcting structure nobody asked it about, and the reader may
// be halfway through an edit that puts the page back.
// AND WHAT IS STORED IS AN ORDINAL. `count` is how many `tab` delimiters the
// block has, which bounds the ordinal without claiming every one of them drew a
// page — `layOutRow` makes the final decision, because it is the only thing that
// knows which pages had anything to show. This is the cheap half of the clamp:
// it throws out what cannot be a page under any reading.
export function openTabFor(
  plugin: ChronoAnvilPlugin,
  key: string,
  count: number
): number {
  const stored = plugin.settings.openGroupTabs?.[key];
  if (typeof stored !== "number" || !Number.isInteger(stored)) return 0;
  return stored >= 0 && stored < count ? stored : 0;
}

// Remember the page the reader just opened.
//
// THROUGH `saveSettings`, which is the path a fold already takes — see the note
// on `saveAndSync`, which says out loud that `saveSettings` "also fires for every
// collapsed section and every keystroke of capture". A page click is the same
// weight of event, and it is the whole reason this is not written into the
// markdown: a `tab` line rewritten on every click would put an entry in every
// sync log in the vault.
export function rememberTab(
  plugin: ChronoAnvilPlugin,
  key: string,
  index: number
): void {
  if (!plugin.settings.openGroupTabs) plugin.settings.openGroupTabs = {};
  const at = plugin.settings.openGroupTabs;
  // THE FIRST PAGE IS THE ABSENCE OF A KEY, so going back to it takes the key
  // out rather than storing a zero. Otherwise every group a reader ever pressed
  // twice would leave a row in data.json saying "this one is where it started".
  if (index === 0) {
    if (!(key in at)) return;
    delete at[key];
  } else {
    if (at[key] === index) return;
    at[key] = index;
  }
  void plugin.saveSettings();
}

// ── which group a keypress drives ────────────────────────────────────────
//
// A register of the groups currently on screen, and which one the reader last
// touched. Module state rather than a field on the plugin: it is a fact about
// the DOM that exists right now, it must not survive a reload, and nothing else
// has any business reading it.
const live = new Map<string, TabControl>();
let touched: string | null = null;

// Register this group's control, replacing any the last render left.
//
// KEYED, SO A REBUILD OVERWRITES RATHER THAN ACCUMULATES. The same block
// re-rendered ten times is one entry, and the tenth is the live one.
function register(key: string, control: TabControl): void {
  live.set(key, control);
}

// Drop every control whose group is no longer in the document.
//
// ASKED AT USE TIME rather than cleaned up on teardown, because the teardown
// that matters is a `LiveWidget` throwing away a subtree — it replaces the
// entry by re-registering, and the only stale entries left are notes that have
// been closed. `isConnected` is exact about both and costs nothing at the rate
// this is called, which is once per keypress.
function sweep(): void {
  for (const [key, control] of live) {
    if (!control.el.isConnected) live.delete(key);
  }
}

// The group a command should act on, or null.
//
// THE LAST ONE TOUCHED, THEN THE FIRST ON THE PAGE. A reader with one group on
// screen has never touched it and should not have to — that is the common case
// and the one they will try first. A reader with three has, by clicking or by
// dragging, and the group says so with `is-focused` (§B) because a keybind whose
// target is invisible is a keybind that changes the wrong thing.
//
// AND A TOUCH ON ANOTHER NOTE IS NOT A TOUCH ON THIS ONE. The register is keyed
// by note path, so a group touched on a note that is no longer in front cannot
// be driven by a key pressed on this one.
export function focusedGroup(plugin: ChronoAnvilPlugin): TabControl | null {
  sweep();
  const path =
    plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path ?? null;
  if (!path) return null;
  const mine = (key: string): boolean =>
    key.slice(0, key.indexOf(SECTION_KEY_SEP)) === path;

  if (touched && mine(touched)) {
    const control = live.get(touched);
    if (control) return control;
  }
  for (const [key, control] of live) {
    if (mine(key)) return control;
  }
  return null;
}

// Move the focused group on by `step` pages, wrapping at both ends.
//
// WRAPPING, BECAUSE THIS IS A SWITCHER AND NOT A STEPPER. `[3]` → next → `[1]`.
// A reader who binds one key and presses it is cycling; one that stopped at the
// end would need the second key to get home.
//
// RETURNS WHETHER IT DID ANYTHING, which is what `checkCallback` needs to keep
// the command out of the palette on a page with no tabbed group — the rule
// 3.13 §7 established for every note-scoped command.
export function stepFocusedGroup(plugin: ChronoAnvilPlugin, step: number): boolean {
  const control = focusedGroup(plugin);
  if (!control || control.count < 2) return false;
  const to = (control.at() + step + control.count) % control.count;
  control.to(to);
  return true;
}

// Whether a command that switches pages has anything to switch.
export function hasTabbedGroup(plugin: ChronoAnvilPlugin): boolean {
  const control = focusedGroup(plugin);
  return control !== null && control.count > 1;
}

// Split this group's last column off as a page of its own.
//
// EVERYTHING ASKED AT THE CLICK, NEVER AT THE RENDER. `indexNow`'s lesson, which
// cost 4.7 a patch and is restated at every writer in `block-drag.ts`: a block
// index or a body taken when the widget was drawn describes a note that has
// since been edited. It is also what keeps this free — a page of ordinary groups
// segments nothing until a button is actually pressed.
async function splitHere(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement
): Promise<void> {
  const bounds = boundsOf(ctx, el);
  const info = ctx.getSectionInfo(el);
  if (!bounds || !info) return;
  const file = getFile(plugin.app, ctx.sourcePath);
  if (!file) return;
  const text = await plugin.app.vault.read(file);
  const lines = text.split("\n");
  const block = blockIndexAt(lines, bounds.from);
  if (block === null) return;
  const next = splitPageIn(lines, block);
  // NULL MEANS NOTHING WOULD CHANGE, which here means the last page has one
  // column and there is nothing to divide. The button is withheld in that case
  // anyway; this is the same answer arriving from the other side, for a note
  // that was edited between the render and the press.
  if (!next) return;
  await plugin.app.vault.modify(file, next.join("\n"));
}

// The handle `layOutRow` takes: where to start, where to write, and how the
// register gets hold of the only way to change pages.
//
// THE KEY IS RESOLVED ONLY WHERE THERE ARE PAGES. A group with no `tab` line has
// nothing to remember and nothing to switch, so it costs no note segmenting —
// but it still gets a handle, because it is the one place the FIRST page can be
// made.
export function tabHandle(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  count: number
): TabHandle {
  const key = count > 1 ? groupKey(ctx, el) : null;
  return {
    open: key ? openTabFor(plugin, key, count) : 0,
    onOpen: (index) => {
      if (!key) return;
      touched = key;
      rememberTab(plugin, key, index);
    },
    addPage: () => void splitHere(plugin, ctx, el),
    attach: (control) => {
      if (!key) return;
      register(key, control);
      // THE GROUP SAYS WHICH ONE IS LISTENING (§B). A pointer anywhere in the
      // box claims the keybind, which is the gesture a reader already makes
      // before pressing a key about something — and `pointerdown` rather than
      // hover, because a strip that lights up as the pointer crosses it on the
      // way somewhere else is noise.
      control.el.addEventListener("pointerdown", () => {
        if (touched === key) return;
        touched = key;
        paintFocus();
      });
    },
  };
}

// One group wears `is-focused` at a time, and it is the one the key drives.
function paintFocus(): void {
  sweep();
  for (const [key, control] of live) {
    control.el.toggleClass("is-focused", key === touched);
  }
}
