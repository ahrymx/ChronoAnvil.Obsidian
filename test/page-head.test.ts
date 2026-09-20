// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The page head — 4.10, and rewritten in 5.2 to describe the head that renders.
//
// ── WHAT THIS FILE GOT WRONG FOR A YEAR, WHICH IS THE POINT OF THE REWRITE ──
//
// It was written about `buildPageTitle`: a card with the page's name, a cog,
// and a row of small-caps links to Home, Diary and Journals built from the
// `title:` directive's argument. Nine of its assertions described that card, in
// detail, down to the `--ca-caps-tracking` on the links — and every one of them
// passed for a year after 4.10 pointed `case "title"` at `livePageHead`
// instead, because they all read the SOURCE of a module nothing imported and
// the CSS of a class nothing drew.
//
// That is the documented hazard of a structural suite, arriving: a test that
// reads what the source says goes on passing after the code stops being called.
// `test/dead-code.test.ts` is the answer to it, and the import graph is what it
// asks. This file now asserts the head that is actually on the page:
// `.ca-journal-page-head`, built by `page-head.ts`, with no card and no links.
//
// The load-bearing assertions are still the composition ones — seven pages
// compose the directive — plus the repair one in layout.test.ts, where
// `applyLayout` is tested.

import { describe, expect, it } from "vitest";
import { fnBody, readCss, readSrc, styleSheets } from "./sources";
import { composeHomeNote } from "../src/diary/home-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";
import { composeJournalsDashboardNote } from "../src/journals/journals-dashboard-sections";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { PAGE_TITLE_LINE, locateTitle } from "../src/core/note-sections";
import { isTitleLine } from "../src/core/directive-grammar";
import { DEFAULT_PATHS } from "../src/core/constants";
import { LAUNCHER_DEFAULT } from "../src/ui/widgets/launcher";
import { TRACKER_CLASSES } from "../src/trackers/trackers";
import { railFor } from "../src/ui/widgets/page-head";
import {
  PROJECTS_CONFIG,
  STUDY_JOURNAL,
  buildJournalType,
} from "../src/journals/journal";

const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

// ONE MODULE'S CSS, NAMED. `readCss` joins the folder, so a `not.toContain`
// against it says "nowhere in 634KB" — which is the right question for a rule
// that must not exist anywhere, and the WRONG one for "this file did not
// change", where the concatenation always contains the other file's copy.
const sheet = (name: string): string => {
  const found = styleSheets().find((s) => s.name === `${name}.css`);
  expect(found, `no stylesheet ${name}.css`).toBeTruthy();
  return found!.css;
};

// A boundary rather than `indexOf`, and ANCHORED TO A LINE START — both halves
// earned. `.ca-jtc-link` is a prefix of `.ca-jtc-link-icon`, so a bare match reads the
// wrong rule; and `readCss` concatenates the folder alphabetically, so
// `05-inline-widgets.css`'s `is-unframed .ca-jtc-card` reset comes hundreds of
// lines before the real `.ca-jtc-card` in `60-heroes-and-banners.css`. Anchoring on
// the line the selector OPENS is what tells a rule from a mention of it.
const ruleFor = (sel: string): string => {
  const at = rules.search(
    new RegExp("(^|\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{]")
  );
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  const open = rules.indexOf("{", at);
  return rules.slice(open, rules.indexOf("}", open));
};

// A module's code with its comments taken off.
//
// EVERY ASSERTION BELOW THAT SAYS "THIS FILE DOES NOT DO X" NEEDS THIS. The
// files in this project explain what they deliberately do NOT do, at length, by
// name — so a bare `not.toContain("jn-pill")` fails on the paragraph arguing
// why there are no pills here.
const code = (name: string): string =>
  readSrc(name).replace(/\/\/.*$/gm, "");

// The seven pages that gain a head, by the note each composes.
const HEADED: [string, string][] = [
  ["Search", composeSearchNote()],
  ["the diary folder note", composeDiaryDashboardNote()],
  ["the journals folder note", composeJournalsDashboardNote()],
  ...(["weekly", "monthly", "quarterly", "yearly"] as const).map(
    (g): [string, string] => [`the ${g} dashboard`, composeDiaryDashboard(g)]
  ),
];

