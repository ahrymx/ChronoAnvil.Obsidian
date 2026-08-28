// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The widget registry, against the switch it describes — 4.12 §B.
//
// WHAT MAKES THIS TABLE DIFFERENT FROM A COMMENT. A record mapping keywords to
// labels is worth exactly as much as its agreement with the code, and nothing
// in TypeScript enforces that agreement: a new `case` compiles, ships and
// renders perfectly well with no entry here, and the only symptom is a widget
// nobody can add. So the agreement is asserted, in the one direction that
// catches it — the UNION of the two tables must equal the switch. A new `case`
// then fails this suite until somebody says which table it belongs in, which is
// the smallest possible amount of thinking to force at exactly the right moment.
//
// THE SCRAPER IS `pure-logic.test.ts`'s, one file over, and it is scoped
// tighter. That one reads `readSrc("widgets")` — the whole directory,
// concatenated — which is right for a subset check and wrong here:
// `button-widgets.ts` and `tracker-controls.ts` carry thirty more `case` labels
// between them, over action ids and tracker types, and folding those into
// `dispatched` would demand entries for words that are not widgets at all. So
// this reads the one file and slices the one function.

import { describe, expect, it } from "vitest";
import {
  NOT_PAGE_WIDGETS,
  WIDGETS,
  isPageWidget,
} from "../src/core/widget-registry";
import { RETIRED_WIDGETS } from "../src/core/constants";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { repoFile, readSrc, ROOT } from "./sources";

const index = repoFile("src/ui/widgets/index.ts");

// `buildFromSpec`'s switch, and nothing else in the file.
//
// BOUNDED AT BOTH ENDS rather than read to the end of the file: `default:
// return null;` is the switch's last line and the arms above it are the whole
// vocabulary. Reading past it would pick up nothing today and would silently
// widen the moment somebody wrote a second switch below.
const dispatchBody = (): string => {
  const from = index.indexOf("private buildFromSpec(");
  expect(from, "buildFromSpec moved or was renamed").toBeGreaterThan(0);
  const to = index.indexOf("default:\n        return null;", from);
  expect(to, "the switch's default arm moved or was reworded").toBeGreaterThan(from);
  return index.slice(from, to);
};

const dispatched = new Set(
  [...dispatchBody().matchAll(/case "([a-z0-9-]+)":/g)].map((m) => m[1])
);

const widgetKeys = Object.keys(WIDGETS);
const excludedKeys = Object.keys(NOT_PAGE_WIDGETS);

describe("the widget registry describes the switch", () => {
  it("finds the switch at all", () => {
    // GUARDS EVERY COMPARISON BELOW. Without a floor, a regex that stopped
    // matching would leave `dispatched` empty and every "is a subset of"
    // assertion would pass while asserting nothing — which is the exact failure
    // `pure-logic.test.ts`'s own floor exists to prevent, and the one this
    // session's house rules call a test that has never failed.
    expect(dispatched.size).toBeGreaterThanOrEqual(40);
  });

  it("names only keywords the switch dispatches", () => {
    expect(widgetKeys.filter((k) => !dispatched.has(k))).toEqual([]);
    expect(excludedKeys.filter((k) => !dispatched.has(k))).toEqual([]);
  });

  it("puts each keyword in exactly one of the two tables", () => {
    const both = widgetKeys.filter((k) => k in NOT_PAGE_WIDGETS);
    expect(both).toEqual([]);
  });

  it("classifies every keyword the switch dispatches", () => {
    // THE ASSERTION THE TABLE EXISTS FOR. Written as a sorted difference rather
    // than a count, so the failure names the word that was added and not the
    // arithmetic that went wrong.
    const classified = new Set([...widgetKeys, ...excludedKeys]);
    const unclassified = [...dispatched].filter((k) => !classified.has(k)).sort();
    expect(unclassified).toEqual([]);
    expect(classified.size).toBe(dispatched.size);
  });

  it("leaves the retired widgets out of both, because they do not dispatch", () => {
    for (const keyword of Object.keys(RETIRED_WIDGETS)) {
      expect(dispatched.has(keyword), keyword).toBe(false);
      expect(keyword in WIDGETS, keyword).toBe(false);
      expect(keyword in NOT_PAGE_WIDGETS, keyword).toBe(false);
    }
  });
});

