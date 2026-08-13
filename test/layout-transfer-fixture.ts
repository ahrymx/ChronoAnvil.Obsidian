// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A minimal journal type for the layout-transfer tests.
//
// Built through `buildJournalType` rather than hand-assembled, so a fixture
// cannot claim a shape the constructor would never produce.

import { buildJournalType } from "../src/journals/journal";
import type { JournalKindConfig } from "../src/journals/custom-journal";

export { buildJournalType };

export function freshCustomJournalType(over: {
  id: string;
  name: string;
  kinds: JournalKindConfig[];
}): ReturnType<typeof buildJournalType> {
  return buildJournalType({
    id: over.id,
    name: over.name,
    emoji: "📔",
    root: `03 - Journals/${over.name}`,
    templatesFolder: `T/${over.name}`,
    levels: [{ id: "section", noun: "Section", fallbackEmoji: "📂" }],
    kinds: over.kinds,
  });
}