describe("every dashboard opens with its own name", () => {
  it("composes the head onto all seven", () => {
    // THE ASSERTION THE RELEASE IS. Seven, enumerated, so adding an eighth
    // dashboard without a head is a test that fails rather than a page a reader
    // finds.
    expect(HEADED).toHaveLength(7);
    for (const [name, text] of HEADED) {
      expect(text, name).toContain(PAGE_TITLE_LINE);
    }
  });

  it("puts it first, above everything the page holds", () => {
    // It names the page, so it sits above the things the page contains — and
    // `applyLayout` anchors its insert against the units that follow, so being
    // first in the catalogue is also what puts it at the top of a note that
    // predates it.
    for (const [name, text] of HEADED) {
      const head = text.indexOf(PAGE_TITLE_LINE);
      const firstFence = text.indexOf("```chronoanvil");
      expect(head, name).toBeGreaterThan(firstFence);
      // Nothing else opens a fence before it.
      expect(text.slice(0, head).match(/```chronoanvil/g), name).toHaveLength(1);
    }
  });

  it("draws exactly one, per page", () => {
    for (const [name, text] of HEADED) {
      expect(text.match(/^title$/gm), name).toHaveLength(1);
    }
  });
});

describe("what the head carries, and what it stopped carrying", () => {
  it("is drawn by livePageHead, which is what the directive dispatches to", () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE WHOLE THING. Everything else in
    // this file is about a head; this says WHICH head, by reading the one line
    // that decides it. `case "title"` has pointed here since 4.10.
    const dispatch = code("ui/widgets/index");
    const at = dispatch.indexOf('case "title":');
    expect(at).toBeGreaterThan(-1);
    expect(dispatch.slice(at, at + 120)).toContain(
      "livePageHead(this.plugin, ctx, wearsActions)"
    );
  });

  it("takes no argument, in the grammar and in the renderer alike", () => {
    // THE DIRECTIVE IS BARE SINCE 5.2. It carried `home,diary,journals` for
    // nine releases after the renderer stopped reading it — the dispatcher
    // passes `ctx` and nothing else, and `livePageHead` has no parameter to put
    // ids in even if one were passed.
    expect(PAGE_TITLE_LINE).toBe("title");
    expect(PAGE_TITLE_LINE).not.toContain(":");
    const head = code("ui/widgets/page-head");
    expect(head).toContain("export function livePageHead(");
    const sig = head.slice(head.indexOf("export function livePageHead("));
    expect(sig.slice(0, sig.indexOf(")"))).not.toContain("ids");
  });

  it("and the three destinations are still destinations, on request", () => {
    // WHAT DROPPING THE ROW DID AND DID NOT COST. `resolveTarget` is the one
    // table that answers "where does `diary` go", shared by `links:`, the
    // launcher and this head, and all three ids are still in it — so a reader
    // who wants that row writes `links:home,diary,journals` and gets it. What
    // is gone is a row composed by default, which had not been RENDERED since
    // 4.10 in any case.
    const links = readSrc("links");
    for (const id of ["home", "diary", "journals"]) {
      expect(links, id).toContain(`case "${id}":`);
    }
    // AND NOT "THE LAUNCHER ALREADY DRAWS THEM", WHICH IS WHAT THREE COMMENTS
    // IN THIS TREE CLAIMED AND 5.2 FOUND TO BE FALSE. The launcher's default is
    // the four PERIOD dashboards; it has never shipped a Diary or a Journals
    // tile unless a reader named one. The head's row was not redundant with it
    // — it was simply not drawn.
    expect([...LAUNCHER_DEFAULT]).toEqual(["week", "month", "quarter", "year"]);
  });

  it("draws no card, which is the whole of how it differs from what it replaced", () => {
    // `buildPageTitle` was a bordered, figured surface — the thing 98-page-head
    // argues against by name: *a note that opens with one more of them opens
    // with furniture.*
    //
    // THE WASH IS NOT A CARD, AND THIS TEST HAD TO LEARN THE DIFFERENCE (5.31.2).
    // It read `not.toContain("background:")`, which was a true statement about
    // the head until the spine and its tint stopped being conditional. What
    // "no card" actually means is what the three assertions below now say: no
    // corner, no elevation, and no opaque SURFACE under it — a gradient off the
    // spine leaves the page's own ground showing through, which a
    // `--background-secondary` fill would not.
    const head = ruleFor(".ca-journal-page-head");
    expect(head).not.toContain("border-radius");
    expect(head).not.toContain("box-shadow");
    expect(head).toContain("background: linear-gradient(");
    expect(head).not.toContain("var(--background-secondary)");
  });

  it("leaves no rule behind for the card it replaced", () => {
    // The stylesheet had thirteen `.ca-jtc-*` rules matching nothing. Deleted in
    // 5.2 with the module, and asserted here so a revert brings both or neither.
    expect(rules).not.toContain(".ca-jtc-");
  });
});

describe("every page composes the same head, the homepage included", () => {
  it("composes the bare directive there too", () => {
    // ── THE ARGUMENT, IN THREE MOVES ──────────────────────────────────
    //
    // 4.5–4.19: the homepage composed the BARE form and the other eight carried
    // ids, because the launcher is already on this page as content and ids here
    // would draw two of the same destinations twice on one screen.
    //
    // 4.20: reversed it, so the banner would mean the same thing on all nine
    // pages — a reader learns the banner once.
    //
    // 5.2: the ids went from all nine, because the head that drew them was
    // replaced in 4.10 and nothing had rendered them since. The banner still
    // means one thing everywhere, which is what 4.20 was actually after.
    const home = composeHomeNote(DEFAULT_PATHS.diaryRoot);
    expect(home).toMatch(/^title$/m);
    for (const [name, text] of HEADED) {
      expect(text, name).toMatch(/^title$/m);
    }
  });

  it("finds both spellings, and no frontmatter key", () => {
    // `locate` decides whether a section is PRESENT and where it sits. A reader
    // with a `title: My Page` property and no head would otherwise be told the
    // head is already there, and never offered one.
    expect(locateTitle("title")).toBe(0);
    expect(locateTitle(PAGE_TITLE_LINE)).toBe(0);
    expect(locateTitle("---\ntitle: My Page\n---\n")).toBe(-1);
    expect(locateTitle("---\ntitle: 2026\n---\n")).toBe(-1);
    // And it still finds a real one further down a note that has both.
    expect(locateTitle(`---\ntitle: My Page\n---\n\n${PAGE_TITLE_LINE}\n`)).toBeGreaterThan(0);
  });
});

describe("entries and journal notes were not touched", () => {
  it("compose no head", () => {
    // THE NEGATIVE CHECK THAT PROVES THE SCOPE. Both already rename the note
    // from their own banner — `entry-header` and `study-header` — so a head
    // above either is the page's name twice, which is the fault the homepage's
    // card was patched for in 4.5.1.
    for (const grain of TRACKER_CLASSES) {
      expect(composeEntryTemplate(grain), grain).not.toContain("title:");
      expect(composeEntryTemplate(grain), grain).not.toMatch(/^title$/m);
    }
  });

  it("and omit redundant in-note links banners in favor of Vault Banner", () => {
    for (const grain of TRACKER_CLASSES) {
      expect(composeEntryTemplate(grain), grain).not.toContain(
        "links:home,today,scopes#diary"
      );
    }
  });
});

describe("the head is drawn as the page, not as another card", () => {
  it("sits on the page's own ground, with a spine and one rule under it", () => {
    // NO CARD IS THE LOOK. Every other block on a note is a bordered surface,
    // and a note opening with one more of them opens with furniture. The head
    // takes the page's ground the way a heading does; what marks it is a spine
    // down the left edge and one rule under it, separating it from the first
    // block.
    const head = ruleFor(".ca-journal-page-head");
    // ── UNCONDITIONAL, WHICH IS THE 5.31.2 CHANGE ────────────────────
    //
    // The spine, the gutter and the wash were four gated selectors in
    // 99-aesthetic-presets.css, every one of them `[data-ca-grain]` or
    // `[data-ca-journal]`. `page-head.ts` writes neither on the Homepage, on
    // Search, on the Diary folder note, on a Logbook page or on the journals
    // root — six pages that drew a bold line of text over a hairline. The rule
    // is the HEAD'S now and the attributes only bind its colour.
    expect(head).toContain("border-left: var(--ca-head-spine) solid var(--ca-grain-spine)");
    expect(head).toContain("padding-left: 14px");
    // AND THE GATE IS GONE RATHER THAN WIDENED. What is left in the presets
    // file is the token BINDING — a custom property inherits, so a grain or a
    // journal reaches the head wherever the attribute landed, which is what the
    // four `[data-ca-grain] .ca-journal-page-head` descendant selectors were
    // doing by hand.
    const presets = sheet("99-aesthetic-presets");
    expect(presets).not.toContain("border-left: 3px solid var(--ca-grain-spine)");
    expect(presets).not.toContain(".ca-journal-page-head[data-ca-grain] .ca-jph-eyebrow");
    expect(presets).toContain('[data-ca-grain="daily"]');
  });

  it("grades the rule under it out of the spine's own colour", () => {
    // IT WAS `--background-modifier-border` — the same grey as every card edge
    // in the vault, so the head's one horizontal line belonged to nothing and
    // read as the top border of the block below it.
    const rule = ruleFor(".ca-journal-page-head::after");
    expect(rule).toContain("var(--ca-grain-spine)");
    expect(rule).toContain("linear-gradient(");
    expect(rule).toContain("height: var(--ca-rule-hair)");
    // AND IT REACHES UNDER THE SPINE. An absolutely positioned child is laid
    // out against the PADDING box, which starts on the far side of
    // `border-left`, so a rule at `left: 0` leaves the corner the mitred border
    // used to fill. One token is read by the border and by this pull-back —
    // that is the whole reason `--ca-head-spine` exists rather than a literal.
    expect(rule).toContain("left: calc(-1 * var(--ca-head-spine))");
    expect(ruleFor(".ca-journal-page-head")).toContain("var(--ca-head-spine)");
  });

  it("takes the wash off the spine rather than down from the top", () => {
    // `180deg` put the most colour along the head's TOP edge, where there is no
    // mark at all, and none of it beside the spine at the bottom, where the
    // mark is (5.31.2).
    const head = ruleFor(".ca-journal-page-head").replace(/\s+/g, " ");
    expect(head).toContain("background: linear-gradient( 90deg, var(--ca-grain-tint) 0%");
    expect(head).not.toContain("180deg");
  });

  it("carries the wash to the head's right edge instead of stopping short", () => {
    // *"the highlight blend fades out too soon before the right side."* The one
    // stop reached nothing by 62%, which on the reported 696px card was gone by
    // x=452 — two thirds of a wide head was flat ground and the colour read as a
    // stain in the corner. Two stops now: the ramp off the spine is the one it
    // always was, and it lands on half the tint at 58% and rides that out.
    const head = ruleFor(".ca-journal-page-head").replace(/\s+/g, " ");
    expect(head).toContain("transparent 100%");
    expect(head).not.toContain("transparent 62%");
    expect(head).toContain("color-mix(in srgb, var(--ca-grain-tint) 52%, transparent) 58%");
    // NOTHING NEAR THE SPINE MOVES, which is what keeps the four heads the
    // reader has already signed off at the density they were signed off at: the
    // first stop is unchanged in both value and position.
    expect(head).toContain("var(--ca-grain-tint) 0%");
  });

  it("gives the eyebrow room to read as a label over a name", () => {
    // 2px between a 0.7em cap line and the name below it reads as one clump
    // (5.31.2). The name steps up with it, and its rename input steps up too —
    // the input draws in place, on the title's own metrics, so a size on one
    // and not the other is a row that jumps the moment it is clicked.
    expect(ruleFor(".ca-journal-page-head")).toContain("gap: 6px");
    expect(ruleFor(".ca-journal-page-head .ca-jph-title")).toContain(
      "font-size: var(--ca-head-title-size)"
    );
    expect(ruleFor(".ca-journal-page-head .ca-jph-title-input")).toContain(
      "font-size: var(--ca-head-title-size)"
    );
  });

  it("keeps the face Obsidian's inline title had, one step up", () => {
    // It stands in that title's place, so a reader should not be able to tell
    // anything moved — except that this one knows what the note is and can be
    // clicked.
    //
    // `--ca-head-title-size` RATHER THAN `--ca-text-xl` (5.31.2), and the token is
    // new rather than the old one widened: `--ca-text-xl` is also the ENTRY
    // header's title and its rename input, and that is a band inside a card
    // where this is a page naming itself. Two rules that must not agree need
    // two numbers — see `00-tokens.css`.
    const title = ruleFor(".ca-journal-page-head .ca-jph-title");
    expect(title).toContain("var(--ca-head-title-size)");
    expect(title).toContain("cursor: text");
    expect(sheet("00-tokens")).toContain("--ca-head-title-size:");
    // The entry header did NOT move with it.
    expect(sheet("50-entry-header")).toContain("var(--ca-text-xl)");
    expect(sheet("50-entry-header")).not.toContain("--ca-head-title-size");
  });

  it("takes no text cursor on a name the reader did not type", () => {
    // A period dashboard's head prints *August 2026* — a fact about which
    // window the page is on, not a name anyone owns.
    expect(ruleFor(".ca-journal-page-head .ca-jph-title.is-fixed")).toContain(
      "cursor: default"
    );
  });

  it("sets its eyebrow in the caps voice every key label uses", () => {
    const eyebrow = ruleFor(".ca-journal-page-head .ca-jph-eyebrow");
    expect(eyebrow).toContain("var(--ca-caps-weight)");
    expect(eyebrow).toContain("var(--ca-caps-tracking)");
    expect(eyebrow).toContain("var(--ca-text-2xs)");
  });

  it("hides Obsidian's own title wherever a banner already draws the name", () => {
    // `.ca-journal-banner-name` is the anchor. `.ca-jtc-card` was the other half
    // of this selector and left in 5.2 with the widget that drew it — it had
    // been matching nothing since 4.10, so the anchor that was doing the work is
    // the one that remains.
    expect(rules).toContain(":has(.ca-journal-banner-name) .inline-title");
    expect(rules).not.toContain(".ca-jtc-card");
  });
});

// ── the head cannot be moved (4.11) ───────────────────────────────────
//
// The section editor's half is asserted in home-sections, search-sections and
// dashboard-sections — the flag, the arrows and the plan. This is the PAGE's
// half, which has no DOM to test in: the drag is a gesture the suite cannot make,
// so what is checked is the one fact the gesture is derived from and the shape of
// the gate it feeds.
describe("nothing on the page can pick the head up", () => {
  it("computes which lines are fixed from the fence's own numbering", () => {
    // `lineAt` is the numbering taken on the way into the SAME filter every
    // directive is read through, so a `frame:` line or a comment above the head
    // cannot shift it. A predicate over the raw text inside block-drag.ts would
    // have to recount past both.
    const w = code("widgets");
    // READ FROM WHAT WILL BE DRAWN, not from every line the fence holds
    // (4.51.1). A suppressed banner's `title` line is no longer in the block, so
    // pinning a position it does not occupy would fix the widget that took its
    // place.
    //
    // AND IT ASKS `isPageHeadLine`, NOT `isTitleLine` (5.28). 5.11 established
    // that a page carries its own name under three keywords — `title`,
    // `journal-header`, `entry-header` — and fixed the three refusals keyed on
    // the first alone. This was the fourth: a journal note's banner and a diary
    // entry's are page heads, pinned in the section editor and draggable on the
    // page, which a vault caught the moment the stack put the grip on a welded
    // section's title bar instead of on the banner's own edge.
    expect(w).toContain(
      "drawable.filter(({ l }) => isPageHeadLine(l)).map(({ at }) => at)"
    );
    // `fixed` is still the last thing computed from `kept` and is still passed
    // straight through; 4.12 added `sectionFence` after it, computed in the same
    // place for the same reason — the dispatcher is holding the fence's lines and
    // block-drag would have to infer the fact from rendered children.
    expect(w).toMatch(/attachBlockHead\([\s\S]{0,250}?fixed,\s*\n?\s*sectionFence\s*\n?\s*\)/);
  });

  it("withholds every gesture from one gate rather than six guards", () => {
    // The grip, the two block slots, the two side quarters, the per-widget slots
    // and the resize divider are all below this line. Naming them one at a time
    // is six places to forget the seventh — the shape `bandOf` already refuses in
    // the editor.
    const b = code("block-drag");
    const gate = b.indexOf("if (fixed.length) return;");
    expect(gate).toBeGreaterThan(0);
    // AFTER the head is drawn and after `boundsOf`: a name is true in an embed,
    // and only the gesture is being declined.
    expect(b.indexOf("buildHead(container, title)")).toBeLessThan(gate);
    expect(b.indexOf("if (!boundsOf(ctx, container)) return;")).toBeLessThan(gate);
    // and before every one of them.
    // The CALL SITES, not the definitions — `attachGrip`, `makeSlot` and
    // `makeSource` are all declared near the top of the file and would pass this
    // by accident. That is why the last entry is where the grip factory is
    // INSTANTIATED rather than the `attachGrip` line inside it: the line moved
    // above the gate in 5.2 when `source` was lifted out of this function, and
    // the fact being asserted — no grip without the gate — did not.
    for (const after of [
      "ca-jbd-slot-above",
      "ca-jbd-slot-side ca-jbd-slot-side-left",
      "Drag to move this block",
      "const source = makeSource(",
    ]) {
      expect(b.indexOf(after), after).toBeGreaterThan(gate);
    }
  });

  it("asks the fence body a different question than the note (on purpose)", () => {
    // `locateTitle` searches a WHOLE NOTE, frontmatter included, so it must tell
    // `title:home,diary,journals` from a reader's `title: My Page` property.
    // `isTitleLine` is asked of a line already inside a ```chronoanvil fence, where
    // no YAML property can occur, and it has to agree with `splitDirective` —
    // which is how every other keyword in the dispatcher is read.
    expect(isTitleLine("title")).toBe(true);
    expect(isTitleLine("title:home,diary,journals")).toBe(true);
    expect(isTitleLine("title-something")).toBe(false);
    expect(isTitleLine("tasks-table:,period")).toBe(false);
    // The disagreement, stated as a test so nobody "fixes" it into one rule.
    expect(isTitleLine("title: My Page")).toBe(true);
    expect(locateTitle("title: My Page")).toBe(-1);
  });
});


// ── the level rail (1.1) ──────────────────────────────────────────────────
//
// THE EYEBROW WAS THE ONLY THING SEPARATING THREE PAGES. A journal home, an
// area index and a project index draw the same wash, the same spine and the same
// title face, and differed by one word — `PROJECTS · JOURNAL` against `PROJECTS ·
// AREA` against `PROJECTS · PROJECT` — set at 0.7em in the same accent as the
// word beside it. The rail says the same thing as a position instead, and says
// two things the eyebrow could not: how deep the journal goes, and whether there
// is a layer below this one.
//
// `railFor` IS PURE AND TAKES THE TYPE, so these are real assertions about the
// decision rather than source-text about the wiring. The wiring — which file
// gets asked, and that the eyebrow is what it replaces — is at the bottom.

const PROJECTS = buildJournalType(PROJECTS_CONFIG);

describe("which layer the rail says you are on", () => {
  it("has a step per level, with the journal itself first", () => {
    // The journal's own name is what lets the rail REPLACE the eyebrow rather
    // than sit beside it: `Projects` was the eyebrow's first half.
    const rail = railFor(PROJECTS, true, null);
    expect(rail?.steps).toEqual(["Projects", "Area", "Project"]);
  });

  it("puts the journal's own note on the first step", () => {
    expect(railFor(PROJECTS, true, null)?.here).toBe(0);
  });

  it("reads the layer off the note's own type, not off its path", () => {
    // `JournalLevel.id` IS the `type:` value an index note at that depth carries,
    // so the note states its own layer and `containerDepth` would be a second
    // derivation of a written-down fact.
    expect(railFor(PROJECTS, false, "area")?.here).toBe(1);
    expect(railFor(PROJECTS, false, "project")?.here).toBe(2);
  });

  it("marks exactly one step, and it is in range", () => {
    for (const value of ["area", "project"]) {
      const rail = railFor(PROJECTS, false, value)!;
      expect(rail.here).toBeGreaterThanOrEqual(0);
      expect(rail.here).toBeLessThan(rail.steps.length);
    }
  });

  it("counts the journal's levels rather than assuming two", () => {
    // Study is two-level like Projects; a flat journal must draw two steps, not
    // three, and nothing here may hard-code a depth.
    expect(railFor(STUDY_JOURNAL, true, null)?.steps).toEqual([
      "Study",
      "Subject",
      "Topic",
    ]);
    const flat = buildJournalType({
      ...PROJECTS_CONFIG,
      levels: [PROJECTS_CONFIG.levels[0]],
    });
    expect(railFor(flat, true, null)?.steps).toEqual(["Projects", "Area"]);
    expect(railFor(flat, false, "area")?.here).toBe(1);
  });

  it("draws nothing for a note that is not a layer", () => {
    // A leaf and a page are what the layers HOLD. The reader was offered the
    // rail on them and did not take it, so an Update keeps the eyebrow naming
    // its kind.
    expect(railFor(PROJECTS, false, "update")).toBeNull();
    expect(railFor(PROJECTS, false, "decision")).toBeNull();
    expect(railFor(PROJECTS, false, "page")).toBeNull();
    // And a note carrying nothing at all is a stray, not a guess.
    expect(railFor(PROJECTS, false, null)).toBeNull();
    expect(railFor(PROJECTS, false, "")).toBeNull();
  });
});

describe("where the rail is drawn, and what it replaces", () => {
  const head = () => code("page-head");

  it("stands where the eyebrow stood, and only one of the two draws", () => {
    expect(head()).toContain("if (rail) buildRail(root, rail);");
    expect(head()).toContain(
      "else if (said.eyebrow) buildEyebrow(app, root, said, ctx.sourcePath);"
    );
  });

  it("leaves what the head SAYS exactly as it was", () => {
    // THE ONE CONSTRAINT. `pageHeadSays` splits the eyebrow on `·` so the
    // tracker card's context strip can withhold what the head already states,
    // and `study-header.ts` records the defect from the two disagreeing — the
    // true half of the strip suppressed and a fabricated level left showing. So
    // the rail changes what the head DRAWS and `eyebrowFor` is untouched.
    const src = head();
    expect(src).toContain("return `${type.name} · Journal`;");
    expect(src).toContain(
      "return named ? `${type.name} · ${named}` : type.name;"
    );
    // The predicate reads the text, never the rail.
    expect(src).toContain("const eyebrow = pageHeadText(plugin, file)?.eyebrow;");
    expect(src).not.toContain("railFor(plugin");
  });

  it("asks the lenient resolver, because a journal's own note declares nothing", () => {
    expect(head()).toContain("journalTypeAtPath(plugin, file.path)");
    expect(head()).toContain("file.path === folderNotePath(type.root)");
  });

  it("is not a second set of breadcrumbs", () => {
    // Obsidian's own trail sits directly above the note and goes to every one of
    // these folders already.
    //
    // ── SCOPED TO THE RAIL IN 1.0.38, BECAUSE THE HEAD GREW A LINK ────────
    //
    // This used to sweep the whole file, and the sweep was standing in for the
    // rail because the rail was the only thing in it that could have drawn one.
    // A page's eyebrow names the note it is a page OF and that name IS a link,
    // so the file-wide version would now forbid the feature rather than the
    // duplication. The argument was never about the file: it is that the RAIL's
    // steps are FOLDERS, and the trail above the note already goes to all of
    // them. A parent note is not on that trail as a destination the eyebrow
    // duplicates — it is the one fact the page did not carry at all.
    const rail = fnBody("buildRail", "page-head");
    expect(rail).not.toContain('createEl("a"');
    expect(rail).not.toContain("openFile(");
  });

  it("gives the parent every gesture the plugin's other links have", () => {
    // 1.0.30's finding, and the reason it is a checklist rather than a habit: a
    // link wearing `internal-link` and none of the behaviour is WORSE than a
    // plain one, because it looks like it should work. Obsidian's own handlers
    // are bound to the note's rendered markdown, not to chrome a plugin builds.
    const src = fnBody("buildEyebrow", "page-head");
    expect(src).toContain('cls: "internal-link ca-jph-parent"');
    expect(src).toContain("void openFile(app, file);");
    expect(src).toContain("attachFileGestures(app, a, file);");
    expect(src).toContain('"hover-link"');
    // The whole name on hover, since the CSS clips it.
    expect(src).toContain('title: parent.label');
  });

  it("prints the parent as text when there is no file to point at", () => {
    // `journalCrumbs`' rule since 4.36: a crumb with no file is text, never a
    // dead link. The `parent:` fallback is exactly that case — it is a NAME,
    // written at creation, not a resolution.
    const src = fnBody("buildEyebrow", "page-head");
    const text = src.indexOf('el.createSpan({ cls: "ca-jph-parent"');
    expect(text).toBeGreaterThan(0);
    expect(text).toBeLessThan(src.indexOf('createEl("a"'));
  });
});

describe("the parent, named in the eyebrow (1.0.38)", () => {
  // THE BUG REPORT WAS A LINE OF PROSE. On a page of a cheatsheet the head read
  // `STUDY · PAGE` and stopped, so the reader typed **Parent page:** and the
  // cheatsheet's name into the page's own body by hand. The plugin knew that
  // fact and was not printing it.

  it("joins the parent on in one place, and only one", () => {
    // The composition is what keeps `eyebrow` a plain string. Two callers SPLIT
    // it — `pageHeadSays` on `·` — so a richer shape would move that predicate's
    // work into each of them, which is the failure `PageHeadText`'s own header
    // is about.
    const src = fnBody("headEyebrow", "page-head");
    expect(src).toContain("const text = eyebrowFor(plugin, file, surface);");
    expect(src).toContain("`${text} of ${parent.label}`");
    // eyebrowFor itself is untouched — asserted next door, and this is the half
    // that makes that true: nothing below composes a second time.
    expect(code("page-head").split("} of ${").length).toBe(2);
  });

  it("asks `resolveUp`, which was already right at any depth", () => {
    // `core/links.ts` has answered "which folder note is one step up" since 2.x
    // for the bar's **Up** pill, in terms of THIS note's folder rather than the
    // journal's shape. That is why nesting cost the head nothing.
    const src = fnBody("pageParentOf", "page-head");
    expect(src).toContain("const up = resolveUp(plugin.app, file);");
    expect(src).toContain("return { label: up.file.basename, file: up.file };");
    expect(readSrc("links")).toContain("export function resolveUp(");
  });

  it("falls back to `parent:`, which is the first reader that property has had", () => {
    // `journal-template.ts` calls it *"the ONLY thing tying a page to the note
    // it is a page of"*, and until this release NOTHING in src/ read it. It is
    // written at creation, so it names the note that held the page then — right
    // when the folder note is missing, wrong when the page has been moved.
    // Hence second, and hence unlinked.
    const src = fnBody("pageParentOf", "page-head");
    expect(src).toContain('frontmatterOf(plugin.app, file)["parent"]');
    expect(src).toContain("file: null");
    // An unfilled template token is not a name: the page TEMPLATE carries the
    // literal `{{parent}}`, lives under the journal root and declares a page's
    // `type:`, so a reader editing it would meet `PAGE OF {{PARENT}}`.
    expect(src).toContain('!label.includes("{{")');
  });

  it("asks it on a page and on nothing else", () => {
    // A leaf's parent is the index above it and an index's is the journal —
    // both already named by the rail and by the bar's trail. Naming either would
    // be the doubling this head exists to remove.
    const src = fnBody("pageParentOf", "page-head");
    expect(src).toContain('if (surface !== "journal") return null;');
    expect(src).toContain("type.kinds.some((k) => k.pages.id === value)");
  });

  it("keeps the line to one row and clips its end, not a flex item", () => {
    // `HTML ↔ CSS Pointers & Syntax Cheatsheet` is a real note name from the
    // vault this was written for. At 0.7em in caps it wraps the head's top line
    // into two — the line the whole head is measured from.
    //
    // ── AND IT IS NOT A FLEX ROW, WHICH IS THE POINT OF THIS TEST ────────
    //
    // It was, and the vault render read **PAGE OFHTML ↔ CSS…**: the lead text
    // ends in the space before the name, and a flex item's trailing whitespace
    // is stripped at the end of its line box. The markup was right and could not
    // have shown it. Plain inline content keeps the space, and `text-overflow`
    // works on a block with inline children — the name is always LAST, so
    // clipping the line clips the name and nothing else.
    const eyebrow = ruleFor(".ca-journal-page-head .ca-jph-eyebrow");
    expect(eyebrow).not.toContain("display: flex");
    expect(eyebrow).toContain("text-overflow: ellipsis");
    expect(eyebrow).toContain("white-space: nowrap");
    expect(eyebrow).toContain("overflow: hidden");
    // Not a second accent on the head's top line: that would make the parent
    // louder than the note the reader is actually on.
    const parent = ruleFor(
      ".ca-journal-page-head .ca-jph-eyebrow .ca-jph-parent"
    );
    expect(parent).toContain("color: inherit");
  });

  it("still lets the strip suppress a fact the head now says twice over", () => {
    // `pageHeadSays` compares whole segments, and a page's segment reads
    // `Page of <name>`. An exact match would answer NO to "does the head say
    // Page?" on the one surface where it plainly does.
    const src = fnBody("pageHeadSays", "page-head");
    expect(src).toContain("seg === want || seg.startsWith(`${want} of `)");
  });
});

describe("how the rail reads", () => {
  it("speaks in the voice the eyebrow spoke in", () => {
    // Still the head's top line. What changed is what the line is made of, and
    // it should not announce itself as a new component.
    const rail = ruleFor(".ca-journal-page-head .ca-jph-rail");
    expect(rail).toContain("var(--ca-text-2xs)");
    expect(rail).toContain("var(--ca-caps-weight)");
    expect(rail).toContain("var(--ca-caps-tracking)");
    expect(rail).toContain("text-transform: uppercase");
  });

  it("tells the three states apart by shape, not only by ink", () => {
    // This sheet's standing rule. The dot is filled behind, filled-and-ringed
    // here, hollow ahead — so the rail survives a monochrome theme.
    const here = ruleFor(
      ".ca-journal-page-head .ca-jph-step.is-here .ca-jph-step-dot"
    );
    const ahead = ruleFor(
      ".ca-journal-page-head .ca-jph-step.is-ahead .ca-jph-step-dot"
    );
    expect(here).toContain("box-shadow: 0 0 0");
    expect(ahead).toContain("background: transparent");
    expect(ahead).toContain("inset 0 0 0");
  });

  it("draws the connector from the step rather than as an element", () => {
    // Three layers is three elements, and the last step needs no case of its own
    // beyond not having a connector.
    expect(
      ruleFor(".ca-journal-page-head .ca-jph-step:not(:last-child)::after")
    ).toContain('content: ""');
    expect(code("page-head")).not.toContain("ca-jph-step-line");
  });

  it("takes its marker size from a token, so no state can wobble", () => {
    expect(
      ruleFor(".ca-journal-page-head .ca-jph-step-dot")
    ).toContain("var(--ca-dot-size)");
    expect(sheet("00-tokens")).toContain("--ca-dot-size:");
  });
});

describe("the journal's colour reaches the wash, not just the spine", () => {
  it("sets both halves of the accent", () => {
    // `--ca-grain-tint` is an `rgba()` over the CHANNELS, so setting only the
    // colour left the spine and the label taking the journal's own hue while the
    // wash behind them fell through to the vault accent — every journal in the
    // vault washing the same purple, on the surface whose job is to say which
    // journal this is.
    for (const name of ["page-head", "vault-banner"]) {
      const src = code(name);
      expect(src, name).toContain("journalAccent(type.id)");
      expect(src, name).toContain('"--ca-journal-accent-rgb"');
    }
  });

  it("names the hue once, where the two readers can share it", () => {
    // `hsl(…, 65%, 55%)` was written out in both files, which is how two copies
    // of one colour drift the first time either is tuned.
    expect(code("journal")).toContain("css: `hsl(${h}, ${ACCENT_S * 100}%");
    expect(code("page-head")).not.toContain("65%, 55%");
    expect(code("vault-banner")).not.toContain("65%, 55%");
  });
});
