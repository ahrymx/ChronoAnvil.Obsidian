// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What a widget says when it has nothing to show.
//
// WHY THIS FILE EXISTS
//
// ChronoAnvil had three separate mechanisms for this and no shared statement about
// what an empty state is for:
//
//   `emptyCallout` in tables.ts — icon, title, body. Fourteen uses, and where
//   it is used it is the best writing in the plugin.
//   `emptyState` in event-widgets.ts — a private one-liner. Five uses.
//   `SettingsTab.emptyState` — a private method. Three uses.
//   …plus about thirty ad-hoc `*-empty` divs with a bare sentence.
//
// So the problem was never that widgets render nothing when empty. Most of them
// say something. The problem is that what they say ranges from
//
//   "No lessons yet — press 'Lesson' above to add one; it'll appear here with
//    its date, confidence and status."
//
// down to
//
//   "Nothing coming up."
//
// and there was nowhere for the difference to be argued.
//
// THE RULE
//
// An empty widget is the one moment a reader is definitely looking at a feature
// and definitely has no idea what it does. So an empty state names TWO things:
//
//   1. WHAT WILL APPEAR HERE — not "no data", which is a control that isn't a
//      decision in sentence form. "No lessons yet" already says more.
//   2. HOW TO MAKE IT HAPPEN — the button to press, the property to fill in,
//      the setting to turn on. A dead end teaches nothing.
//
// If a widget cannot say the second — because there is genuinely nothing the
// reader can do, as with "nothing is due for review today" — then the first has
// to carry it, and it should say why rather than only that.
//
// TWO SHAPES, AND THE DIFFERENCE IS STRUCTURAL
//
// Not a style choice, which is why both live here rather than one winning:
//
//   `emptyCallout` REPLACES content. The widget is a table or a list and there
//   is no table to draw, so the callout stands in for it and can afford an icon
//   and two lines.
//   `emptyLine` ANNOTATES content. The widget still drew its card, its header
//   and its controls; only one region inside is empty. A callout there would be
//   a box inside a box, and the surrounding chrome already says what the widget
//   is — so the line only has to say why this part is blank.

import { setIcon } from "obsidian";

// Stands in for content that isn't there. Icon, title, and one sentence that
// names what will appear and how.
export function emptyCallout(
  icon: string,
  title: string,
  body: string
): HTMLElement {
  const callout = createDiv({ cls: "callout", attr: { "data-callout": "empty" } });
  const titleEl = callout.createDiv({ cls: "callout-title" });
  setIcon(titleEl.createDiv({ cls: "callout-icon" }), icon);
  titleEl.createDiv({ cls: "callout-title-inner", text: title });
  callout.createDiv({ cls: "callout-content" }).createEl("p", { text: body });
  return callout;
}

// Annotates a region inside a card that already drew itself. `cls` lets a
// caller keep the class its own stylesheet already targets — the thirty ad-hoc
// `*-empty` divs were each styled where they were written, and rewriting all of
// that at once would be a restyle wearing a refactor's clothes.
export function emptyLine(
  parent: HTMLElement,
  text: string,
  cls = "ca-empty-line"
): HTMLElement {
  return parent.createDiv({ cls, text });
}

// ── AND A THIRD SHAPE: THE HEAD CARRIES IT (5.28) ────────────────────────
//
// `emptyCallout` REPLACES content and `emptyLine` ANNOTATES it. This one says
// there is nothing to draw AT ALL — the section's own bar takes a muted phrase
// after its title and the body is not built.
//
// WHY THAT IS NOT A THIRD STYLE OF THE SAME THING. The rule at the top of this
// file is that an empty state names what will appear and HOW TO MAKE IT HAPPEN,
// and a callout carries the second half as a sentence pointing at a control.
// The two sections this is for — a subject's Topics table, a lesson's Pages
// table — are composed as `button:` and then the table, so that control is
// already in the bar, six pixels from where the phrase lands, wearing the very
// label the sentence would have quoted. The sentence was reading the button out
// loud. Where there is no bar the callout is still the answer, which is why this
// marks the element rather than replacing what it drew: the widget builds its
// callout exactly as before, and the DISPATCHER lifts the phrase only when it
// has a titled head to lift it onto (`ui/widgets/index.ts`).
//
// STILL NOT A SMALLER BAR. 5.14 built one of those and the reader rejected it —
// see `section-frame.ts`. Nothing here adds a head; it takes a body away.
export const EMPTY_HEAD_ATTR = "data-ca-empty-head";

// Mark a widget whose empty state the section head may carry instead, with the
// short phrase to carry. Returns the element, so a call site can `return
// emptyHead(root, …)` where it used to `return root`.
export function emptyHead(root: HTMLElement, note: string): HTMLElement {
  root.setAttr(EMPTY_HEAD_ATTR, note);
  return root;
}