describe("every entry is drawable", () => {
  it("gives each widget a label, a glyph and a blurb", () => {
    for (const [keyword, spec] of Object.entries(WIDGETS)) {
      expect(spec.label, keyword).toBeTruthy();
      expect(spec.glyph, keyword).toBeTruthy();
      expect(spec.blurb, keyword).toBeTruthy();
      // A blurb is a sentence about the page, not a restatement of the keyword.
      expect(spec.blurb.length, keyword).toBeGreaterThan(20);
    }
  });

  it("gives each exclusion a reason and a sentence", () => {
    for (const [keyword, why] of Object.entries(NOT_PAGE_WIDGETS)) {
      expect(why.reason, keyword).toBeTruthy();
      expect(why.note, keyword).toBeTruthy();
    }
  });

  it("gives every choice argument at least two answers", () => {
    // A CHOICE OF ONE IS NOT A CHOICE — `modals.ts::only` makes the same
    // judgement about a picker with one option, and here it would also be a
    // required question with exactly one legal answer, which is a step the
    // reader is walked through for nothing.
    for (const [keyword, spec] of Object.entries(WIDGETS)) {
      if (spec.arg?.kind !== "choice") continue;
      expect(spec.arg.values.length, keyword).toBeGreaterThan(1);
      for (const v of spec.arg.values) {
        expect(v.value, keyword).toBeTruthy();
        expect(v.label, keyword).toBeTruthy();
      }
    }
  });

  it("answers isPageWidget from the table and not from a second list", () => {
    expect(isPageWidget("events")).toBe(true);
    expect(isPageWidget("slider")).toBe(false);
    expect(isPageWidget("not-a-widget")).toBe(false);
  });
});

