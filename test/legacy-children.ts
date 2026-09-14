// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The *What's below* card as every release up to 1.0.15 composed it: a head, a
// create button and a table PER NOTE KIND.
//
// WHY A HELPER AND NOT A FIXTURE FILE. 1.0.16 consolidates that section into one
// table, so the composers no longer write this shape and nine test files that
// were reading it out of a shipped template had nothing to read. Every one of
// them is still asking a real question — the rename offer, the reveal's ranges,
// the journal importer and the migration itself all meet notes in this shape,
// and will for as long as vaults exist — so the shape moves here rather than
// out.
//
// DERIVED FROM THE TYPE, exactly as the catalogue derived it, so a fixture
// cannot claim a spelling the plugin never wrote: the head is the kind's emoji
// and plural, the button is `new-<kind id>`, the table is `kind-table:<kind id>`.
// It is the one piece of 1.0.15's composition kept anywhere in the tree, and it
// is kept because the READER's notes are the fixture.

import { kindPlural } from "../src/journals/journal-sections";
import type { JournalType } from "../src/journals/journal";

// One group per kind, at level 2 under the section's bar — 5.12's shape, and
// the one in every vault.
export function perKindStack(type: JournalType): string[] {
  return type.kinds.flatMap((k) => [
    `header:2:${k.emoji} ${kindPlural(k)}`,
    `button:${type.id}:new-${k.id}`,
    `kind-table:${k.id}`,
  ]);
}

// And 5.11's, which is the same lines with the levels left to the demotion rule
// and no bar over them at all. A note this old is what `consolidateChildren`
// has to name as well as merge.
export function bareHeadStack(type: JournalType): string[] {
  return type.kinds.flatMap((k) => [
    `header:${k.emoji} ${kindPlural(k)}`,
    `button:${type.id}:new-${k.id}`,
    `kind-table:${k.id}`,
  ]);
}

// A composed note, with its consolidated table put back into the per-kind shape.
//
// A REPLACEMENT RATHER THAN A SECOND COMPOSER, so the note around it is exactly
// what this release writes — the frontmatter, the weld, the stack dividers, the
// sections either side — and the only thing that differs is the two lines this
// release composes where 1.0.15 composed six.
export function asPerKindTables(text: string, type: JournalType): string {
  const from = `button:${type.id}:new\nkind-table`;
  if (!text.includes(from)) {
    throw new Error(
      `no consolidated table in this note to age: expected ${JSON.stringify(from)}`
    );
  }
  return text.replace(from, perKindStack(type).join("\n"));
}
