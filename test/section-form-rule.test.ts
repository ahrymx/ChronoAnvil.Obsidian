// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// THE RULE, HELD TO EVERY CATALOGUE AT ONCE (1.0.22).
//
// The reader's sentence, and it is the whole of this file:
//
//   *everything is a section, and sections without a special actions row have
//   the widget toggle.*
//
// ── WHY IT NEEDED A SWEEP OF ITS OWN ─────────────────────────────────────
//
// The rule was already in the tree, DERIVED, for exactly one catalogue.
// `journal-sections.ts` computes it — `widgetFormBar` finds the bar a section
// would take back, `BAR_ANCHORED` names the three keywords whose controls hang
// off that bar, and `questionsOf` splices the toggle in — and the comment there
// is the reader's sentence in the plugin's own words: *"a section WITHOUT an
// action row is convertible."*
//
// The other six catalogues declare it PER ENTRY, which is a spelling the rule
// cannot survive: every new section is a fresh chance to forget, and six of
// them had. Tags offered the toggle on the diary dashboard and not on the
// homepage, the period dashboards or either journal page; On this day offered
// it on Search and not on the homepage; Search and Timeline declared
// `asks: false` outright; the journal tally composed no name at all while the
// dispatcher drew one over it. None of those were decisions — they were the
// order the sections happened to be written in.
//
// So the rule is asserted HERE, across every catalogue, in one list. A seventh
// catalogue, or a thirty-third widget, joins this sweep by existing.
//
// ── WHAT IS EXEMPT, AND WHY EACH ONE IS ──────────────────────────────────
//
// Two ids, and both are exempt for a reason the reader's sentence already
// contains rather than for one invented here:
//
//   `banner`  is not a section of the page, it is the page's HEAD. Its fence
//             carries `title`, `links` and `actions` — the note's name and the
//             controls that act on the note — and there is no bar under it to
//             turn into a widget's.
//   `charts`  IS the special actions row. The managed region appends "+ Add
//             chart" and "Edit…" into `frame.actions`, which is why `jchart`
//             is one of `BAR_ANCHORED`'s three; take the bar off and the two
//             controls have nowhere to go. Its fence says so in its own info
//             string, which is what the test below reads.
//
// Everything else on every page offers the toggle.

import { describe, expect, it } from "vitest";
import { WELDS_INTO_BANNER, soleFence, soloBarOf } from "../src/core/sections";
import type { Section, SectionQuestion } from "../src/core/sections";
import { isHeaderLine, splitDirective } from "../src/core/directive-grammar";
import type { FlatSection } from "../src/core/note-sections";
import { homeSections } from "../src/diary/home-sections";
import { SEARCH_SECTIONS } from "../src/diary/search-sections";
import { EVENTS_SECTIONS } from "../src/events/events-sections";
import { DIARY_DASHBOARD_SECTIONS } from "../src/diary/diary-dashboard-sections";
import { JOURNALS_DASHBOARD_SECTIONS } from "../src/journals/journals-dashboard-sections";
import { journalDashboardSections } from "../src/journals/journal-dashboard-sections";
import {
  logbookSections,
  logbooksFolderSections,
} from "../src/diary/logbook-sections";
import {
  sectionsForDashboard,
  type DashboardGrain,
  type DiaryDashboardContext,
} from "../src/diary/diary-sections";
import {
  BAR_ANCHORED,
  questionsOf,
  sectionContext,
  sectionsFor,
} from "../src/journals/journal-sections";
import type { JournalSection } from "../src/journals/journal-sections";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { DEFAULT_LOGBOOKS, DEFAULT_PATHS } from "../src/core/constants";

// The two ids the sweep lets through, argued in the header.
const EXEMPT = new Set(["banner", "charts"]);

// The other way a catalogue says "this is a section": the head is drawn by the
// dispatcher from `WidgetSpec.bar` rather than composed into the file. Six
// entries across three dashboards are written this way and there is no exported
// constant for the line, which is why it is spelled here.
const FRAME_SECTION = "frame: section";

const GRAINS: DashboardGrain[] = ["weekly", "monthly", "quarterly", "yearly"];

