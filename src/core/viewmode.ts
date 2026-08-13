// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Which pages open in reading mode. 4.6.
//
// ── WHY ANY OF THIS ──────────────────────────────────────────────────────
//
// An Almanac page is a page of widgets. In Live Preview it also shows the
// Properties block, and a click anywhere near a fence puts a cursor in the raw
// directive — `` `almanac:spacer` `` exists BECAUSE of that, as a full-width
// line on row 0 whose whole job is to catch a click that would otherwise land
// inside the first fence and render it as source. In reading mode none of that
// happens and nothing is lost: every widget is a markdown post-processor, and
// the cog, the click-to-rename and the section editor are click handlers that
// run in reading view.
//
// ── RECOGNISED, NOT DECLARED ─────────────────────────────────────────────
//
// The alternative was a frontmatter key written into every composed page. It
// would have meant editing four flat composers, the entry template composer and
// the journal template composer — and, worse, every note already in a reader's
// vault would go without it: `shippedNotes` writes a note only when it is
// missing, so an existing dashboard would never acquire the key. Deriving the
// answer from what the note IS means an existing vault gets this the moment it
// updates, which is the difference between a feature and a feature for new
// vaults.
//
// `surfaceOfNote` already answers "is this an Almanac page" for every one of
// them — a journal note, a diary entry, a period dashboard, the homepage,
// Search, the two folder-note dashboards and a managed template — so this adds
// no second opinion about which notes are the plugin's.
//
// ── AND THE READER CAN STILL SAY NO, IN THEIR NOTE ───────────────────────
//
// `obsidianUIMode` is the key the *Force note view mode* plugin reads, which
// makes it the convention a reader is most likely to already have — the same
// argument 4.2 §1.3 made for `banner:`. Read both ways: `source` means leave
// this note alone, `preview` means put it in reading mode whatever it is. No
// settings key (4.1 §11 refuses one), and the opt-out lives where the reader
// meets it.

import type { TFile } from "obsidian";
import type AlmanacPlugin from "../main";

// The frontmatter key, spelled once.
export const VIEW_MODE_KEY = "obsidianUIMode";
export const READING_MODE = "preview";
export const EDITING_MODE = "source";

// THE WHOLE RULE, as a function of two facts.
//
// PURE, AND SEPARATED FROM THE WORKSPACE for `chromeClasses`' and `cellPlan`'s
// reason: the interesting half is three cases over two inputs, and the suite has
// no workspace to exercise the other half in. What is left outside this is
// plumbing — read a frontmatter value, ask the resolver, set a view state.
//
// `declared` is the raw frontmatter value, whatever a reader typed, or undefined.
export function opensInReadingMode(
  declared: unknown,
  recognised: boolean
): boolean {
  const said = typeof declared === "string" ? declared.trim().toLowerCase() : "";
  // THE OPT-OUT WINS OVER RECOGNITION, which is the case that makes this a
  // reader's decision rather than the plugin's: a note that says `source` is
  // left alone even though Almanac composed it.
  if (said === EDITING_MODE) return false;
  // AND AN EXPLICIT ASK WORKS ON ANY NOTE, including one Almanac has never
  // heard of. Honouring the convention only on our own pages would be honouring
  // half a convention.
  if (said === READING_MODE) return true;
  return recognised;
}

// The same rule, asked of a real file.
export function wantsReadingMode(plugin: AlmanacPlugin, file: TFile): boolean {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  return opensInReadingMode(
    fm[VIEW_MODE_KEY],
    plugin.sections.canEditSections(file.path)
  );
}
