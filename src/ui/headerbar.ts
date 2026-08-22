// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Header bars that collapse their section.
//
// A `header:` directive renders a bar that owns "everything after me until the
// next header bar of the same or higher level". Obsidian renders each markdown
// block (our ```almanac fence included) as a separate sibling element in the
// preview, so a header bar can't *contain* its section in the DOM — visibility
// is instead derived by walking the note's block-level siblings.
//
// UNLESS ITS OWN FENCE DREW THE BODY (4.57.1), which is how every page Almanac
// composes is written now: the bar and its widgets are one fence, so the
// section is that block and the blocks after it are the reader's. The sentence
// above is the OTHER shape — a bar alone in its fence — and is why the scope
// exists. See `SecNode.ends` and `bodyInOwnFence`.
//
// A bar owns TWO KINDS OF THING and both are siblings rather than children.
// The blocks after it, as above; and the widgets welded into its own fence,
// which render beside it inside the one block that fence became. Sections
// written the second way — Learning Path with its `path:` field, Resources
// with its `attach:` shelves, Charts with its chart stack — used to turn their
// chevron, persist their state, and go on showing the widget the section is
// for, because the walk only ever looked at whole blocks. The walk is now
// flattened over both (see recompute).
//
// Visibility is computed HOLISTICALLY, not toggled per-bar. Each bar knows its
// own collapsed state (persisted per "<notePath>::<title>"), but a block's
// hidden state is a pure function of *every* bar above it: a block is hidden if
// it falls inside the scope of any collapsed ancestor bar. Deriving it in one
// pass (recompute) avoids the ordering conflict a per-bar toggle has — e.g. a
// collapsed level-1 "Journals" and an expanded level-2 "Study" beneath it used
// to fight over the same shared `journal-section-hidden` class on the blocks
// they both cover, leaving an orphaned callout visible. Now the level-1
// collapse wins because the block is simply inside a collapsed ancestor.
//
// The arrow is a custom glyph (Obsidian's native heading-fold arrow only exists
// on real markdown headings, which these bars deliberately are not).

import { MarkdownRenderChild, setIcon } from "obsidian";
import { OBSIDIAN_DOM } from "../core/constants";
import type AlmanacPlugin from "../main";

// One shared timer rather than one per bar: folding three sections in a row
// should be one write, not three. Module-level because the bars are separate
// MarkdownRenderChild instances with no common owner, and a fold survives the
// bar that made it being torn down by a re-render.
let persistTimer: number | null = null;
const PERSIST_DELAY_MS = 400;

function schedulePersist(plugin: AlmanacPlugin): void {
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void plugin.saveSettings();
  }, PERSIST_DELAY_MS);
}

// One element of the flattened fold walk.
//
// Pure data, because the interesting half of folding is a scope calculation
// and not a DOM traversal — separating them is what lets the rule be asserted
// (see test/headerbar.test.ts) rather than eyeballed on a dashboard.
export interface FoldNode {
  // A header bar's level (1 or 2); 0 for anything that isn't a bar.
  level: number;
  // This bar is folded, so it opens a scope over what follows.
  collapsed: boolean;
  // A real markdown heading, which ends every open scope. See the note below.
  heading: boolean;
}

// Which nodes are hidden, given every bar's fold state.
//
// A node is hidden iff some collapsed bar's scope still covers it. A bar of
// level L owns everything after it until a header of level <= L, so a level-1
// bar folds the level-2 bars beneath it too; the stack makes that a single
// rule rather than a per-bar toggle, which is what an earlier version had, and
// what let a collapsed level-1 "Journals" and an expanded level-2 "Study"
// beneath it fight over the same class and leave an orphaned callout on screen.
//
// A MARKDOWN HEADING ENDS EVERY OPEN BAR SCOPE.
//
// Without this a bar owns "everything after me until the next bar", and on a
// note with one bar that means the rest of the file. Measured on the shipped
// Lesson template, whose only bar is `header:📄 Pages`: folding it hid 21
// blocks — every heading, both widgets and the whole body. The user folded a
// pages table and the note vanished.
//
// Terminating rather than nesting, because a bar and a heading are different
// kinds of thing. A bar titles a WIDGET section; a heading is the note's own
// structure. A widget section has no business extending across a boundary the
// document drew, whatever the relative depths would say if the two were one
// hierarchy. Depth is why they aren't one: bars have two levels and headings
// have six, and any mapping between them would make `## Overview` either
// swallowed by a level-1 bar above it or able to close a level-2 bar it was
// written inside.
//
// Costs nothing on the dashboards: no shipped dashboard interleaves a markdown
// heading with a bar, so this changes no existing fold.
export function computeFoldHidden(nodes: FoldNode[]): boolean[] {
  const out: boolean[] = [];
  // Levels of the collapsed bars whose scope still covers what we're walking.
  const active: number[] = [];

  for (const node of nodes) {
    if (node.level === 0 && node.heading) {
      active.length = 0;
      out.push(false);
      continue;
    }

    // A header at level L closes any scope of level >= L. BEFORE its own
    // visibility is decided, so a section isn't hidden by the one above it.
    if (node.level !== 0) {
      while (active.length && active[active.length - 1] >= node.level) {
        active.pop();
      }
    }

    out.push(active.length > 0);

    // A collapsed bar is itself visible — that is the only way back — and
    // opens a scope over everything after it.
    if (node.level !== 0 && node.collapsed) active.push(node.level);
  }

  return out;
}

// ── the paint pass's core ─────────────────────────────────────────────────

