// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { MarkdownRenderChild, setIcon } from "obsidian";
import {
  MODIFIER_KEYWORDS,
  headerLevel,
  parseHeaderDirective,
  stackParts,
} from "../core/directive-grammar";

// The banner's reveals — chrome a journal note opens on request (5.28).
//
// WHY THIS EXISTS, AND WHY IT IS NOT A FOLD
//
// 5.28 welded the tracker grid into the banner and shrank an empty index table
// to its head, and the vault render of both was still 300px of chrome above the
// first written word on a Lesson with two trackers and no pages. The reader's
// answer was not a smaller card:
//
//   "I was thinking the banner would gain chevrons (down/up) to expand or
//    collapse trackers or what's below."
//
// So the banner becomes the note's own control strip: one labelled chevron per
// revealable section, and a section a chevron is closed on is NOT DRAWN AT ALL
// — head included. That is the half a fold cannot do. `HeaderBar` hides a
// section's body and keeps its bar, deliberately, because "a section that folded
// itself away entirely would leave a reader nothing to click to get it back"
// (`foldableSection`). A reveal has somewhere to get back from — the button in
// the banner is the thing that is left — so it can take the whole card.
//
// AND THE DEFAULT IS CLOSED, which is the other half a fold cannot do. Every
// other collapse in this plugin starts open and remembers what the reader shut;
// a reveal starts shut and remembers what they opened. That is why the state is
// its own record rather than a namespace inside `collapsedNoteSections`: the two
// records answer opposite questions, and one map whose absent keys mean
// "expanded" for some prefixes and "collapsed" for others is a map nobody can
// iterate correctly.
//
// ── HOW A BUTTON REACHES A CARD IN ANOTHER BLOCK ────────────────────────
//
// Obsidian renders every markdown block — our ```chronoanvil fences included —
// as a separate sibling element, so the banner's fence and the What's below
// fence are two DOM trees with no relationship the banner can walk to at the
// moment it is drawn. `headerbar.ts` solves that with a sibling walk, a
// MutationObserver and a per-note settle pass, which is 300 lines and exists
// because a header bar has to work on a note it knows nothing about.
//
// This one knows exactly what it is looking for, so it does not walk anything.
// A block that draws a revealable section REGISTERS ITSELF here, keyed by note
// path; the banner SUBSCRIBES and redraws its buttons whenever the set changes.
// Blocks may render in any order, arrive late, or be torn down and rebuilt by a
// live widget, and none of it needs a timer.
//
// A TARGET IS VISIBLE UNTIL A CONTROLLER CLAIMS IT, and that rule is what makes
// the feature safe to ship closed-by-default. If a note has no banner — the
// section removed, a template preview, a fence pasted into somebody else's note
// — nothing hides, because nothing is drawn that could show it again. The
// hiding is the controller's act, never the target's.
//
// IT IS ALSO WHAT MAKES BREAKING A STACK UP FREE (5.29). Only a section welded
// into the banner's fence registers, so a section that leaves it stops being a
// target the moment its block redraws, and stops being hidden with it — no
// release to remember, no state to migrate, and the closed key left in the
// store is the arrangement's, waiting where the reader left it if they weld it
// back.

