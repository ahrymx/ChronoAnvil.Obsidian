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
    const toolbar = container.createDiv({ cls: "journal-chart-toolbar" });
    for (const btn of buttons) toolbar.appendChild(btn);
  }

  if (specs.length === 0) {
    container.createDiv({
      cls: "journal-chart-empty",
      text: "No charts yet — use Add chart above.",
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
  // than putting containment on every `.journal-live-widget`: container-type
  // implies `contain: layout style inline-size`, and applying that to the
  // half-dozen unrelated widgets that share the live-widget host would be a
  // large blast radius for a rule only the chart grid needs.
  const host = container.createDiv({
    cls: "journal-live-widget journal-chart-host",
  });
  ctx.addChild(
    new LiveWidget(deps.plugin.app, host, {
      build: () => {
        const grid = createDiv({ cls: "journal-chart-grid" });
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