// One block of the note, as the run calculation sees it.
//
// EXTRACTED IN 3.13 §3, for the reason `computeFoldHidden` was: "the
// interesting half of folding is a scope calculation and not a DOM traversal —
// separating them is what lets the rule be asserted rather than eyeballed on a
// dashboard." `markSectionBodies` is the same kind of calculation and had no
// such split, so every rule below was checkable only by opening a dashboard and
// looking — including the two that produced visible bugs.
export interface SecNode {
  // A titled level-1 bar. Opens a run, and closes whatever was open.
  opens: boolean;
  // Ends the open run and joins nothing: a markdown heading, Obsidian's own
  // chrome, or a level-1 bar with no `data-headerKey` — an untitled bar or the
  // diary entry banner, neither of which is a section head.
  closes: boolean;
  // Hidden by the fold pass. AN INPUT RATHER THAN SOMETHING COMPUTED HERE,
  // which promotes the existing ordering rule — the paint pass runs after the
  // fold pass — from a comment into a parameter.
  hidden: boolean;
  // Renders something a reader can see. A storage region
  // (`<!--almanac:path-->`) is a real block that renders nothing.
  renders: boolean;
  // The section is complete in this block, so the run ends where the block
  // does. Only meaningful with `opens`.
  //
  // WHAT THIS IS ABOUT (4.57.1). A bar owns the blocks after it because in 2.x a
  // section was written as two fences — a `header:` fence and a body fence —
  // and Obsidian renders each block separately, so a section could not contain
  // its own body. Every page Almanac composes today welds the two: `header:⏳
  // Open tasks` and `tasks-table` are one fence, and so is the charts section
  // that ends the homepage. For those, "the blocks after it" is not the
  // section's body — it is whatever the reader put next, and the homepage's
  // last section quietly took every page widget added below it into its card
  // and into its fold.
  //
  // So the rule is what the fence says: a fence that drew a body has named what
  // its section holds. A bar ALONE in its fence is the 2.x shape and still owns
  // what follows, which is what keeps every note composed before this working.
  ends: boolean;
}

export interface SecMark {
  member: boolean;
  first: boolean;
  last: boolean;
}

// Which blocks belong to a section, and which of them carry its two ends.
//
// NOT MERGED WITH `computeFoldHidden`, though they share boundaries. The two
// disagree on one thing deliberately: a `.cm-line` is never hidden and is still
// a member of the section. One function returning both would carry that
// exception internally, where today it is a guarded `continue` at the call site
// with a paragraph explaining itself.
//
// THE TWO RULES WORTH THE EXTRACTION are the two that produced bugs, and both
// are arithmetic over a list of flags rather than anything about the DOM:
//
//   `is-last` lands on the last member that is BOTH visible and renders
//   something — otherwise a section ending in a storage region rounds an
//   invisible element and leaves a band of empty surface under the content.
//
//   A fully collapsed section falls back to index 0. The head block is never
//   hidden by its own bar, so index 0 is always a safe floor, and a collapsed
//   section becomes one block that is both of its own ends.
export function computeSectionRuns(nodes: SecNode[]): SecMark[] {
  const marks: SecMark[] = nodes.map(() => ({
    member: false,
    first: false,
    last: false,
  }));
  let run: number[] = [];

  const close = (): void => {
    if (!run.length) return;
    let last = -1;
    for (let i = run.length - 1; i >= 0; i--) {
      const n = nodes[run[i]];
      if (n.hidden) continue;
      if (n.renders) {
        last = i;
        break;
      }
    }
    if (last === -1) last = 0;
    run.forEach((idx, i) => {
      marks[idx].first = i === 0;
      marks[idx].last = i === last;
    });
    run = [];
  };

  nodes.forEach((n, i) => {
    // A head both ends the previous run and starts one, in that order.
    if (n.opens) {
      close();
      marks[i].member = true;
      run.push(i);
      // A section whose body is inside its own fence is one block long, and
      // closing here rather than at the next boundary is what puts both ends of
      // the surface on it — `is-first` and `is-last` on the same block, which
      // `close()` already knows how to do for a fully collapsed section.
      if (n.ends) close();
      return;
    }
    if (n.closes) {
      close();
      return;
    }
    // Outside a section. Not an error and not a boundary — a note's own prose
    // between two dashboards' fences lands here.
    if (!run.length) return;
    marks[i].member = true;
    run.push(i);
  });
  close();

  return marks;
}

// How long the renderer must stay quiet before the tail of the initial render
// counts as over, and how long to wait for that quiet before giving up on it.
//
// 3.12.1 deferred the pass by one `requestAnimationFrame` — a duration standing
// in for an event nothing announces. `SETTLE_MS = 3000` replaced it with the
// same shape, better only because it was three thousand times longer.
//
// QUIET IS DIRECTLY OBSERVABLE WHERE ELAPSED TIME IS NOT (3.13 §4). The thing
// being waited for is the renderer falling silent, so silence is what is
// measured: no `childList` mutation for QUIET_MS means the note has finished
// arriving. That retires early on a fast desktop and late on a slow phone,
// which is exactly the difference a fixed duration cannot express.
//
// THE CAP IS NOT A FORMALITY. A dashboard holding a live chart, a polling
// embed, or any widget that writes to the DOM on a timer never falls quiet, and
// a quiet rule with no cap is "watch for the whole session" wearing a different
// name. The cap turns that case into the old behaviour with a longer fuse — the
// worst case rather than a new one.
// Built once from OBSIDIAN_DOM rather than written inline, so the class names
// live in the table with the rest of Obsidian's DOM and the regex here is only
// the matching rule.
const READING_HEADING = new RegExp(
  `\\b${OBSIDIAN_DOM.readingHeadingWrapper}[1-6]\\b`
);
const EDITOR_HEADING = new RegExp(
  `\\b${OBSIDIAN_DOM.editorHeading}\\b|\\b${OBSIDIAN_DOM.editorHeadingLevel}\\b`
);

// What a block wears that is not its content: the drag grip and the two drop
// slots `attachBlockHead` hangs on every block, and the head it draws for a
// block with no bar of its own. Spelled here rather than imported, because
// `block-drag.ts` reaches the plugin and this module is imported by everything;
// test/headerbar.test.ts pins the two spellings together.
const BLOCK_FURNITURE = ".jbd-slot, .jbd-handle, .journal-block-head";

const QUIET_MS = 500;
const SETTLE_CAP_MS = 10000;

