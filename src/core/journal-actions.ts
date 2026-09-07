// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Every journal's own commands, derived from its config.
//
// WHY THIS EXISTS (3.21)
//
// Study's four were written out by hand in `ACTIONS` and every other journal's
// were derived in a loop in `main.ts` that began `if (type.id === "study")
// continue`. Two code paths for one idea, and they had drifted in three
// separate ways — each of which was invisible until you owned a journal that
// was not Study:
//
//   ONLY STUDY REACHED THE RIBBON. `openMenu` builds itself from `ACTIONS`, so
//   *Study: new journal* and *Study: new topic* sat under the Journals heading
//   and a reader's own journal had nothing there at all. The commands existed;
//   the surface that most readers actually use did not know about them.
//
//   ONLY STUDY WAS GATED. Its four carried `when: studyOn`. A derived command
//   was registered with a plain callback, so a journal deleted in Settings left
//   its commands in the palette, pointed at a type that no longer resolved.
//
//   THE TWO USED DIFFERENT ID SCHEMES — `study-new-lesson` against
//   `new-study-lesson` — which is the kind of thing that stays harmless right
//   up until something tries to reason about command ids as a set.
//
// So this returns `Action`s, the same shape the static table holds, and both
// surfaces consume one list. There is no per-journal branch left anywhere: what
// Study gets, every journal gets, because it is the same code producing it.
//
// DERIVED FRESH RATHER THAN STORED. The ribbon calls this on every open, so a
// journal added, renamed or deleted in Settings is right the next time the menu
// is opened rather than after a reload — which is what a menu built from live
// config should do and what the hand-written table could never have done.

import type ChronoAnvilPlugin from "../main";
import { GROUP_ID_PREFIX } from "./actions";
import type { Action } from "./actions";
import { registeredJournalTypes } from "../journals/journal";
import type { JournalType } from "../journals/journal";

// A journal's id is a slug the reader chose, so a command id built from it is
// stable exactly as long as that id is — which is the same guarantee the
// template filenames and the layout keys already run on.
// `<group token>-<verb>-<object>`, the scheme `GROUP_ID_PREFIX` states and the
// action table has followed since §10.3. Applied here rather than chosen,
// which is the whole point of generating these: the id of the command for a
// journal nobody has created yet is already decided.
const idFor = (type: JournalType, leaf: string): string =>
  `${GROUP_ID_PREFIX.journals}-new-${type.id}-${leaf}`;

// Whether this journal is still registered, asked by id.
//
// CHEAP, WHICH IS THE RULE `Action.when` STATES: settings and a path, no vault
// reads and no metadata walks, because this runs on every palette keystroke for
// every action. A registered-types scan is a map over `customJournals`, which
// is the same order of work as the `studyOn` check it replaces.
const stillThere =
  (typeId: string) =>
  (p: ChronoAnvilPlugin): boolean =>
    (p.settings.customJournals ?? []).some((j) => j.id === typeId);

export function journalActions(plugin: ChronoAnvilPlugin): Action[] {
  const out: Action[] = [];

  for (const type of registeredJournalTypes(plugin)) {
    const when = stillThere(type.id);
    const top = type.levels[0];

    // ON THE RIBBON, like Study's two were. The ribbon is a convenience and the
    // palette is the interface, so what goes here is what a reader reaches for
    // repeatedly: making a top-level container, and making one a level down.
    // Note kinds stay palette-only — a journal with six kinds would otherwise
    // put six items under one heading and bury the diary below them.
    out.push({
      id: idFor(type, "top"),
      name: `${type.name}: new ${top.noun.toLowerCase()}`,
      icon: "book-plus",
      group: "journals",
      ribbon: true,
      when,
      run: (p) => p.journals.newTopLevel(type),
    });

    if (type.levels.length > 1) {
      const sub = type.levels[1];
      out.push({
        id: idFor(type, "container"),
        name: `${type.name}: new ${sub.noun.toLowerCase()}`,
        icon: "folder-plus",
        group: "journals",
        ribbon: true,
        when,
        run: (p) => p.journals.newContainer(type, 1),
      });
    }

    for (const kind of type.kinds) {
      out.push({
        id: idFor(type, kind.id),
        name: `${type.name}: new ${kind.label.toLowerCase()}`,
        icon: "file-plus",
        group: "journals",
        when,
        run: (p) => p.journals.newNote(type, kind.id),
      });
    }

    // NO PER-JOURNAL "refresh on homepage" (removed 2.13.8, and not
    // reintroduced here): each was a verbatim call to `rebuildJournalHome`,
    // which rewrites every journal's sub-section in one pass. N commands named
    // after N journals, all doing the same whole-section rebuild, only implied a
    // per-journal scope that never existed.
  }

  return out;
}