// ── ONE REVEAL PER WELDED SECTION (5.30) ────────────────────────────────
//
// `REVEAL_IDS = ["trackers", "below"]` STOOD HERE, a fixed two-word vocabulary
// with a hand-written label rule per word, and it was the last journal-shaped
// thing about the strip. The reader asked for the arrangement itself to travel:
//
//   "I think the stack could become a global thing for any page with a banner."
//
// A vocabulary of two cannot travel. Search's box is `search`, Home's period
// tiles are `launcher`, a journal dashboard's table of what is below is
// `contents`, and none of them is a word this list could have held without
// becoming a list of every section on ten catalogues — which is a catalogue,
// drawn a second time, in the render layer.
//
// SO THE FENCE ANSWERS INSTEAD, AND THAT IS WHAT 5.29's DIVIDERS WERE FOR. A
// divided stack states where each of its sections begins: part 0 is the host —
// the banner, which is the head this strip sits in and can never be revealed by
// it — and parts 1..n are one reveal each, in the order the reader arranged
// them. `stackParts` is the whole of the reading.
//
// ── AND THE ID IS THE PART'S ANCHOR, NOT ITS PLACE ──────────────────────
//
// A part's index moves the moment anything is welded in above it, and the id is
// what a reader's open/closed answer is filed under — so an id that moved would
// hand a reader somebody else's answer on the first rearrangement. The anchor is
// the first line in the part that DRAWS something, which is `BELOW_KINDS`' own
// argument one function down: the head is wording a reader may reword and the
// button under it is chrome they may delete, so the widget is the section.
//
// THIS IS NOT THE CATALOGUE'S SECTION ID AND CANNOT BE. The dispatcher reads a
// fence, not a surface — it has no catalogue, and resolving one here would drag
// ten section models into the block processor to answer a question the file
// already answers. `kind-table` is what the `children` section IS on the page;
// filing the answer under that is filing it under the thing the chevron opens.

// The first titled `header:` in a run of fence lines, which is what the section
// calls itself wherever it composes one.
//
// TITLED, because a bare `header:` is a spacer bar and naming a button after
// nothing is worse than naming it after the widget.
export function firstHeaderTitleIn(lines: readonly string[]): string | null {
  for (const line of lines) {
    if (line.split("|")[0].split(":")[0].trim() !== "header") continue;
    const { title } = parseHeaderDirective(line.slice(line.indexOf(":") + 1).trim());
    if (title.trim()) return title.trim();
  }
  return null;
}

// The keyword a part of a stack is built around.
//
// `button:` IS SKIPPED WITH THE MODIFIERS, and it is the only keyword that
// needs saying out loud. A journal index composes `header`, `header:2`,
// `button:study:new-lesson`, `kind-table:lesson` — so the first drawing line is
// a new-note button, which is a control INSIDE the section rather than the
// section, and which a reader who does not want it can take out. The table is
// what stays.
export function revealAnchorIn(lines: readonly string[]): string | null {
  for (const line of lines) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const kind = line.split("|")[0].split(":")[0].trim();
    if (MODIFIER_KEYWORDS.has(kind) || kind === "button") continue;
    return kind;
  }
  return null;
}

// What a part's chevron says.
//
// NO LABEL IS SPELLED IN THIS FILE, which was true of the two words this
// replaces and is why `nameOf` is a parameter rather than a table. The head the
// section wrote is the first answer — it is the reader's own wording, and a
// button and the card it opens calling themselves different things is the
// failure this avoids. A part with no head of its own (the logging grid: the
// weld drops its bar, which is the whole reason the grid is a band) falls back
// to whatever the dispatcher already calls that widget elsewhere.
export function revealLabelFor(
  lines: readonly string[],
  nameOf: (kind: string) => string | undefined
): string | null {
  const anchor = revealAnchorIn(lines);
  if (!anchor) return null;
  return firstHeaderTitleIn(lines) ?? nameOf(anchor) ?? anchor;
}

// Every revealable part of a banner's fence, in file order, as body line spans.
//
// PART 0 IS NEVER IN HERE. It is the host — the banner — and a chevron that
// hid the strip it is drawn in is a control with no way back.
//
// A PART THAT DRAWS NOTHING IS NOT IN HERE EITHER. A reader who left a `stack`
// line above a blank run has written a divider with no section under it; there
// is no card to hide, so there is no button.
export function revealPartsIn(
  body: readonly string[],
  nameOf: (kind: string) => string | undefined
): { id: string; label: string; from: number; to: number }[] {
  const parts = stackParts(body);
  if (parts.length < 2) return [];
  return parts.slice(1).flatMap(({ from, to }) => {
    const lines = body.slice(from, to);
    const id = revealAnchorIn(lines);
    const label = revealLabelFor(lines, nameOf);
    return id && label ? [{ id, label, from, to }] : [];
  });
}

