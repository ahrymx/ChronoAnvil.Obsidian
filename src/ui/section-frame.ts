// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The section frame.
//
// WHY THIS EXISTS
//
// A `header:` directive draws the bar that titles a section on every dashboard
// and every journal note. Three places in widgets.ts built that bar, and all
// three built it the same way:
//
//   const bar = container.createDiv({ cls: `journal-header-bar …l${level}` });
//   bar.createDiv({ cls: "journal-header-title", text: title });
//   const group = bar.createDiv({ cls: "journal-widget-bar …-widgets" });
//   ctx.addChild(new HeaderBar(plugin, bar, el, ctx.sourcePath, title, level));
//
// Four lines, character for character, three times in one file — and that is
// the *good* case. Outside this bar there are 39 header-shaped components in
// styles.css across 27 class-prefix families, including three separate
// implementations of "a collapsible titled section" in quarter-view.ts,
// year-view.ts and journals-section.ts, none of which can see the other two.
//
// Nobody decided any of that. It is the third time this codebase has produced
// the same shape for the same reason: `createListRow` in 2.55.4, the wizard
// rail in 2.55.5, and now this. The thing that gets duplicated is whatever is
// awkward to import. So this is a module of its own from the first commit,
// exactly as list-row.ts had to be — widgets.ts imports half the plugin, and
// anything living inside it cannot be imported back out.
//
// TWO OWNERSHIP MODELS, WHICH IS THE HALF THE PLAN MISSED
//
// §1.1 called `quarter-view.ts`, `year-view.ts` and `journals-section.ts`
// "three separate implementations of a collapsible titled section". Nearly
// true, and the missing word is what they own.
//
// A `header:` bar owns the SIBLING BLOCKS after it. Obsidian renders each
// markdown block as a separate element, so such a section cannot contain its
// body in the DOM — visibility is derived by walking the note's siblings, and
// `HeaderBar` does that by finding every `.journal-header-bar` in a block.
// (Only while the fence gave it no body of its own — see 4.57.1 in
// `headerbar.ts`. The two ownership models below are unaffected: this is about
// where a blocks-owning bar's scope stops, not about which kind it is.)
//
// A dashboard's inner section owns its OWN CHILDREN. It is a div with a head
// and a body inside one widget's DOM, and it folds by toggling a class on
// itself (`makeFoldable` in journals-section.ts, with its own chevron and its
// own persistence).
//
// So they are one widget with two scopes, and nobody had named the difference —
// which is exactly why three files each solved it privately. It also makes the
// naive conversion actively harmful: give an inner section the
// `.journal-header-bar` class and the fold walk finds it as a descendant,
// reads the BLOCK's level off it, and the enclosing dashboard folds wrong.
//
// Hence `owns`. Both variants share every visual class, so they look identical
// and are styled once. Only the blocks variant carries `.journal-header-bar`,
// which is now purely the fold walk's marker rather than a look.
//
// WHAT THIS IS NOT
//
// It is not a new element shape. It emits the same classes the bar has always
// emitted, because `HeaderBar` finds bars with `querySelectorAll(
// ".journal-header-bar")`, reads their level off `journal-header-l1|2`, and
// computes fold scope over the result — logic with fifteen tests behind it
// that has nothing to do with how a section looks. Reparenting without
// renaming means the fold walk, its tests, and every CSS rule keep working,
// and the visual change is a stylesheet change.
//
// The prefixes get retired as their owners move onto this frame, not in a
// rename pass. A rename that is not a reparent is churn.

import { Menu, setIcon } from "obsidian";

