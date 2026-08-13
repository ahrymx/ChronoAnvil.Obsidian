// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Opening the section editor on a JOURNAL file.
//
// WHAT HAPPENED TO THIS FILE
//
// It was the editor — four hundred lines of modal that read a file's sections,
// planned a change, previewed it and wrote it. §7 of the 3.0 plan lists it as
// "retired, or reduced to a caller", and §6 records the choice between
// replacing the journal editor and sitting beside it:
//
//   "Replacing is cleaner and risks a regression in a surface that works
//   today. Beside is safer and means two editors for one job, which is what §2
//   exists to prevent. I lean replace, and the reason to say so out loud is
//   that it is reversible only before the old one is deleted."
//
// Replaced. The modal is `section-editor.ts` and works over a `SectionModel`,
// so the diary halves get the same window rather than a second one that looks
// almost like it. What is left here is the part that was always journal-shaped
// and could never have moved into an agnostic modal:
//
//   • building a journal model from a `SectionContext`;
//   • asking `isHandEdited`, which only a surface with a composer can answer;
//   • resolving a kind's per-section overrides when an arrangement is saved as
//     a variant.
//
// THE ENTRY POINT AND ITS SIGNATURE ARE UNCHANGED, deliberately. Two callers
// use it — the settings rail and the section inserter — and a rewrite that also
// rearranged their call sites would have mixed "does the new editor behave like
// the old one" with "did I update the callers correctly", which are two
// questions and only one of them is patch 3's. The regression risk §6 names is
// judged against the surface that already works, and that is only possible if
// the surface is reached the same way.

import { App } from "obsidian";
import type AlmanacPlugin from "../main";
import { openSectionEditor } from "./section-editor";
import type {
  SectionContext,
  SectionOverrides,
} from "../journals/journal-sections";
import { sectionOverrides } from "../journals/journal-sections";
import { isHandEdited, journalSectionModel } from "../journals/journal-plan";
import { getFile } from "../core/util";

// Whether an arrangement of THIS file can be stored as one of a kind's saved
// layouts. 3.18 §6.
//
// ONE RULE, TWO CALLERS. The settings rail and the banner both offer "Save as
// layout…", and the test used to be spelled inline in the settings rail alone:
//
//   Only a kind's template can become a variant. An index template has nothing
//   to vary FOR — there is one Subject Index per subject, not a choice made
//   when creating one — so offering it there would be a button that could not
//   mean anything.
//
// That reasoning is unchanged; giving it a name is what stops the two doors
// disagreeing about which files it applies to.
export function variantEligible(ctx: SectionContext): boolean {
  return !!ctx.kind && ctx.noteKind !== "page";
}

// Open the editor on a journal file, resolving its model first.
//
// Returns false when the path is not a file, so the caller can say so in its
// own words — the command has a longer explanation to give than a settings row
// does.
export async function openTemplateEditor(
  app: App,
  plugin: AlmanacPlugin,
  path: string,
  ctx: SectionContext,
  onSaved?: () => void,
  onSaveVariant?: (
    label: string,
    sections: string[],
    options: Record<string, SectionOverrides>,
    // Which kinds the layout is offered on. 3.18 follow-ups §5.
    kinds: string[]
  ) => Promise<void>
): Promise<boolean> {
  const file = getFile(app, path);
  if (!file) return false;
  const text = await app.vault.read(file);

  return openSectionEditor(app, plugin, path, {
    model: journalSectionModel(ctx),
    // Read here rather than in the modal because it is the one fact in that
    // window only a journal can produce: "given these sections, is the file
    // still the file the plugin wrote". A dashboard and an entry have composers
    // too, but comparing a reader's months-old entry against a freshly composed
    // one would report every entry ever written in as hand-edited — true,
    // useless, and alarming. The sentence is worth showing only where it is
    // none of those.
    handEdited: isHandEdited(text, ctx),
    ...(onSaved ? { onSaved } : {}),
    ...(onSaveVariant
      ? {
          arrangement: {
            buttonLabel: "Save as layout…",
            promptTitle: "Save as layout",
            promptPlaceholder: "e.g. Math Lesson",
            // WHICH KINDS THIS LAYOUT MAY BE OFFERED ON (3.18 follow-ups §5).
            // Resolved here for the same reason the overrides are: they are a
            // journal concept and the modal holds no context to look one up
            // with. It draws the labels and hands back the ids.
            //
            // EVERY KIND OF THIS JOURNAL, not just the current one — the whole
            // point of the storage move is that a layout is no longer the
            // property of the kind it was saved from. Cross-JOURNAL is not
            // offered, deliberately: a layout names section ids and an
            // `options` entry keyed by kind id cannot survive a journey to a
            // journal whose kind ids differ by construction.
            targets: ctx.type.kinds.map((k) => ({ id: k.id, label: k.label })),
            originTarget: ctx.kind?.id ?? "",
            // THE OVERRIDES ARE RESOLVED HERE, not in the modal.
            //
            // They are a journal concept — a kind's per-template label and
            // field overrides — and the modal holds no context to look one up
            // with. It hands back the ids it has on screen and this turns them
            // into the type's own options, which is the split the whole release
            // runs on: surface-shaped work lives with the surface.
            //
            // Only the overrides that EXIST. Storing an entry per section would
            // put a wall of empty objects in data.json and make a variant that
            // differs by one label look like it differs by everything.
            save: async (
              label: string,
              sections: string[],
              kinds: string[]
            ): Promise<void> => {
              const options: Record<string, SectionOverrides> = {};
              for (const id of sections) {
                const o = sectionOverrides(ctx, id);
                if (o) options[id] = o;
              }
              await onSaveVariant(label, sections, options, kinds);
            },
          },
        }
      : {}),
  });
}