// One thing a chevron shows and hides.
export interface RevealTarget {
  // The part's anchor keyword — see the head of this file. A `string` rather
  // than a union since 5.30, because the set of them is the set of widgets a
  // reader can weld into a banner, which is not a list this module may hold.
  id: string;
  // What the button says, where this target is the first of its id.
  label: string;
  // The element the reveal hides. Every one of them lives INSIDE the banner's
  // own block, which is the whole of what makes them revealable (5.29): a part
  // of the stack is a RUN of the banner's children, one registration each. A
  // section in a fence of its own has its own head and its own fold and
  // registers nothing here.
  el: HTMLElement;
}

// Where a reveal's state lives.
//
// AN INTERFACE RATHER THAN THE PLUGIN, for `FoldStore`'s reason — this module is
// imported by the widget dispatcher, which imports half the plugin, and taking
// `ChronoAnvilPlugin` here would be the cycle.
export interface RevealStore {
  isOpen(key: string): boolean;
  setOpen(key: string, open: boolean): void;
}

// The separator is `SECTION_KEY_SEP`'s, so `pathwatch.ts` retargets these keys
// on a rename with the same three lines it uses for every other per-note record.
export function revealKey(path: string, id: string): string {
  return `${path}::${id}`;
}

// ── THE PURE HALF ───────────────────────────────────────────────────────
//
// Kept apart from the DOM and the registry for the reason `chromeClasses` is:
// the interesting part is a rule over a list, and a rule that can be asserted is
// worth more than one that has to be eyeballed in a vault.

// The buttons a banner draws for a set of targets: one per id, in the order the
// first target of each id registered, labelled by that first target.
//
// FILE ORDER, WHICH IS THE READER'S ORDER (5.30). `REVEAL_IDS` used to impose
// one — the grid before the index, on the argument that the grid is what a
// reader came to the note to fill in — and an imposed order is exactly what
// stops working the moment the sections are the reader's own arrangement. Every
// target registers from one pass over one fence, so registration order IS the
// order the parts are written in, and the strip reads left to right the way the
// card reads top to bottom.
//
// ONE BUTTON, EVERY TARGET. A part is a RUN of the banner's children, so its
// several elements are several registrations under one id — and two buttons
// saying the same word, each hiding half of a section, is a control that lies
// about what it does.
export function revealButtons(
  targets: readonly RevealTarget[]
): { id: string; label: string; targets: RevealTarget[] }[] {
  const order: string[] = [];
  for (const t of targets) if (!order.includes(t.id)) order.push(t.id);
  return order.map((id) => {
    const mine = targets.filter((t) => t.id === id);
    return { id, label: mine[0].label, targets: mine };
  });
}


// The directives that make a fence the note's "what's below" — the table of a
// folder's notes, of a long note's pages, or of a subject's topics.
//
// THE TABLES AND NOT THE HEADS. A fence is claimed by what it DRAWS, the way
// `OVERVIEW_KINDS` and `BANNER_KINDS` claim theirs, because the head is wording
// a reader may change and the table is the section.
//
// `level-index` IS IN HERE BECAUSE THE SWEEP SAID SO. This list was written by
// reading the `children` section's `claims` — header, button, topics-table,
// kind-table — and that list is one word out of date: the section RENDERS
// `level-index` above the deepest level and keeps `topics-table` only so a
// note written before 4.16 still locates. Which is to say the subject index,
// the note in the screenshots carrying the most chrome of the three, was the
// one note that would have got no chevron at all. `test/banner-reveal.test.ts`
// composes every shipped template and fails if a section this list is supposed
// to name goes unnamed, which is how that was found rather than noticed.
//
// `level-cards` is deliberately not here: it draws the same question in cards,
// but only a journal DASHBOARD composes it, and a dashboard has no banner to
// hang a chevron on.
export const BELOW_KINDS = new Set([
  "level-index",
  "kind-table",
  "pages-table",
  "topics-table",
]);

