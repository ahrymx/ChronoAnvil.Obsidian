// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Where a drop-down sits (1.0.46).
//
// THE CARD IS NOT BIG ENOUGH TO HOLD A MENU, AND IT NEVER WILL BE. The date
// picker's list was `position: absolute` inside `.ca-jeh-datenav`, so its box
// was bounded by whatever the nearest scroll or clip ancestor happened to be.
// On a diary entry that ancestor is the stack card, which sets
// `overflow: hidden` on purpose — that is what makes the head's spine and the
// grid's rules stop at the radius — so the menu was cropped to the card. The
// reader saw it as two faults in one screenshot pair:
//
//   "date note picker should grow downward. Also the old entries without the
//    new stack seem to show a different list of available dates?"
//
// They are one fault. `dateOptions` takes `(plugin, grain)` and nothing else —
// there is no welded/unwelded branch in it, and the list is the same four days
// on both entries. What differed was how much of that list survived the crop:
// an UNWELDED entry's stepper is the first row of `.ca-journal-tracker-section`,
// which has no `overflow`, so the menu grew up over the banner card above it
// and all four rows showed. A WELDED entry's stepper is a band inside the one
// card, and the two rows that would have sat above the title were cut off at
// the card's edge. Same list, two crops, and the crop looked like data.
//
// So the menu leaves the flow. `position: fixed` puts its containing block at
// the viewport, which no `overflow: hidden` ancestor clips, and this places it
// against the trigger's own rect. The direction is then a measurement rather
// than a guess: DOWNWARD, which is what the reader asked for and what every
// other drop-down on the page does, flipping up only when down genuinely does
// not fit and up fits better.
//
// The cost of leaving the flow is that fixed coordinates do not follow a note
// that scrolls under them, so this listens for scroll and resize and places it
// again. Both listeners come off through the function this returns, which the
// caller's `closeMenu` calls — adds and removes live in this file, which is
// what `test/review-checklist.test.ts` sweeps for.

/** The gap between the trigger and the menu — the 6px the CSS stated. */
const GAP = 6;
/** How close to the window's edge the menu may come. */
const EDGE = 8;
/** Below this a shrunk list is a scrollbar with nothing to scroll. */
const MIN_LIST = 96;

/**
 * Place `menu` against `trigger` and keep it there. `menu` is `position: fixed`
 * and `scroller` is the element inside it that takes a `max-height` when the
 * room is short. Returns the release for the listeners it opens.
 */
export function anchorDropMenu(
  trigger: HTMLElement,
  menu: HTMLElement,
  scroller: HTMLElement
): () => void {
  const place = (): void => {
    const box = trigger.getBoundingClientRect();

    // MEASURE UNCONSTRAINED FIRST. A second placement must not inherit the
    // first one's shrink, or a menu opened once in a tight spot stays short
    // after the note scrolls and the room comes back.
    menu.removeClass("is-above");
    scroller.style.maxHeight = "";
    const chrome = menu.offsetHeight - scroller.offsetHeight;

    const below = window.innerHeight - box.bottom - GAP - EDGE;
    const above = box.top - GAP - EDGE;
    const up = menu.offsetHeight > below && above > below;

    const room = Math.max(MIN_LIST, (up ? above : below) - chrome);
    if (scroller.offsetHeight > room) scroller.style.maxHeight = `${room}px`;
    if (up) menu.addClass("is-above");

    menu.style.top = up
      ? `${box.top - GAP - menu.offsetHeight}px`
      : `${box.bottom + GAP}px`;
    // Left-aligned to the trigger, as the entry's own rule already was, then
    // pulled back inside the window — the trigger can sit near the right edge
    // on a split pane, where a 220px menu would otherwise run off it.
    const left = Math.min(box.left, window.innerWidth - EDGE - menu.offsetWidth);
    menu.style.left = `${Math.max(EDGE, left)}px`;
  };

  place();

  const onMove = (): void => place();
  document.addEventListener("scroll", onMove, true);
  window.addEventListener("resize", onMove);

  return (): void => {
    document.removeEventListener("scroll", onMove, true);
    window.removeEventListener("resize", onMove);
  };
}