// One watcher per NOTE, shared by every bar in it.
//
// WHY THIS EXISTS, AND IT IS NOT THE ARITHMETIC. `watchForLateSiblings`
// attached a `MutationObserver` per BAR, and every bar in a note attaches to
// the same parent — so the shipped homepage put five observers on one node and
// a journal index six or seven, each with its own frame dedupe and its own
// retirement timer. Every batch of appended blocks then scheduled six full-note
// passes, each independently deduplicated to one per frame: six passes
// computing the same answer over the same blocks in the same frame.
//
// The waste was modest, because the pass is DOM-local and idempotent. The
// argument is OWNERSHIP. The observer, the frame dedupe, the settle timer and
// the pass are all note-scoped concerns, and they were held by an object whose
// scope is one bar — which is why the retirement timer was per-bar, and why the
// footer leak had nowhere to be repaired from.
//
// KEYED BY WeakMap, because the key is a DOM element whose lifetime the plugin
// does not control. A `Map` here is a leak with a nicer name.
const passes = new WeakMap<HTMLElement, SectionPass>();

class SectionPass {
  private observer: MutationObserver | null = null;
  private members = new Set<() => void>();
  private queued = false;
  private quiet = 0;
  private cap = 0;

  constructor(private parent: HTMLElement) {}

  // A bar joins its note's pass. RE-ARMING A RETIRED WATCHER IS DELIBERATE: a
  // bar arriving after the watcher gave up is itself evidence the note is still
  // growing, which is the event the watcher exists for.
  add(run: () => void): void {
    this.members.add(run);
    this.arm();
  }

  // ...and leaves on its own teardown. The last one out disconnects and clears
  // the note's marks.
  remove(run: () => void): void {
    this.members.delete(run);
    if (this.members.size > 0) return;
    this.retire();
    this.clearMarks();
    passes.delete(this.parent);
  }

  private arm(): void {
    if (!this.observer) {
      if (typeof MutationObserver === "undefined") return;
      // `childList` AND NOTHING ELSE, deliberately: the pass toggles classes,
      // classes are attributes, and an observer watching attributes re-enters
      // on its own writes. Moving this must not quietly widen it.
      this.observer = new MutationObserver(() => this.onMutations());
      this.observer.observe(this.parent, { childList: true });
    }
    this.restartQuiet();
    if (!this.cap) {
      this.cap = window.setTimeout(() => this.retire(), SETTLE_CAP_MS);
    }
  }

  private onMutations(): void {
    // RESET ON THE BATCH, NOT ON THE PASS. The frame dedupe below coalesces a
    // burst into one recompute; the quiet timer is reset before it, so a burst
    // that yields a single pass still counts as one piece of evidence that the
    // note is still growing.
    this.restartQuiet();
    if (this.queued) return;
    this.queued = true;
    window.requestAnimationFrame(() => {
      this.queued = false;
      // ONE pass, not one per member: every bar's recompute walks the whole
      // note and computes the same answer, so any live member will do.
      for (const run of this.members) {
        run();
        return;
      }
    });
  }

  private restartQuiet(): void {
    window.clearTimeout(this.quiet);
    this.quiet = window.setTimeout(() => this.retire(), QUIET_MS);
  }

  private retire(): void {
    this.observer?.disconnect();
    this.observer = null;
    window.clearTimeout(this.quiet);
    window.clearTimeout(this.cap);
    this.quiet = 0;
    this.cap = 0;
  }

  // THE FOOTER LEAK, CLOSED FROM THE NOTE THAT LEFT.
  //
  // `.mod-footer.mod-ui` belongs to the LEAF, not the document: Obsidian makes
  // it once per leaf and reuses it across file switches, so a class put on it
  // outlives the note that caused it — open a dashboard with sections, then any
  // other note in the same tab, and the footer arrives still wearing
  // `journal-sec-block is-last`, drawing an empty grey band under a note with
  // no Almanac content in it.
  //
  // `computeSectionRuns` already refuses to make the footer a member, which is
  // the first defence and why this is rare rather than routine. But the old
  // comment admitted the leak had nowhere to be repaired from — "a note with no
  // header bar registers no HeaderBar and never runs this pass" — which is true
  // and was the wrong note to fix it from. The note that LEFT holds the stale
  // classes, and it has a teardown. This is it.
  private clearMarks(): void {
    for (const el of Array.from(this.parent.children)) {
      el.removeClass("journal-sec-block");
      el.removeClass("is-first");
      el.removeClass("is-last");
    }
  }
}

// Is this element the note's section container — the thing whose children are
// the note's blocks?
//
// LIFTED TO MODULE SCOPE IN 3.13 §1.5. It was a local inside `siblingAnchor`,
// where it had one caller and needed no name of its own. The construction-time
// mark is the second caller, and it needs the test rather than the walk: the
// walk always returns SOMETHING, and what it returns when the block is not yet
// attached is an inner element.
//
// `.markdown-rendered` is the note's container in READING view and, in Live
// Preview, the container of ONE code-block widget inside `.cm-embed-block` —
// hence the exclusion, without which every fence in Live Preview saw only
// itself.
function isSectionParent(p: HTMLElement | null): boolean {
  return (
    !!p &&
    (p.classList.contains(OBSIDIAN_DOM.previewSection) ||
      p.classList.contains(OBSIDIAN_DOM.cmSizer) ||
      p.classList.contains(OBSIDIAN_DOM.cmContent) ||
      (p.classList.contains(OBSIDIAN_DOM.markdownRendered) &&
        !p.closest(`.${OBSIDIAN_DOM.widgetWrapper}`)))
  );
}

export class HeaderBar extends MarkdownRenderChild {
  constructor(
    private plugin: AlmanacPlugin,
    // The header bar element itself (.journal-header-bar).
    private barEl: HTMLElement,
    // The ```almanac code block's root element (ctx `el`) — its block-level
    // ancestor is the sibling anchor we walk from.
    private blockEl: HTMLElement,
    private sourcePath: string,
    private title: string,
    // 1 = container (folds nested level-2 bars too), 2 = nested.
    private level: number
  ) {
    super(barEl);
  }

  // The pending attachment poll, and when it started. See `whenAttached`.
  private attachFrame: number | null = null;
  private attachSince = 0;

  private get key(): string {
    return `${this.sourcePath}::${this.title}`;
  }

  private isCollapsed(): boolean {
    return this.plugin.settings.collapsedNoteSections?.[this.key] === true;
  }

