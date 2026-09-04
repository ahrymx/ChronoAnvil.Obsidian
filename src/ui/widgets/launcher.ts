// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A grid of places to go. 4.5 §3.
//
// ── WHY THIS IS A KEYWORD AND NOT AN ARRANGEMENT OF `links:` ─────────────
//
// The `journals:cards` precedent points the other way and is worth answering.
// That release argued one idea gets one name and a second arrangement is an
// ARGUMENT — and `links:` already means *go somewhere*, which is what four
// tiles do. Two things decide against it.
//
// The `#` slot on `links:` is taken. It carries a VaultArea — `links:…#diary`
// wraps the row in that area's titlebar — so an arrangement token in the same
// slot would be two kinds of value, looked up two ways, in one position. That is
// the ambiguity `frame:` and `row` each refused in their own grammar.
//
// And they are not the same idea. A `links:` row is navigation CHROME: a
// breadcrumb trail, an "up", a filter, attached to a page that is about
// something else. A launcher is CONTENT — a block a reader puts on a page
// because getting somewhere is what that part of the page is for. The
// difference shows in where each one goes: the row is welded to a header band,
// and this is a widget in a cell.
//
// ── ONE DESTINATION TABLE ────────────────────────────────────────────────
//
// `resolveTarget` in core/links.ts, shared rather than copied. A second table
// would be a second answer to "where does `search` go", and the second one is
// the one nobody updates. 4.5 added `diary`, `journals` and `capture` to it,
// which is why the tiles the reference design shows are spellable at all.
//
// ── NOTHING DEAD IS DRAWN ────────────────────────────────────────────────
//
// A destination that does not resolve is not drawn. No journals root, no
// Journals tile — rather than a tile that opens nothing, or one greyed out to
// teach a reader that this plugin's controls are decoration (4.1 §6.2). An
// unknown id is skipped for the same reason and without a refusal: this is a
// LIST, and a typo in one of four should cost that tile rather than the block.

import { setIcon, TFile } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";

import type ChronoAnvilPlugin from "../../main";
import { resolveTarget } from "../../core/links";
import { getFile, openFile } from "../../core/util";
import { emptyCallout } from "../empty";

// What a bare `launcher` (overview navigator) draws: the four diary overviews
// (weekly, monthly, quarterly, and yearly).
export const LAUNCHER_DEFAULT = ["week", "month", "quarter", "year"];

export function buildLauncher(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  ids: readonly string[]
): HTMLElement {
  const root = createDiv({ cls: "ca-jlx-grid" });
  const file = getFile(plugin.app, ctx.sourcePath);
  // `resolveTarget` needs the host note — `up` is relative to it, and every
  // other id ignores it. Without one there is nothing to resolve against.
  if (!(file instanceof TFile)) return root;

  let drawn = 0;
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    const target = resolveTarget(plugin, file, id);
    if (!target) continue;
    // A file destination that does not exist is as dead as an unknown id: the
    // note has not been created yet, and a tile opening nothing is worse than
    // one that is not there.
    if (!target.file && !target.action) continue;

    const tile = root.createEl("a", {
      cls: "ca-jlx-tile",
      href: "#",
      attr: { "aria-label": target.label },
    });
    setIcon(tile.createSpan({ cls: "ca-jlx-icon" }), target.icon);
    tile.createSpan({ cls: "ca-jlx-label", text: target.label });
    tile.addEventListener("click", (evt) => {
      evt.preventDefault();
      if (target.action) target.action();
      else if (target.file) void openFile(plugin.app, target.file);
    });
    drawn++;
  }

  if (drawn === 0) {
    // `emptyCallout` REPLACES content, which is this case: there is no grid to
    // draw and the sentence stands in for it. It says what would appear and how
    // to make it happen, which is `empty.ts`'s rule.
    root.addClass("is-empty");
    root.appendChild(
      emptyCallout(
        "compass",
        "Nowhere to go yet",
        "Run Maintenance: set up / repair vault to create the pages this links to, or name your own destinations after the directive."
      )
    );
  }
  return root;
}
