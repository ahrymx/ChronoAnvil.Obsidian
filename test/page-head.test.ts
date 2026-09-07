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
import { readCss, readSrc, styleSheets } from "./sources";
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
    expect(dispatch.slice(at, at + 120)).toContain("livePageHead(this.plugin, ctx)");
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