// A section's title as written (`📖 Lessons`) split into the two things the
// frame lays out separately.
//
// The glyph gets a fixed slot so that titles line up down the page — today
// "🎓 Study" and "Learning Path" start their words at different x positions,
// which is most of why a column of section headers reads as ragged.
//
// The glyph stays an emoji. 2.55.4 declined converting `JournalSection.icon`
// to a Lucide id and that decision stands for the reason it gave:
// `.almanac-list-token` is an emoji slot everywhere else in the plugin, and
// the reader chose these.
// The overflow control: a `⋯` that builds its menu when clicked.
//
// The BUTTON is shared; the MENU is not, and that distinction is the whole of
// what 2.55's §2 got right and §2.3 of the 2.56 plan got wrong. The plan said
// "`bannerMenu` generalised to two callers". Its two callers turn out to share
// two items out of six — a journal note offers "Edit sections…", template
// preview and "Convert to a dashboard", none of which a diary entry can do, and
// a diary entry offers its month's review, which a journal note has no concept
// of. Generalising the menu would mean a builder taking a flag that selects
// between two disjoint lists, which is the shape §4.3 declined for the chart
// models and for the same reason.
//
// What IS the same is this: a glyph, an aria-label, and the rule that the menu
// is built ON CLICK rather than at draw time, so it describes the note as it is
// when opened rather than as it was when the header rendered.
export function overflowButton(
  host: HTMLElement,
  cls: string,
  build: (menu: Menu) => void
): HTMLElement {
  const button = host.createDiv({ cls, attr: { "aria-label": "More" } });
  setIcon(button, "more-horizontal");
  button.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new Menu();
    build(menu);
    menu.showAtMouseEvent(evt);
  });
  return button;
}

// The control a BANNER carries: same glyph, same label, same menu position, on
// every Almanac page. 4.20.
//
// ── WHY THIS IS ONE FUNCTION AND NOT THREE COPIES OF THREE LINES ──────
//
// `page-title.ts` has drawn a cog since 4.5 and said why: *"the control acts on
// the PAGE — its name, its sections — where a ⋯ elsewhere in this plugin means
// 'more things about this row'."* That argument was right and it was applied to
// one of the three banners. A diary entry and a journal note carried the same
// menu, opening the same section editor, behind the glyph that means something
// else — so a reader who learned the cog on a dashboard had to learn the ⋯
// separately on the two surfaces they spend the most time in.
//
// 4.20 settles that every Almanac page has a banner and that a banner is the
// file's name, its navigation, and this. One meaning, one glyph.
//
// IT WRAPS `overflowButton` RATHER THAN REPLACING IT, because the ⋯ is still
// right for what it was always for — a row, a cell, a card inside a page — and
// the two differ by a glyph and a label rather than by behaviour.
export function settingsButton(
  host: HTMLElement,
  cls: string,
  build: (menu: Menu) => void
): HTMLElement {
  const button = overflowButton(host, cls, build);
  setIcon(button, "settings");
  button.setAttr("aria-label", "Page settings");
  return button;
}

export function splitGlyph(title: string): { glyph: string; text: string } {
  const trimmed = title.trim();
  const m = /^(\S+)\s+(\S.*)$/.exec(trimmed);
  if (!m) return { glyph: "", text: trimmed };
  const [, head, rest] = m;
  // A glyph is a leading token with no letters or digits in it. Testing for
  // what it is NOT keeps this working for every script: a Greek or Cyrillic
  // first word is a word, and an emoji, a dingbat or a symbol is not.
  if (/[\p{L}\p{N}]/u.test(head)) return { glyph: "", text: trimmed };
  return { glyph: head, text: rest };
}

// What a section's body is, structurally — see the note above.
export type SectionOwns = "blocks" | "children";

