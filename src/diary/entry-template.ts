// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Reading an entry as a template, and writing a template back over an entry.
//
// WHY THIS FILE EXISTS (4.29)
//
// A grain's template is composed — `composeEntryTemplate` plus
// `settings.entrySections` — and written to a file the entry openers read
// (`diary.ts`). Until now the only thing that could write that setting was one
// two-row table in Settings. Everything else a reader can do to an entry's
// shape — reorder its shared band, point a bridge at a journal kind — lived in
// the one note and had nowhere to go.
//
// So: save the page in front of you as the grain's default, or as a named
// layout, and reload one onto an entry that holds nothing yet.
//
// ── THE RELOAD IS THE DESTRUCTIVE ONE, AND THAT IS THE POINT ────────
//
// "Apply a template to this page" could mean two things:
//
//   PLAN AND SPLICE — `applyEntrySections`, which adds, removes and moves
//   sections and re-emits every other byte as it was read. It exists, it is on
//   the same cog as "Edit sections…", and it needs no emptiness test because
//   it destroys nothing.
//
//   RECOMPOSE — write the template over the page.
//
// If reload meant the first, this would be a second door onto a built feature
// under a new name. It means the second, and `entryReloadLoss` is what makes a
// wholesale rewrite allowed to sit beside a safe splice: the control is not
// drawn at all unless the page holds nothing the rewrite would destroy.
//
// ── THE FRONTMATTER IS NEVER RECOMPOSED ─────────────────────────────
//
// Not a courtesy. `journal-date` is what scopes an entry to its period for
// every period-filtered table; `month:` keys a monthly note; the events stamp
// is written once at creation and `diary.ts::stampEvents` says in its own
// comment that entries are never re-synced against the events list, so a
// recomposed frontmatter would destroy it permanently. The alias `title:` is
// the reader's words and the tracker properties hold their readings. So a
// reload replaces the BODY and copies the frontmatter through untouched, which
// also narrows "is this page empty" to a question about the body alone.

import {
  ENTRY_SECTIONS,
  offerableEntrySections,
  parseEntry,
  sharedBody,
  isForeignBandLine,
} from "./entry-sections";
import type {
  EntryBandGroup,
  EntrySection,
  EntrySectionContext,
} from "./entry-sections";
import {
  FLAG_OFF,
  SECTION_FORM,
  answerInText,
} from "../core/section-model";
import type { SectionChoice } from "../core/section-model";
import { answersOn, replaceBody } from "../core/note-sections";
import { reloadLoss } from "../core/reload-loss";
import type { ReloadLoss } from "../core/reload-loss";
import type { TrackerClass } from "../trackers/trackers";

// A named arrangement of an entry's shared band, offered on the grains the
// reader picked.
//
// MIRRORS `JournalVariantConfig` AND IS NOT IT. A journal variant is stored on
// a journal config and scaffolds a template FILE, because a journal kind can be
// created from any of several arrangements. A grain has exactly one template
// file, so a diary layout is only ever a recipe you seed a page from — half
// that shape has nothing to do here, and sharing the storage would put a diary
// layout on a journal, which is the cross-catalogue carry `layout-transfer.ts`
// exists to refuse.
export interface EntryLayoutConfig {
  id: string;
  label: string;
  // Shared-band section ids, in the order they should be composed.
  sections: string[];
  // Each section's own answers, keyed by section id. Absent for a layout whose
  // sections asked nothing — storing an entry per section would put a wall of
  // empty objects in data.json, which is the reasoning `saveVariant` already
  // gives for the same field.
  options?: Record<string, Record<string, unknown>>;
  // The groups its shared band is arranged into, where the reader made any
  // (1.0.46). Absent for a flat template, on `options`' rule one field up: a
  // partition whose every block holds one field composes exactly what no
  // partition composes, so storing it would be a wall of one-member arrays.
  // See `EntryBandGroup` for why an order and a set of answers cannot say this.
  groups?: EntryBandGroup[];
  // Which grains it may be reloaded onto. A layout saved from a weekly entry
  // naming `challenges` is meaningful on monthly too; one naming a section a
  // grain cannot compose is reported when it is applied, not filtered here,
  // because the reader may add that section to that grain later.
  grains: TrackerClass[];
}

// One thing a recompose over this page would destroy.
//
// THE SHARED SHAPE UNDER THE DIARY'S NAME (4.33). `ReloadLoss` carries the
// argument this comment used to — a list rather than a boolean, because the
// window has to say what is in the way and because a boolean derived from four
// unrelated facts cannot say WHICH of them broke. The alias stays because
// `EntryLoss` is the right word on this surface and two callers import it.
export type EntryLoss = ReloadLoss;

