// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The control a stats CELL carries, and the write behind it. 4.48.
//
// ── WHY THE CONTROL IS HERE AND NOT IN THE SECTION EDITOR ────────────────
//
// 4.47 asked four questions — *first number*, *second number*, … — in *Edit this
// note's sections…*, which drew four `<select>` boxes wrapped across the row,
// over a section whose own body is a row of four cells. **A model of the band,
// beside the band.** Reported from a vault as visual clutter, and the fix the
// reader asked for is the obvious one: put the control ON the thing it changes.
//
// `overflowButton` already means exactly this, in `section-frame.ts`'s own
// words — *"a row, a cell, a card inside a page"*. A stats cell is the one place
// in this plugin where the object being configured and the control that
// configures it can be the same object.
//
// ── WHAT IT KNOWS, WHICH IS AS LITTLE AS POSSIBLE ────────────────────────
//
// Nothing here decides what a measure is, what a scope may answer, or how a
// directive is spelled. The three list edits are `stats-band.ts`'s and hold no
// DOM; the write is `withAnswers` with `slotQuestions`, which is the same
// function, the same questions and the same grammar the section editor used —
// including 4.46.1's migration of an older keyword. **The control moved; the
// write path did not.**

import { MarkdownPostProcessorContext, TFile } from "obsidian";
import type AlmanacPlugin from "../../main";
import { overflowButton } from "../section-frame";
import type { StatCell } from "../stat-strip";
import type { JournalType } from "../../journals/journal";
import {
  STAT_CELL_CAP,
  StatScope,
  bandAnswers,
  insertSlot,
  nextMeasureFor,
  removeSlot,
  setSlot,
  swapSlots,
  slotChoicesFor,
  slotQuestions,
} from "../../journals/stats-band";
import { SectionQuestion, withAnswers } from "../../core/section-model";
import { notify } from "../../core/notify";

/** Everything the menu needs that is a fact about the band, not about a cell. */
export interface BandEditContext {
  plugin: AlmanacPlugin;
  ctx: MarkdownPostProcessorContext;
  file: TFile;
  scope: StatScope;
  type: JournalType | null;
  /** The measures the band actually drew, filtered to this scope. */
  measures: readonly string[];
}

// The note, with this block's band rewritten. `null` when nothing would change.
//
// PURE, AND THAT IS THE POINT OF SPLITTING IT OUT. Everything that decides what
// the file should say is here and takes strings; the caller does the reading and
// the writing. A `null` covers both "the answer is what is already there" and
// "this block has no band line to splice" — the caller tells them apart by
// asking first — see `apply`, which returns before it reads the file when the
// answer is what is already there, so a `null` reaching it can only be the
// second.
export function noteWithBandEdit(
  lines: readonly string[],
  body: { from: number; to: number },
  questions: readonly SectionQuestion[],
  next: readonly string[]
): string[] | null {
  const before = lines.slice(body.from, body.to);
  const after = withAnswers(before, questions, bandAnswers(next));
  if (after.join("\n") === before.join("\n")) return null;
  const out = [...lines];
  out.splice(body.from, body.to - body.from, ...after);
  return out;
}