export interface SectionFrameOptions {
  // As written in the directive, glyph and all. Split here rather than by the
  // caller, so every caller splits it the same way.
  title: string;
  // 1 = container (folds nested level-2 bars too), 2 = nested. Unchanged
  // meaning; see headerbar.ts for the fold scope this decides.
  level: number;
  // How many things the body holds.
  //
  // OMITTED RATHER THAN ZERO, and the caller decides by passing null. A count
  // is the one piece of new information here — a collapsed section currently
  // tells a reader nothing at all — but a pill reading `0` because nothing
  // counted is worse than no pill, and only the caller knows the difference
  // between "none" and "not counted".
  count?: number | null;
  // The glyph, given rather than split out of `title`.
  //
  // Most sections carry theirs inside the title string because a `header:`
  // directive is one line of markdown. The Journals section resolves its own
  // per level (`levelEmojiFor`) and has always had it as a separate element,
  // so asking it to concatenate a string this would immediately re-split would
  // be the frame demanding a shape for its own convenience.
  glyph?: string;
  // Fills the title slot instead of setting text on it.
  //
  // FOR ONE SECTION, and it is worth naming which: a subject's name in the
  // Journals section is a LINK to that subject's note, with Obsidian's hover
  // preview wired to it. No other section's title is clickable. That is the
  // reason this file could not simply convert `journals-section.ts` alongside
  // the quarter and year dashboards in 2.56.2 — those were a mechanical swap,
  // and this needed a capability, which is a thing to argue for once rather
  // than invent halfway through a patch.
  //
  // The slot is still `.journal-header-title`, so the type, the truncation and
  // the alignment are the frame's; only what goes inside it is the caller's.
  titleRender?: (slot: HTMLElement) => void;
  // A short muted phrase after the title: "2 of 5 met", "12 of 30 days".
  // Distinct from `count` because it is a sentence fragment rather than a
  // quantity, and a pill around "2 of 5 met" reads as a badge saying something
  // it is not.
  note?: string;
  // A bar with no title of its own, anchoring buttons under a real markdown
  // heading that is a structural boundary (Study and the custom journals).
  // It draws no title, no glyph and no count — it is a control strip.
  untitled?: boolean;
  // Defaults to "blocks", which is what every caller was before this option
  // existed. See the note above for why this is not a styling choice.
  owns?: SectionOwns;
}

export interface SectionFrame {
  // `.journal-header-bar` — what HeaderBar folds and what the fold walk finds.
  root: HTMLElement;
  // Where the section's actions go: at most one accented button, then icons,
  // then the overflow. The rule is not enforced by this type yet — the
  // overflow menu is the patch that can enforce it, because until there is
  // somewhere for a second action to go, refusing one would just delete it.
  actions: HTMLElement;
}

// Build a section header into `host`.
//
// Returns the bar and its action slot. It deliberately does NOT register the
// HeaderBar child: that needs the caller's `ctx` and `blockEl`, and a frame
// that reached for a MarkdownPostProcessorContext would be a frame that could
// only be used from a code-block processor.
export function sectionFrame(
  host: HTMLElement,
  opts: SectionFrameOptions
): SectionFrame {
  // `journal-sec` is the LOOK; `journal-header-bar` is the fold walk's marker.
  // Splitting them is what lets an inner section be styled identically without
  // being mistaken for a block-owning bar by HeaderBar.recompute().
  const owns = opts.owns ?? "blocks";
  const marker =
    owns === "blocks"
      ? ` journal-header-bar journal-header-l${opts.level}`
      : "";
  const root = host.createDiv({
    cls: `journal-sec journal-sec-l${opts.level}${marker}`,
  });

  if (opts.untitled) {
    root.addClass("journal-header-bar-untitled");
    return {
      root,
      actions: root.createDiv({
        cls: "journal-widget-bar journal-header-widgets",
      }),
    };
  }

  const split = splitGlyph(opts.title);
  const glyph = opts.glyph ?? split.glyph;
  const text = opts.glyph ? opts.title.trim() : split.text;

  // The glyph is its own element rather than part of the title string, which
  // is what buys the fixed slot. A section with no glyph still gets no slot —
  // an empty 16px box in front of every untitled-glyph section would align the
  // titles by indenting all of them, which is a worse trade than ragged.
  if (glyph) {
    root.createSpan({ cls: "journal-header-glyph", text: glyph });
  }

  // `.journal-header-title` keeps its class and keeps carrying the full title
  // in its text content where there is no glyph, so nothing that reads the bar
  // back — the fold key is built from the directive's title, not from the
  // DOM — sees a different string than it did.
  const titleSlot = root.createDiv({ cls: "journal-header-title" });
  if (opts.titleRender) opts.titleRender(titleSlot);
  else titleSlot.setText(text);

  if (opts.count != null) {
    root.createSpan({
      cls: "journal-header-count",
      text: String(opts.count),
    });
  }

  if (opts.note) {
    root.createSpan({ cls: "journal-header-note", text: opts.note });
  }

  return {
    root,
    actions: root.createDiv({
      cls: "journal-widget-bar journal-header-widgets",
    }),
  };
}

