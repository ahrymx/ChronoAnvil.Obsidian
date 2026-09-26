// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Changing the glyph one page tiles behind its banner. 1.0.42.
//
// ── WHY A PAGE NEEDS ITS OWN, WHEN A KIND ALREADY HAS ONE ───────────────
//
// 1.0.42 gave every banner a tiled glyph, read from the model: a level's
// `fallbackEmoji`, a note kind's `emoji`, a diary grain's. That is the right
// source for "every Cheatsheet should be 📝" and the journal editor already
// changes it there. It is the wrong source for "this one page is about
// fractions", which is what the reader asked for — *"add a entry to the banner
// actions menu to change the icon"* — and the menu it was asked for is the one
// that acts on the note it is drawn in.
//
// So the two coexist: the model answers by default, frontmatter answers for one
// page. Nothing here changes a kind, and `pageGlyphOf` is what keeps the two
// from drifting — it is the same resolution the banner paints with.
//
// ── EQUAL TO THE DEFAULT IS NOT STORED ──────────────────────────────────
//
// `kind-columns.ts` states this rule and 1.0.32 is where it was learned: a
// reader who opens the picker, looks, and picks the glyph already on screen has
// changed nothing, and writing `pageicon: 📖` for them means their note now
// carries a record of agreeing with us — which then stops following the kind if
// the kind's own glyph is ever changed. Choosing the default DELETES the key.
//
// ── AND NOTHING IS WRITTEN WHEN NOTHING WOULD CHANGE ────────────────────
//
// `header-title.ts`' rule, for its reason: a `processFrontMatter` that leaves a
// file identical still moves its modified time, which is a lie about the
// reader's vault that sync then propagates.

import { TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { frontmatterOf } from "../core/util";
import { notify } from "../core/notify";
import { promptEmoji } from "./modals";
import { pageIconOf, PAGE_ICON_KEY } from "./rung";
import { pageGlyphOf } from "./widgets/page-head";

export async function changePageIcon(
  plugin: ChronoAnvilPlugin,
  path: string
): Promise<void> {
  const app = plugin.app;
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;

  // THE NOTE'S OWN DEFAULT, WHICH IS ALSO THE REFUSAL. A page with no rung
  // draws no film — a note under a journal root whose `type:` names nothing, or
  // a surface the head does not recognise — and there is no icon on screen for
  // this to change. Saying so beats opening a picker whose result is invisible.
  const fallback = pageGlyphOf(plugin, file);
  if (!fallback) {
    notify.info("This note draws no icon, so there is none to change.");
    return;
  }

  const current = pageIconOf(frontmatterOf(app, file)) ?? fallback;
  // `allowNone: false`, so an empty field means "leave it alone" rather than
  // "draw nothing". Clearing an override is choosing the default, which reads
  // the same way round as it does in the journal editor and needs no second
  // control: the picker marks the current glyph, and the one under it is home.
  const picked = await promptEmoji(app, current, false);
  if (picked == null) return;

  const next = picked.trim() === fallback ? null : picked.trim();
  const before = pageIconOf(frontmatterOf(app, file));
  if (next === before) return;

  await app.fileManager.processFrontMatter(file, (fm) => {
    if (next) fm[PAGE_ICON_KEY] = next;
    else delete fm[PAGE_ICON_KEY];
  });
  // NO REPAINT CALL. The head is a `LiveWidget` over this note's frontmatter and
  // the vault banner listens for the same write, so both redraw themselves —
  // which is the whole reason the override is frontmatter and not a setting.
}