// The stretch of a BANNER fence that is the note's index — 5.28, second half.
//
// WHY A SPAN AND NOT A BLOCK. The reader asked for the index to be attached to
// the banner the way the grid is, and the catalogue answers by welding it into
// the banner's fence. Inside one fence there is no element wrapping a section:
// `sectionFrame` draws a BAR, the widgets after it are its siblings, and what a
// bar owns is "everything until the next bar of its level or shallower" —
// `HeaderBar`'s own rule, which it needs a mutation observer to apply across
// blocks and which is a slice of one array in here.
//
// The span is over the fence's LINES, and the dispatcher already records where
// each line's children start (`drawn`), so a line range converts to an element
// range with no DOM reading at all.
//
// WHICH HEAD OPENS IT: the last head at the shallowest level before the first
// table. On a topic index the fence carries `header:🗂️ What's below` and then a
// `header:2:` per kind, so the level is what tells the section's own head from
// the group heads inside it — and a reader who welded a second section in front
// of this one keeps it, because that head is not the shallowest-and-last.
export function belowSpanIn(
  lines: readonly string[]
): { from: number; to: number; label: string } | null {
  const kindOf = (l: string): string => l.split("|")[0].split(":")[0].trim();
  const first = lines.findIndex((l) => BELOW_KINDS.has(kindOf(l)));
  if (first < 0) return null;

  // The same level rule the block processor applies, counted the same way: a
  // bare `header:` is level 1 only if it is the fence's first TITLED head.
  const heads: { at: number; level: number; title: string }[] = [];
  let titled = 0;
  for (const [at, line] of lines.entries()) {
    if (kindOf(line) !== "header") continue;
    const rest = line.slice(line.indexOf(":") + 1).trim();
    const { title } = parseHeaderDirective(rest);
    heads.push({ at, level: headerLevel(rest, titled === 0), title: title.trim() });
    if (title.trim()) titled++;
  }

  const before = heads.filter((h) => h.at < first && h.title);
  if (!before.length) return null;
  const level = Math.min(...before.map((h) => h.level));
  const head = before.filter((h) => h.level === level).pop();
  if (!head) return null;
  const next = heads.find((h) => h.at > head.at && h.level <= head.level);
  return { from: head.at, to: next?.at ?? lines.length, label: head.title };
}

// ── THE REGISTRY ────────────────────────────────────────────────────────

const targetsByPath = new Map<string, Set<RevealTarget>>();
const watchersByPath = new Map<string, Set<() => void>>();

function announce(path: string): void {
  for (const cb of watchersByPath.get(path) ?? []) cb();
}

// Register one revealable section. Returns the teardown, which a
// `MarkdownRenderChild` calls on unload — a block that is rebuilt registers
// again, and a block that leaves the note takes its entry with it.
export function addRevealTarget(
  path: string,
  target: RevealTarget
): () => void {
  let set = targetsByPath.get(path);
  if (!set) {
    set = new Set();
    targetsByPath.set(path, set);
  }
  set.add(target);
  announce(path);
  return () => {
    const live = targetsByPath.get(path);
    if (!live) return;
    live.delete(target);
    if (live.size === 0) targetsByPath.delete(path);
    announce(path);
  };
}

// Subscribe to the note's set of targets. The callback runs whenever a block
// registers or unregisters, which is how the banner draws a button for a card
// that had not been rendered yet when the banner was.
export function watchRevealTargets(path: string, cb: () => void): () => void {
  let set = watchersByPath.get(path);
  if (!set) {
    set = new Set();
    watchersByPath.set(path, set);
  }
  set.add(cb);
  return () => {
    const live = watchersByPath.get(path);
    if (!live) return;
    live.delete(cb);
    if (live.size === 0) watchersByPath.delete(path);
  };
}

