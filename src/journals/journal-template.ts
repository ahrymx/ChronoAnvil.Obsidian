// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Reading a journal note as a template, and writing a template back over one.
// 4.33 — the journal half of what 4.29 built for diary entries.
//
// WHAT WAS ALREADY HERE, AND WHY THIS FILE IS SMALL
//
// The journals have carried the storage since 3.18: `JournalConfig.layout`,
// keyed by `templateKeyFor(ctx)`, is a per-template arrangement, and
// `TemplateLayout.sections` already means "exactly these, in this order" —
// which is the authoritative shape 4.29 had to invent `entrySectionBand` to get
// on the diary side. So there is no new setting here. A default is
// `cfg.layout[key]`, and the manager writes it.
//
// What was missing is a reader who can write it, which is the window, and the
// two questions the window has to ask first: what would a rewrite destroy, and
// what does this page actually say.
//
// ── THE FRONTMATTER IS NEVER RECOMPOSED ─────────────────────────────
//
// `core/note-sections.ts::replaceBody` does the write, and its comment carries
// the list. On this surface it is `type:` — which is what classifies the note at
// all — the level keys that say where it belongs, `created:`, `status:`, the
// kind's rating property holding a real reading, and, on a page, `parent:` and
// `order:`. A page's `parent:` is the ONLY thing tying it to the note it is a
// page of, and nothing in the body could rebuild it.

import {
  fenceBlocks,
  fenceLines,
  reloadLoss,
  trackerBlockLines,
} from "../core/reload-loss";
import type { ReloadLoss } from "../core/reload-loss";
import { looseLines } from "../core/reload-loss";
import {
  JOURNAL_SECTIONS,
  headingTitlesIn,
  sectionOverrides,
  sectionsFor,
  skeletonTitles,
} from "./journal-sections";
import type { SectionContext, SectionOverrides } from "./journal-sections";
import { composedFromPresent, sectionsPresent } from "./journal-plan";


// What a recompose of this note as `composed` would destroy. Empty means the
// reload is safe to offer.
//
// THREE CHECKS COME FROM `core/reload-loss.ts` — regions with writing, a
// tracker added from this note's own cog, and prose outside every section —
// and this adds the one only a journal can make.
//
// ── WHY PROSE HAS TO BE THE SHARED LINE-DIFF AND NOT A RUNS WALK ────
//
// A journal leaf template ships a PROSE SKELETON, and a reader writing under
// `## Notes` is the ordinary way these notes are used. It would be natural to
// ask `parseSections` which runs belong to nobody — and it would be wrong.
// `markdownOwnerOf` deliberately over-matches, and says so:
//
//   "Over-matching is harmless here in a way it would not be anywhere else in
//   this module: a markdown-only section is never removable, so attributing a
//   reader's own `## Notes` to it changes nothing that happens to the file."
//
// Harmless for the PLANNER, which splices. Fatal for a gate on a REWRITE:
// `segment()` flushes only at a fence boundary, so the whole skeleton plus
// everything typed into it is one segment, and `headings`' bare `/^##\s+\S/m`
// probe claims all of it. The shared `looseLines` diff sees it, because the
// composed `## Notes` appears on both sides and cancels while the paragraph
// under it does not.
export function journalReloadLoss(
  text: string,
  composed: string,
  ctx: SectionContext
): ReloadLoss[] {
  const labels = new Map(JOURNAL_SECTIONS.map((s) => [s.id, s.label]));
  return reloadLoss(text, composed, {
    label: (key) => labels.get(key) ?? key,
    extra: (t) => fenceContentLoss(t, ctx),
  });
}