describe("the exclusions say why, and the reasons are the ones claimed", () => {
  const of = (reason: string): string[] =>
    Object.entries(NOT_PAGE_WIDGETS)
      .filter(([, why]) => why.reason === reason)
      .map(([k]) => k)
      .sort();

  it("excludes exactly the inline kinds, from the same list the renderer uses", () => {
    // READ OFF THE RENDERER rather than retyped, so the two cannot drift.
    // `INLINE_KINDS` decides whether a widget renders inline or full-width, and
    // "is bound to one frontmatter property" is the same fact from the other
    // side — which is why this is an equality and not an overlap.
    const widgets = readSrc("widgets");
    const inline = (
      /const INLINE_KINDS = new Set\(\[([^\]]*)\]/.exec(widgets)?.[1] ?? ""
    )
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean)
      .sort();
    expect(inline.length).toBeGreaterThanOrEqual(5);
    expect(of("inline")).toEqual(inline);
  });

  it("excludes exactly the self-labelled kinds as region owners", () => {
    const widgets = readSrc("widgets");
    const regions = (
      /const SELF_LABELLED_KINDS = new Set\(\[([^\]]*)\]/.exec(widgets)?.[1] ?? ""
    )
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean)
      .sort();
    expect(regions.length).toBeGreaterThanOrEqual(5);
    expect(of("region")).toEqual(regions);
  });

  it("excludes the two banners and the two structural directives", () => {
    expect(of("banner")).toEqual(["entry-header", "journal-header"]);
    expect(of("structural")).toEqual(["spacer", "title"]);
  });

  it("excludes an alias, and its target is offered", () => {
    // A SECOND SPELLING IS NOT A SECOND WIDGET. `confidence-trend` falls
    // through to `journal-chart`'s arm, so offering both would be a menu with
    // one entry twice under different names.
    // TWO OF THEM AS OF 4.16 §3, and the second is the reason this reason
    // exists rather than a second retirement. `topics-table` was replaced by
    // `level-index` and still sits in every shipped Subject index note, so it
    // must go on rendering — and `RETIRED_WIDGETS` is the wrong shelf for that,
    // because `planLayout` REMOVES what it names from a reader's note on repair.
    // Retired means gone and cleaned up; an alias means superseded and honoured.
    // FOUR AS OF 4.46, and the two new ones route DIFFERENTLY from the two
    // above — which is worth stating rather than hiding behind a longer list.
    //
    // `confidence-trend` and `topics-table` fall THROUGH to their target's arm,
    // because each is a bare second spelling of one directive. `topic-stats` and
    // `journal-totals` cannot: they merged into `stats-band`, whose behaviour is
    // chosen by a preset argument, and neither old word carried one. So each has
    // an arm of its own that supplies the preset it always drew — which is the
    // only place that knows which of the two spellings was written.
    expect(of("alias")).toEqual([
      "confidence-trend",
      "journal-totals",
      "topic-stats",
      "topics-table",
    ]);
    expect(dispatchBody()).toContain('case "confidence-trend":\n      case "journal-chart":');
    expect(dispatchBody()).toContain('case "topics-table":\n      case "level-index":');
    // THE TWO BAND SPELLINGS SHARE AN ARM AS OF 4.46.1, which is the fallthrough
    // shape after all — but not for the reason the other two have it. They still
    // resolve to DIFFERENT presets; what changed is that the preset is looked up
    // in `STATS_BAND_ALIASES` rather than written here as a literal. 4.46.0 had
    // it in two literals, which made this the second of three places that knew
    // what an old word means, and the third — the section editor's question —
    // had no way to know at all.
    expect(dispatchBody()).toContain('case "topic-stats":\n      case "journal-totals":');
    expect(dispatchBody()).toContain("STATS_BAND_ALIASES[kind]");
    // And neither is retired, which is the half that would delete work.
    for (const alias of of("alias")) {
      expect(Object.keys(RETIRED_WIDGETS), alias).not.toContain(alias);
    }
  });

  it("defers the six that need a list only the vault has", () => {
    expect(of("needs-vault-answer")).toEqual([
      "bridge-notes",
      "bridge-readings",
      "journal-breakdown",
      "journal-chart",
      "journal-tally",
      "kind-table",
    ]);
    // A SIXTH IN 4.35, AND ITS SIBLING IS DELIBERATELY NOT HERE.
    // `journal-tally` must name a tracker, so it defers like the two above it.
    // `journal-totals` takes NO argument — it reads the registry for whatever
    // this journal totals — so it is offerable from the section window and
    // sits in WIDGETS instead. Two widgets shipped together, on opposite sides
    // of this exact line, which is the clearest statement of what it means.
    // AND THE DEFERRAL IS WHAT THE SPEC CANNOT CARRY, not a taste. If
    // `FlatNoteSpec` ever grows a field naming this vault's trackers or
    // journals, this test is the one that should fail.
    //
    // IT DID, IN 4.15 §4, AND THAT WAS THE POINT OF WRITING IT. The spec now
    // carries `vault`, the registry has a `vault` argument kind, and
    // `journal-card` is offered with a list of this vault's journals in its
    // dropdown. What is asserted now is the boundary in its new place: the lists
    // that exist are the lists that are WIRED, so a source cannot be named in
    // the registry and left unresolved, and the five above stay deferred until
    // theirs is built too.
    //
    // IT DID AGAIN, IN 4.52 AND 4.70, and both times the deferral moved rather
    // than the six. `logbooks` came in with 4.52; `trackers` came in with
    // `tracker-stat`, on the argument the 4.15 note asked for by name — a
    // `TrackerDef.id` IS the frontmatter property it writes, so it is stable
    // under a relabel, and changing it makes a new tracker rather than renaming
    // this one. That is the same stability `journals` was admitted on.
    //
    // SO THE SIX ABOVE ARE NOT DEFERRED FOR WANT OF A TRACKER LIST ANY MORE,
    // and their notes no longer say they are. Four of them want the trackers
    // the HOST NOTE'S journal accepts, and a `vault` argument is resolved once
    // for the whole window, before there is a host. The other two want a note
    // type. This assertion is deliberately over the sources that are WIRED and
    // not over the count of what is deferred, so lifting a deferral is a change
    // to one line here and a change to the note that claimed it.
    const sources = new Set(
      Object.values(WIDGETS).flatMap((w) =>
        w.arg?.kind === "vault" ? [w.arg.source] : []
      )
    );
    expect([...sources].sort()).toEqual(["journals", "trackers"]);
    const wiring = repoFile("src/core/widget-sections.ts");
    for (const s of sources) expect(wiring).toContain(`  ${s}: {`);
  });

  it("says which list it lacks, in its own terms, for each of the six", () => {
    // THE SIX ARE DEFERRED FOR A REASON THAT SURVIVED §4 AND 4.70, and it is
    // worth separating from the sentence above. `journals` was buildable
    // because a journal's id is stable and `registeredJournalTypes` answers it
    // in one call; `trackers` became buildable in 4.70 on the same stability
    // argument. Neither made these six buildable, because what they name is a
    // list the HOST NOTE decides — the trackers this journal's notes accept, or
    // a note type under this journal — and the section window resolves a
    // `vault` argument before any host is chosen.
    //
    // What is asserted is that each note still SAYS which list, in its own
    // terms. This test was `/tracker|note type/` alone until 4.70, and it went
    // on passing while all four tracker notes claimed the window had no list of
    // this vault's trackers — a true regex over a sentence that had become
    // false. So that exact claim is now asserted ABSENT, and only that one: the
    // two note-kind entries still say there is no list of this vault's
    // journals, and they still say it because there still is not one.
    for (const k of of("needs-vault-answer")) {
      const note = NOT_PAGE_WIDGETS[k].note;
      expect(note, k).toMatch(/tracker|note type/);
      expect(note, k).not.toMatch(/no list of this vault's trackers/);
    }
  });
});