// Move a marked widget's empty state onto the bar above it, if there is one,
// and take it off again when the widget stops being empty. Returns whether the
// phrase is on the bar after the call.
//
// `actions` is the bar's action slot — `SectionFrame.actions`, which is what the
// dispatcher is holding at the moment it has just built a widget, and which is
// a child of the bar root. Null where the fence has drawn no head yet.
//
// THE DECISION IS HERE AND THE TIMING IS THE CALLER'S. What the dispatcher
// knows is *which bar this widget landed under*; what an empty state is and
// where it may go is this file's, which is the split the module comment at the
// top asks for — three mechanisms existed because there was nowhere to argue
// the difference, and a fourth spelled out inline in a 400-line dispatch loop
// would be the fourth.
//
// ── TWO THINGS THIS DID NOT DO WHEN IT SHIPPED (5.28, fixed the same day) ──
//
// IT LOOKED ONLY AT THE ELEMENT IT WAS HANDED, and every table it was written
// for is wrapped: `level-index`, `kind-table` and `pages-table` all reach the
// dispatcher through `liveScopedWidget`, which returns a `.ca-journal-live-widget`
// host and appends the built table INSIDE it. So the marker sat one level below
// the element being asked, the answer was always "not marked", and the whole
// mechanism was inert in the vault — which is exactly what the next screenshot
// showed: an empty Pages card still 185px tall. The wrapper is not an accident
// to be routed around, it is how these tables stay live, so the read goes one
// level down.
//
// AND IT WAS A ONE-SHOT, which is the same bug with a delay on it. A live
// widget rebuilds whenever its folder changes: add the first page and the host
// draws a table with a row in it while the bar still says "none yet". So this
// is a SYNC rather than a lift — it removes the phrase it put there before
// deciding whether to put it back, and the span it owns is marked with the same
// attribute so it can never remove a `note:` the section itself composed.
export function liftEmptyHead(
  widget: HTMLElement,
  actions: HTMLElement | null
): boolean {
  // The widget, or the ONLY thing it drew, however deep that is. Not a
  // `querySelector` over the subtree: what may be lifted is a widget whose
  // whole content is the empty state, and a marker found beside other content
  // would be a fragment volunteering its card away.
  //
  // A CHAIN AND NOT ONE STEP, which the first cut got wrong and the screenshot
  // caught: `level-index` — the Topics table on every subject — wraps the
  // rollup in a root of its own AND is wrapped by the live host, so the marker
  // was two levels down and the whole thing went on drawing its box. Stopping
  // at a node with more than one child is what keeps the rule honest: the
  // deepest branch of `level-index` draws a head and a table per kind, and
  // there the walk stops at the root, which is right.
  let marked: HTMLElement | null = widget;
  while (marked && marked.getAttribute(EMPTY_HEAD_ATTR) === null) {
    marked =
      marked.children?.length === 1
        ? (marked.firstElementChild as HTMLElement)
        : null;
  }
  const bar = actions?.parentElement ?? null;
  bar
    ?.querySelector(`.ca-journal-header-note[${EMPTY_HEAD_ATTR}]`)
    ?.remove();

  const note = marked?.getAttribute(EMPTY_HEAD_ATTR) ?? null;
  if (note === null || marked === null) {
    // No longer empty — the widget goes back to drawing itself.
    widget.removeClass("is-empty");
    return false;
  }
  marked.removeAttribute(EMPTY_HEAD_ATTR);
  // A TITLED head, and the test is the title slot rather than the bar's class:
  // `untitled: true` builds the same `.ca-journal-sec` root for a control strip
  // under a markdown heading, and a phrase where no title is drawn reads as a
  // stray word floating above the button.
  if (!bar || !bar.querySelector(".ca-journal-header-title")) return false;
  // EMPTIED, NOT DROPPED. The dispatcher records each widget's position among
  // its container's children BEFORE appending it, so a directive that
  // contributed no child would hand its line number to whatever came next;
  // `stampLines` would stamp the following widget with this one's line and
  // block-drag would move the wrong block. `.is-empty:empty` takes it out of
  // the flow instead — see 94-native-tables.css.
  widget.empty();
  widget.addClass("is-empty");
  const span = createSpan({ cls: "ca-journal-header-note", text: note });
  // OURS, AND SAYS SO. The next pass removes the phrase before deciding
  // whether to write it again, and a `note:` the section composed for its own
  // reasons wears the same class.
  span.setAttr(EMPTY_HEAD_ATTR, "");
  // BEFORE THE ACTIONS, which is where `sectionFrame` puts a `note` it was
  // given up front: the phrase belongs beside the title, not past the button on
  // the far right.
  actions?.insertAdjacentElement("beforebegin", span);
  return true;
}