const has = (qs: readonly SectionQuestion[], kind: string): boolean =>
  qs.some((q) => q.kind === kind);

// Every FLAT catalogue in the plugin, each as the pair the sweep needs: a name
// for the failure message, and the list. Built fresh per call so a catalogue
// that takes an argument is exercised with a real one.
const flatCatalogues = (): Array<[string, FlatSection[]]> => [
  ["the homepage", homeSections(DEFAULT_PATHS.diaryRoot)],
  ["the Search page", SEARCH_SECTIONS],
  ["the Events page", EVENTS_SECTIONS],
  ["the diary dashboard", DIARY_DASHBOARD_SECTIONS],
  ["the journals dashboard", JOURNALS_DASHBOARD_SECTIONS],
  ["a journal's dashboard", journalDashboardSections(STUDY_JOURNAL)],
  ["one logbook's page", logbookSections(DEFAULT_LOGBOOKS[0])],
  ["the logbooks folder note", logbooksFolderSections(DEFAULT_LOGBOOKS)],
];

describe("everything is a section, and one without an action row has the toggle", () => {
  it("offers the toggle on every section of every flat catalogue", () => {
    // THE FAILURE MESSAGE IS THE POINT of collecting rather than asserting in
    // the loop: a catalogue that has drifted names every section it dropped,
    // rather than stopping at the first.
    //
    // AND A FLOOR UNDER THE SWEEP, because the shape of this test is one an
    // empty list passes. Thirty-odd sections across eight pages is what the
    // catalogues hold today; the number is a tripwire for a refactor that
    // silently stops building one of them, not a count anyone should maintain.
    const missing: string[] = [];
    let swept = 0;
    for (const [page, list] of flatCatalogues()) {
      for (const s of list) {
        if (EXEMPT.has(s.id)) continue;
        swept += 1;
        const qs = s.questions?.(undefined, {}) ?? [];
        if (!has(qs, "form")) missing.push(`${page}: ${s.id}`);
      }
    }
    expect(missing).toEqual([]);
    expect(swept).toBeGreaterThan(30);
  });

  it("offers it on every section of every period dashboard", () => {
    // Four grains, because `applies` cuts the list per grain and a section
    // offered only on a year would otherwise never be looked at.
    const missing: string[] = [];
    for (const grain of GRAINS) {
      const ctx: DiaryDashboardContext = { grain };
      for (const s of sectionsForDashboard(ctx)) {
        if (EXEMPT.has(s.id)) continue;
        if (!has(s.questions?.(ctx, {}) ?? [], "form")) {
          missing.push(`${grain}: ${s.id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("derives it on the journal catalogue, from the same set", () => {
    // 5.11's machinery, asked the same question. The toggle is NOT declared on
    // these entries — `questionsOf` splices it — which is why the sweep has to
    // go through that accessor rather than through `.questions`. Reading the
    // raw field here would report nineteen sections with no toggle and be
    // wrong about every one of them.
    //
    // AND THE EXEMPTIONS ARE DERIVED TOO, so this case states the rule's other
    // half: nothing here is exempt by id. A journal section goes without the
    // toggle exactly when one of FOUR things is true of what it renders, and
    // the predicate below is those four spelled out from the RENDER rather than
    // read back off `widgetFormBar`, so the two can be compared:
    //
    //   welded    it is written into the banner's fence, so the head over it is
    //             the banner's and there is no card of its own to draw bare.
    //   barless   it composes no bar and declares no solo bar — nothing for the
    //             toggle to name in either direction.
    //   two bars  `children` composes a header per note kind, and the widget
    //             branch filters EVERY `header:` line, so unticking would take
    //             the second kind's title with the first's.
    //   two blocks  the section emits a body beside its fence — `path` its
    //             crumb line, `recall` and `checklist` their regions. A widget
    //             is a fence; a section that is also prose has no widget form
    //             to offer, which is the block model's rule rather than this
    //             one's.
    //   anchored  the reader's "special actions row" — a control hung off the
    //             bar with nowhere to go once the bar does.
    const surfaces = [
      ...STUDY_JOURNAL.levels.map((_l, i) =>
        sectionContext(STUDY_JOURNAL, { depth: i })
      ),
      ...STUDY_JOURNAL.kinds.map((k) =>
        sectionContext(STUDY_JOURNAL, { kind: k })
      ),
    ];
    const wrong: string[] = [];
    for (const ctx of surfaces) {
      for (const s of sectionsFor(ctx) as JournalSection[]) {
        const blocks = s.render(ctx);
        const fence = soleFence(blocks);
        const composed =
          fence.lines.length > 0 && isHeaderLine(fence.lines[0])
            ? fence.lines[0]
            : undefined;
        const bar = composed ?? soloBarOf(s, ctx);
        const twoBars = fence.lines
          .slice(composed ? 1 : 0)
          .some((l) => isHeaderLine(l.trim()));
        const anchored = fence.lines.some((l) =>
          BAR_ANCHORED.has(splitDirective(l.trim()).keyword)
        );
        const expected =
          blocks.length === 1 &&
          !WELDS_INTO_BANNER.has(s.id) &&
          Boolean(bar) &&
          !twoBars &&
          !anchored;
        const offered = has(questionsOf(s, ctx), "form");
        if (offered !== expected) {
          wrong.push(`${s.id}: offered=${offered} expected=${expected}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("names a bar in every toggle it offers", () => {
    // The other direction of "everything is a section": the toggle is only
    // worth having if ticking it produces a NAMED section. `formQuestion`
    // carries the bar the section takes back, and a blank or barless one would
    // splice an empty `header:` line — a section with a rule over it and no
    // name, which is the shape 4.15 §1 called a frameless render.
    const bars: string[] = [];
    const collect = (
      s: Section<never, never>,
      qs: readonly SectionQuestion[]
    ): void => {
      for (const q of qs) {
        if (q.kind !== "form") continue;
        expect(typeof q.bar, s.id).toBe("string");
        bars.push(q.bar);
      }
    };
    for (const [, list] of flatCatalogues()) {
      for (const s of list) {
        collect(s as never, s.questions?.(undefined, {}) ?? []);
      }
    }
    for (const grain of GRAINS) {
      const ctx: DiaryDashboardContext = { grain };
      for (const s of sectionsForDashboard(ctx)) {
        collect(s as never, s.questions?.(ctx, {}) ?? []);
      }
    }
    //
    // TWO SPELLINGS OF "THIS IS A SECTION", and both count. A catalogue that
    // composes `header:` names the section in the file; one that composes
    // `frame: section` hands the naming to the dispatcher, which draws the head
    // from `WidgetSpec.bar` — the same string, written once instead of twice.
    // What the rule forbids is a toggle naming NEITHER.
    expect(bars.length).toBeGreaterThan(40);
    for (const bar of bars) {
      expect(isHeaderLine(bar) || bar === FRAME_SECTION, bar).toBe(true);
    }
  });

  it("exempts the banner and the charts region, and nothing else", () => {
    // The exemptions are checked rather than trusted: a section that quietly
    // renamed itself `charts` would otherwise skip the sweep above.
    //
    // THE BANNER is the page head — its fence carries `title` and no widget.
    // THE CHARTS REGION says what it is in its fence INFO rather than in its
    // lines, which is why the sweep above cannot reach it through
    // `BAR_ANCHORED`: the `jchart:` directives live in the note, written by the
    // reader, not in the composed block.
    for (const [page, list] of flatCatalogues()) {
      for (const s of list) {
        if (!EXEMPT.has(s.id)) continue;
        const fence = soleFence(s.render(undefined, undefined));
        if (s.id === "banner") {
          expect(fence.lines, page).toContain("title");
          expect(fence.fence, page).toBe("chronoanvil");
        } else {
          expect(fence.fence.endsWith("-charts"), page).toBe(true);
        }
      }
    }
    // And `jchart` is still in the set the charts region is exempt BY, so the
    // two halves of the argument cannot drift apart.
    expect(BAR_ANCHORED.has("jchart")).toBe(true);
  });
});
