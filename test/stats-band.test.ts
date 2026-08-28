// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// THE MERGED BAND'S PURE HALF. 4.46.
//
// `topic-stats` and `journal-totals` answered one question — what do the notes
// below this note come to? — in two markup families with two collapse rules,
// and a Media shelf drew both, stacked. `stats-band` is the one widget, and
// what decides its cells is a table with no vault in it.
//
// WHY THE TABLE IS TESTED RATHER THAN THE BAND. The release's central claim is
// *one preset, three scopes, three honest bands, no branch in the caller*, and
// that is a claim about which measures survive which scope — arithmetic over a
// list, with no `App` and no DOM anywhere near it. `stats-band.ts` was split out
// of the builder precisely so that claim could be asserted in one call instead
// of being inferred from a rendered strip.
//
// The drawing half — that a measure with nothing to say draws no cell — is a
// vault question and is on §8's check list, not here.

import { describe, expect, it } from "vitest";
import {
  MEASURE_SCOPES,
  STATS_BAND_ALIASES,
  STATS_BAND_WORDS,
  STAT_CELL_CAP,
  STAT_PRESET_SHORTHAND,
  STAT_SLOTS,
  bandMeasures,
  isMeasure,
  kindMeasure,
  slotArgument,
  bandAnswers,
  insertSlot,
  nextMeasureFor,
  removeSlot,
  setSlot,
  slotChoicesFor,
  slotQuestions,
  swapSlots,
  slotsOf,
  STAT_PRESETS,
  defaultPresetFor,
  measuresFor,
  presetChoicesFor,
  presetsFor,
  resolveStatPreset,
  soleKindOf,
  statScopeOf,
  statsBandProbe,
} from "../src/journals/stats-band";
import type { StatScope } from "../src/journals/stats-band";
import {
  JOURNAL_PRESETS,
  MEDIA_PRESET,
  buildJournalType,
} from "../src/journals/journal";
import { DEFAULT_CONTAINER_PRESET } from "../src/journals/journal-sections";
import { homeSections } from "../src/diary/home-sections";
import { flatNoteModel } from "../src/core/note-sections";
import {
  answersInText,
  fieldLabelOf,
  withAnswers,
} from "../src/core/section-model";
import { STUDY_JOURNAL } from "../src/journals/journal";
import type { SectionQuestion } from "../src/core/section-model";
import { renameSoleKeyword } from "../src/core/directive-grammar";
import { cssRule, cssRules, readCode, readCss, readSrc } from "./sources";
import { WIDGETS } from "../src/core/widget-registry";
import { noteWithBandEdit } from "../src/ui/widgets/stats-band-menu";

const SCOPES: StatScope[] = ["vault", "journal", "container"];
const byId = (id: string) => STAT_PRESETS.find((p) => p.id === id)!;

describe("the scope is derived from where the band sits", () => {
  it("reads containerDepth's own answer, including its −1", () => {
    // `containerDepth` returns −1 for a journal's ROOT and 0-up for a container
    // inside it, and 4.13 corrected it to do so — "the root is not a container,
    // it is the box the first level sits in". This reads the same −1 to mean the
    // same thing, so the two cannot drift into disagreeing about what a journal
    // folder note is.
    expect(statScopeOf(-1)).toBe("journal");
    expect(statScopeOf(0)).toBe("container");
    expect(statScopeOf(3)).toBe("container");
  });

  it("treats a note in no journal as the vault, not as a depth", () => {
    // `null` is what a caller passes when `journalTypeOfNote` came back empty —
    // the homepage, the journals dashboard. It is deliberately not spelled as a
    // number: a homepage is not at depth −2.
    expect(statScopeOf(null)).toBe("vault");
  });
});

describe("a preset is offered where it means something", () => {
  it("offers Activity everywhere and the other three inside a journal", () => {
    expect(presetsFor("vault").map((p) => p.id)).toEqual(["activity"]);
    expect(presetsFor("journal").map((p) => p.id)).toEqual([
      "activity",
      "progress",
      "totals",
      "summary",
    ]);
    expect(presetsFor("container").map((p) => p.id)).toEqual([
      "activity",
      "progress",
      "totals",
      "summary",
    ]);
  });

  it("offers something on every scope, so no surface gets an empty menu", () => {
    // A `ChoiceQuestion` with no values draws the `empty` sentence instead of a
    // control, which on this question would be a section a reader can add and
    // cannot configure. The three catalogues all build their list from
    // `presetChoicesFor`, so one empty scope would be one broken dropdown.
    for (const scope of SCOPES) {
      expect(presetChoicesFor(scope).length, scope).toBeGreaterThan(0);
    }
  });

  it("puts the difference between the presets into the row, not just the noun", () => {
    // A `<select>` has one string per row, and "Progress" beside "Summary" tells
    // a reader nothing about which numbers they get. Every row therefore carries
    // its blurb after the name.
    for (const row of presetChoicesFor("container")) {
      expect(row.label, row.value).toContain(" — ");
      expect(row.label.length, row.value).toBeGreaterThan(20);
    }
  });
});

describe("what a directive's argument resolves to", () => {
  it("gives a bare band the scope's own preset", () => {
    // THE HALF THE MIGRATION RESTS ON. Every journal note catalogue composes
    // `stats-band` bare, and a container has to resolve it to `progress` —
    // because `progress` is what `topic-stats` drew, and that band is on every
    // Study Topic index in every vault.
    expect(resolveStatPreset("", "container").id).toBe("progress");
    expect(resolveStatPreset("", "journal").id).toBe("activity");
    expect(resolveStatPreset("", "vault").id).toBe("activity");
  });

  it("agrees with the constant the journal catalogue compares against", () => {
    // TWO COPIES OF A VALUE, PINNED TOGETHER. `journal-sections.ts` holds
    // `DEFAULT_CONTAINER_PRESET` so its `render` can decide whether the argument
    // is worth writing, and a drift between the two would have it compose
    // `stats-band:progress` on every Topic index — a byte-for-byte difference
    // from what 4.45 composed, saying exactly the same thing.
    expect(defaultPresetFor("container").id).toBe(DEFAULT_CONTAINER_PRESET);
  });

  it("falls back rather than refusing on a word it does not know", () => {
    // A band's preset chooses BETWEEN arrangements of numbers that are all
    // available, so a typo costs the arrangement and never the page. That is a
    // decision `journal-chart` cannot make — a chart naming a missing tracker
    // can draw nothing at all, so it refuses and lists what the vault has.
    expect(resolveStatPreset("nonsense", "container").id).toBe("progress");
    expect(resolveStatPreset("nonsense", "vault").id).toBe("activity");
  });

  it("honours a preset typed outside the scope that offers it", () => {
    // `scopes` governs a dropdown; it is not a veto. A reader who typed
    // `stats-band:totals` onto the homepage gets `totals`, and `measuresFor`
    // then drops every measure the vault cannot answer — so the band draws
    // nothing rather than something false. Substituting a different preset
    // behind their back would be worse: it looks like it worked.
    expect(resolveStatPreset("totals", "vault").id).toBe("totals");
    expect(measuresFor(byId("totals"), "vault")).toEqual([]);
  });

  it("takes the word case-insensitively, because a reader types it", () => {
    expect(resolveStatPreset("Totals", "container").id).toBe("totals");
    expect(resolveStatPreset("  summary  ", "container").id).toBe("summary");
  });
});

