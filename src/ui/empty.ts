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
// Almanac had three separate mechanisms for this and no shared statement about
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
  cls = "am-empty-line"
): HTMLElement {
  return parent.createDiv({ cls, text });
}