  // Fold state stays in settings, so it syncs with everything else — a section
  // folded on one device is folded on the next. What it should NOT do is write
  // data.json on every chevron click: a fold is a glance, people fold and
  // unfold several in a row, and each one was an await on a disk write plus a
  // sync event. The in-memory value updates immediately (recompute reads it on
  // the next line); only the persist is deferred.
  private setCollapsed(v: boolean): void {
    if (!this.plugin.settings.collapsedNoteSections) {
      this.plugin.settings.collapsedNoteSections = {};
    }
    const map = this.plugin.settings.collapsedNoteSections;
    if (v) map[this.key] = true;
    else delete map[this.key];
    schedulePersist(this.plugin);
  }

  onload(): void {
    // Collapse toggle: a chevron button prepended to the bar. Clicking the bar
    // itself (outside its buttons/links) also toggles, so the whole title strip
    // is a hit target — but clicks on the anchored controls are left alone.
    this.barEl.addClass("journal-header-collapsible");
    // Tag the bar with its own persisted key + level so the holistic recompute
    // can read state straight off the DOM without needing every bar's instance.
    this.barEl.dataset.headerKey = this.key;
    this.barEl.dataset.headerLevel = String(this.level);

    // THE RIGHT-HAND END, AS OF 4.13 §1b. This prepended, so the fold control sat
    // where a reader's eye starts and pushed the glyph and the title along.
    //
    // INSERTED BEFORE THE ACTIONS RATHER THAN APPENDED, and the difference is not
    // cosmetic: at level 1 the actions slot is `flex: 1 0 100%`, so it is a whole
    // second ROW of the bar — an appended chevron would land after it and wrap to
    // a third. Placing it before the actions and pushing it over with
    // `margin-left: auto` puts it at the end of the FIRST row, which is where it
    // belongs, and leaves the title first in the DOM for a screen reader.
    const toggle = createDiv({ cls: "journal-header-toggle" });
    setIcon(toggle, "chevron-down");
    const actions = this.barEl.querySelector(".journal-header-widgets");
    if (actions) this.barEl.insertBefore(toggle, actions);
    else this.barEl.appendChild(toggle);

    const onToggle = (evt: Event) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.toggle();
    };
    this.registerDomEvent(toggle, "click", onToggle);
    this.registerDomEvent(this.barEl, "click", (evt) => {
      // Ignore clicks that land on the section's widgets (buttons, links, date
      // pickers) — only the bare title area folds.
      //
      // AND SINCE 4.11 THOSE ARE ON A STRIP UNDER THE TITLE RATHER THAN BESIDE IT,
      // which is why this reads the CLASS and not a position. The slot kept its
      // element and both its classes precisely so this line and `foldableSection`'s
      // twin did not have to learn about a second bar — a control that folded its
      // own section when clicked is what a new wrapper here would have shipped.
      const target = evt.target as HTMLElement;
      if (target.closest(".journal-header-widgets")) return;
      onToggle(evt);
    });