// ── The menu on one cell ──────────────────────────────────────────────────
//
// EVERY CHOICE IS A TOP-LEVEL ROW AND THERE IS NO SUBMENU. 4.47's outcome §5 is
// the argument: `setSubmenu` is not on Obsidian's public types, so it has to be
// probed, and a probe that fails must still leave the setting reachable. A flat
// menu has nothing to probe.
export function attachCellMenus(
  band: BandEditContext,
  cells: readonly StatCell[],
  // Which SLOT drew each cell. `kinds` and `totals` expand, so several cells can
  // share one — recorded as the cells are built rather than reconstructed after,
  // because only the builder knows which measure it was on when it pushed.
  origin: readonly number[]
): void {
  const { scope, type, measures } = band;
  const questions = slotQuestions(scope, type);
  cells.forEach((cell, i) => {
    const at = origin[i];
    if (at === undefined) return;
    const button = overflowButton(cell.root, "sb-cell-menu", (menu) => {
      for (const row of slotChoicesFor(scope, type)) {
        menu.addItem((item) =>
          item
            .setTitle(row.label)
            // TICKED ON THE SLOT, NOT ON THE CELL. Where one choice drew three
            // cells, all three tick the same row — which is the honest thing to
            // show, because changing any one of them replaces all three.
            .setChecked(row.value === measures[at])
            .onClick(() => void apply(band, cell, setSlot(measures, at, row.value)))
        );
      }
      menu.addSeparator();

      // ADDS WITHOUT ASKING. The first measure this scope offers that the band
      // is not already showing, landing immediately after the cell whose menu
      // this is; the reader retargets it from its own `⋯`. One click to a new
      // cell and one more to choose it, against a submenu that might not open.
      const add = nextMeasureFor(measures, scope, type);
      if (add && cells.length < STAT_CELL_CAP) {
        menu.addItem((item) =>
          item
            .setTitle("Add cell")
            .setIcon("plus")
            .onClick(() => void apply(band, cell, insertSlot(measures, at, add)))
        );
      }

      // AND THE LAST CELL HAS NO REMOVE. An argument with no slots left is a
      // BARE directive, and a bare directive is the scope's own default — so
      // removing the last cell would silently restore four cells the reader had
      // just spent four gestures replacing. Removing the band is the section
      // editor's job, and its row still has a Remove button.
      if (measures.length > 1) {
        menu.addItem((item) =>
          item
            .setTitle("Remove cell")
            .setIcon("trash-2")
            .onClick(() => void apply(band, cell, removeSlot(measures, at)))
        );
      }
    });
    // NAMED AFTER THE SLOT IT EDITS, from the question's own label — *"the
    // second number"* — so a screen reader hears which of four identical
    // controls it is on. `overflowButton` writes "More", which is the right
    // word for a row's menu and the wrong one for four of them side by side.
    const named = questions[at];
    if (named) button.setAttr("aria-label", `Change ${named.label}`);

    // AND THE CELL ITSELF IS THE DRAG (4.49). Only where there is somewhere to
    // drop: a one-cell band sets no `draggable`, so the `grab` cursor never
    // appears over a gesture that cannot start.
    if (cells.length > 1) attachCellDrag(band, cell, at);
  });
}

// ── Dragging one cell onto another (4.49) ─────────────────────────────────
//
// `attachCardDrag` IN `journals-cards.ts` IS THE MODEL, verb for verb, because
// the two surfaces are the same shape: a row of things, reordered by dragging
// one onto another, on a page that repaints itself when the drop lands. Every
// question this raises was settled there in 4.45.1 and none of them is re-asked
// here.
//
// A MIME TYPE OF OUR OWN, lowercase because the drag-and-drop spec lowercases
// every type it stores and a mixed-case constant would never match `types`.
const SLOT_DRAG_TYPE = "application/x-almanac-stat-slot";

interface SlotPayload {
  path: string;
  // The block's first line, read at `dragstart`. A page may hold two bands and
  // a vault two windows; this is what lets a drop prove the slot number it was
  // handed describes the band it landed on.
  line: number;
  slot: number;
}

function readPayload(evt: DragEvent): SlotPayload | null {
  const raw = evt.dataTransfer?.getData(SLOT_DRAG_TYPE);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as SlotPayload;
    return typeof p.path === "string" &&
      Number.isFinite(p.line) &&
      Number.isFinite(p.slot)
      ? p
      : null;
  } catch {
    // A payload this cannot read is another plugin's drag wearing our type,
    // which is not a thing that happens — but a `JSON.parse` on a string from
    // outside is a throw waiting for the one day it does.
    return null;
  }
}

