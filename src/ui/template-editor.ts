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
import type ChronoAnvilPlugin from "../main";
import { openSectionEditor } from "./section-editor";
import type { SectionModel } from "../core/section-model";
import type {
  SectionContext,
  SectionOverrides,
} from "../journals/journal-sections";
import {
  layoutTargetsFor,
  sectionOverrides,
  targetIdFor,
} from "../journals/journal-sections";
import { isHandEdited, journalSectionModel } from "../journals/journal-plan";
import { getFile } from "../core/util";

// `variantEligible` WAS HERE AND IS GONE (4.33). It read:
//
//   export function variantEligible(ctx: SectionContext): boolean {
//     return !!ctx.kind && ctx.noteKind !== "page";
//   }
//
// and 3.18 §6's argument for it was:
//
//   Only a kind's template can become a variant. An index template has nothing
//   to vary FOR — there is one Subject Index per subject, not a choice made
//   when creating one — so offering it there would be a button that could not
//   mean anything.
//
// THE PREMISE WAS RIGHT AND THE CONCLUSION WAS TOO NARROW. "Nothing to vary
// for" is true of CREATION — an index really is not picked from a dropdown, and
// `LAYOUT_SURFACE_INDEX`'s comment keeps that fact and acts on it — but a saved
// layout is also something you reload onto a page and something you press into
// a surface's default, and both of those mean plenty on an index.
//
// So all three note kinds are eligible now, which makes the predicate a
// tautology, and a function that always returns true is a decision that reads
// like one and is not. It is deleted rather than widened: the callers pass the
// sink unconditionally, and `layoutTargetsFor` is where "which surfaces exist
// here" is now answered — including the one real refusal left, which is that a
// journal with no paged kind is not offered `Page`.

