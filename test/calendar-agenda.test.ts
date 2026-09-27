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
import { calendarPanelKey } from "../src/diary/calendar";
import { SECTION_KEY_SEP, pruneCollapsedSections } from "../src/core/pathwatch";
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
    // `=== true`, not a truthy test: a `CalendarState` carrying no answer at all
    // is what "automatically collapsed" has to mean, and it is still the
    // fallback now that a stored answer can outlive the pane.
    expect(src).toContain("opts.folds ? opts.folds.isOpen(panel) : local === true");
    expect(src).toContain('showAgenda(panelOpen("agenda", state?.agendaOpen))');
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
    // The reason it is there AS WELL as in settings: the same rebuild that would
    // snap the month back is the one that would fold this away — adding an event
    // redraws the card that was showing you the events — and a caller with no
    // note to key against still gets a toggle that works.
    expect(body).toContain("monthKey?: string");
    expect(body).toContain("jumpOpen?: boolean");
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

// ── AND ACROSS RELOADS (1.0.42) ──────────────────────────────────────────
//
// *"Remember if diary-calendar chevrons are expanded. Some users want to keep
// coming up rolled down."*
//
// THE ONE THAT WOULD BE SILENT IF IT BROKE is the sign. Both panels ship CLOSED,
// so "the reader opened this" is a fact only an explicitly stored `false` can
// carry — and the dispatcher's other fold store DELETES a key whose value is
// false, correctly, because for a header bar absent means open. Copying that
// store here would persist a close and forget every open, which looks exactly
// like the bug this release is fixing.

describe("where the two panels are remembered", () => {
  const cal = (): string => calendar();
  const wiring = (): string => readSrc("ui/widgets/directive-regions.ts");

  it("files both panels under the namespaced per-note key", () => {
    // `calendar:` NAMESPACES IT, the rule `note:`, `frame:` and `reveal:` already
    // follow: a header bar's keys are `"<path>::<title>"`, so a reader who titled
    // a section `agenda` would otherwise fold this card's panel.
    expect(calendarPanelKey("Diary/Home.md", "agenda")).toBe(
      "Diary/Home.md::calendar:agenda"
    );
    expect(calendarPanelKey("Diary/Home.md", "jump")).toBe(
      "Diary/Home.md::calendar:jump"
    );
    // And the separator is the one `pathwatch.ts` splits on, so the prune and the
    // rename retarget reach these with no new lines.
    expect(calendarPanelKey("a.md", "agenda").split(SECTION_KEY_SEP)[0]).toBe(
      "a.md"
    );
  });

  it("survives the load-time prune and a rename, as a stored `false`", () => {
    // Driven through the REAL prune, because the value is the half that is easy
    // to get wrong: this record holds `false` for a panel the reader opened, and
    // a prune that dropped falsy entries would forget exactly the answer the
    // reader asked to be remembered.
    const folds: Record<string, unknown> = {
      [calendarPanelKey("Diary/Home.md", "agenda")]: false,
      [calendarPanelKey("Diary/Home.md", "jump")]: true,
      [calendarPanelKey("Gone.md", "agenda")]: false,
    };
    const dropped = pruneCollapsedSections(folds, new Set(["Diary/Home.md"]));
    expect(dropped).toBe(1);
    expect(folds).toEqual({
      "Diary/Home.md::calendar:agenda": false,
      "Diary/Home.md::calendar:jump": true,
    });
  });

  it("stores the answer explicitly either way", () => {
    // `map[key] = !open`, not `delete` on false. THE SIGN IS THE WHOLE BUG: a
    // store that deletes on false remembers a close and forgets every open, and
    // for a panel that ships closed that is indistinguishable from not storing
    // anything at all.
    const src = wiring();
    const at = src.indexOf("const folds: CalendarFolds");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n  };", at));
    expect(body).toContain("] === false");
    expect(body).toContain("map[key] = !open");
    expect(body).not.toContain("delete map[key]");
    // Fire-and-forget, as every other fold write is.
    expect(body).toContain("void plugin.saveSettings()");
    // And it writes nothing when the answer has not moved, so a redraw that
    // re-applies the same state is not a save.
    expect(body).toContain("if (map[key] === !open) return;");
  });

  it("does not seed a key on the first draw", () => {
    // A draw that writes to disk would put back the two rows
    // `pruneCollapsedSections` had just dropped for a note nobody has touched —
    // so the record is only ever written by a PRESS. That is why `apply` and
    // `setPanel` are separate: the first call applies and does not record.
    const src = cal();
    expect(src).toContain("applyJump(panelOpen(\"jump\", state?.jumpOpen));");
    const at = src.indexOf("const setPanel = (");
    const body = src.slice(at, src.indexOf("\n  };", at));
    expect(body).toContain("opts.folds?.setOpen(panel, open)");
    // TWO CALL SITES, ONE PER TOGGLE, both inside a click handler — the count is
    // the assertion: a third would be the first draw recording the state a panel
    // was born in, which is the write this test exists to forbid.
    expect((src.match(/setPanel\(/g) ?? []).length).toBe(2);
    for (const m of src.matchAll(/setPanel\("(agenda|jump)", next\)/g)) {
      expect(m[0]).toContain("next");
    }
    expect((src.match(/setPanel\("(agenda|jump)", next\)/g) ?? []).length).toBe(2);
  });

  it("gives the jump row the same memory as the agenda", () => {
    // *"chevronS"*, plural — there are two of them in that footer, and the jump
    // row's state lived in a class and nowhere else, so picking a date and coming
    // back found it shut.
    const src = cal();
    expect(src).toContain('setPanel("jump", next)');
    expect(src).toContain('setPanel("agenda", next)');
    // The class stays `open`; it is what `.ca-jc-jump-row.open` reads, and the
    // agenda's `.is-open` is on the TOGGLE rather than on the panel.
    expect(cssRule(".ca-jc-jump-row.open")).toContain("display: flex");
  });

  it("works for a caller that has no note to key against", () => {
    // An embedded grid, or a test. `folds` is optional and the state object is
    // the fallback, so a toggle still works for the life of the render — the same
    // bargain `fieldFoldStore` strikes for a host without a plugin.
    const src = cal();
    const at = src.indexOf("export interface CalendarOptions");
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain("folds?: CalendarFolds");
  });
});
