// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Joining a page to the diary. 1.0.11.
//
// ── WHAT "LINKED TO THE DIARY" MEANS, SINCE NOTHING SAID SO BEFORE ──────
//
// There was no such concept in the tree: no attach function, no frontmatter key
// that meant it, no index entry point. What there WAS is a key the whole diary
// already reads and nothing ever writes — `JOURNAL_DATE_PROPERTY`, spelled
// `date:`. `diary-index.ts` builds a journal note's index row from it, and
// `bridge-widgets.ts` refuses to offer a bridge to a note that lacks it. A page
// with that property is on the diary's timeline; a page without one is not.
//
// So this action is that property, written. Stamping it turns on search,
// on-this-day and the bridge together, because all three were already asking.
//
// ── AND THE HALF THAT IS VISIBLE ────────────────────────────────────────
//
// A property is invisible, and an action whose whole effect is a frontmatter
// key a reader cannot see is an action they will press twice and then stop
// trusting. So the day gets told about the page as well: a link to it lands in
// the entry's attachments region, where the plugin ALREADY puts vault links
// dragged in by hand and already draws them as chips. Nothing here invents a
// storage format — `newAttachment` classifies it and `serializeAttachmentLine`
// spells it, exactly as a drop would.
//
// WHY THE ATTACHMENTS REGION AND NOT THE PROSE. The standing rule is that this
// plugin writes into `<!--chronoanvil:key-->` regions and never into a reader's
// loose markdown. `attachments` is the region on every grain's template whose
// content type is "things this day points at", which is what a linked page is.
// `log` and `focus` are the reader's sentences and are not ours to append to.
//
// A DAY WITH NO ATTACHMENTS REGION STILL GETS THE PROPERTY. An entry written
// before the field existed, or one whose reader removed it, is not a reason to
// refuse the half that works — the notice says which half happened.

import { Notice, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { JOURNAL_DATE_PROPERTY } from "../core/constants";
import {
  hasNoteRegion,
  readNoteRegion,
  writeNoteRegion,
} from "../core/notestore";
import { frontmatterOf, getFile, today } from "../core/util";
import {
  hasTarget,
  newAttachment,
  parseAttachments,
  serializeAttachments,
} from "../ui/attachments";
import { promptText } from "../ui/modals";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The region every grain's template gives its attachments field. One spelling,
// here, because `entry-sections.ts` writes `attach:attachments|Attachments` on
// all five grains and a second copy of that key would rot silently — the link
// would simply stop arriving, with nothing failing.
const ATTACH_KEY = "attachments";

// The date this page already claims, if it claims one.
//
// A STRING, WHATEVER YAML MADE OF IT. `date: 2026-09-13` parses as a Date in
// some vaults and a string in others depending on quoting, and a `Date` here
// would reach `openOrCreateDay` as `[object Date]`. Anything that is not
// already an ISO day is treated as absent and the reader is asked — which is
// also the right answer for `date: soon`.
function statedDate(fm: Record<string, unknown>): string | null {
  const raw = fm[JOURNAL_DATE_PROPERTY];
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return DATE_RE.test(t) ? t : null;
}

export async function linkPageToDiary(
  plugin: ChronoAnvilPlugin,
  notePath: string
): Promise<void> {
  const file = getFile(plugin.app, notePath);
  if (!file) {
    new Notice("Open a note first.");
    return;
  }

  const already = statedDate(frontmatterOf(plugin.app, file));

  // ASKED ONLY WHEN THE PAGE DOES NOT ALREADY SAY. A page with a date is being
  // linked to the day it is already about, and asking would invite a reader to
  // answer differently from their own frontmatter — which would then be
  // rewritten, silently, by a button labelled "link".
  const date = already ?? (await askForDate(plugin));
  if (date == null) return;

  if (!already) {
    await plugin.app.fileManager.processFrontMatter(file, (front) => {
      front[JOURNAL_DATE_PROPERTY] = date;
    });
  }

  // `reveal: false`: the reader pressed a button in the page they are reading,
  // and taking them out of it is not what they asked for. The same argument
  // quick capture makes for the same flag.
  const entry = await plugin.diary.openOrCreateDay(date, { reveal: false });
  if (!entry) return;

  const linked = await linkFromEntry(plugin, entry, file);
  new Notice(
    linked
      ? `Linked to the diary on ${date}.`
      : `Dated ${date}. The entry has no attachments field to link from.`
  );
}

// Ask which day this page belongs to, defaulting to today.
async function askForDate(plugin: ChronoAnvilPlugin): Promise<string | null> {
  const input = await promptText(
    plugin.app,
    "Diary date (YYYY-MM-DD)",
    "YYYY-MM-DD",
    today()
  );
  if (input == null) return null;
  const d = input.trim();
  if (!DATE_RE.test(d)) {
    new Notice("Use the format YYYY-MM-DD");
    return null;
  }
  return d;
}

// Put a link to `page` in `entry`'s attachments region. Answers whether it
// landed: false means the entry has no such region to write into.
//
// READ-MODIFY-WRITE INSIDE `vault.process`, where `appendToNoteRegion` would
// have been a straight append. The dedupe needs the current list in hand —
// pressing the button twice must not add the page twice, and `hasTarget` is the
// same check a second drop of the same file makes — and `process` is what
// serialises the read against every other body write, which is the hazard the
// append path exists to avoid.
async function linkFromEntry(
  plugin: ChronoAnvilPlugin,
  entry: TFile,
  page: TFile
): Promise<boolean> {
  let wrote = false;
  await plugin.app.vault.process(entry, (text) => {
    const items = parseAttachments(readNoteRegion(text, ATTACH_KEY));
    if (hasTarget(items, page.path)) {
      wrote = true;
      return text;
    }
    if (!hasNoteRegion(text, ATTACH_KEY)) return text;
    wrote = true;
    return writeNoteRegion(
      text,
      ATTACH_KEY,
      serializeAttachments([...items, newAttachment(page.path, page.basename)])
    );
  });
  return wrote;
}