describe("SECTION_TITLES and the registry answer different questions", () => {
  // THEY ARE NOT MERGED, and this is the assertion that says how far they may
  // agree. `SECTION_TITLES` maps a keyword to the HEADING a `frame: section`
  // block wears — "⏳ Open tasks", glyph included — and the registry maps it to
  // a NOUN for a list of things you could add. Two questions, two tables. What
  // must be true is that the smaller one names no word the larger one has never
  // heard of, because such a word is a heading for a widget that does not exist.
  const widgets = readSrc("widgets");
  const titles = (
    /const SECTION_TITLES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(widgets)?.[1] ?? ""
  );
  const keys = [...titles.matchAll(/^\s*"?([a-z0-9-]+)"?:/gm)].map((m) => m[1]);

  it("finds the title table", () => {
    expect(keys.length).toBeGreaterThanOrEqual(15);
  });

  it("names no keyword the switch does not dispatch", () => {
    // THIS FAILED WHEN IT WAS WRITTEN, and found two dead entries: `calendar`,
    // retired in 3.11, and `month-nav`, which was never a keyword at all — the
    // directive is `period-nav`. A heading for a widget nothing draws is a
    // `frame: section` fence that refuses instead of folding.
    expect(keys.filter((k) => !dispatched.has(k))).toEqual([]);
  });

  it("names no keyword the registry has not classified", () => {
    const classified = new Set([...widgetKeys, ...excludedKeys]);
    expect(keys.filter((k) => !classified.has(k))).toEqual([]);
  });

  // THE DIRECTION THAT WAS MISSING, AND THE ONE THAT HAD FAILED (4.15 §1).
  //
  // The two assertions above both run from the title table outwards — no
  // heading for a widget that cannot render, no heading for a word nobody
  // classified. Neither could see the fault that was actually on the page,
  // because a MISSING heading breaks nothing this file was reading: it is a
  // widget drawing its content onto the page's own background with no head and
  // no card, which `blockTitle` produces by returning null and
  // `attachBlockHead` produces by drawing nothing.
  //
  // Six widgets were in that state — `events`, `sleep-summary`, `period-nav`,
  // `journals-header`, `topic-stats` and `links` — and 4.8.1 had already
  // diagnosed it for a seventh, the launcher, whose comment in `SECTION_TITLES`
  // calls it "the one block on the homepage that looked unfinished". That fix
  // added one entry, because nothing compared the tables.
  //
  // ONLY `WIDGETS`, AND THE CONVERSE IS NOT "EVERYTHING ELSE HAS NO HEADING".
  // That was this test's first draft and `kind-table` failed it immediately,
  // correctly: it is excluded from the ADD LIST because the window has no list
  // of this vault's note kinds to ask with, and it is a perfectly ordinary block
  // that a `frame: section` fence titles "🗂 Notes". `needs-vault-answer` is a
  // deferral about a QUESTION, never a claim about what the widget draws.
  //
  // What can be asserted about the other table is what its reasons actually say.
  // See below.
  it("gives every page widget a heading, so none can render frameless", () => {
    const titled = new Set(keys);
    expect(widgetKeys.filter((k) => !titled.has(k))).toEqual([]);
  });

  // The two reasons that are about the SHAPE of the thing, rather than about
  // whether the window can offer it:
  //
  //   `inline`  — drawn as a control inside a line. There is no block, so there
  //               is nothing for a head to sit on.
  //   `banner`  — what the page IS. Its root is in `BANDS`, so `hasOwnBar` is
  //               true and a heading here would be looked up, handed over and
  //               dropped — a dead entry that reads as a decision.
  //
  // The other four reasons are deliberately not asserted on. A `region` widget
  // is a block and could coherently be given one; an `alias` follows whatever
  // its real spelling does.
  it("gives no heading to a widget that has nowhere to put one", () => {
    const titled = new Set(keys);
    const shaped = excludedKeys.filter((k) =>
      ["inline", "banner"].includes(NOT_PAGE_WIDGETS[k].reason)
    );
    expect(shaped.length).toBeGreaterThan(5);
    expect(shaped.filter((k) => titled.has(k))).toEqual([]);
  });
});