describe("one preset, three scopes, three honest bands", () => {
  it("keeps Activity whole on a journal and drops nothing on the vault", () => {
    // The claim in one assertion: the same four measures survive at every scope,
    // and what changes is what `below` COUNTS — journals at the top, the level's
    // own noun inside one. That last half is the builder's, and it is why the
    // measure is called `below` rather than `subjects`.
    for (const scope of SCOPES) {
      expect(measuresFor(byId("activity"), scope), scope).toEqual([
        "notes",
        "last",
        "open",
        "below",
      ]);
    }
  });

  it("drops the journal-shaped measures on the vault and keeps the rest", () => {
    // 2.44's finding, which `journals-header` acted on by deleting a cell: an
    // average across every registered journal at once is a number with no
    // referent, because a journal rates its kinds on whatever it likes. The same
    // is true of a sum — Pages read added to Distance is a figure in no unit.
    expect(measuresFor(byId("progress"), "vault")).toEqual(["open"]);
    expect(measuresFor(byId("summary"), "vault")).toEqual(["notes", "open"]);
    expect(measuresFor(byId("totals"), "vault")).toEqual([]);
  });

  it("names every measure a preset uses", () => {
    // A preset naming a measure with no scope entry would silently vanish from
    // every band rather than erroring — `measuresFor` filters on a lookup, and
    // an absent key is not a member of anything.
    for (const preset of STAT_PRESETS) {
      for (const m of preset.measures) {
        expect(MEASURE_SCOPES[m], `${preset.id}/${m}`).toBeTruthy();
      }
    }
  });

  it("leaves no preset with nothing to say at a scope it is offered on", () => {
    // The pairing that would be a broken menu row: a preset in a dropdown that
    // resolves to no cells at all on the surface that offered it.
    for (const scope of SCOPES) {
      for (const preset of presetsFor(scope)) {
        expect(
          measuresFor(preset, scope).length,
          `${preset.id} on ${scope}`
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("the cap is a fact about the data", () => {
  it("is four, which is what the strip has always claimed", () => {
    expect(STAT_CELL_CAP).toBe(4);
  });

  // How wide a band resolves, counted the way the builder counts: the two
  // expanding measures contribute a count and the rest one cell each. `sums` is
  // handed in rather than read off the preset, because how many summable
  // quantities are IN SCOPE is a vault fact — a Books shelf has readings of
  // *Pages read* and none of *Minutes*, which is the whole of what makes one
  // directive serve both.
  const widthOn = (
    kinds: number,
    sums: number,
    band: (typeof STAT_PRESETS)[number],
    scope: StatScope
  ): number =>
    measuresFor(band, scope).reduce(
      (n, m) => n + (m === "kinds" ? kinds : m === "totals" ? sums : 1),
      0
    );

  // What each shipped journal composes on its deepest index — a bare band, which
  // is `progress`, unless its layout names one.
  const shipped = (preset: (typeof JOURNAL_PRESETS)[number]) => {
    const type = buildJournalType(preset.config);
    const named =
      preset.config.layout?.[`index:${type.levels.length - 1}`]?.options?.[
        "stats"
      ]?.preset;
    return { type, band: byId(named ?? DEFAULT_CONTAINER_PRESET) };
  };

  it("costs nothing on what each shipped journal composes, one quantity per shelf", () => {
    // THE CLAIM THAT MAKES THE CAP FREE, AND IT IS NARROWER THAN THE PLAN SAID —
    // see ROADMAP-4.46-OUTCOME.md. Study composes `progress`: two kinds, a
    // rating, open tasks, four. Exercise & Diet composes `totals`, and its four
    // sums are exactly four. Media composes `summary`, whose fourth cell is the
    // ONE quantity a shelf carries — *Pages read* on Books, *Minutes* on Film —
    // which is the arrangement `MEDIA_CONFIG` is built around.
    for (const preset of JOURNAL_PRESETS) {
      const { type, band } = shipped(preset);
      const sums = (preset.trackers ?? []).filter((t) => t.reduce === "sum");
      // A journal whose sums are shared across its shelves contributes one per
      // shelf; one whose notes all carry all of them contributes all of them.
      // `pages: true` is the shape that splits them — see `MEDIA_CONFIG`.
      const inScope = type.kinds.some((k) => k.pages) ? 1 : sums.length;
      expect(
        widthOn(type.kinds.length, inScope, band, "container"),
        `${preset.id} ships ${band.id}`
      ).toBeLessThanOrEqual(STAT_CELL_CAP);
    }
  });

  it("spends the overflow on the expanding measure, never on the fixed cells", () => {
    // WHERE THE CAP DOES BITE, AND IT DOES: `Summary` on Exercise & Diet is a
    // count, a rating, open tasks and FOUR sums — seven cells for a band that
    // gets four. That is a reader's choice rather than a shipped arrangement,
    // and what has to hold is that the band stays legible when they make it.
    //
    // It does, because the preset's measures are declared most-important-first:
    // the three fixed cells are taken before the expansion starts, so the reader
    // loses the tail of a list and never the rating or the task count. The
    // builder names what it dropped in the strip's tooltip.
    expect(widthOn(2, 4, byId("summary"), "container")).toBe(7);
    const fixed = byId("summary").measures.slice(0, STAT_CELL_CAP - 1);
    expect(fixed).toEqual(["notes", "rating", "open"]);
    expect(byId("summary").measures.at(-1)).toBe("totals");
    // AND THE SAME IS TRUE OF THE OTHER EXPANDING MEASURE. `progress` on a
    // journal with three note types is five cells, and the two it must not lose
    // are the ones after the expansion — so this one is the exception that
    // proves the rule is about ORDER rather than about a promise that it never
    // bites. It is recorded rather than fixed, because no shipped journal has
    // three kinds and inventing a fifth preset for a vault nobody has is the
    // speculation this catalogue keeps declining.
    expect(widthOn(3, 0, byId("progress"), "container")).toBe(5);
  });

  it("is applied by the builder, and the remainder is named rather than dropped", () => {
    // THE ONE PART OF THE CAP THIS SUITE CANNOT ASSERT AS BEHAVIOUR, because
    // applying it needs a vault and a DOM and this suite has neither — see
    // `level-cards.test.ts`, which opens with the same boundary.
    //
    // So it is asserted at the seam instead, scoped to the function body and
    // anchored on the CALL rather than on its formatting (RESUME §6: an
    // assertion must not anchor on formatting). What it pins is the pair that
    // makes the cap honest: the band is cut, and what was cut is named.
    //
    // A MUTATION RUN CONFIRMED THIS IS THE ONLY THING WATCHING IT. Deleting the
    // slice left every other test in the suite green.
    const src = readSrc("tables");
    const start = src.indexOf("export function buildStatsBand(");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).toContain("cells.slice(0, STAT_CELL_CAP)");
    expect(body).toContain("cells.slice(STAT_CELL_CAP)");
    expect(body).toContain("Also totalled here:");
  });

  it("declares its measures most-important-first, since order decides survival", () => {
    // Where the cap does bite in some future vault, the preset's order is what
    // decides which cells are kept — so `open` must not sit behind an expanding
    // measure in a preset whose point is what is still open.
    expect(byId("summary").measures.indexOf("totals")).toBe(
      byId("summary").measures.length - 1
    );
    expect(byId("progress").measures.indexOf("kinds")).toBe(0);
  });
});

describe("Media is the shelf this release was written from", () => {
  it("names its notes after its single kind", () => {
    // "3 notes" and "3 titles" describe the same set when a journal has one
    // kind, and the second is what the reader called the thing. With two kinds
    // no kind's name covers the count, so the word is genuinely "notes".
    const media = buildJournalType(MEDIA_PRESET.config);
    expect(soleKindOf(media)?.label).toBe("Title");
    for (const preset of JOURNAL_PRESETS) {
      const type = buildJournalType(preset.config);
      expect(soleKindOf(type) !== null, preset.id).toBe(type.kinds.length === 1);
    }
    expect(soleKindOf(null)).toBeNull();
  });

  it("gets the two stacked bands as one, through Summary", () => {
    // §0's screenshot: *3 titles · 4.7/5 avg stars · 1 open tasks* in one band
    // and *753 pages read* in a second directly beneath it. Summary is those
    // four cells in one band — a count, a rating, what is open, and what it adds
    // up to — and Media declares exactly one summable quantity per shelf, which
    // is what keeps it at four.
    expect(measuresFor(byId("summary"), "container")).toEqual([
      "notes",
      "rating",
      "open",
      "totals",
    ]);
    const layout = MEDIA_PRESET.config.layout?.["index:0"];
    expect(layout?.sections).toContain("stats");
    expect(layout?.sections).not.toContain("totals");
    expect(layout?.options?.["stats"]?.preset).toBe("summary");
  });

  it("leaves Exercise & Diet banding its four sums out of one section", () => {
    const ex = JOURNAL_PRESETS.find((p) => p.id === "exercise-diet")!;
    const layout = ex.config.layout?.["index:0"];
    expect(layout?.sections).toContain("stats");
    expect(layout?.sections).not.toContain("totals");
    expect(layout?.options?.["stats"]?.preset).toBe("totals");
    expect(
      (ex.trackers ?? []).filter((t) => t.reduce === "sum").length
    ).toBe(4);
  });
});

describe("the two old words still reach the band", () => {
  it("routes each alias to the preset it always drew", () => {
    // A directive is content in someone's markdown. `topic-stats` sits in every
    // Study Topic index and `journal-totals` in every Exercise Block index, so
    // both go on dispatching — and each has an arm of its own rather than
    // falling through, because the merged widget's behaviour is chosen by an
    // argument neither old word carried.
    // ONE TABLE, AND THE DISPATCHER READS IT (4.46.1). It was two string
    // literals in the switch, and that made the mapping's THIRD reader — the
    // section editor's question — impossible to write: there was nowhere to take
    // it from. The behaviour is asserted off the table; the switch is asserted
    // only to be reading it rather than restating it.
    expect(STATS_BAND_ALIASES).toEqual({
      "topic-stats": "progress",
      "journal-totals": "totals",
    });
    for (const [word, preset] of Object.entries(STATS_BAND_ALIASES)) {
      expect(resolveStatPreset(preset, "container").id, word).toBe(preset);
    }
    const dispatch = readSrc("widgets");
    expect(dispatch).toContain('case "topic-stats":\n      case "journal-totals":');
    expect(dispatch).toContain("STATS_BAND_ALIASES[kind]");
  });

  it("is found by the catalogues' locators, so neither is offered twice", () => {
    // 4.16 §1's finding, arriving through a merged directive rather than a
    // renamed one: a locator that knew only the new word would report the
    // section ABSENT on every note composed before this release and offer to add
    // a second copy of what is already there.
    expect(STATS_BAND_WORDS).toEqual([
      "stats-band",
      "topic-stats",
      "journal-totals",
    ]);
    // Asserted as the locator BEHAVING, not as source text, and built from the
    // catalogue's own function rather than re-typed — 4.46.1 moved the
    // alternation into `statsBandProbe` so the two catalogues stop spelling it
    // by hand and a fourth word would reach both at once.
    const probe = statsBandProbe();
    for (const line of [
      "stats-band",
      "stats-band:summary",
      "topic-stats",
      "journal-totals",
    ]) {
      expect(probe.test(`\`\`\`almanac\n${line}\n\`\`\``), line).toBe(true);
    }
    // And it does not match a word that merely starts the same way, which is
    // the boundary failure this suite has been bitten by before.
    expect(probe.test("stats-bandwidth")).toBe(false);
  });
});

describe("the band reaches the pages outside every journal", () => {
  it("is offered on a flat note, and asks nothing there either", () => {
    // THE HOMEPAGE AND THE TWO DASHBOARDS GET IT FOR FREE, through
    // `pageWidgetSections` — the generic add-any-widget path, which builds a
    // section per `WIDGETS` entry. That is why no section was ever added to
    // `home-sections.ts` or to either dashboard catalogue: the registry entry IS
    // the offer there.
    //
    // AND IT IS OFFERED WITH NO CONTROLS (4.48). 4.47 gave the registry entry
    // four `choice` rows and this test asserted them; the control is on the cell
    // now, and a section row that draws a model of the band beside the band is
    // the clutter the reader reported. What has to stay true is that adding it
    // still WORKS: composed bare, and a bare band is the scope's own default.
    const model = flatNoteModel({
      sections: homeSections(),
      noun: "homepage",
      text: "",
    } as never);
    const band = model.sections("").find((s) => s.id === "w:stats-band#1");
    expect(band, "the homepage's add list").toBeTruthy();
    expect(band!.questions ?? []).toHaveLength(0);
    // AT THE TABLE AS WELL AS AT THE MODEL, because `argsOf` reads three fields
    // and a leftover in any one of them would put a box back on the row.
    expect(WIDGETS["stats-band"].args).toBeUndefined();
    expect(WIDGETS["stats-band"].arg).toBeUndefined();
    expect(WIDGETS["stats-band"].arg2).toBeUndefined();
  });

  it("keeps no second copy of the vault's rows", () => {
    // `STAT_SLOT_ROWS` STOOD IN THE REGISTRY and was the vault scope's list
    // spelled out, because that table may hold no functions. It existed only to
    // feed the four `choice` rows, and this test was what stopped the two
    // spellings drifting — a job with no subject once the rows went.
    expect(readCode("widget-registry")).not.toContain("STAT_SLOT_ROWS");
    // The list itself is unchanged and is still the vault's: no note types and
    // no rating, because a vault has no one list of either.
    expect(slotChoicesFor("vault", null).map((r) => r.value)).toEqual([
      "notes",
      "below",
      "open",
      "last",
    ]);
  });
});

describe("one band means one markup family", () => {
  // COMMENTS DESCRIBE OLD CODE IN THIS PROJECT, so every negative match below
  // runs over the stylesheet with its comments stripped. That is the house rule
  // from RESUME §6, and it has bitten this suite before: a `not.toContain` over
  // a source file matched the comment explaining a removal.
  const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("retired the hand-rolled topic band, rules and all", () => {
    // Fifty-five declarations that were `.am-stats` spelled again: a grid of
    // four, a border, a radius, an overflow clip, per-cell left borders, and a
    // fold with two more rules to unpick those borders on the second row.
    for (const dead of [
      ".journal-topic-stats",
      ".jts-cell",
      ".jts-value",
      ".jts-sub",
      ".jts-label",
      ".journal-totals",
      ".jtot-title",
    ]) {
      expect(css, dead).not.toContain(dead);
    }
  });

  it("leaves one wrapper and one strip", () => {
    // `cssRule` throws when the selector is gone, so this fails loudly on a
    // rename rather than turning the assertions above into no-ops.
    expect(cssRule(".stats-band")).toContain("flex-direction: column");
    expect(cssRule(".sb-title")).toContain("color: var(--text-muted)");
    expect(cssRules(".am-stats").length).toBeGreaterThan(0);
  });

  it("folds at one width now, where it used to fold at two", () => {
    // THE HALF THAT WAS ACTUALLY WRONG. The retired band folded at 520px and the
    // shared strip folds at 480px, so a Media shelf drawing both — which every
    // Media shelf did — had two bands of four cells becoming two-by-two forty
    // pixels apart. Neither number was wrong; there were two of them.
    //
    // AND IT IS `@container`, NOT `@media`. Almanac renders inside a note pane,
    // and a 400px pane in a 1600px window is the normal way anyone reads a
    // dashboard beside something else — `96-stat-strip.css` records the release
    // where that was a live bug.
    // Asserted as "no band selector appears in a 520px block" rather than as
    // "the file has no 520px" — that width is this plugin's general widget
    // breakpoint and five other sheets use it. What must be gone is a SECOND
    // fold over these cells.
    for (const [, block] of css.matchAll(
      /@container \(max-width: 520px\)\s*\{([\s\S]*?)\n\}/g
    )) {
      expect(block).not.toContain(".am-stat");
      expect(block).not.toContain(".jts-");
      expect(block).not.toContain("stats-band");
    }
    expect(css).toContain("@container (max-width: 480px)");
  });

  it("draws through the strip rather than beside it", () => {
    // The builder calls `statStrip`, which is what brings the container query
    // with it. A band that built its own `.am-stat` divs would look identical
    // and would drift the first time the component changed.
    const src = readSrc("tables");
    const start = src.indexOf("export function buildStatsBand(");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).toContain("statStrip(root, shown)");
    expect(body).not.toContain('cls: "am-stat"');
  });

  it("skips a kind the journal no longer declares, rather than borrowing one", () => {
    // A `kind:<id>` slot names a NOTE TYPE, and a note type can be renamed or
    // deleted while the note carrying the slot is untouched. Drawing the
    // journal's first kind under a heading a reader chose for another one is
    // the failure `study-fallback.test.ts` names on the other surface —
    // *"nothing rather than something borrowed"* — so the arm skips the cell.
    //
    // PINNED AT THE SEAM, and this is the second time this file has had to.
    // Applying the arm needs a vault and a DOM, which this suite has neither
    // of: a mutation replacing the skip with a fallback left all 4,000-odd
    // other tests green. Scoped to the function body and anchored on the
    // statement rather than its formatting.
    const src = readSrc("tables").replace(/\/\/.*$/gm, "");
    const start = src.indexOf("export function buildStatsBand(");
    const body = src.slice(start, src.indexOf("\n}\n", start));
    const at = body.indexOf("const kind = type?.kinds.find");
    expect(at).toBeGreaterThan(-1);
    // The statement AFTER the lookup, which is `study-fallback.test.ts`'s own
    // way of asking this: a reader of a nullable answer checks it first.
    const next = body
      .slice(at)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[1];
    expect(next).toBe("if (!kind) continue;");
  });
});


// ── 4.46.1: the control the release shipped and could not be reached ──────
//
// 4.48 MOVED THE CONTROL ONTO THE CELL and these tests stayed, because what they
// pin is the GRAMMAR rather than the window it was drawn in: a note carrying an
// old keyword or a preset word still has to open with the cells it is drawing,
// and answering still has to write one line. The questions are read from
// `slotQuestions` directly now — they are the band's own vocabulary rather than
// a catalogue's, which is the only thing about them that changed.

describe("every cell is configurable, on a note that already has a band", () => {
  const questions = (): SectionQuestion[] =>
    slotQuestions("container", STUDY_JOURNAL);
  const fence = (line: string): string[] => ["```almanac", line, "```"];
  const boxes = (line: string): Record<string, string> =>
    answersInText(fence(line).join("\n"), questions());

  it("has one question per cell, named by its ordinal", () => {
    // 4.46 asked ONE question naming a whole arrangement, and 4.46.0's label
    // *"which numbers to show"* put a box headed **Which** on the row —
    // `fieldLabelOf` takes the first word that is not an article. The ordinals
    // outlived the boxes: they are what the cell's `⋯` is named after, so a
    // screen reader on the third of four identical controls hears which it is.
    expect(questions()).toHaveLength(STAT_SLOTS);
    expect(questions().map(fieldLabelOf)).toEqual([
      "First",
      "Second",
      "Third",
      "Fourth",
    ]);
    expect(readSrc("stats-band-menu")).toContain('`Change ${named.label}`');
  });

  it("offers this journal's own note types by name", () => {
    // `kinds` fills one cell per note type and is right for *"one per note
    // type"*; a reader choosing what goes in the SECOND cell is asking *"how
    // many Lessons"*. Both catalogues that ask this hold a `JournalType`, so the
    // per-kind rows need no vault plumbing — this is not the
    // `needs-vault-answer` deferral.
    const values = (questions()[0] as { values: { value: string }[] }).values;
    expect(values.map((v) => v.value)).toEqual(
      slotChoicesFor("container", STUDY_JOURNAL).map((v) => v.value)
    );
    for (const kind of STUDY_JOURNAL.kinds) {
      expect(values.map((v) => v.value)).toContain(kindMeasure(kind.id));
    }
    // `total:<tracker>` is NOT offered, deliberately: it would need the registry,
    // which neither catalogue holds.
    expect(values.every((v) => !v.value.startsWith("total:"))).toBe(true);
  });

  it("opens with the cells the note is actually drawing", () => {
    // THE HALF A SHORTHAND WOULD OTHERWISE BREAK. A whole word cannot be divided
    // between four boxes, so `summary` would sit in the first and leave three
    // empty over a band drawing four cells. `shorthand` expands it first.
    expect(boxes("stats-band:summary")).toEqual({
      slot1: "notes",
      slot2: "rating",
      slot3: "open",
      slot4: "totals",
    });
    // An explicit list is shown as itself.
    expect(boxes("stats-band:notes,rating,open")).toEqual({
      slot1: "notes",
      slot2: "rating",
      slot3: "open",
      slot4: "",
    });
    // AND A SUPERSEDED KEYWORD IS RESOLVED THROUGH BOTH HOPS: `topic-stats`
    // means the argument `progress`, and `progress` means `kinds,rating,open`.
    expect(boxes("topic-stats")).toEqual({
      slot1: "kinds",
      slot2: "rating",
      slot3: "open",
      slot4: "",
    });
    expect(boxes("journal-totals")).toEqual({
      slot1: "totals",
      slot2: "",
      slot3: "",
      slot4: "",
    });
    // A bare band names no cells, and the first box says what empty means.
    expect(boxes("stats-band")).toEqual({
      slot1: "",
      slot2: "",
      slot3: "",
      slot4: "",
    });
    expect(questions()[0].emptyLabel).toBe("This page's own choice");
    expect(questions()[1].emptyLabel).toBe("Nothing");
  });

  it("writes the whole list out when one box is answered", () => {
    // ONE SPLICE FOR FOUR QUESTIONS, which is what `part` exists for: four
    // splices of one span would be the last overwriting the first three.
    const qs = questions();
    expect(withAnswers(fence("stats-band:notes,rating,open"), qs, { slot2: "last" })[1])
      .toBe("stats-band:notes,last,open");
    // A CLEARED BOX REMOVES ITS CELL AND LEAVES NO TRAILING SEPARATOR —
    // `joinParts`' own rule: `stats-band:a,b,c,` reads as though something went
    // missing.
    expect(
      withAnswers(fence("stats-band:notes,rating,open,totals"), qs, { slot4: "" })[1]
    ).toBe("stats-band:notes,rating,open");
    // A per-kind cell carries a colon, and the grammar takes the FIRST one as
    // the directive's separator — so the argument survives whole.
    expect(
      withAnswers(fence("stats-band"), qs, { slot1: kindMeasure("lesson") })[1]
    ).toBe("stats-band:kind:lesson");
  });

  it("keeps what the old spelling meant when it migrates the line", () => {
    // THE TRAP THE FOUR BOXES INTRODUCE. An alias carries no argument, so
    // renaming `topic-stats` and then seeding from the now-empty line would
    // throw away the arrangement the reader was looking at — change the second
    // cell and the first and third vanish.
    const qs = questions();
    expect(withAnswers(fence("topic-stats"), qs, { slot2: "rating" })[1]).toBe(
      "stats-band:kinds,rating,open"
    );
    expect(withAnswers(fence("journal-totals"), qs, { slot2: "open" })[1]).toBe(
      "stats-band:totals,open"
    );
    // A title the reader typed is theirs and survives.
    expect(
      withAnswers(fence("stats-band:summary|My band"), qs, { slot1: "kinds" })[1]
    ).toBe("stats-band:kinds,rating,open,totals|My band");
  });

  it("writes nothing when the reader answered nothing", () => {
    // A row nobody touched carries no options, and must not be migrated on the
    // strength of having been looked at — the promise `shownAnswer` makes when
    // it seeds a control without marking the section dirty.
    const qs = questions();
    expect(withAnswers(fence("topic-stats"), qs, undefined)[1]).toBe("topic-stats");
    expect(withAnswers(fence("topic-stats"), qs, {})[1]).toBe("topic-stats");
  });
});

describe("an argument is a slot list or a shorthand, and they cannot collide", () => {
  it("makes a word that is both read the same either way", () => {
    // THE WHOLE GRAMMAR RESTS ON THIS, and the first draft asserted the wrong
    // version of it: *"preset ids and measure ids are disjoint"*, which failed
    // immediately on `totals` — it is both the name of a preset and the name of
    // a measure.
    //
    // Disjointness was never the property that matters. What matters is that a
    // reader who types one word gets one band: an overlap is safe exactly when
    // the two readings AGREE, and dangerous otherwise — a preset called `notes`
    // standing for four cells would silently become a one-cell band, and nothing
    // would error.
    //
    // So the invariant is stated as the thing it protects, and it is checked over
    // every scope because `bandMeasures` filters by one.
    for (const preset of STAT_PRESETS) {
      if (!isMeasure(preset.id)) continue;
      for (const scope of SCOPES) {
        expect(
          bandMeasures(preset.id, scope),
          `${preset.id} on ${scope}`
        ).toEqual(measuresFor(preset, scope));
      }
    }
    // And the overlap is exactly one word today, which is worth pinning so a
    // second one is a decision somebody makes rather than notices.
    expect(STAT_PRESETS.filter((p) => isMeasure(p.id)).map((p) => p.id)).toEqual([
      "totals",
    ]);
  });

  it("reads a slot list, a shorthand and a typo, in that order", () => {
    expect(bandMeasures("notes,open", "container")).toEqual(["notes", "open"]);
    expect(bandMeasures("progress", "container")).toEqual([
      "kinds",
      "rating",
      "open",
    ]);
    // A typo falls back to the scope's own arrangement rather than refusing —
    // 4.46's rule, unchanged and still for its reason.
    expect(bandMeasures("nonsense", "container")).toEqual(
      measuresFor(defaultPresetFor("container"), "container")
    );
    // ONE BAD TOKEN MAKES THE WHOLE THING A SHORTHAND LOOKUP, which then fails
    // and falls back — rather than a list with a hole silently dropped out of it.
    expect(bandMeasures("notes,rubbish", "container")).toEqual(
      measuresFor(defaultPresetFor("container"), "container")
    );
    // And the scope still filters: a vault cannot answer a rating.
    expect(bandMeasures("notes,rating,open", "vault")).toEqual(["notes", "open"]);
  });

  it("spells every preset as the cells it stands for", () => {
    // DERIVED FROM `STAT_PRESETS`, so the word and the list cannot drift into
    // meaning different things.
    for (const preset of STAT_PRESETS) {
      expect(STAT_PRESET_SHORTHAND[preset.id], preset.id).toBe(
        preset.measures.join(",")
      );
      expect(bandMeasures(STAT_PRESET_SHORTHAND[preset.id], "container")).toEqual(
        measuresFor(preset, "container")
      );
    }
  });

  it("round-trips a slot list through the pieces the editor writes", () => {
    // `slotsOf` pads to four for the boxes and `slotArgument` drops the empty
    // tail on the way back — the pair the editor sits between.
    expect(slotsOf("notes,rating", "container")).toEqual([
      "notes",
      "rating",
      "",
      "",
    ]);
    expect(slotArgument(slotsOf("notes,rating", "container"))).toBe("notes,rating");
    expect(slotArgument(["notes", "", "open", ""])).toBe("notes,,open");
  });
});

describe("renaming a keyword is refused where it would be a guess", () => {
  it("declines an absent word and an ambiguous one", () => {
    // `soleArgSpanIn`'s rule, and its reason: a keyword that appears twice
    // cannot be told apart, and renaming the first would move an answer onto a
    // block the reader was not looking at.
    expect(renameSoleKeyword(["stats-band"], "topic-stats", "stats-band")).toBeNull();
    expect(
      renameSoleKeyword(["topic-stats", "topic-stats"], "topic-stats", "stats-band")
    ).toBeNull();
    expect(renameSoleKeyword(["topic-stats"], "topic-stats", "stats-band")).toEqual([
      "stats-band",
    ]);
  });

  it("replaces the word and nothing else on the line", () => {
    expect(
      renameSoleKeyword(["  journal-totals:x|Label  "], "journal-totals", "stats-band")
    ).toEqual(["  stats-band:x|Label  "]);
  });
});

// ── 4.48: the control moved onto the cell ─────────────────────────────────

describe("a cell is edited from the cell", () => {
  const M = ["notes", "rating", "open"];

  it("sets one slot and leaves the others alone", () => {
    expect(setSlot(M, 1, "last")).toEqual(["notes", "last", "open"]);
    // A cell that is no longer there — the note changed under an open menu —
    // edits nothing rather than appending something the reader did not ask for.
    expect(setSlot(M, 9, "last")).toEqual(M);
    expect(setSlot(M, -1, "last")).toEqual(M);
  });

  it("closes the gap when a cell is removed", () => {
    // THE WHOLE REASON THIS IS A LIST OPERATION rather than an answer of `""`
    // to one question: `joinParts` drops an empty TAIL and cannot shift a hole
    // out of the middle, so clearing the second box would leave `notes,,open`.
    expect(removeSlot(M, 1)).toEqual(["notes", "open"]);
    expect(slotArgument(removeSlot(M, 1))).toBe("notes,open");
    expect(removeSlot(M, 9)).toEqual(M);
  });

  it("adds after the cell whose menu was opened, never at the end", () => {
    // The reader opened a menu on a particular cell. A new one appearing at the
    // far end of the row is the answer to a question they did not ask.
    expect(insertSlot(M, 0, "last")).toEqual(["notes", "last", "rating", "open"]);
    expect(insertSlot(M, 2, "last")).toEqual(["notes", "rating", "open", "last"]);
    // AND IT CANNOT PUSH THE BAND PAST WHAT THE STRIP DRAWS. A fifth slot would
    // be written to the note and then silently truncated at render.
    expect(insertSlot(["a", "b", "c", "d"], 0, "last")).toHaveLength(STAT_SLOTS);
  });

  it("adds a measure the band is not already showing", () => {
    // A menu row that adds a second copy of the cell it was opened from has
    // added nothing anybody can see.
    const rows = slotChoicesFor("container", STUDY_JOURNAL).map((r) => r.value);
    expect(nextMeasureFor([], "container", STUDY_JOURNAL)).toBe(rows[0]);
    expect(nextMeasureFor([rows[0]], "container", STUDY_JOURNAL)).toBe(rows[1]);
    // Nothing left to offer is null, and a null is a row that is not drawn.
    expect(nextMeasureFor(rows, "container", STUDY_JOURNAL)).toBeNull();
    // Scope-aware, like everything else here: the vault has no rating to add.
    expect(nextMeasureFor(["notes"], "vault", null)).toBe("below");
  });

  it("answers every slot, including the empty ones", () => {
    // A PARTIAL WRITE LEAVES THE REST READING WHAT THE LINE ALREADY SAID, which
    // after a removal is the cell that was just removed.
    expect(bandAnswers(["notes", "open"])).toEqual({
      slot1: "notes",
      slot2: "open",
      slot3: "",
      slot4: "",
    });
  });
});

describe("the write is the one the section editor used", () => {
  const note = (line: string): string[] => [
    "# A topic",
    "",
    "```almanac",
    line,
    "```",
    "",
    "Body text the reader wrote.",
  ];
  const body = { from: 3, to: 4 };
  const qs = (): SectionQuestion[] => slotQuestions("container", STUDY_JOURNAL);

  it("rewrites the band's line and nothing else in the note", () => {
    const out = noteWithBandEdit(
      note("stats-band:notes,rating,open"),
      body,
      qs(),
      ["notes", "last", "open"]
    );
    expect(out?.[3]).toBe("stats-band:notes,last,open");
    // The fence, the heading and the reader's prose are untouched.
    expect(out?.slice(0, 3)).toEqual(["# A topic", "", "```almanac"]);
    expect(out?.slice(4)).toEqual(["```", "", "Body text the reader wrote."]);
  });

  it("migrates an older keyword on the first edit, as the editor did", () => {
    // 4.46.1's `supersedes` and `renameSoleKeyword`, reached from the new
    // control — which is the point of writing through `withAnswers` rather than
    // splicing here: the migration was not re-implemented, it was inherited.
    const out = noteWithBandEdit(note("topic-stats|My band"), body, qs(), [
      "kinds",
      "last",
      "open",
    ]);
    expect(out?.[3]).toBe("stats-band:kinds,last,open|My band");
  });

  it("says null rather than writing a note it did not change", () => {
    // A range that no longer holds a band — the note was edited under an open
    // menu. The caller turns this into a notice; what it must never do is write
    // the file to say nothing happened.
    expect(noteWithBandEdit(note("level-index"), body, qs(), ["notes"])).toBeNull();
  });
});

describe("the cell's menu is flat, and knows which slot it is on", () => {
  const src = (): string => readSrc("stats-band-menu");

  it("has no submenu to probe", () => {
    // 4.47's outcome §5: `setSubmenu` is not on Obsidian's public types, so it
    // has to be probed, and a probe that fails must leave the setting
    // reachable. A flat menu has nothing to probe — which is why "Add cell"
    // takes no argument.
    expect(readCode("stats-band-menu")).not.toContain("setSubmenu");
  });

  it("offers no Remove on the last cell", () => {
    // An argument with no slots left is a BARE directive, and a bare directive
    // is the scope's own default — so removing the last cell would silently
    // restore the four cells the reader had just spent four gestures replacing.
    expect(src()).toContain("if (measures.length > 1) {");
    expect(src()).toContain('.setTitle("Remove cell")');
  });

  it("offers no Add once the strip is full", () => {
    expect(src()).toContain("if (add && cells.length < STAT_CELL_CAP) {");
  });

  it("edits the slot the cell came from, not the cell's own position", () => {
    // `kinds` and `totals` expand, so three cells can share one slot. The
    // provenance is recorded as the cells are pushed — `buildStatsBand`'s
    // `origin` — because only that loop knows which measure it was on.
    expect(src()).toContain("const at = origin[i];");
    for (const call of ["setSlot(measures, at,", "removeSlot(measures, at)", "insertSlot(measures, at,"]) {
      expect(src(), call).toContain(call);
    }
    // AND THE BUILDER COUNTS RATHER THAN SEARCHES. `measures.indexOf(measure)`
    // would give both cells of `notes,notes` the first slot — a menu on the
    // second that edits the first.
    const band = readCode("tables");
    const start = band.indexOf("export function buildStatsBand(");
    const scoped = band.slice(start, band.indexOf("\n}\n", start));
    expect(scoped).toContain("for (slot = 0; slot < measures.length; slot += 1) {");
    expect(scoped).not.toContain("measures.indexOf(");
  });

  it("never writes when the reader picked the row already ticked", () => {
    // The one gesture that must do nothing, and it has to be caught BEFORE the
    // write path starts: once there, "no change" and "no band line here" are
    // indistinguishable, and the second one shows a failure notice.
    expect(src()).toContain('if (next.join(",") === measures.join(",")) return;');
  });
});

describe("the cell's control rests where a hover cannot reach it", () => {
  it("is scoped to the band, never to the shared strip", () => {
    // `.am-stat` is also the year dashboard's body and three period mastheads.
    // A control that edits a directive must not appear on a surface that has no
    // directive to edit.
    const css = readCss();
    expect(css).toContain(".stats-band .am-stat:hover .sb-cell-menu");
    expect(css).not.toMatch(/(^|[},])\s*\.am-stat:hover \.sb-cell-menu/);
  });

  it("is reachable by keyboard and on a touchscreen", () => {
    // A control at `opacity: 0` is still focusable, and one that stays invisible
    // while focused is a control nobody can see they are on. The touch half is
    // 3.9 §3.3 and `hover-reveal.test.ts` enforces it mechanically.
    const css = readCss();
    expect(css).toContain(".stats-band .am-stat:focus-within .sb-cell-menu");
    // The resting state lives in a `(hover: none)` branch — read by matching
    // the branch rather than by `cssRules`, which walks INTO at-rules and
    // answers about the selectors inside them.
    const touch = readCss().match(/@media\s*\(hover:\s*none\)\s*\{[\s\S]*?\n\}/g) ?? [];
    expect(touch.join("\n")).toContain(".sb-cell-menu");
  });
});

// ── 4.49: two cells trading places ────────────────────────────────────────

describe("a cell can be dragged onto another cell", () => {
  it("swaps the two and moves nothing else", () => {
    // THE DIFFERENCE FROM `dropOnto`, AND THE REASON THIS IS A SWAP. A band is
    // a row of POSITIONS, capped at four and read across, so trading the first
    // and the third must leave the second and the fourth exactly where they
    // were — where a move-aside would shuffle everything between them.
    const M = ["notes", "rating", "open", "last"];
    expect(swapSlots(M, 0, 2)).toEqual(["open", "rating", "notes", "last"]);
    expect(swapSlots(M, 3, 1)).toEqual(["notes", "last", "open", "rating"]);
    // `cell-move.ts`'s own claim for its swap verb, asserted: nothing is
    // inserted and nothing is removed.
    expect(swapSlots(M, 0, 3)).toHaveLength(M.length);
    expect([...swapSlots(M, 0, 3)].sort()).toEqual([...M].sort());
    // And the source list is not touched, because the caller still holds it.
    expect(M).toEqual(["notes", "rating", "open", "last"]);
  });

  it("is the identity on itself and on a cell that is gone", () => {
    // NO BRANCH FOR THE FIRST OF THOSE, deliberately: two positions trading
    // with themselves is the list it started with, and a mutation run showed
    // the `a === b` guard could be deleted with the suite still green. The
    // behaviour is what is pinned here, which is why the deletion was safe.
    const M = ["notes", "rating"];
    expect(swapSlots(M, 1, 1)).toEqual(M);
    expect(readCode("stats-band")).not.toContain("a === b");
    expect(swapSlots(M, 0, 9)).toEqual(M);
    expect(swapSlots(M, -1, 0)).toEqual(M);
  });

  it("hands the swap to the same write the menu uses", () => {
    // NO SECOND WRITE PATH, which is what keeps the keyword migration and the
    // `|Label` rule working for a gesture that knows nothing about either.
    const note = ["```almanac", "topic-stats|My band", "```"];
    const out = noteWithBandEdit(
      note,
      { from: 1, to: 2 },
      slotQuestions("container", STUDY_JOURNAL),
      swapSlots(["kinds", "rating", "open"], 0, 2)
    );
    expect(out?.[1]).toBe("stats-band:open,rating,kinds|My band");
  });
});

describe("the drag is the journal cards' gesture, on a smaller surface", () => {
  const src = (): string => readSrc("stats-band-menu");

  it("declines a payload from another band, rather than writing into this one", () => {
    // A slot number means nothing except against the measure list it was taken
    // from, and a page may hold two bands. The payload carries the note's path
    // and the block's first line, both read at `dragstart`.
    expect(src()).toContain("from.path !== band.ctx.sourcePath || from.line !== info.lineStart");
    expect(src()).toContain('notify.fail("That number belongs to a different stats band.");');
  });

  it("keeps the payload in the drag rather than in a variable", () => {
    // `attachCardDrag`'s rule: a band rebuilds on every repaint — including the
    // one its own drop causes — so a module-level "currently dragging" would be
    // read by handlers belonging to cells that no longer exist.
    const code = readCode("stats-band-menu");
    expect(code).toContain("evt.dataTransfer?.setData(SLOT_DRAG_TYPE, JSON.stringify(payload));");
    expect(code).not.toMatch(/^let (inFlight|dragging|current)/m);
  });

  it("lights up for its own drag and for nothing else", () => {
    // A file from the explorer, a link, a text selection — all fire `dragover`
    // on whatever is under the pointer. `getData` is blocked until drop, and the
    // type list is what a target has to decide with.
    expect(src()).toContain("if (!evt.dataTransfer?.types.includes(SLOT_DRAG_TYPE)) return;");
    // A lowercase type, because the spec lowercases every type it stores.
    const type = src().match(/const SLOT_DRAG_TYPE = "([^"]+)"/)?.[1] ?? "";
    expect(type).toBe(type.toLowerCase());
    expect(type.length).toBeGreaterThan(0);
  });

  it("says why two cells from one choice cannot trade", () => {
    // 4.48 was a release about a control that silently did nothing; a drop that
    // lands on a sibling of the cell it came from must not be another one.
    expect(src()).toContain("if (from.slot === at) {");
    expect(src()).toContain("come from one choice");
  });

  it("is offered only where there is somewhere to drop", () => {
    expect(src()).toContain("if (cells.length > 1) attachCellDrag(band, cell, at);");
    // The cursor follows the attribute rather than the class, so the two cannot
    // disagree about whether a band can be reordered.
    expect(readCss()).toContain('.stats-band .am-stat[draggable="true"]');
  });

  it("draws its drag states on the band and not on the shared strip", () => {
    const css = readCss();
    for (const rule of [
      ".stats-band .am-stat.is-dragging",
      ".stats-band .am-stat.is-drop-target",
    ]) {
      expect(css, rule).toContain(rule);
    }
    expect(css).not.toMatch(/(^|[},])\s*\.am-stat\.is-(dragging|drop-target)/);
  });

  it("declares micro-ring ribbon styling for compact telemetry presentation", () => {
    const css = readCss();
    expect(cssRule(".am-stat-ring-wrap")).toContain("display: inline-flex");
    expect(cssRule(".am-stat-ring-svg")).toContain("rotate(-90deg)");
    expect(cssRule(".am-stat-ring-bg")).toContain("stroke: var(--background-modifier-border)");
    expect(cssRule(".am-stat-ring-val")).toContain("stroke: var(--interactive-accent)");
    expect(cssRule(".am-stat-data")).toContain("display: flex");
    expect(cssRule(".am-stat-val-row")).toContain("display: flex");
  });
});