function attachCellDrag(band: BandEditContext, cell: StatCell, at: number): void {
  const el = cell.root;
  el.draggable = true;

  el.addEventListener("dragstart", (evt) => {
    const info = band.ctx.getSectionInfo(el);
    if (!info) {
      // Nothing here can be written — an embed, an export — so the gesture does
      // not start rather than starting and failing at the end of it.
      evt.preventDefault();
      return;
    }
    const payload: SlotPayload = {
      path: band.ctx.sourcePath,
      line: info.lineStart,
      slot: at,
    };
    evt.dataTransfer?.setData(SLOT_DRAG_TYPE, JSON.stringify(payload));
    evt.dataTransfer?.setData("text/plain", "");
    if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
    el.addClass("is-dragging");
  });
  el.addEventListener("dragend", () => el.removeClass("is-dragging"));

  el.addEventListener("dragover", (evt) => {
    // ONLY ANOTHER STAT CELL IS A DROP TARGET. A file dragged in from the
    // explorer, a link from another note, a selection of text — all of those
    // fire `dragover` on whatever is under the pointer, and a band that lit up
    // for them would be promising a swap it has no way to make. The custom type
    // is in `types` during the drag even though `getData` is blocked until drop,
    // which is exactly what it is there for.
    if (!evt.dataTransfer?.types.includes(SLOT_DRAG_TYPE)) return;
    if (el.hasClass("is-dragging")) return;
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";
    el.addClass("is-drop-target");
  });
  el.addEventListener("dragleave", () => el.removeClass("is-drop-target"));

  el.addEventListener("drop", (evt) => {
    el.removeClass("is-drop-target");
    const from = readPayload(evt);
    if (!from) return;
    evt.preventDefault();
    const info = band.ctx.getSectionInfo(el);
    // THE DROP HAS TO PROVE IT CAME FROM THIS BAND. A slot number is only
    // meaningful against the measure list it was taken from, and two bands on
    // one page have two different ones — so a payload from another block is
    // refused rather than written somewhere it means something else.
    if (!info || from.path !== band.ctx.sourcePath || from.line !== info.lineStart) {
      notify.fail("That number belongs to a different stats band.");
      return;
    }
    // TWO CELLS FROM ONE CHOICE ARE NOT TWO CELLS. `kinds` and `totals` expand,
    // and the plugin draws what they expand to in its own order, so there is
    // nothing to trade. It SAYS so: 4.48 was a release about a control that
    // silently did nothing, and a drop that lands on a sibling must not be
    // another one.
    //
    // AND THE SAME SLOT CAN ONLY MEAN A SIBLING HERE. A cell dropped on ITSELF
    // never reaches this handler — its own `dragover` returns before
    // `preventDefault`, which is the browser's way of being told this is not a
    // drop target — so no guard for it is written, and none is needed.
    if (from.slot === at) {
      notify.info("Those two numbers come from one choice, so they cannot trade places.");
      return;
    }
    void apply(band, cell, swapSlots(band.measures, from.slot, at));
  });
}

// ── The write ─────────────────────────────────────────────────────────────
//
// `getSectionInfo` IS ASKED AT THE CLICK, NEVER CAPTURED AT RENDER, which is
// `block-drag.ts`'s rule and its reason: it re-reads the live document, and
// every write to this note moves the lines under any range that was kept.
//
// THE FILE IS READ AGAIN TOO, and the two are checked against each other by the
// splice itself — `withAnswers` looks for the band's keyword inside the range,
// so a range that no longer holds one produces no change and is reported rather
// than written. **A silent no-op is the bug this release also fixes**; it is not
// going to be introduced by the fix.
async function apply(
  band: BandEditContext,
  cell: StatCell,
  next: readonly string[]
): Promise<void> {
  const { plugin, ctx, file, scope, type, measures } = band;
  // PICKING THE ROW THAT IS ALREADY TICKED IS NOT AN EDIT, and it has to be
  // caught HERE rather than by the splice returning "no change" — the two are
  // indistinguishable once the write path has started, and the failure notice
  // below would then fire on the one gesture that is meant to do nothing.
  if (next.join(",") === measures.join(",")) return;
  const info = ctx.getSectionInfo(cell.root);
  if (!info) {
    notify.fail("Almanac cannot edit this band here — it is not in an editable note.");
    return;
  }
  const text = await plugin.app.vault.read(file);
  const lines = text.split("\n");
  const out = noteWithBandEdit(
    lines,
    { from: info.lineStart + 1, to: info.lineEnd },
    slotQuestions(scope, type),
    next
  );
  if (!out) {
    notify.fail("Almanac could not find this band's line in the note.");
    return;
  }
  // No repaint call: the band is inside a live widget scoped to its own note,
  // so the write it just made is the event that redraws it.
  await plugin.app.vault.modify(file, out.join("\n"));
}