// Lines inside this note's fences that the catalogue did not put there.
//
// ONE CHECK, FOUR THINGS IT CATCHES, and they are one thing rather than four: a
// journal note's fences hold content the reader authored, which an entry's
// never did. A `jchart:` spec added with the chart editor's Add button; an
// `attach:` shelf they named; a `pages-table` about to be dropped, which orphans
// their pages from the note that lists them; and a directive they typed
// themselves, which is the diary's own check 3.
//
// MEASURED AGAINST THE NOTE'S OWN SECTIONS, NOT AGAINST `composed`. That is the
// whole of getting this right. Comparing with the replacement would report
// every section a layout DROPS as content destroyed and refuse every reload
// that changed anything — 4.29's rule that "a catalogue directive the
// replacement drops is not a loss, it is the reload doing what it was asked".
// Comparing with what the catalogue would write FOR THE SECTIONS THIS NOTE HAS
// asks the narrower and correct question: of the lines in front of me, which
// are mine rather than the plugin's.
//
// The tracker block is excluded because `reloadLoss` check 2 already owns it,
// and reporting a hand-added tracker twice would make the window's list read as
// two problems where there is one.
function fenceContentLoss(text: string, ctx: SectionContext): ReloadLoss[] {
  const catalogue = new Set(fenceLines(composedFromPresent(text, ctx)));
  const trackers = new Set(trackerBlockLines(text));
  const out: ReloadLoss[] = [];
  for (const line of fenceLines(text)) {
    if (catalogue.has(line) || trackers.has(line)) continue;
    // A chart is content with a name a reader would recognise; anything else in
    // a fence is a directive, and the honest thing to call it is a line.
    out.push(
      line.startsWith("jchart:")
        ? { kind: "fence", label: line, detail: "a chart you added here" }
        : {
            kind: "foreign",
            label: line,
            detail: "not a line this catalogue writes",
          }
    );
  }
  return out;
}

// This page's sections, in the order the page has them, with the overrides it
// can state read back OFF THE PAGE.
//
// THE OVERRIDES ARE THE POINT, AND THEY WERE THE BUG (4.33). The existing
// "Save as layout…" resolves them with `sectionOverrides(ctx, id)` — from the
// journal's stored config, not from the note in front of the reader — so the
// two things a reader edits directly in markdown were dropped without a word:
//
//   • a heading they renamed. Rename `## Notes` to `## Working`, save the
//     page as the default, and `## Notes` comes back on the next Lesson.
//   • a header bar they retitled, which lives as the `header:` argument on the
//     section's own directive.
//
// That is exactly the case 4.29 named when it hoisted `answerInText`: "saving a
// default that dropped the reader's target back to unconfigured would be a
// silent loss at the exact moment they asked to keep something."
//
// THE PAGE FIRST, THE TYPE BEHIND IT. Where the page says nothing — a section
// whose header was never retitled — the type's own override still applies, so
// Study's Learning Path label and its three resource shelves survive a save
// that never mentioned them.
export function wantFromJournalNote(
  text: string,
  ctx: SectionContext
): {
  sections: string[];
  options: Record<string, SectionOverrides>;
  drops: string[];
} {
  const sections = sectionsPresent(text, ctx);
  const options: Record<string, SectionOverrides> = {};

  const byId = new Map(sectionsFor(ctx).map((s) => [s.id, s]));
  const pageHeadings = headingsOf(text);

  for (const id of sections) {
    const declared = sectionOverrides(ctx, id);
    const next: SectionOverrides = { ...(declared ?? {}) };

    // The header bar's title, where this section draws one and the reader has
    // changed it.
    const label = headerTitleIn(text, byId.get(id)?.claims ?? []);
    if (label != null) next.label = label;

    // The prose skeleton, by TITLE ONLY.
    //
    // NEVER THE BODY UNDER A HEADING, and that is a decision rather than an
    // omission. A heading's name is structure — it is what the reader arranged
    // — and the prose beneath it is what they wrote in THIS note. Carrying the
    // body would leak a sentence about last Tuesday's lesson into every Lesson
    // made afterwards, from a gesture whose whole promise is "this is what the
    // shape should be". The body a heading already declares is kept, matched by
    // title, so a type that ships prompt text keeps it.
    if (id === "headings" && pageHeadings.length) {
      const declaredBody = new Map(
        (declared?.headings ?? []).map((h) => [h.title, h.body])
      );
      next.headings = pageHeadings.map((title) => {
        const body = declaredBody.get(title);
        return body ? { title, body: [...body] } : { title };
      });
    }

    if (Object.keys(next).length) options[id] = next;
  }

  // `drops` ARE REPORTED, NEVER DROPPED IN SILENCE — `layout-transfer.ts`'s
  // settled rule, in its own words: "drop silently, drop loudly, or refuse —
  // and silence is the wrong one". A hand-written directive cannot become a
  // catalogue id, so a save that carried this page into a stored layout has to
  // say which lines it will not carry.
  const drops = fenceContentLoss(text, ctx).map((l) => l.label);

  return { sections, options, drops };
}