export function revealTargetsFor(path: string): RevealTarget[] {
  return Array.from(targetsByPath.get(path) ?? []);
}

// The class a claimed, closed target wears. On its own element rather than on a
// wrapper: a reveal has to be able to hide a whole block, and a block has no
// wrapper this module is allowed to introduce.
export const REVEAL_HIDDEN_CLASS = "ca-journal-reveal-hidden";

// FOR TESTS AND FOR A RELOAD. The registry is module state, which is right — a
// note's blocks have no common owner and the plugin instance is not one either
// — and module state that nothing can clear is a leak with a long fuse.
export function clearRevealRegistry(): void {
  targetsByPath.clear();
  watchersByPath.clear();
}

// ── THE TWO RENDER CHILDREN ─────────────────────────────────────────────
//
// Both are `MarkdownRenderChild`s rather than plain objects so Obsidian's own
// teardown drives the registry: a block that scrolls out of a long note, a note
// that closes, a live widget that rebuilds its subtree — each already unloads
// its children, and each has to take its registration with it or the banner
// draws a button for a card that is not on the page.

// A block that holds a revealable section.
export class RevealTargetChild extends MarkdownRenderChild {
  private off: (() => void) | null = null;

  constructor(
    el: HTMLElement,
    private path: string,
    private target: RevealTarget
  ) {
    super(el);
  }

  onload(): void {
    this.off = addRevealTarget(this.path, this.target);
  }

  onunload(): void {
    this.off?.();
    this.off = null;
    // SHOWN AGAIN ON THE WAY OUT. The class is the controller's mark on
    // somebody else's element; leaving it behind on a block that is being
    // recycled — Obsidian reuses preview sections — would hide a card no button
    // is claiming any more.
    this.target.el.removeClass(REVEAL_HIDDEN_CLASS);
  }
}

// The strip of chevrons in the banner.
export class RevealBar extends MarkdownRenderChild {
  private off: (() => void) | null = null;
  private claimed: RevealTarget[] = [];

  constructor(
    private barEl: HTMLElement,
    private path: string,
    private store: RevealStore
  ) {
    super(barEl);
  }

  onload(): void {
    this.off = watchRevealTargets(this.path, () => this.draw());
    this.draw();
  }

  onunload(): void {
    this.off?.();
    this.off = null;
    this.release();
  }

  private release(): void {
    for (const t of this.claimed) t.el.removeClass(REVEAL_HIDDEN_CLASS);
    this.claimed = [];
  }

  private draw(): void {
    // RELEASED BEFORE REDRAWN, because the previous pass's claims are over
    // elements this pass may no longer be able to see. A target that
    // unregistered while closed would otherwise keep the class for as long as
    // its block lives.
    this.release();
    this.barEl.empty();

    const buttons = revealButtons(revealTargetsFor(this.path));
    for (const { id, label, targets } of buttons) {
      const open = this.store.isOpen(revealKey(this.path, id));
      const btn = this.barEl.createEl("button", {
        cls: "ca-journal-reveal-toggle",
        attr: { type: "button", "aria-expanded": String(open) },
      });
      btn.createSpan({ cls: "ca-journal-reveal-label", text: label });
      const chev = btn.createDiv({ cls: "ca-journal-reveal-chevron" });
      // ONE GLYPH, TURNED. Two icons — a right chevron closed and a down one
      // open — is the same information said twice and one more thing to keep
      // in step; the stylesheet rotates this one, which is also what
      // `foldableSection`'s chevron does.
      setIcon(chev, "chevron-down");
      btn.toggleClass("is-open", open);

      for (const t of targets) {
        t.el.toggleClass(REVEAL_HIDDEN_CLASS, !open);
        this.claimed.push(t);
      }

      this.registerDomEvent(btn, "click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const key = revealKey(this.path, id);
        this.store.setOpen(key, !this.store.isOpen(key));
        this.draw();
      });
    }
  }
}