const hasDocs = existsSync(join(ROOT, "docs/reference.md"));
(hasDocs ? describe : describe.skip)(
  "the reference table and the registry agree on what exists",
  () => {
    // NOT GENERATED FROM EACH OTHER, and that is deliberate: the essay-length
    // cells in `docs/reference.md` are the documentation's value, and a generator
    // would either destroy them or need them as input, at which point it is not a
    // generator. What is asserted is PARITY of the keyword sets, in both
    // directions — which kills a row for a widget that no longer exists and forces
    // a row for one that has been shipping undocumented, without this test having
    // any opinion about the prose in between.
    const reference = hasDocs ? repoFile("docs/reference.md") : "";
    const table = reference.slice(
      reference.indexOf("## Almanac widget reference"),
      reference.indexOf("## Trackers")
    );
    // The keyword is the first backticked word of a row, up to the first
    // separator the grammar uses: `:` opens an argument, `[` an optional one,
    // and `|` a label.
    const documented = new Set(
      [...table.matchAll(/^\| `([a-z0-9-]+)[`:[|]/gm)].map((m) => m[1])
    );

    it("finds the table", () => {
      expect(table.length).toBeGreaterThan(1000);
      expect(documented.size).toBeGreaterThanOrEqual(20);
    });

    it("documents every widget a page can be given", () => {
      expect(widgetKeys.filter((k) => !documented.has(k)).sort()).toEqual([]);
    });

    it("names nothing that does not dispatch and is not retired", () => {
      // `header` IS THE ONE ALLOWANCE, and it is stated here rather than added to
      // a table so that the exception cannot quietly acquire company. It has no
      // `case`: the fence loop intercepts it before `buildFromSpec` is ever
      // called, because a header bar anchors the widgets that follow it and so
      // has to be built by the thing that knows what follows. It is documented
      // for the same reason it is intercepted — a reader types it.
      //
      // A RETIRED KEYWORD IS ALSO ALLOWED TO HAVE A ROW. That row is how a reader
      // holding a note from two releases ago finds out what happened to it, which
      // is the job `RETIRED_WIDGETS` does in the renderer and the table does here.
      const dead = [...documented]
        .filter((k) => k !== "header")
        .filter((k) => !dispatched.has(k) && !(k in RETIRED_WIDGETS))
        .sort();
      expect(dead).toEqual([]);
    });
  }
);
