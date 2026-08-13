// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Taking a saved layout somewhere it was not saved.
//
// WHY THIS IS A MODULE AND NOT A FLAG (3.18 follow-ups §5, second half)
//
// The cross-KIND half was a storage move: a layout is `{sections, options}`
// keyed by nothing kind-specific, so offering it on a second kind of the same
// journal needed no new semantics at all. Cross-JOURNAL is a different problem,
// and the difference is that a layout names things that may not exist on the
// other side:
//
//   SECTIONS ARE NAMED BY ID, and which sections exist is a function of the
//   surface. `sectionApplies` filters by `surface`, by `applies(ctx)`, and by
//   the type's own shape — so a layout naming `pages` applied to a journal
//   whose kinds are not paged names a section that cannot be composed.
//
//   OPTIONS ARE WORSE THAN SECTIONS. A `resources` override naming shelves is
//   arguably portable — the shelves are the reader's own words. A `bridge`
//   override naming a tracker id is portable only if the vault still defines
//   that tracker. And a `children` override keyed by KIND ID is not portable at
//   all: kind ids are per journal by construction, so `{ lesson: … }` means
//   nothing in a journal whose kinds are `recipe` and `method`.
//
// `sectionsFor` already drops what cannot be composed — SILENTLY, which is
// right for composing a template from a layout that belongs where it is, and
// wrong for carrying one somewhere new. The follow-up's own words: the answer
// has to be defined — drop silently, drop loudly, or refuse — "and silence is
// the wrong one".
//
// So this is the loud version. It resolves and REPORTS, and every caller that
// moves a layout across a boundary shows the report before writing anything.
//
// A COPY, NOT A REFERENCE. Nothing here creates a link between two journals.
// The result is a new layout that the target journal owns outright, which
// sidesteps the whole question of what a shared layout does when one of its
// journals changes shape — the version, as the follow-up put it, that will
// generate the bug reports.

import {
  SectionContext,
  SectionOverrides,
  sectionsFor,
} from "./journal-sections";
import { JOURNAL_SECTIONS } from "./journal-sections";
import type { JournalType } from "./journal";
import type { TemplateLayout } from "./journal-sections";

// One thing the layout named that the target cannot carry.
export interface LayoutDrop {
  // The section id it belongs to. For a dropped section, the section itself.
  sectionId: string;
  // What was lost, in the reader's words rather than the code's.
  detail: string;
}

export interface ResolvedLayout {
  layout: TemplateLayout;
  dropped: LayoutDrop[];
}

// The ids a target surface can actually compose, as a set.
const composableIds = (ctx: SectionContext): Set<string> =>
  new Set(sectionsFor(ctx).map((s) => s.id));

// Whether an overrides entry survives the journey, and what is lost if not.
//
// PER FIELD RATHER THAN PER ENTRY, because the fields differ in portability and
// an all-or-nothing rule would throw away a perfectly good `label` to avoid
// carrying a `children` map. A partially-carried entry is reported for what it
// lost, not for what it kept.
function portableOverrides(
  sectionId: string,
  from: SectionOverrides,
  target: JournalType
): { kept: SectionOverrides; dropped: LayoutDrop[] } {
  const kept: SectionOverrides = {};
  const dropped: LayoutDrop[] = [];

  // A title is a string the reader typed. It means the same thing anywhere.
  if (from.label !== undefined) kept.label = from.label;

  // `fields` IS ONE SHAPE WITH TWO MEANINGS, and the section says which.
  // On `resources` a key is a shelf the reader named, resolved by nothing
  // outside the layout, so it travels intact. On a section declaring
  // `fieldKeys: "kinds"` a key is a KIND ID — per journal by construction — so
  // each is checked against the target and the ones it does not have are
  // dropped and named.
  //
  // ASKED OF THE CATALOGUE rather than by testing for `children` here: this
  // module's job is to be told what things mean, and an id check would stop
  // covering the second section keyed this way the day there is one.
  if (from.fields) {
    const section = JOURNAL_SECTIONS.find((x) => x.id === sectionId);
    if (section?.fieldKeys === "kinds") {
      const have = new Set(target.kinds.map((k) => k.id));
      const survivors = from.fields.filter((f) => have.has(f.key));
      const lost = from.fields.filter((f) => !have.has(f.key));
      if (lost.length) {
        dropped.push({
          sectionId,
          detail:
            `headings for ${lost.map((f) => f.key).join(", ")} — ` +
            `${target.name} has no such note type`,
        });
      }
      if (survivors.length) kept.fields = survivors.map((f) => ({ ...f }));
    } else {
      kept.fields = from.fields.map((f) => ({ ...f }));
    }
  }

  // Prose skeletons are text. They may be wrong FOR the new journal, which is a
  // matter of taste the reader can fix, rather than unresolvable.
  if (from.headings) {
    kept.headings = from.headings.map((h) => ({
      title: h.title,
      ...(h.body ? { body: [...h.body] } : {}),
    }));
  }

  // A tracker id is vault-global, so it resolves or it does not — and this
  // module holds a JournalType and no plugin, so it cannot ask the registry.
  // Carried, and reported as needing a look rather than as lost: a wrong
  // tracker draws an empty bridge, which is visible and fixable, where dropping
  // it silently turns a bridge the reader configured into the generic default.
  if (from.tracker !== undefined) kept.tracker = from.tracker;

  // NO GENERIC WALK OVER THE REMAINING KEYS. An earlier draft looked at every
  // object-valued field and treated its keys as kind ids, which was wrong twice
  // over: it would have mangled any nested shape that is not a kind map, and it
  // missed the one that IS a kind map, because `children` keys its by `fields`
  // — the same field `resources` uses for something else entirely. The
  // catalogue is asked instead.

  return { kept, dropped };
}

// Resolve `layout` against a target surface, keeping what composes and
// reporting what does not.
export function resolveLayoutFor(
  layout: TemplateLayout,
  target: JournalType,
  ctx: SectionContext
): ResolvedLayout {
  const composable = composableIds(ctx);
  const dropped: LayoutDrop[] = [];

  const sections = (layout.sections ?? []).filter((id: string) => {
    if (composable.has(id)) return true;
    dropped.push({
      sectionId: id,
      detail: `${target.name} has no “${id}” section on this surface`,
    });
    return false;
  });

  const options: Record<string, SectionOverrides> = {};
  const entries = Object.entries(layout.options ?? {}) as [
    string,
    SectionOverrides,
  ][];
  for (const [id, over] of entries) {
    // Settings for a section that did not survive are not a second loss — the
    // section was already reported, and saying it twice reads as two problems.
    if (!composable.has(id)) continue;
    const { kept, dropped: lost } = portableOverrides(id, over, target);
    dropped.push(...lost);
    if (Object.keys(kept).length) options[id] = kept;
  }

  return {
    layout: {
      ...(layout.sections ? { sections } : {}),
      ...(Object.keys(options).length ? { options } : {}),
    },
    dropped,
  };
}
