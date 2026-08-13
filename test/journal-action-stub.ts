// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { journalActions } from "../src/core/journal-actions";

// A plugin stub holding the named journals, for the generated actions.
//
// Only `customJournals` is read — `registeredJournalTypes` maps over it and
// `when` asks whether an id is still in it — which is `Action.when`'s own
// cheapness rule holding in the test as well as in the plugin.
export const pluginWith = (ids: string[]): Parameters<typeof journalActions>[0] =>
  ({
    settings: {
      customJournals: ids.map((id) => ({
        id,
        name: id === "study" ? "Study" : "Cooking",
        emoji: "📔",
        root: `J/${id}`,
        templatesFolder: `T/${id}`,
        levels: [{ id: "subject", noun: "Subject", fallbackEmoji: "📂" }],
        kinds: [{ id: "entry", emoji: "📝", label: "Entry" }],
      })),
    },
  }) as unknown as Parameters<typeof journalActions>[0];