// What a recompose of this page as `composed` would destroy. Empty means the
// reload is safe to offer.
//
// TAKES THE COMPOSED TEXT rather than recomposing it here, so a loss is exactly
// "something in the page that the replacement does not carry" and the answer
// cannot drift from the write. It is also what makes the round trip statable:
// the losses of composing a page over itself are none, and if that is ever
// false a freshly created entry can never be reloaded.
//
// THREE OF ITS FOUR CHECKS LIVE IN `core/reload-loss.ts` SINCE 4.33, unchanged
// and in the same order, because none of them ever looked at a diary. What is
// left here is check 3, which is the only one that has to know whose catalogue
// is asking — and the labels, which are this catalogue's words.
export function entryReloadLoss(
  text: string,
  composed: string,
  ctx: EntrySectionContext
): EntryLoss[] {
  const labels = new Map(ENTRY_SECTIONS.map((s) => [s.id, s.label]));
  return reloadLoss(text, composed, {
    label: (key) => labels.get(key) ?? key,
    // 3. DIRECTIVES IN THE WIDGET FENCE THAT ARE NOT THE CATALOGUE'S. The same
    // set `planEntrySections` reports as `foreign` and leaves alone — it can
    // leave them alone because it splices, and this cannot because it replaces.
    //
    // ONLY THE UNRECOGNISED ONES. A catalogue directive the replacement drops
    // is not a loss, it is the reload doing what it was asked: a layout that
    // takes out an empty section is the whole gesture, and reporting that as
    // damage would refuse every reload that changed anything.
    extra: (t) => {
      const out: EntryLoss[] = [];
      for (const b of sharedBody(parseEntry(t, ctx))) {
        if (!isForeignBandLine(b)) continue;
        out.push({
          kind: "foreign",
          label: b.line.trim(),
          detail: "not a line this catalogue writes",
        });
      }
      return out;
    },
  });
}

// This page's shared band, in the order the page has it, with each section's
// answers read back off its own directive.
//
// `drops` ARE REPORTED, NEVER DROPPED IN SILENCE. A hand-written directive
// cannot become a catalogue id, so a save that carried the page into a stored
// layout has to say which lines it will not carry. That is `layout-transfer.ts`'s
// settled rule, in its own words: "drop silently, drop loudly, or refuse — and
// silence is the wrong one".
export function wantFromEntry(
  text: string,
  ctx: EntrySectionContext
): { want: SectionChoice[]; drops: string[] } {
  const band = sharedBody(parseEntry(text, ctx));
  const byId = new Map(offerableEntrySections(ctx).map((s) => [s.id, s]));
  const want: SectionChoice[] = [];
  const drops: string[] = [];
  const seen = new Set<string>();

  for (const b of band) {
    if (b.id === null) {
      // A modifier is the catalogue's own furniture rather than a line the
      // reader wrote, so it is neither carried into the layout nor reported as
      // dropped — `isForeignBandLine` is the one place that distinction lives.
      if (isForeignBandLine(b)) drops.push(b.line.trim());
      continue;
    }
    // A second copy of one section is one region shared by two widgets, which
    // `addableEntrySections` already refuses to create. Reading one back as two
    // wants would then compose a template with the same defect in it.
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    const section = byId.get(b.id);
    want.push(section ? choiceFor(text, section, ctx) : { id: b.id });
  }
  return { want, drops };
}

