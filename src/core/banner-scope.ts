// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Which notes the vault banner appears on. 4.51.
//
// ── PURE, AND THAT IS WHY IT IS IN `core/` ───────────────────────────────
//
// No `App`, no plugin, no DOM — `stats-band.ts`'s and `page-default.ts`'s split.
// The banner itself is a view-level hook that cannot be reached without a vault;
// the QUESTION it asks first — *is this one of ours, and which kind* — is a
// string test over paths and is checkable here.
//
// ── ALMANAC NOTES ONLY, WHICH IS A DECISION AND NOT A DEFAULT ────────────
//
// The banner is chrome, and chrome on a note the plugin has nothing to say about
// is a plugin behaving like a vault skin. A note written outside the diary,
// outside every journal and away from the homepage gets nothing — no banner, no
// crumbs, no reserved height.
//
// ── LONGEST ROOT WINS, WHICH IS THE PLUGIN'S OWN RULE ────────────────────
//
// `journalTypeOfPath` resolves an overlapping pair of journals that way and
// `levelScope` reads a folder the same way, so a reader who points their diary
// at `03 - Journals/Diary` gets the answer the rest of the plugin would give.
// A first-match-wins list would make the answer depend on the order the fields
// happen to sit in `settings.paths`, which is not a fact about their vault.

import { normalizePath } from "obsidian";
import { folderPrefix } from "./util";

/** Which kind of Almanac note this is — the banner draws different facts for each. */
export type BannerSurface = "diary" | "journal" | "home";

/** The folders that decide the answer, taken as data so this needs no plugin. */
export interface BannerScope {
  /**
   * The flat dashboards, by exact path: the homepage and the Search note.
   *
   * A LIST SINCE 4.51.3, and the vault render is why. It was one field called
   * `home`, and the Search note — a page Almanac composes, with Almanac's own
   * banner on it — was outside the bar entirely. Two exact paths is what the
   * plugin actually has; one was a guess.
   */
  flatNotes: readonly string[];
  /**
   * The diary's own root, and every grain folder under it.
   *
   * THE ROOT IS IN THE LIST (4.51.3). `02 - Diary/02 - Diary.md` is the diary's
   * folder note — an Almanac dashboard with an Almanac banner — and it is in
   * none of the five grain folders, so the bar skipped it and the note kept its
   * old banner.
   */
  diaryFolders: readonly string[];
  /**
   * The journals root, and every registered journal's root under it.
   *
   * THE ROOT IS IN THIS LIST FOR THE SAME REASON, and it matters more here: a
   * vault with **no journals registered** has an empty list of journal roots,
   * so before 4.51.3 the entire journals half of the vault — including
   * `03 - Journals/03 - Journals.md`, which every vault has — was outside the
   * bar. That is the state a new vault starts in.
   */
  journalRoots: readonly string[];
}

// Which surface a path belongs to, or null for a note that is none of Almanac's
// business.
//
// THE HOMEPAGE IS AN EXACT PATH, NOT A PREFIX. It is one file, and a folder that
// happens to share its name is a folder.
//
// A FOLDER MATCHES ITSELF AS WELL AS WHAT IS UNDER IT: `03 - Journals` is where
// the journals root's own folder note lives, and that note is as much a journal
// note as anything beneath it.
export function bannerSurfaceOf(
  path: string,
  scope: BannerScope
): BannerSurface | null {
  const p = normalizePath(path);
  for (const flat of scope.flatNotes) {
    if (flat && p === normalizePath(flat)) return "home";
  }

  let best: BannerSurface | null = null;
  let bestLen = -1;
  const consider = (folder: string, surface: BannerSurface): void => {
    if (!folder) return;
    const root = normalizePath(folder);
    const prefix = folderPrefix(folder);
    if (p !== root && !p.startsWith(prefix)) return;
    // STRICTLY LONGER, so a tie keeps the first surface considered — and the
    // order below puts the diary first, which is the honest tie-break: a folder
    // named as both is a misconfiguration, and the diary is the surface whose
    // notes are found by filename and would break the more visibly.
    if (root.length > bestLen) {
      bestLen = root.length;
      best = surface;
    }
  };
  for (const f of scope.diaryFolders) consider(f, "diary");
  for (const f of scope.journalRoots) consider(f, "journal");
  return best;
}

/** Whether this note gets a banner at all. */
export function hasBanner(path: string, scope: BannerScope): boolean {
  return bannerSurfaceOf(path, scope) !== null;
}

// ── What the title edits ─────────────────────────────────────────────────
//
// ONE CONTROL, TWO TARGETS, DECIDED BY SURFACE (4.51, Q11).
//
// On a journal note the file's name IS the note's name — that argument is older
// than this release and is written where it was first made: the quick switcher,
// the graph, every backlink and every table display read the filename, and
// storing a second title in frontmatter would let those disagree.
//
// A DIARY ENTRY IS THE CASE THAT BREAKS IT. Its filename is a DATE, and the
// diary finds its entries by that filename — so renaming `2026-08-20.md` does
// not retitle the entry, it removes it from the diary. The entry already has a
// place for a name (`TITLE_PROP`, which `entryheader.ts` has edited since 4.21),
// and that is what the banner's title writes there.
//
// DECIDED BY SURFACE RATHER THAN BY THE READER REMEMBERING. The control looks
// the same on both and the reader never has to know which one they are on,
// because on each one it does the only thing that could be meant.
export type TitleTarget = "filename" | "property";

// A DIARY *ENTRY* IS THE CASE, NOT THE DIARY (4.51.3). The rule above was
// keyed on the surface alone, and the surface now reaches the diary's own
// folder note and its four period overviews — pages whose names are their
// filenames and which have no entry title to write.
//
// `hasDate` IS THE TEST BECAUSE IT IS WHAT MAKES A NOTE AN ENTRY. The diary
// indexer will not index a diary note without a date; `entryDateLabel` returns
// null for one. A dashboard has no date, a Tuesday does — and asking the note
// rather than its folder is what keeps the answer right for a note filed
// somewhere odd.
export function titleTargetFor(
  surface: BannerSurface,
  hasDate: boolean
): TitleTarget {
  return surface === "diary" && hasDate ? "property" : "filename";
}
