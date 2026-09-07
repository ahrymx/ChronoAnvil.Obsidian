// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The chart grid: a toolbar, a row of chart cells, and the live wrapper that
// rebuilds them.
//
// WHY THIS IS HERE AND buildChartCell IS IN charts/
//
// The two came out of the same class and look like they belong together, but
// they need different things and that is what decides where they live.
//
// buildChartCell needs a plugin and nothing else — it resolves a tracker
// definition and hands off to the renderer, so it sits in charts/ beside what
// it adapts. buildChartGrid draws BUTTONS, and a button needs the full
// EntryControlHost: somewhere to read a value, somewhere to write one, and the
// note it was rendered into. That contract lives in the widget layer.
//
// Putting the grid in charts/ would therefore have made charts/ import
// ./controls from ui/ — pointing a domain folder at the presentation layer, and
// undoing the one-way dependency the 2.56.25 split was for. The grid is
// composition of UI parts; it belongs on the UI side of that line.

import { MarkdownPostProcessorContext } from "obsidian";
import type { EntryControlHost } from "./controls";
import { buildButton } from "./button-widgets";
import { buildChartCell, resolvePeriodBounds } from "../../charts/chart-widgets";
import type { ChartSpec } from "../../charts/charts";
import { LiveWidget } from "../livewidget";
import { HeaderBar } from "../headerbar";
import { sectionFrame } from "../section-frame";

// What the charts region says with no `chart:` lines in it.
//
// EXPORTED BECAUSE THERE ARE TWO OF THESE REGIONS — 4.25 §2. `buildChartGrid`
// here and `buildJournalChartStack` in widgets/index.ts are separate render
// paths for the same fence, and each had written this sentence out for itself.
// The empty state is deliberately hand-rolled rather than an `emptyCallout`
// (test/empty-states.test.ts names it as one of the two survivors, and says
// why) — but "hand-rolled" was never meant to mean "written twice". Two copies
// of one sentence drift the moment anyone improves one of them, and only the
// copy in this file is the one the dashboard test pins.
export const CHART_GRID_EMPTY = "No charts yet — use Add chart above.";

export function buildChartGrid(
  deps: EntryControlHost,
  container: HTMLElement,
  specs: ChartSpec[],
  ctx: MarkdownPostProcessorContext,
  blockEl: HTMLElement,
  header: { level: number; title: string } | null
): void {
  const buttons = [buildButton(deps, "chart-add", ctx)];
  // ONE button for edit and remove, not two.
  //
  // They were separate because they started as separate flows, and both did
  // the same first thing: open a picker of this note's charts. The second
  // then deleted the chosen one — while the first opened an editor that has
  // a Delete button in its footer. So "Remove…" was a shortcut to a thing
  // already one press further on, and it was costing a third of the toolbar
  // to say so. On a phone the three buttons wrapped under the section title
  // and pushed the first chart off the screen.
  //
  // The `chart-remove` directive is deliberately still recognised (see
  // BUTTON_SPECS) — a note that has one written into it by hand keeps
  // working. It just isn't part of the toolbar the deps.plugin draws.
  if (specs.length > 0) {
    buttons.push(buildButton(deps, "chart-edit", ctx));
  }

  if (header) {
    // The same frame the journal chart section above uses, and the same one
    // the `header:` directive uses. It used to be this comment's job to
    // promise that ("identical shell/classes to the dashboard header bars") —
    // which is a promise three copies of four lines cannot keep. It is now a
    // shared call, so the claim is structural.
    // The count is the number of charts this section actually holds, and it
    // is what stops a folded Charts section being opaque. Passed as a number
    // rather than as `null` because this caller genuinely knows — `specs` is
    // right here — which is the distinction the frame asks for.
    //
    // ── INTO `container`, AND BEFORE ITS BODY (5.10) ──────────────────
    //
    // This read `sectionFrame(blockEl, …)` for three releases. `container` is
    // created by the caller and handed here empty, then filled below — so a
    // bar appended to the BLOCK landed after everything in it, and the section
    // rendered upside down: the empty state above the title, and the Add chart
    // button under it — a sentence pointing at a control that was below where
    // it said to look. The screenshots that reported this show exactly that,
    // on the home page and on a Study subject.
    //
    // AND THE FOLD WENT WITH IT, which is the half that does not look like a
    // layout bug. `HeaderBar.recompute` hides THE BAR'S LATER SIBLINGS; with
    // the body sitting before the bar there are none, so collapsing the
    // section closed nothing and the empty state went on drawing under a
    // chevron pointing the other way.
    //
    // So the host is the element the body goes into, and the bar is built
    // first. That is rule one of the frame and it is not a chart rule: a
    // renderer that must draw its content first moves it into the frame
    // afterwards, the way `frame: section` does in widgets/index.ts.
    const frame = sectionFrame(container, {
      title: header.title,
      level: header.level,
      count: specs.length,
    });
    for (const btn of buttons) frame.actions.appendChild(btn);
    ctx.addChild(
      new HeaderBar(
        deps.plugin,
        frame.root,
        blockEl,
        ctx.sourcePath,
        header.title,
        header.level
      )
    );
  } else {
    const toolbar = container.createDiv({ cls: "ca-journal-chart-toolbar" });
    for (const btn of buttons) toolbar.appendChild(btn);
  }

  if (specs.length === 0) {
    container.createDiv({
      cls: "ca-journal-chart-empty",
      text: CHART_GRID_EMPTY,
    });
    return;
  }

  // The grid is live: a "period"-ranged chart follows the note's own
  // week-start / month-start, so navigating to another week/month has to
  // redraw it. Rebuilding on the host note's metadata change is what makes
  // "This period (follows the page)" actually follow — previously the block
  // rendered once and kept showing the period it first resolved. Teardowns
  // from the previous build are run before each rebuild so Chart.js instances
  // never accumulate.
  const teardowns: (() => void)[] = [];
  // `journal-chart-host` carries `container-type: inline-size` so the grid can
  // respond to the *pane* width rather than the window's — an Obsidian
  // sidebar is routinely 300px inside a 1600px display. Its own class rather
  // than putting containment on every `.ca-journal-live-widget`: container-type
  // implies `contain: layout style inline-size`, and applying that to the
  // half-dozen unrelated widgets that share the live-widget host would be a
  // large blast radius for a rule only the chart grid needs.
  const host = container.createDiv({
    cls: "ca-journal-live-widget ca-journal-chart-host",
  });
  ctx.addChild(
    new LiveWidget(deps.plugin.app, host, {
      build: () => {
        const grid = createDiv({ cls: "ca-journal-chart-grid" });
        // Resolved once for the whole grid rather than per cell. It is a
        // property of the host note, so every cell was reading the same
        // frontmatter and computing the same answer — and the automatic tile
        // size needs it too (a `period` chart is seven days on the weekly
        // overview and a full year on the year dashboard, which is the
        // difference between a small tile and a large one). Inside build(),
        // so the LiveWidget's rebuild on metadata change still re-resolves it.
        const period = resolvePeriodBounds(deps.plugin, ctx);
        for (const spec of specs) {
          const destroy = buildChartCell(deps.plugin, grid, spec, period, ctx);
          if (destroy) teardowns.push(destroy);
        }
        return grid;
      },
      shouldRefresh: (f) => f.path === ctx.sourcePath,
      onCleanup: () => {
        for (const fn of teardowns) fn();
        teardowns.length = 0;
      },
    })
  );
}