// One section's stored choice, with whatever the page already answers.
//
// ── TWO READS, BECAUSE THERE ARE TWO PLACES AN ANSWER LIVES (1.0.46) ─────
//
// There was one, and it could not see half the answers a diary field has.
// `answerInText` searches the whole file for an argument span and **returns
// null by name** for `form`, `lines` and `flag` — it says so itself: "its
// callers fall back to the model's own `answered`, which is where `formAt` puts
// the answer — see `answersOn`". Every other caller has that fallback. This one
// did not, so a field drawn as a widget was read back as a plain id, stored as
// a plain id, and composed back as a SECTION.
//
// That is the read half of the defect `answeredLine` fixes on the write side,
// and it is why *Save this entry as the default* came back with Tasks in the
// wrong form: the answer was lost before it ever reached the store.
//
// `answersOn` IS THE READ THE MODEL ALREADY USES — `entrySectionModel.sections`
// asks it the same question with the same two arguments — so the box the editor
// draws ticked and the choice this stores cannot disagree.
//
// A DEFAULT IS NOT STORED. `answersOn` answers every question it is asked, so
// an untouched field would come back `{ form: "section" }` and the store would
// fill with the catalogue's own answers written out. That is the rule
// `kind-table-overrides-1.0.33` settled for headings — a value equal to its
// default is absent — and it is what keeps a vault that changed nothing
// composing byte-for-byte what it composed before this read existed.
function choiceFor(
  text: string,
  section: EntrySection,
  ctx: EntrySectionContext
): SectionChoice {
  const questions = section.questions?.(ctx) ?? [];
  const options: Record<string, unknown> = {};
  for (const q of questions) {
    const answer = answerInText(text, q);
    // EMPTY IS NOT AN ANSWER. An unset bridge writes `bridge-notes:` with
    // nothing after the colon, and storing `""` would make "the reader chose
    // nothing" indistinguishable from "the reader chose the empty string" — and
    // `directiveFor` already treats a blank target as unconfigured.
    if (answer != null && answer.trim() !== "") options[q.key] = answer.trim();
  }
  // AND THE ANSWERS WRITTEN ON THE SECTION'S OWN LINE, off the line `locate`
  // found rather than off the fence — a band is one fence holding seven fields,
  // so a fence-wide read would hand all seven one answer.
  const onLine = answersOn(section.locate(text, ctx), questions, text);
  for (const [key, value] of Object.entries(onLine)) {
    if (key in options) continue;
    if (value === SECTION_FORM || value === FLAG_OFF) continue;
    if (value.trim() === "") continue;
    options[key] = value;
  }
  return Object.keys(options).length ? { id: section.id, options } : { id: section.id };
}

// A saved band with one section switched on or off.
//
// HERE RATHER THAN IN THE SETTINGS RENDERER, and that is the rule this file
// exists to keep: the suite has no DOM, so a decision made inside a `write`
// closure is a decision nothing can test — and this one is the single way the
// two stores could come to disagree. A grain that has a band ignores
// `entrySections` for membership, so a tick in Settings → Diary entries that
// did not reach the band would change a setting and nothing else.
//
// `undefined` IN, `undefined` OUT. Most vaults have no band, and the catalogue's
// own order is still the answer for them — a caller that reads undefined must
// write nothing rather than create one out of a checkbox.
//
// APPENDED AT THE END when it is switched on, which is `addSectionToNote`'s call
// and its reasoning: a reader who arranged their band arranged it, and inserting
// into the middle of that to satisfy a canonical order would undo a
// customisation in the name of adding one.
export function bandWithSection(
  band: readonly string[] | undefined,
  id: string,
  present: boolean
): string[] | undefined {
  if (!band) return undefined;
  const without = band.filter((x) => x !== id);
  return present ? [...without, id] : without;
}

// A saved partition with one section switched on or off. 1.0.46.
//
// `bandWithSection`'s TWIN, HERE FOR ITS REASON. The settings table decides
// membership and the band carries the order; the groups carry the arrangement,
// and all three have to move together or `regroupBand` refuses the partition —
// "EVERY FIELD, EXACTLY ONCE" — and the reader's grouping silently degrades to a
// flat band on the next compose. Ticking a box in Settings → Diary entries must
// not cost somebody the row they arranged.
//
// `undefined` IN, `undefined` OUT, and a partition that empties out comes back
// `undefined` rather than as an empty array: a grain with no groups is a grain
// with no key, which is what keeps an untouched vault composing what it always
// composed.
//
// APPENDED AS A BLOCK OF ITS OWN when it is switched on, which is
// `bandWithSection`'s call one function up and the same reasoning: a new field
// joins the band at the end, and putting it inside somebody's existing row would
// be arranging their entry for them.
//
// AND A GROUP THAT LOSES ITS LAST MEMBER GOES, rather than staying as an empty
// block with a title — a name for a row that no longer holds anything.
export function groupsWithSection(
  groups: readonly EntryBandGroup[] | undefined,
  id: string,
  present: boolean
): EntryBandGroup[] | undefined {
  if (!groups) return undefined;
  const without = groups
    .map((g) => ({ ...g, ids: g.ids.filter((x) => x !== id) }))
    .map((g) => ({ ...g, ...(g.pages ? { pages: g.pages.filter((x) => x !== id) } : {}) }))
    .filter((g) => g.ids.length > 0);
  const next = present ? [...without, { ids: [id] }] : without;
  return next.length ? next : undefined;
}

// The page with `composed`'s body and its own frontmatter.
//
// THE BODY OF THIS MOVED TO `core/note-sections.ts::replaceBody` IN 4.33, when
// the journals needed the same write. The name stays here because it is the
// diary's word for the gesture and two callers already use it; what is gone is
// the second copy of the rule.
export function reloadEntryBody(text: string, composed: string): string | null {
  return replaceBody(text, composed);
}