// Open the editor on a journal file, resolving its model first.
//
// Returns false when the path is not a file, so the caller can say so in its
// own words — the command has a longer explanation to give than a settings row
// does.
export async function openTemplateEditor(
  app: App,
  plugin: ChronoAnvilPlugin,
  path: string,
  ctx: SectionContext,
  onSaved?: () => void,
  onSaveVariant?: (
    label: string,
    sections: string[],
    options: Record<string, SectionOverrides>,
    // Which kinds the layout is offered on. 3.18 follow-ups §5.
    kinds: string[]
  ) => Promise<void>,
  // Store whether this kind's notes can be split across pages. 5.20.
  //
  // OPTIONAL, AND ONLY THE SETTINGS RAIL PASSES IT. `kind.pages` is a property
  // of the KIND, so a Pages row on a reader's own lesson note would be one
  // note quietly changing what every other note of its kind is — which is
  // exactly the confusion the deleted Structure checkbox created from the other
  // direction. The rail opens a kind's TEMPLATE, which is the one file that
  // means the kind rather than an instance of it, so that is where the row is
  // offered and the second door goes without.
  //
  // RETURNS FALSE WHEN THE READER DECLINED, because unsetting it is a change
  // `confirmKindChange` asks about and the answer has to be able to be no.
  onSetPaged?: (paged: boolean) => Promise<boolean>
): Promise<boolean> {
  const file = getFile(app, path);
  if (!file) return false;
  const text = await app.vault.read(file);

  // The model that composes this note when `ids` are its sections.
  //
  // THE UNION, NOT THE TICK LIST (5.20). `hasPages` is true where the config
  // says so OR the reader has ticked the row, and the "or" is load-bearing in
  // both directions:
  //
  //   • TICKED ON AN UNPAGED KIND — the config still says no, and this is what
  //     lets the window compose, preview and plan the table before anything is
  //     written. The tick is the answer; the config catches up on Save.
  //   • UNTICKED ON A PAGED ONE — `applySections` REMOVES a section by knowing
  //     it exists and finding it absent from `want`. A model narrowed to the
  //     tick list would not have `pages` in its catalogue at all, so it would
  //     walk past the reader's pages table and report nothing to change: the
  //     untick would clear `kind.pages` and leave the table sitting in the
  //     file. Widening only is what makes the removal expressible.
  //
  // `documentLike` follows exactly as `sectionContext` derives it, so nothing
  // downstream can tell this ctx from a stored one.
  //
  // BUILT HERE, NOT IN THE MODAL, for the reason everything else in this file
  // is: it is a `SectionContext` away from a journal catalogue, and the window
  // holds neither.
  const modelWith = (ids: readonly string[]): SectionModel => {
    const paged = ids.includes("pages") || ctx.hasPages;
    return journalSectionModel({
      ...ctx,
      hasPages: paged,
      documentLike: paged || ctx.noteKind === "page",
    });
  };
  // A KIND'S DEFAULT TEMPLATE ONLY. A saved layout is one arrangement of a kind
  // among several, so a Pages row on `kind:lesson:compact` would be a
  // per-variant control over a per-kind fact — ticking it on one layout would
  // change every other, including the default nobody had open. The page
  // template is excluded too: `sectionContext` says a page has no variant, and
  // it is also not the note the question is about.
  const structuralHere =
    !!onSetPaged &&
    ctx.noteKind === "leaf" &&
    (ctx.variantId ?? "default") === "default";

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
    ...(structuralHere
      ? {
          structural: {
            // OFFERED ONLY WHILE THE KIND IS UNPAGED. Once it is, the catalogue
            // offers the section itself — `applies: (ctx) => ctx.hasPages` is
            // satisfied — and a second copy of the row in the Add list would be
            // this file disagreeing with the catalogue about what exists.
            //
            // TAKEN FROM `modelWith` RATHER THAN SPELLED, so the row carries the
            // catalogue's own icon, label, blurb and locks. A `SectionView` is
            // built by machinery this file does not own and must not reproduce.
            offer: ctx.hasPages
              ? []
              : modelWith(["pages"])
                  .sections()
                  .filter((sv) => sv.id === "pages"),
            modelWith,
            save: async (ids: readonly string[]): Promise<boolean> => {
              const paged = ids.includes("pages");
              // NOTHING TO ASK WHEN NOTHING MOVED. A reader reordering a paged
              // kind's template must not be shown a confirmation about pages.
              if (paged === ctx.hasPages) return true;
              return onSetPaged!(paged);
            },
          },
        }
      : {}),
    ...(onSaveVariant
      ? {
          arrangement: {
            buttonLabel: "Save as layout…",
            promptTitle: "Save as layout",
            promptPlaceholder: "e.g. Math Lesson",
            // WHERE THIS LAYOUT MAY BE OFFERED (3.18 follow-ups §5; the two
            // surfaces added in 4.33). Resolved here for the same reason the
            // overrides are: they are a journal concept and the modal holds no
            // context to look one up with. It draws the labels and hands back
            // the ids.
            //
            // EVERY KIND OF THIS JOURNAL, not just the current one — the whole
            // point of the storage move is that a layout is no longer the
            // property of the kind it was saved from — plus Front page, plus
            // Page where the journal has any. Cross-JOURNAL is not offered,
            // deliberately: a layout names section ids and an `options` entry
            // keyed by kind id cannot survive a journey to a journal whose kind
            // ids differ by construction.
            targets: layoutTargetsFor(ctx.type),
            // WAS `ctx.kind?.id ?? ""`, WHICH WAS EMPTY ON THE TWO SURFACES
            // THAT COULD NOT REACH HERE. Now that they can, an empty origin
            // would leave the box the reader is standing in unticked and
            // un-disabled — so `promptLayoutSave`'s "the one you saved it from
            // is always included" rule would quietly not apply on exactly the
            // two new cases. Derived by `targetIdFor`, which is `templateKeyFor`
            // asked about the same three-value question, so the origin and the
            // key cannot drift.
            originTarget: targetIdFor(ctx),
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