// The `## ` titles this note's skeleton carries, in page order.
//
// OFF `looseLines`, so a heading inside a fence or inside a region is not one —
// the same walk the prose check uses, which is what keeps "what the page says"
// and "what a rewrite would destroy" reading the same page.
//
// ── SCOPED TO THE BRACKET WHERE THERE IS ONE (5.6) ──────────────────────
//
// This is the other half of what the markers bought, and it is the authoring
// half rather than the removal one. "Save as layout…" turns the headings on
// this page into the headings every note of this kind opens with — so a reader
// who added `## Scratch` at the bottom of one Lesson, below everything the
// template wrote, used to have Scratch baked into every Lesson they would ever
// make. Nothing was wrong with the read; there was simply nothing on the page
// that said where the skeleton stopped.
//
// Now there is, and the answer is the span rather than the file. A heading
// inside the bracket is the shape of the document; one outside it is something
// that happened in this note.
//
// THE WHOLE NOTE IS STILL THE ANSWER FOR A NOTE WITH NO BRACKET, which is every
// note written before 5.6 — the same fallback the removal path takes, for the
// same reason: an unmarked skeleton is a page the plugin can read and cannot
// delimit, and reading it as it always did is better than reading nothing.
function headingsOf(text: string): string[] {
  return skeletonTitles(text) ?? headingTitlesIn(looseLines(text));
}

// A retitled header bar, or null when this section has none or never had one
// changed.
//
// `header:` IS THE ONE ARGUMENT A READER EDITS IN PLACE. The section editor
// writes it and the banner's rename control writes it, and `note-sections.ts`
// says why nothing matches on it: "a reader retitles a header — that is what
// the `header:` argument is for — and matching on it would make a renamed
// section invisible". Reading it is the other half of that sentence.
// A retitled header bar, or null when this section has none or never had one
// changed.
//
// `header:` IS THE ONE ARGUMENT A READER EDITS IN PLACE. The section editor
// writes it and the banner's rename control writes it, and `note-sections.ts`
// says why nothing MATCHES on it: "a reader retitles a header — that is what the
// `header:` argument is for — and matching on it would make a renamed section
// invisible". Reading it is the other half of that sentence.
//
// SCOPED TO THE SECTION'S OWN FENCE, WHICH IS THE WHOLE DIFFICULTY. `header:` is
// not unique in a note — a Lesson draws one for Pages and could draw another for
// Resources — so a note-wide read hands the same title to every section that
// claims one, and a save would stamp "📄 Pages" onto the Resources bar. The
// fence is the unit that disambiguates, because `renderSection` emits exactly
// one per section: find the block carrying one of this section's OTHER claimed
// keywords, and read the `header:` in that block alone.
//
// A SECTION WHOSE ONLY CLAIM IS `header` CANNOT BE FOUND THIS WAY, and returns
// null rather than a guess — the same answer `soleArgSpanIn` gives to the same
// question, for the reason its own comment states: "an answer that cannot be
// told apart from another section's is not an answer".
function headerTitleIn(text: string, claims: readonly string[]): string | null {
  if (!claims.includes("header")) return null;
  const anchors = claims.filter((c) => c !== "header");
  if (!anchors.length) return null;

  for (const block of fenceBlocks(text)) {
    const keywords = new Set(
      block.map((l) => l.slice(0, l.indexOf(":")).trim()).filter(Boolean)
    );
    if (!anchors.some((a) => keywords.has(a))) continue;
    const line = block.find((l) => l.startsWith("header:"));
    if (!line) return null;
    // `header:🏷️ Tags|tag-index` — the title is the first field and the anchor
    // the second; `header:📄 Pages` has no anchor at all. Both give the title
    // as everything before the first `|`.
    const title = line.slice("header:".length).split("|")[0]?.trim();
    return title ? title : null;
  }
  return null;
}