// ── the collapsible children-owning section ───────────────────────────
//
// WHY THIS IS HERE AND NOT IN THE CALLER
//
// This module opens by naming the problem it exists to stop: three separate
// implementations of "a collapsible titled section", in quarter-view.ts,
// year-view.ts and journals-section.ts, none of which could see the other two,
// because "the thing that gets duplicated is whatever is awkward to import".
// `sectionFrame` fixed the BAR. It did not fix the FOLD — `owns: "children"`
// only withholds the block-owning marker, and every caller that wanted its
// children to actually collapse still had to write the chevron, the body and
// the persistence itself. journals-section.ts did (`makeFoldable`); the quarter
// and year dashboards did not, and so their sections are titled but fixed.
//
// 4.1 §3.1 needs the collapsible variant for `frame: section`, and §11 refuses
// "a second section component" — so the behaviour lands here, where the module
// comment has been asking for it since the frame was extracted, rather than as
// a fourth private copy inside the widget dispatcher.
//
// WHY IT IS NOT `HeaderBar`. That class folds SIBLING BLOCKS by walking the
// note, and carries `.journal-header-bar` so the walk can find it. An inner
// section folds its OWN CHILDREN by toggling a class on itself. Giving this one
// the marker would make an enclosing dashboard read its fold level off a
// descendant and fold the wrong scope — which does not look wrong, and is
// therefore the bug found weeks later.

// The two halves of a collapsible section: the frame, and the body its fold
// hides.
export interface FoldableSection {
  frame: SectionFrame;
  // Everything the section holds. Hidden by the fold, so a caller appends here
  // rather than to the host.
  body: HTMLElement;
}

// What a fold needs to remember its state between renders.
//
// AN INTERFACE RATHER THAN THE PLUGIN, so this module stays importable from
// anywhere. `section-frame.ts` is imported by widgets.ts, which imports half
// the plugin; taking `AlmanacPlugin` here would be the import cycle that put
// `makeFoldable` inside journals-section.ts in the first place.
export interface FoldStore {
  isCollapsed(key: string): boolean;
  setCollapsed(key: string, value: boolean): void;
}

// Build a titled section that folds its own children into `host`.
//
// `key` is the persistence key. It shares `settings.collapsedNoteSections` with
// headerbar.ts, whose keys are `"<notePath>::<title>"`, so a caller must
// namespace its own — see `foldKey` in journals-section.ts for the pattern.
export function foldableSection(
  host: HTMLElement,
  opts: SectionFrameOptions,
  store: FoldStore,
  key: string
): FoldableSection {
  // The wrapper is what carries the collapsed state, because the fold has to
  // hide the body while leaving the bar visible — a section that folded itself
  // away entirely would leave a reader nothing to click to get it back.
  const section = host.createDiv({ cls: "journal-sec-fold" });
  const frame = sectionFrame(section, { ...opts, owns: "children" });
  const body = section.createDiv({ cls: "journal-sec-fold-body" });

  // THE RIGHT-HAND END, AS OF 4.13 §1b — and before the actions rather than after
  // them, for the reason `headerbar.ts` gives at its own toggle: at level 1 the
  // actions slot is a full-width second row, so appending would wrap the chevron
  // onto a third one. `margin-left: auto` in the stylesheet is what moves it.
  const chevron = createDiv({ cls: "journal-sec-fold-toggle" });
  setIcon(chevron, "chevron-down");
  frame.root.insertBefore(chevron, frame.actions);
  frame.root.addClass("is-foldable");

  const apply = (collapsed: boolean): void => {
    section.toggleClass("is-collapsed", collapsed);
  };
  apply(store.isCollapsed(key));

  frame.root.addEventListener("click", (evt) => {
    // Clicks on the section's own controls act; they do not fold. The same rule
    // the header bars use for their anchored widget group, and the reason a
    // scope button in a section's actions strip is not a fold target.
    const target = evt.target as HTMLElement;
    if (target.closest(".journal-header-widgets, a, button, input, select")) {
      return;
    }
    evt.preventDefault();
    const next = !store.isCollapsed(key);
    apply(next);
    store.setCollapsed(key, next);
  });

  return { frame, body };
}
