// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The diary card's agenda folds away — 1.0.28.
//
// The reader's ask: *"make the Diary calendar's coming up events collapsible
// via 'Upcoming Events' opposite to 'Jump to a Date…'; automatically
// collapsed."*
//
// WHY THESE PROPERTIES AND NOT A RENDER. `buildCalendar` wants a plugin, a
// vault of entries and an events store to draw anything at all, and what this
// release changed is not what it draws — the panel's markup is untouched. It is
// WHERE THE CONTROL LIVES, WHAT THE ABSENT ANSWER MEANS, and WHICH ELEMENT
// carries the state class, and all three are answerable from the source and the
// stylesheet without standing a month grid up.
//
// The one that would be silent if it broke is the last: the panel and the
// card's bottom padding read the same class, and a refactor that moved the
// class onto the panel would hide the agenda correctly and leave the footer
// flush against the card's rim, which is a defect nobody reports as one.

import { describe, expect, it } from "vitest";
import { cssRule, cssRules, readSrc } from "./sources";

const calendar = (): string => readSrc("diary/calendar.ts");

describe("the calendar's agenda is collapsible", () => {
  it("puts the toggle in the footer, beside the jump toggle", () => {
    const src = calendar();
    const at = src.indexOf(`cls: "ca-jc-agenda-toggle"`);
    expect(at, "no agenda toggle").toBeGreaterThan(0);
    // Created ON the footer, which is the half of "opposite Jump to a date…"
    // that the stylesheet cannot state: `space-between` puts a third child
    // wherever it is told, and this one has to be in that row to be told.
    expect(src.slice(at - 60, at)).toContain("footer.createSpan");
    expect(src).toContain(`text: "Upcoming events"`);
  });

  it("ships collapsed, and reads an absent answer as closed", () => {
    const src = calendar();
    // `=== true`, not a truthy test: a `CalendarState` from a build before this
    // one carries no answer at all, and "automatically collapsed" is what an
    // empty record has to mean.
    expect(src).toContain("showAgenda(state?.agendaOpen === true)");
    // Nothing opens it on the way in. The class is applied by `showAgenda`
    // alone, so there is one place that decides.
    expect(src).not.toContain(`addClass("is-agenda-open")`);
  });

  it("keeps the reader's answer where the month is kept", () => {
    const src = calendar();
    const at = src.indexOf("export interface CalendarState");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("}", at));
    expect(body).toContain("agendaOpen?: boolean");
    // The reason it is there rather than in settings: the same rebuild that
    // would snap the month back is the one that would fold this away — adding
    // an event redraws the card that was showing you the events.
    expect(body).toContain("monthKey?: string");
  });

  it("hides the panel from the card, not from itself", () => {
    // The state class is the ROOT's because two rules read it, and only one of
    // them is about the panel.
    expect(
      cssRule(".ca-journal-calendar:not(.is-agenda-open) .ca-jc-agenda")
    ).toContain("display: none");
    expect(
      cssRule(".ca-journal-calendar.ca-jc-has-agenda.is-agenda-open")
    ).toContain("padding-bottom: 0");
    // And the unqualified rule is gone: a card whose agenda is folded away must
    // take its bottom padding back, or the footer sits on the rim.
    expect(cssRules(".ca-journal-calendar.ca-jc-has-agenda")).toEqual([]);
  });

  it("draws the two toggles with one rule", () => {
    // One control in two places. A copy would be the pair drifting apart on the
    // one row where they are read as a pair.
    expect(cssRule(".ca-jc-agenda-toggle")).toContain("cursor: pointer");
    expect(cssRule(".ca-jc-jump-toggle")).toBe(cssRule(".ca-jc-agenda-toggle"));
    // The jump toggle's ellipsis says "something follows" at rest; this one has
    // no such word, so the open state is said in the other channel.
    expect(cssRule(".ca-jc-agenda-toggle.is-open")).toContain("font-weight");
  });
});
