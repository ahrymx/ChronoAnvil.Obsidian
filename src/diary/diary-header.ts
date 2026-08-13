// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Diary section's actions: what you can do to today, from the page you
// landed on.
//
// ── THIS FILE USED TO BE A HERO, AND 4.13.1 §3 TOOK IT OFF ────────────────
//
// It drew an accent-washed band across the top of the calendar card carrying an
// eyebrow date, a greeting sized at 1.5em, a status line, the action pills and a
// strip of four numbers — entries this month, day streak, open tasks, 7-day
// mood. Its own history was a steady collapse of containers (a bordered card
// above a `header:📅 Diary` bar, then the section header itself in 2.13.3, then
// inside the card in 2.13.7); this is the last step of that same movement, and
// it removes the band as well as the box.
//
// WHY, IN ONE SENTENCE: the section under it does the same job with no tint and
// one hairline per boundary. `month-summary` — *This month*, eight pixels below
// this card on the diary dashboard — is a banner, a stat strip and a grid, drawn
// on the card's own ground with a rule under the banner. Two idioms for one kind
// of object on one screen is the finding 4.13 §1 made about the title bars, and
// this was the same fault one widget over.
//
// WHAT WENT WITH IT, STATED, because a reader will notice: the greeting, the
// eyebrow date, the status line, the four numbers, and the empty-vault line "No
// entries yet — start your first one." Every CONTROL survived that release —
// they were what this file still built — and the numbers were never
// load-bearing: three of the four are one click away in the diary's own
// dashboards, which is where a number can name the scope it counted.
//
// ── AND 4.13.2 §1 TOOK THREE OF THE CONTROLS ──────────────────────────────
//
// "Every control survives" was the right promise for a release that was removing
// a BAND. Rendered, the strip it left was five controls wide and three of them —
// Open today / Start today, Yesterday, All entries — pointed at things the card
// under them already points at. `buildDiaryActions` below carries that argument
// where it can be checked against the code.
//
// WHAT IS LEFT IS A STRIP, and it is drawn as one: right-aligned, at the section
// bar's scale, with a hairline under it. `.journal-sec-l1`'s actions strip and
// `.journal-group-foot` are the same object at two scales (4.11), and this is
// the third — on a dashboard it sits directly under the section's own bar and
// reads as its strip; on the homepage, where the block wears a block head and
// has no strip, it reads as the same band under that head.
//
// It stays a view over the plugin's own openers — `openCapture`, plus
// `buildBannerLinks` for the one destination no calendar can point at. No
// persistence, no data source, and, since 4.13.2 took the last `hasToday` check
// with the button that needed it, **no vault read at all**.

import { MarkdownPostProcessorContext, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";
import { openCapture } from "./capture";
import { buildBannerLinks } from "../core/links";

// A button in the strip. There is one, and it is a `.journal-btn` rather than a
// `mod-cta`: 4.13.1 §1 flattened the primary tier out of the plugin.
//
// KEPT AS A FUNCTION FOR ONE CALLER, deliberately. It is the shape of a control
// on this strip — the icon slot, the label span, the prevented default — and
// inlining it would put those four lines back in the builder for the next
// control to be added beside rather than in the same shape as.
function addAction(
  parent: HTMLElement,
  label: string,
  icon: string,
  onClick: () => void
): void {
  const btn = parent.createEl("button", { cls: "journal-btn" });
  setIcon(btn.createSpan({ cls: "journal-btn-icon" }), icon);
  btn.createSpan({ cls: "journal-btn-label", text: label });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
}

// The strip's contents, built into a caller-owned row.
//
// `ctx` IS REQUIRED, unlike the hero's, and that is a simplification rather than
// a new demand: `buildBannerLinks` resolves its destinations relative to the
// host note, and the only caller (calendar.ts, on `opts.header`) already had to
// have one to draw the band at all.
export function buildDiaryActions(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const root = createDiv({ cls: "jc-actions" });

  // ── WHAT WENT, AND THE RULE BEHIND IT (4.13.2 §1) ──────────────────────
  //
  // The strip shipped in 4.13.1 with five controls on it — Open today / Start
  // today, Yesterday, Capture, All entries, Search — because the hero it
  // replaced had five and nothing was to be lost. Rendered, three of the five
  // were ways of getting to a day, sitting on top of a card whose entire body
  // is a way of getting to a day.
  //
  // **OPEN TODAY AND YESTERDAY ARE IN THE GRID.** Today is the cell with the
  // ring on it and yesterday is the cell before it; both open on a click, and
  // both say which date they are while doing it, which a button cannot. A
  // control duplicated twelve pixels from the thing it duplicates is not a
  // shortcut, it is the same control drawn twice. **All entries** goes for the
  // same reason one level out: the page head above this card is where you are in
  // the vault, and the diary's own folder is a click away in it.
  //
  // The open-today button goes in BOTH ITS STATES, which is what took the last
  // vault read out of this module: it existed to choose between "Open today" and
  // "Start today", and there is no longer a word to choose.
  //
  // WHAT IS LEFT IS THE TWO THAT ARE NOT ON THE PAGE. Capture writes without
  // leaving the note, and Search reaches notes no calendar can point at.
  addAction(root, "Capture", "pencil-line", () => openCapture(plugin));
  root.appendChild(buildBannerLinks(plugin, ctx));

  return root;
}