    // EVERYTHING THAT NEEDS TO KNOW WHERE THIS BLOCK SITS WAITS UNTIL IT SITS
    // THERE. See `whenAttached` — this used to be an unconditional
    // `requestAnimationFrame(recompute)` plus a `joinNotePass()` that resolved
    // the note's container in `onload`, and a bar whose block was not attached
    // yet got a pass over the wrong parent and joined a shared pass keyed on
    // one, permanently.
    this.whenAttached();
  }

  // WAIT FOR AN OBSERVABLE CONDITION, NOT FOR A DURATION — 3.13.9, and the
  // third time this file has learned it.
  //
  // 3.12.1 deferred the paint by one frame and a phone took several. §4
  // replaced a fixed three seconds with silence, because silence is what
  // "the renderer has finished" actually looks like. This is the same mistake
  // one level down: `onload` is not the moment a block is in the note.
  //
  // A code-block post-processor is handed an element the renderer inserts
  // AFTERWARDS, so in `onload` `siblingAnchor()` can climb to something whose
  // parent is not the note's container. §1.5 predicted that and guarded
  // `claimOwnBlock` against it — correctly, because marking a detached inner
  // element paints a surface inside a surface that no later pass can clear.
  // What §1.5 did not do is COME BACK. The guard refused, the frame passed,
  // and nothing asked again.
  //
  // `joinNotePass` was worse, because it did not ask at all: it read
  // `siblingAnchor().parentElement` in `onload` and either returned early (no
  // parent — the bar joins no pass, ever) or registered a pass keyed on an
  // inner wrapper, whose observer watches a subtree the note's blocks never
  // arrive in. So a bar that mounted detached was orphaned from the note's
  // shared pass for the life of the note.
  //
  // WHICH IS EXACTLY WHAT THE HOMEPAGE'S TAGS SECTION WAS. Reported on a fresh
  // vault: `📊 Trends and Statistics` painted, `🏷️ Tags` beneath it bare —
  // and clicking Tags fixed it, because `toggle()` calls `recompute()` directly
  // and `recompute` resolves the anchor on every call. The failure was never
  // that the pass computes Tags wrongly. It is that after Tags was attached, no
  // pass ever ran for it: its own were resolved while it was detached, and the
  // container's shared observer — which fires when the Tags block is inserted —
  // ran on the next frame, before Tags' own `onload` had set the
  // `data-headerKey` the pass identifies sections by, and then fell quiet.
  //
  // So: poll for attachment, which is a fact about the DOM that can be read,
  // rather than for a number of frames, which is a guess about the renderer.
  // Each attempt is one walk up a handful of parents. Bounded by the same cap
  // the settle rule uses, because a block that has not been inserted after ten
  // seconds is not going to be.
  private whenAttached(): void {
    const el = this.siblingAnchor();
    const parent = el.parentElement;
    if (isSectionParent(parent)) {
      this.claimOwnBlock(el);
      this.joinNotePass(parent as HTMLElement);
      this.recompute();
      return;
    }
    if (this.attachSince === 0) this.attachSince = Date.now();
    if (Date.now() - this.attachSince > SETTLE_CAP_MS) return;
    this.attachFrame = window.requestAnimationFrame(() => this.whenAttached());
  }

  onunload(): void {
    if (this.attachFrame !== null) window.cancelAnimationFrame(this.attachFrame);
  }

  // A SECTION OWNS ITS OWN BLOCK, WITHOUT WAITING TO BE TOLD — 3.13.
  //
  // `markSectionBodies` is a HOLISTIC pass: it walks every block of the note in
  // order and works out which section each one belongs to. That is the right
  // shape for the question it was written for — "which of the blocks AFTER this
  // header does it own" — and the wrong shape for the one block whose answer
  // needs no walking at all. A bar's own block is that bar's section. Always.
  // No sibling can change it and no ordering can reveal it late.
  //
  // WHY THAT MATTERED. Everything about a section's surface depended on a pass
  // that only runs when some bar decides to schedule one, and a pass scheduled
  // by an EARLIER bar can run before a later bar's `onload` has set the
  // `data-headerKey` it identifies sections by. `markSectionBodies` then reads
  // a bar element with no key, skips the block entirely — `if
  // (!bar.dataset.headerKey) continue;` — and the section renders with no
  // background at all.
  //
  // The homepage's Tags section is where this showed, because it is a single
  // WELDED fence (`header:🏷️ Tags` and `tag-index:` in one block) sitting last
  // on the page. Welded sections were assumed safe: their body is complete when
  // their bar is, so the late-sibling problem 3.12.1 fixed cannot reach them.
  // True, and it hid that they were exposed to a different race entirely — one
  // that has nothing to do with siblings and, as it turned out, nothing to do
  // with mobile. It was reported as mobile-only and reproduced on desktop.
  //
  // SO THE PASS LOSES A RESPONSIBILITY RATHER THAN GAINING A RETRY. 3.12.1
  // widened the window the holistic pass watches; this narrows what the window
  // has to catch. `recompute` remains the authority — it clears and re-sets
  // every class on every run, so a block that claimed itself and then genuinely
  // belongs to a longer run is corrected on the next pass, and a bar edited
  // away still leaves no orphan. What claiming buys is that the FLOOR is right
  // from the first frame: a titled section is never unpainted, whatever else
  // has or has not rendered.
  //
  // `is-first` COMES WITH IT AND `is-last` DOES NOT (§1.4), and the reason is
  // Charts. The tempting version gives the head block both when its fence
  // rendered a body beside it, which would make a welded section complete in
  // one step. But a welded body does not mean the section ENDS at the block:
  // `📊 Charts` has its stack in its own fence AND owns the note beneath it up
  // to the next level-1 bar. Whether this is the last block is genuinely
  // unknowable to a bar that has only itself, and guessing it is the same class
  // of error as guessing that one frame was enough.
  //
  // The honest degradation is a square bottom for one frame: until the first
  // pass runs, a welded section has its surface, its top rounding and no bottom
  // rounding. Against a section with no background at all, that is the trade.
  private claimOwnBlock(el: HTMLElement): void {
    // Level 2 does not open a section — it is a subheading inside one, and the
    // run it belongs to is genuinely a question about its neighbours.
    if (this.level !== 1) return;

    // THE GUARD IS THE DELIVERABLE AS MUCH AS THE MARK IS (§1.5).
    //
    // `siblingAnchor()` climbs to the highest ancestor whose parent is the
    // note's section container — and in `onload` the block may not be attached
    // to that container yet, because a code-block post-processor is handed an
    // element the renderer inserts afterwards. The walk always returns
    // something; what it returns when the block is detached is an INNER
    // element.
    //
    // That failure does not self-repair. `markSectionBodies` clears these
    // classes from `parent.children`, and a wrongly-marked descendant is not
    // one of them — so the result would be a surface drawn inside a surface,
    // permanently, which is worse than the bug being fixed.
    //
    // THE GUARD MOVED OUT IN 3.13.9 and became a precondition rather than a
    // refusal: `whenAttached` does not call this until the anchor's parent IS
    // the container, so where this once returned and left the section unpainted
    // for good, the caller now comes back next frame. Asserted rather than
    // assumed — a caller that got this wrong would paint the permanent
    // double surface above.
    if (!isSectionParent(el.parentElement)) return;

    el.addClass("journal-sec-block");
    el.addClass("is-first");
  }

  // Join the note's shared pass (3.13 §2). One observer, one frame dedupe, one
  // settle rule and one teardown for the whole note — see `SectionPass`, which
  // holds all four and explains why they were never the bar's to hold.
  //
  // TAKES THE CONTAINER RATHER THAN FINDING IT (3.13.9). It used to read
  // `siblingAnchor().parentElement` here, in `onload`, where a detached block
  // yields either null — and the bar silently joined no pass at all — or an
  // inner wrapper, giving the note a second `SectionPass` whose observer
  // watches a subtree its blocks never arrive in. Both are invisible: the
  // section simply never repaints. `whenAttached` is now the only caller and
  // it has already established that this is the note's container.
  private joinNotePass(parent: HTMLElement): void {
    let pass = passes.get(parent);
    if (!pass) {
      pass = new SectionPass(parent);
      passes.set(parent, pass);
    }
    const run = (): void => this.recompute();
    pass.add(run);
    this.register(() => pass.remove(run));
  }

  private toggle(): void {
    this.setCollapsed(!this.isCollapsed());
    this.recompute();
  }

  // The block-level element that sits as a sibling among the note's rendered
  // blocks. In reading view Obsidian wraps each block; our code block's `el`
  // is nested a level or two inside that wrapper, so climb to the highest
  // ancestor whose parent is the section container. Falls back to blockEl.
  private siblingAnchor(): HTMLElement {
    let node: HTMLElement = this.blockEl;
    // `.markdown-rendered` is the note's container in READING view and, in Live
    // Preview, the container of ONE code-block widget inside `.cm-embed-block`.
    // Treating both as the note meant that in Live Preview every fence saw only
    // itself: a section's scope stopped at its own ```almanac block.
    //
    // Journals hid this completely, because a journal section is one fence —
    // `header:🧭 Learning Path` and the `path:` under it are the same block, so
    // "everything I own" and "everything in my fence" were the same set. The
    // diary writes its sections as a header fence and a body fence, and there
    // the difference is the whole feature: folding stopped at the header and so
    // did the card, which is why the two modes disagreed on exactly the notes
    // where they were written differently.
    while (node.parentElement && !isSectionParent(node.parentElement)) {
      node = node.parentElement;
    }
    return node;
  }

  // Recompute hidden/indent state for everything a bar in this note can own,
  // from the collapsed state of all header bars. Single source of truth: an
  // element is hidden iff it's inside the scope of a collapsed bar.
  //
  // TWO SCOPES, ONE WALK. A bar owns the blocks after it, and it also owns the
  // widgets welded into its own fence — `header:🧭 Learning Path` and the
  // `path:` beneath it are one ```almanac block, so the field renders as the
  // bar's SIBLING inside the block rather than as a block of its own. Folding
  // by block alone therefore left those sections looking broken: the chevron
  // turned, the state persisted, and the widget the section is *for* stayed on
  // screen. Learning Path, Resources (its `attach:` shelves), Charts (the
  // `jchart` stack) and Progress are all built that way, which is every
  // section a reader was likely to try to fold on a journal index.
  //
  // So the walk is flattened: each rendered block contributes a node, and a
  // block that holds bars also contributes its bars' own siblings, in document
  // order. One stack then governs both, which matters because the two interact
  // — an in-block bar's scope carries on into the blocks that follow it while
  // the fence gave it no body of its own, and a fold computed separately per
  // level would give the same element two answers. Where that scope stops is
  // the sentinel at the foot of the loop; 4.57.1's note on it says why.
  private recompute(): void {
    const anchor = this.siblingAnchor();
    const parent = anchor.parentElement;
    if (!parent) return;
    const blocks = Array.from(parent.children).filter(
      (n): n is HTMLElement => n.nodeType === 1
    );

    // `null` MARKS A NODE WITH NO ELEMENT, which is the sentinel below. The two
    // arrays are parallel and `hidden[i]` is written back to `els[i]`, so a
    // scope-closing node that stands for nothing on the page needs a slot to
    // keep the indices aligned and nothing to paint.
    const els: (HTMLElement | null)[] = [];
    const nodes: FoldNode[] = [];
    const bars: HTMLElement[] = [];
    // Blocks whose own first bar is level 2, for the body-indent pass below.
    const l2Blocks: HTMLElement[] = [];

    for (const block of blocks) {
      const inner = Array.from(
        block.querySelectorAll<HTMLElement>(".journal-header-bar")
      );

      if (inner.length === 0) {
        const isBoundary = this.isSectionBoundary(block);
        els.push(block);
        nodes.push({
          level: isBoundary ? 1 : 0,
          collapsed: false,
          heading: isBoundary,
        });
        continue;
      }

      // The block carries the level of the first bar inside it, so it closes
      // the previous section's scope before its own visibility is decided —
      // otherwise a sibling container would be hidden by the section above it.
      // It never opens a scope itself; the bar node does that a moment later.
      const level = this.levelOf(inner[0]);
      els.push(block);
      nodes.push({ level, collapsed: false, heading: false });
      if (level === 2) l2Blocks.push(block);

      // Then the bars' own siblings. Walking the bar's parent rather than the
      // block picks up exactly the widgets the fence rendered beside it.
      const seen = new Set<HTMLElement>();
      for (const bar of inner) {
        const host = bar.parentElement;
        if (!host || seen.has(host)) continue;
        seen.add(host);
        for (const child of Array.from(host.children)) {
          if (!(child instanceof HTMLElement)) continue;
          const isBar = child.hasClass("journal-header-bar");
          els.push(child);
          nodes.push({
            level: isBar ? this.levelOf(child) : 0,
            collapsed: isBar && this.barCollapsed(child),
            heading: false,
          });
          if (isBar) bars.push(child);
        }
      }

      // ── WHERE AN IN-BLOCK BAR'S SCOPE STOPS (4.57.1) ────────────────
      //
      // A fence that drew its section's body has said what the section holds,
      // so its scope ends with the block — see `SecNode.ends`, which is the
      // same rule for the paint pass, and `bodyInOwnFence`, which is the one
      // question both ask.
      //
      // A HEADER THAT OPENS NOTHING, rather than a new kind of node. The rule
      // `computeFoldHidden` already has is "a header at level L closes any
      // scope of level >= L", and the shallowest bar in this block is exactly
      // the level whose scopes this block opened — the block's own node closed
      // everything at that level or deeper on the way in. So the sentinel needs
      // no field of its own and the fold arithmetic is untouched.
      if (this.bodyInOwnFence(block)) {
        els.push(null);
        nodes.push({
          level: Math.min(...inner.map((bar) => this.levelOf(bar))),
          collapsed: false,
          heading: false,
        });
      }
    }

    const hidden = computeFoldHidden(nodes);
    for (let i = 0; i < els.length; i++) {
      // A SOURCE LINE IS NEVER HIDDEN, only painted.
      //
      // In Live Preview the siblings between two fences are `.cm-line`
      // elements CodeMirror owns and measures. `display: none` on one is a risk
      // to editing — a stranded cursor, a mis-measured scroll — and it buys
      // nothing, because a blank line has no content to fold away. The line
      // still belongs to the section for every other purpose, which is what
      // keeps the card continuous across it.
      //
      // The one asymmetry between what a section FOLDS and what it SHADES, and
      // it is narrower than it looks: both agree on which blocks belong to the
      // section. They differ only on whether an empty line is worth taking a
      // risk to hide.
      const el = els[i];
      if (!el) continue;
      if (el.classList.contains(OBSIDIAN_DOM.editorLine)) continue;
      el.toggleClass("journal-section-hidden", hidden[i]);
    }

    // Chevrons, and the level-2 body indent (idempotent).
    for (const bar of bars) bar.toggleClass("is-collapsed", this.barCollapsed(bar));
    for (const block of l2Blocks) this.markL2Body(block, 2);
    this.markSectionBodies(blocks);
  }

  // Tag the blocks each top-level section owns, so a section can be drawn as
  // one surface rather than as a heading with loose prose under it.
  //
  // MARKS WHOLE BLOCKS, and the first two attempts did not, which is why the
  // sections came out striped twice. Two things forced it:
  //
  //   a section's body is often INSIDE the bar's own block. The comment above
  //   recompute says it plainly — `header:🧭 Learning Path` and the `path:`
  //   beneath it are one ```almanac fence, and Charts, Resources and Progress
  //   are all built that way. A walk over sibling blocks alone never reaches
  //   the content of any section on a journal index;
  //   `.journal-widget-block` is a flex column with a gap, so painting its
  //   children individually paints stripes with the gaps showing through.
  //
  // Both point the same way: mark the BLOCK. A fence holding a header and its
  // widgets is the section; a fence holding only a header is the section's
  // start and the blocks after it are the rest. One class covers both, and the
  // ends of the run carry the rounding.
  //
  // Same boundaries as the fold walk, deliberately — a section that folds one
  // set of blocks and shades another would be two claims about what "this
  // section" means, and a reader would meet the disagreement the first time
  // they collapsed something.
  private markSectionBodies(blocks: HTMLElement[]): void {
    // BUILD THE NODES, CALL THE RULE, APPLY THREE CLASSES — 3.13 §3. What used
    // to be one loop mixing the run calculation with the DOM writes is now a
    // read pass, `computeSectionRuns`, and a write pass. The rules moved; none
    // of them changed.
    const nodes: SecNode[] = blocks.map((block) => {
      // OBSIDIAN'S OWN CHROME IS NOT A BLOCK OF THE NOTE.
      //
      // `.mod-footer.mod-ui` holds the embedded-backlinks container and is part
      // of the VIEW, not the document — Obsidian creates it once per leaf and
      // reuses it across file switches. So a class put on it here outlives the
      // note that caused it: open a dashboard with sections, then open any
      // other note in the same tab, and the footer arrives still wearing
      // `journal-sec-block is-last`, drawing a section's background and padding
      // as an empty grey band under a note with no Almanac content in it. The
      // cleanup below cannot help, because a note with no header bar registers
      // no HeaderBar and never runs this pass.
      //
      // It CLOSES the run rather than merely being skipped: the footer sits
      // after everything the note contains, so a section still open when we
      // reach it ends there.
      if (block.hasClass(OBSIDIAN_DOM.viewFooter) ||
        block.hasClass(OBSIDIAN_DOM.viewUi)) {
        return {
          opens: false,
          closes: true,
          hidden: false,
          renders: false,
          ends: false,
        };
      }

      const bar = block.querySelector<HTMLElement>(".journal-header-bar");

      // A real markdown heading or independent section/banner ends a section for the same reason it ends a
      // fold: it is its own structure and must not be swallowed into this section's card.
      if (!bar && (this.isHeadingBlock(block) || this.isSectionBoundary(block))) {
        return {
          opens: false,
          closes: true,
          hidden: false,
          renders: false,
          ends: false,
        };
      }

      // A SECTION IS OPENED BY A TITLED `header:` BAR AND NOTHING ELSE.
      //
      // `data-headerKey` is the honest test, because HeaderBar sets it and is
      // registered only for a `header:` that has a title — the same fact
      // `barCollapsed` reads to decide whether a bar can fold at all. Asking
      // "is it untitled" was a narrower version of the same question that
      // missed the case that matters.
      //
      // Two other things wear `.journal-header-bar journal-header-l1`: an
      // untitled bar, which anchors widgets under a real markdown heading, and
      // the diary ENTRY BANNER (entryheader.ts builds one). The banner is the
      // note's head, not a section — treating it as one wrapped the whole daily
      // entry in a single card, fields fence and all five storage regions
      // together, and the last of those regions took the rounding and drew an
      // empty strip under the capture box.
      //
      // Such a bar still CLOSES what was open: it is a level-1 header, so
      // whatever section preceded it does not continue past it.
      const level1 = !!bar && this.levelOf(bar) === 1;
      if (level1 && !bar?.dataset.headerKey) {
        return {
          opens: false,
          closes: true,
          hidden: false,
          renders: false,
          ends: false,
        };
      }

      return {
        opens: level1,
        closes: false,
        hidden: block.hasClass("journal-section-hidden"),
        renders: this.rendersSomething(block),
        ends: level1 && this.bodyInOwnFence(block),
      };
    });

    const marks = computeSectionRuns(nodes);

    blocks.forEach((block, i) => {
      // Cleared every pass, not accumulated: a block leaves a section when a
      // bar above it is edited away, and a stale class is a shaded orphan with
      // no header — the failure that only shows on the second render. Written
      // as a toggle against the computed answer, which clears and re-derives in
      // one step rather than two.
      block.toggleClass("journal-sec-block", marks[i].member);
      block.toggleClass("is-first", marks[i].first);
      block.toggleClass("is-last", marks[i].last);
    });
  }

  // A bar's persisted fold state, read off the DOM so the holistic pass needs
  // no reference to the other bars' HeaderBar instances. An untitled bar (and
  // the entry banner, which wears the same class to get the same shell) has no
  // key and is never collapsed — it is a place widgets anchor, not a section.
  private barCollapsed(bar: HTMLElement): boolean {
    const key = bar.dataset.headerKey;
    if (!key) return false;
    return this.plugin.settings.collapsedNoteSections?.[key] === true;
  }

  // Is this block a rendered markdown heading?
  //
  // Deliberately not a descendant search. Several widgets render their own
  // heading elements deep inside themselves — the calendar's year label, the
  // Is this block a rendered markdown heading or an independent section/banner?
  //
  // Deliberately not a descendant search for headings. Several widgets render their own
  // heading elements deep inside themselves — the calendar's year label, the
  // sleep card's title, an event section — and a descendant search would read
  // those as document structure and break the enclosing fold. A real markdown
  // heading is the block itself, its direct child, or (in reading view) a
  // wrapper Obsidian tags `el-h2`.
  //
  // AND BLOCKS WITH THEIR OWN SECTION FRAME OR BANNER ARE BOUNDARIES TOO. A block
  // holding `frame: section` or a banner is a top-level section container and
  // must not be swallowed into a preceding `header:` section's card run.
  private isHeadingBlock(block: HTMLElement): boolean {
    if (/^H[1-6]$/.test(block.tagName)) return true;
    if (READING_HEADING.test(block.className)) return true;
    // Live Preview does not build `<h1>`; a heading is a `.cm-line` wearing
    // `HyperMD-header` (and `cm-header-N`). Without this a section in the
    // editor ran straight through the note's own headings, which is the one
    // boundary the fold rule says it must respect — a bar titles a widget
    // section, a heading is the note's structure.
    if (EDITOR_HEADING.test(block.className)) return true;
    return !!block.querySelector(
      ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6"
    );
  }

  // ── THE LOGGING GRID IS ONE OF THESE, AND WAS NOT LISTED (4.51.4) ──────
  //
  // `.journal-tracker-section` is a block with its own card and its own caption
  // — 4.21.1 gave it both, on the argument that *"it is the only section in the
  // plugin with a card and no name"*. Everything in the list beside it is here
  // for the reason stated at `markSectionBodies`: *it is its own structure and
  // must not be swallowed into this section's card.* The grid is exactly that
  // and was the one such block missing, so a note whose logging grid sat after
  // a `header:` section drew the grid INSIDE that section's surface — reported
  // as *"the resources section in Journals merging with the trackers"* — and
  // collapsing that section took the grid with it.
  //
  // WHY 4.51 IS WHAT EXPOSED IT. On a note composed by 4.20 or later the grid
  // is section two, above every `header:` bar, so there was never an open
  // section for it to fall into. On every note composed BEFORE that the markers
  // are inside the banner's own fence — `createTrackerRegion` still writes them
  // there — and that fence wore `.journal-study-banner`, which IS in this list.
  // Suppressing the banner's directives dropped that class and left the same
  // block carrying only `.journal-tracker-section`: a boundary that had been
  // one by inheritance stopped being one.
  //
  // So this is a gap in the list rather than a consequence of the bar, and it
  // is fixed as one: the grid is a boundary because of what it is, on every
  // note, whether or not the vault banner is on.
  //
  // `.journal-page-head` JOINS IT IN 4.51.6 for the same reason and before it
  // can bite: the remade Banner section is a page's own head, which is the most
  // obviously self-standing block in the plugin.
  // Did this block draw its section's body beside the bar?
  //
  // ONE PREDICATE FOR BOTH WALKS, for `isSectionBoundary`'s reason: the fold
  // and the shade must agree about what "this section" means, and a section
  // that folds one set of blocks and shades another is two claims a reader
  // meets the first time they collapse something.
  //
  // THE LAST BAR IN THE BLOCK IS THE ONE ASKED, because a fence may hold
  // several — `header:📖 Lessons`, its table, `header:🛠️ Practice`, its table
  // are one block on Study's topic index. The bars before the last one plainly
  // have their bodies here; the only open question is whether the last one
  // does, and a trailing bar with nothing under it is a section still waiting
  // for its blocks.
  //
  // RENDERING SIBLINGS THAT ARE NOT FURNITURE. A storage region welded into the
  // same fence draws nothing, so it is skipped by `rendersSomething` already;
  // `BLOCK_FURNITURE` is the other half — the grip and the drop slots
  // `attachBlockHead` hangs on every block are appended after whatever was
  // drawn, and they belong to the page's editing gestures rather than to the
  // section. They happen to be empty divs today, so this changes no answer; it
  // is here so that giving the grip an icon does not silently end every
  // section at its own bar.
  private bodyInOwnFence(block: HTMLElement): boolean {
    const bars = Array.from(
      block.querySelectorAll<HTMLElement>(".journal-header-bar")
    );
    const last = bars[bars.length - 1];
    const host = last?.parentElement;
    if (!host) return false;
    const kin = Array.from(host.children);
    const after = kin.slice(kin.indexOf(last) + 1);
    return after.some(
      (sib) =>
        sib instanceof HTMLElement &&
        !sib.matches(BLOCK_FURNITURE) &&
        this.rendersSomething(sib)
    );
  }

  private isSectionBoundary(block: HTMLElement): boolean {
    if (this.isHeadingBlock(block)) return true;
    return !!block.querySelector(
      ":scope .journal-sec-fold, :scope .journal-section-bar, :scope .journal-overview-banner, :scope .journal-entry-banner, :scope .journal-study-banner, :scope .journal-page-head, :scope .journal-tracker-section, :scope .journals-card, :scope .journal-sec-l1"
    );
  }

  private levelOf(bar: HTMLElement): number {
    const d = Number(bar.dataset.headerLevel);
    if (d === 1 || d === 2) return d;
    if (bar.classList.contains("journal-header-l1")) return 1;
    if (bar.classList.contains("journal-header-l2")) return 2;
    return 1;
  }

  // Indent/bracket the blocks a level-2 bar owns (its body), up to the next
  // header of level <= 2. Runs during recompute so it's applied regardless of
  // load order; idempotent.
  // Does this block put anything on the page?
  //
  // Not `offsetHeight`, which would read layout during a render pass and give a
  // different answer depending on when it ran. A block with no element children
  // and no text is one Obsidian created for something that renders to nothing —
  // in practice a body storage region, which is a comment.
  private rendersSomething(block: HTMLElement): boolean {
    if (block.childElementCount > 0) return true;
    return (block.textContent ?? "").trim() !== "";
  }

  private markL2Body(barBlock: HTMLElement, level: number): void {
    // THE SAME RULE ONE LEVEL DOWN (4.57.1). A level-2 fence that drew its own
    // body indents nothing after it, for the reason `SecNode.ends` gives: what
    // follows such a fence is the reader's, not the subsection's. Asked with
    // the one predicate, so the indent cannot disagree with the fold and the
    // shade about where the subsection stops.
    if (this.bodyInOwnFence(barBlock)) return;
    let sib = barBlock.nextElementSibling as HTMLElement | null;
    while (sib) {
      if (sib.nodeType === 1) {
        const b = sib.querySelector<HTMLElement>(".journal-header-bar");
        // Same boundary as recompute's: a heading ends the bar's body, so a
        // level-2 bar doesn't indent prose that isn't its.
        if (!b && this.isSectionBoundary(sib)) break;
        const lvl = b ? this.levelOf(b) : 0;
        if (lvl !== 0 && lvl <= level) break;
        sib.addClass("journal-section-l2-body");
      }
      sib = sib.nextElementSibling as HTMLElement | null;
    }
  }

}
