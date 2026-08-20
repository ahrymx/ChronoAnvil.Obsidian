// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What a title's PAGES are built from. 4.50.
//
// ── THE TABLE, AND NOTHING ELSE ──────────────────────────────────────────
//
// No `App`, no plugin, no DOM — `stats-band.ts`'s split, and the only reason
// this release can be checked without a vault. Everything here takes a config
// and some strings and gives back a list or a path; the reading, the writing and
// the confirming are `ui/widgets/kind-row-menu.ts`'s and `journal.ts`'s.
//
// ── WHY A PAGE LAYOUT IS NOT A FILE ──────────────────────────────────────
//
// A TITLE layout is: `buildJournalType` claims a template file for every variant
// a kind names, the launcher rail lists it and `refreshJournalTemplates` writes
// it. A PAGE layout is not, and `sectionContext` says why in its own words —
// *"a page has no variant: every paged kind shares one page template, so there
// is nothing for a variant to distinguish."* That is still true.
//
// What 4.33 added beside it is a saved layout naming `surfaces: ["page"]`, which
// until now was offered only for RELOADING a page that already exists. This
// module is that list read one step earlier, at the moment a page is MADE — and
// it is composed in memory rather than claimed on disk, which is why nothing
// here reaches the allocator, the rail, the repair path or the wizard.

import type { JournalConfig, JournalVariantConfig } from "./custom-journal";

// The frontmatter key a title carries when its pages are NOT built from the
// journal's own page template.
//
// ONE LOWERCASE WORD, matching `created`, `status`, `parent` and `order` — the
// four other properties this plugin writes into a note and reads back.
export const PAGE_LAYOUT_KEY = "pagelayout";

// The id meaning "the journal's page default". EMPTY, not a word: an id is a
// stored layout's own id, and the default is the absence of one — so the value
// that means "no layout named" is the value the property has when it is not
// there. A sentinel word would be a fifth spelling of absent.
export const PAGE_LAYOUT_DEFAULT = "";

// The stored config a journal id names.
//
// ONE IMPLEMENTATION, TAKING THE LIST (4.50). `JournalManager` and
// `JournalTemplates` both need it and both had it — three lines each, which is
// how "which config is this journal?" comes to have two answers the day one of
// them learns about a migration. It takes the array rather than the plugin so
// that it stays checkable without one, and so that neither manager has to reach
// through the other to ask.
//
// BY ID, NOT BY IDENTITY: a `JournalType` is rebuilt on every read and the thing
// that persists is the `JournalConfig` in settings.
export function configOfJournal(
  configs: readonly JournalConfig[] | undefined,
  id: string
): JournalConfig | null {
  return (configs ?? []).find((j) => j.id === id) ?? null;
}

/** One row of a layout dropdown. Structurally `TemplateChoice`, without the UI import. */
export interface LayoutChoice {
  id: string;
  label: string;
}

// The layouts a page of this journal can be built from: the default, then every
// saved layout that says it belongs on a page.
//
// THE SAME MEMBERSHIP TEST `layoutsFor` USES, and deliberately the narrow half
// of it. `JournalVariantConfig` states the asymmetry: `kinds` absent means EVERY
// kind, and `surfaces` absent means NONE — *"a layout saved from a Lesson has no
// business being offered on a Subject Index by default"*. A layout reaches this
// list only by naming `page`, which is a reader having said so.
//
// `label` IS THE PAGE NOUN, not the word "Default". A journal that calls its
// pages Chapters offers "⭐ Chapter default", so the field names the thing it
// is about rather than restating that it is a default.
export function pageLayoutChoices(
  cfg: JournalConfig | null,
  pagesLabel: string
): LayoutChoice[] {
  const rows: LayoutChoice[] = [
    { id: PAGE_LAYOUT_DEFAULT, label: `⭐ ${pagesLabel} default` },
  ];
  for (const v of cfg?.variants ?? []) {
    if (v.surfaces?.includes("page")) rows.push({ id: v.id, label: v.label });
  }
  return rows;
}

// The saved layout an id names, or null for the default.
export function pageLayoutById(
  cfg: JournalConfig | null,
  id: string
): JournalVariantConfig | null {
  if (!id) return null;
  return (
    (cfg?.variants ?? []).find(
      (v) => v.id === id && v.surfaces?.includes("page")
    ) ?? null
  );
}

// What a note's `pagelayout` property means, as a string.
//
// ANYTHING THAT IS NOT A NON-EMPTY STRING IS THE DEFAULT. A property a reader
// typed by hand can be a number, a list or a bare `true`, and none of those
// names a layout.
export function pageLayoutOf(fm: Record<string, unknown>): string {
  const raw = fm[PAGE_LAYOUT_KEY];
  return typeof raw === "string" ? raw.trim() : PAGE_LAYOUT_DEFAULT;
}

// The id to DRAW as chosen, given what the note stores and what still exists.
//
// A STORED ID NAMING A LAYOUT THAT IS GONE FALLS BACK RATHER THAN REFUSING. A
// reader who deletes a saved layout has not asked for every title that named it
// to stop making pages — and a dropdown opening on a value not in its own list
// shows the first row while reporting the missing one, which is two lies at
// once.
export function pageLayoutShown(
  cfg: JournalConfig | null,
  stored: string
): string {
  return pageLayoutById(cfg, stored) ? stored : PAGE_LAYOUT_DEFAULT;
}

// ── What a bin takes ─────────────────────────────────────────────────────

// Whether a note has been promoted: a folder note is one whose basename matches
// its folder.
//
// THE SAME TEST THE REST OF THE PLUGIN USES — `study-header`, `links.ts`'s
// `resolveUp` and `journal.ts`'s own `isPromoted` all ask it this way, so "is
// this a dashboard?" has one answer. Spelled over a PATH here rather than a
// `TFile` because that is what makes it checkable without a vault.
export function isPromotedPath(path: string): boolean {
  const parts = path.split("/");
  const base = (parts.pop() ?? "").replace(/\.md$/, "");
  // NO GUARD FOR THE VAULT ROOT, and a mutation run is why. A note with no
  // folder above it read `undefined === "Quadratics"` and was already false, so
  // an `if (!folder) return false` could be deleted with the suite green — 4.47
  // §4's rule for the third release running: **an equivalent mutant is a
  // deletion, not a cleverer test.** The root case is still asserted, because
  // the next spelling of this line might not be false by accident.
  return parts[parts.length - 1] === base;
}

// The pages of a title: every markdown file beside it in its own folder.
//
// EMPTY FOR A TITLE THAT WAS NEVER PROMOTED, and that is not a detail. An
// unpromoted title sits in the TOPIC folder among its siblings — the other
// titles — so a list of "the files next to me" would be every title in the
// topic. The promotion test is what makes the question meaningful at all.
export function pagePathsOf(
  hostPath: string,
  siblingPaths: readonly string[]
): string[] {
  if (!isPromotedPath(hostPath)) return [];
  return siblingPaths.filter((p) => p !== hostPath);
}

// `binPathsOf` LIVED HERE AND IS GONE (4.50.1). It returned the note's path
// followed by its pages' — a LIST OF FILES TO REMOVE, which is the model 4.50
// built the bin on and the model that was wrong. A promoted title bins as its
// FOLDER, in one rename, so the pages come with it by construction and there is
// no list to get wrong. `pagePathsOf` above is still the answer to "are there
// any", which is what the menu's second row is gated on.
