// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A row of divided stat cells: label, value, optional sub-line.
//
// ONE COMPONENT, BECAUSE §4.1's BLOCKER WAS NEVER THE NUMBERS. 3.2 deferred
// giving the other three grains a stat strip on the grounds that weekly and
// monthly cannot compute four figures and a strip padded with zeros is worse
// than no strip. That was true of the YEAR'S strip, which was a four-up flex
// with a hardcoded two-up fallback, and it was a fact about the container
// rather than about the grains. Nothing requires four: a caller declares the
// cards it has and the strip lays out however many that is.
//
// So the year keeps its four and the week, month and quarter take the two they
// can answer honestly, out of one component rather than two that would drift.
//
// THE CLASSES ARE `am-`, NOT `jyr-`. The markup was the year view's, private to
// it, and the diary band adopting `.jyr-stat` would have made every future
// reader of that name check whether the year page was involved. The `.jyr-*`
// rules are retired the way 2.56.2 retired `.jq-section-*`: the callers move
// and the rules go, rather than an alias being added so both spellings work.

/** One cell. `sub` is omitted rather than empty when there is nothing to say. */
export interface StatCard {
  label: string;
  value: string;
  sub?: string | null;
  icon?: string | null;
  ratio?: number | null;
}

/** The handles a caller needs to fill a cell in later. */
export interface StatCell {
  root: HTMLElement;
  value: HTMLElement;
  sub: HTMLElement;
}

// The grid, and the cells it made.
//
// THE COUNT IS AN ATTRIBUTE, NOT AN INLINE CUSTOM PROPERTY, and the first cut
// of this got it wrong in a way worth recording. Setting
// `--am-stats-cols` with `style.setProperty` reads well and cannot work: an
// inline declaration is the one thing a stylesheet cannot override, so the
// container query below it — the entire point of the component — was being
// silently beaten by the element it was trying to lay out. The strip stayed
// four across at every width and nothing errored.
//
// A layout the CSS has to be able to ADAPT cannot be written from JavaScript.
// What JavaScript knows is how many cards there are; what the stylesheet knows
// is how many fit. So the count goes on as data and the stylesheet owns every
// declaration that acts on it.
export function statStrip(
  parent: HTMLElement,
  cards: StatCard[]
): { grid: HTMLElement; cells: StatCell[] } {
  const grid = parent.createDiv({ cls: "am-stats" });
  // Capped at four: past that the cells are too narrow to read a label in, and
  // no caller has five. Set even for one card, so a lone cell fills the row
  // rather than sitting a quarter-width against empty space.
  grid.setAttr("data-cols", String(Math.min(Math.max(cards.length, 1), 4)));

  const cells = cards.map((c) => {
    const root = grid.createDiv({ cls: "am-stat" });
    if (c.ratio != null || c.icon) {
      const ringWrap = root.createDiv({ cls: "am-stat-ring-wrap" });
      if (c.ratio != null) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 36 36");
        svg.setAttribute("class", "am-stat-ring-svg");

        const bgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        bgPath.setAttribute("class", "am-stat-ring-bg");
        bgPath.setAttribute(
          "d",
          "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        );

        const valPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        valPath.setAttribute("class", "am-stat-ring-val");
        const pct = Math.min(Math.max(Math.round(c.ratio * 100), 0), 100);
        valPath.setAttribute("stroke-dasharray", `${pct}, 100`);
        valPath.setAttribute(
          "d",
          "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        );

        svg.appendChild(bgPath);
        svg.appendChild(valPath);
        ringWrap.appendChild(svg);
      }
      if (c.icon) {
        ringWrap.createSpan({ cls: "am-stat-ring-icon", text: c.icon });
      }
    }

    const data = root.createDiv({ cls: "am-stat-data" });
    // Label first in the DOM as well as on screen. It is what the value means,
    // and a screen reader that hit "145" before "Diary entries" would be
    // reading the answer before the question.
    data.createDiv({ cls: "am-stat-label", text: c.label });
    const valRow = data.createDiv({ cls: "am-stat-val-row" });
    const value = valRow.createDiv({ cls: "am-stat-value", text: c.value });
    // Always created, even when empty: a sub-line that appears when an async
    // read lands would change the cell's height and shift the row under it.
    const sub = valRow.createDiv({ cls: "am-stat-sub", text: c.sub ?? "" });
    return { root, value, sub };
  });

  return { grid, cells };
}
