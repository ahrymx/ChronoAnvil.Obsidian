// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The block modifier — 4.1 §3 to §5.
//
// WHAT IS ASSERTED HERE AND WHERE IT LIVES. The suite has no DOM, so the two
// halves of this feature are pinned at the seams that are pure: `parseFrame`
// decides what a fence said, and `chromeClasses` decides what that means for
// the block's classes. Both were separated out of the processor for exactly
// this reason — §4 lists five things a change of frame is likely to quietly
// break, and every one of them is a rule rather than a rendering.
//
// The CSS half is asserted against the stylesheet, because §5's decision is a
// decision about SELECTORS: one class covering everything the block can hold,
// rather than one per widget. That shape cannot be checked any other way, and
// it is the one most likely to drift back.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAME,
  hasSectionBar,
  hasTitledBar,
  isFrameLine,
  isHeaderLine,
  isSectionFence,
  parseFrame,
} from "../src/core/directive-grammar";
import { chromeClasses } from "../src/ui/widgets/index";
import { readCss, readSrc } from "./sources";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";

// A note's fences, as the lines inside each one. The processor is handed one
// fence at a time, so a check that reads a whole note is checking something the
// plugin never sees — which is how the first version of the last test in this
// file reported two `frame:` lines in a note whose fences have one each.
const fencesOf = (note: string): string[][] => {
  const out: string[][] = [];
  let open: string[] | null = null;
  for (const line of note.split("\n")) {
    if (line.startsWith("```")) {
      if (open) {
        out.push(open);
        open = null;
      } else if (line.startsWith("```chronoanvil")) {
        open = [];
      }
      continue;
    }
    open?.push(line.trim());
  }
  return out;
};

describe("all three values parse", () => {
  it("reads each one off its own line", () => {
    for (const value of ["card", "section", "none"] as const) {
      expect(parseFrame([`frame: ${value}`, "calendar"]), value).toEqual({
        frame: value,
        error: null,
      });
    }
  });

  it("defaults to card when there is no frame line", () => {
    // THE PROPERTY THAT MAKES THIS A MINOR. A fence with no `frame:` line
    // renders exactly as it did before the modifier existed.
    expect(parseFrame(["calendar"])).toEqual({ frame: "card", error: null });
    expect(DEFAULT_FRAME).toBe("card");
  });

  it("tolerates the spacing a reader actually types", () => {
    expect(parseFrame(["frame:none"]).frame).toBe("none");
    expect(parseFrame(["frame:   none   "]).frame).toBe("none");
  });

  it("does not care where in the fence the line sits", () => {
    // Read before the loop rather than in it, so it is a property of the block
    // rather than of the directive it happens to precede.
    expect(parseFrame(["calendar", "frame: none"]).frame).toBe("none");
  });

  it("refuses a value that is not a frame, and says what is", () => {
    const { frame, error } = parseFrame(["frame: naked", "calendar"]);
    expect(frame).toBe("card");
    expect(error).toContain("card, section, none");
  });

  it("refuses an empty value rather than guessing", () => {
    expect(parseFrame(["frame:", "calendar"]).error).toBeTruthy();
  });

  it("matches the keyword exactly, so a future directive is not swallowed", () => {
    expect(isFrameLine("frame: none")).toBe(true);
    expect(isFrameLine("frame-of-reference: x")).toBe(false);
    expect(isFrameLine("calendar")).toBe(false);
  });
});

describe("a fence that asked twice is refused, not resolved", () => {
  it("allows header: and frame: section together", () => {
    const { frame, error } = parseFrame([
      "header:🗓 This month",
      "frame: section",
      "month-summary",
    ]);
    expect(error).toBeNull();
    expect(frame).toBe("section");
  });

  it("allows header: with frame: none, which is the composed-dashboard case", () => {
    // §3.3: one bar owning the blocks after it, no card underneath. This is the
    // pairing Part II's catalogues would compose, so refusing it would refuse
    // the feature's main use.
    expect(
      parseFrame(["header:🗓 This month", "frame: none", "month-summary"])
    ).toEqual({ frame: "none", error: null });
  });

  it("allows an untitled header: with frame: section", () => {
    // An untitled `header:` is a control strip anchoring buttons under a real
    // markdown heading — it draws no title, so it is not competing to title
    // anything and there is no contradiction to refuse.
    expect(parseFrame(["header:", "frame: section", "calendar"]).error).toBeNull();
  });

  it("refuses two frame lines on the same argument", () => {
    const { error } = parseFrame(["frame: none", "frame: section", "calendar"]);
    expect(error).toContain("2 frame: lines");
  });
});

describe("what each frame does to the block's classes", () => {
  const drew = {
    entryBanner: false,
    overviewCard: true,
    studyBanner: false,
  };

  it("card is the default and keeps every composite class", () => {
    expect(chromeClasses("card", drew)).toEqual(["ca-journal-overview-card"]);
    expect(
      chromeClasses("card", {
        entryBanner: true,
        overviewCard: true,
        studyBanner: true,
      })
    ).toEqual([
      "ca-journal-entry-banner",
      "ca-journal-overview-card",
      "ca-journal-study-banner",
      // TWO BANNERS, NOT FOUR (4.21.1). The two slim banners share every rule
      // about the card they draw and the two bands in it, so they share the
      // class those rules are written against. The specific classes survive
      // beside it for what genuinely differs — an entry welds a links card into
      // the band, a leaf does not.
      "ca-journal-slim-banner",
    ]);
  });

  it("gives both slim banners the shared class and the page banner none of it", () => {
    // THE RULE THIS PINS is the one 4.21.1 exists for: a change to how a note
    // you write in identifies itself cannot reach one page kind without
    // reaching the other. Asserted from each side alone, because the failure
    // that mattered was a fix applied to the surface it was reported on.
    const only = (drewOne: Record<string, boolean>): string[] =>
      chromeClasses("card", {
        entryBanner: false,
        overviewCard: false,
        studyBanner: false,
        pageBanner: false,
        trackerSection: false,
        ...drewOne,
      });
    expect(only({ entryBanner: true })).toContain("ca-journal-slim-banner");
    expect(only({ studyBanner: true })).toContain("ca-journal-slim-banner");
    // AND THE LARGE ONE IS NOT SLIM. A page you navigate to announces itself
    // with the wash and the hatch; a note you write in does not announce itself
    // at all. Sharing the class would give a dashboard the tight card.
    expect(only({ pageBanner: true })).not.toContain("ca-journal-slim-banner");
  });

  it("section and none both withhold every composite class", () => {
    // The three cards are what §4 says both non-default frames remove, and the
    // assertion is on ALL of them rather than the one the dashboard happens to
    // draw — a frame that stripped the overview card and left the entry banner
    // would look right on the page this was built for and wrong everywhere.
    for (const frame of ["section", "none"] as const) {
      const out = chromeClasses(frame, {
        entryBanner: true,
        overviewCard: true,
        studyBanner: true,
      });
      expect(out, frame).not.toContain("ca-journal-entry-banner");
      expect(out, frame).not.toContain("ca-journal-overview-card");
      expect(out, frame).not.toContain("ca-journal-study-banner");
    }
  });

  it("gives section and none the same one class", () => {
    // §5: `frame: section` needs no class of its own. It withholds the
    // composite modifier and adds `is-unframed` exactly as `none` does, then
    // puts the block inside a section body. Two values, one selector.
    expect(chromeClasses("section", drew)).toEqual(["is-unframed"]);
    expect(chromeClasses("none", drew)).toEqual(["is-unframed"]);
  });

  it("never touches the block's own class, whatever the frame", () => {
    // `container-type: inline-size` lives on `.ca-journal-widget-block`, and it is
    // the one rule that has to survive all three frames — lose it and every
    // `@container` rule in styles/ stops matching, so the tracker grid stops
    // collapsing. The class is applied at creation and no frame may remove it.
    for (const frame of ["card", "section", "none"] as const) {
      expect(chromeClasses(frame, drew), frame).not.toContain(
        "journal-widget-block"
      );
    }
  });
});

describe("the CSS is one class, not one per widget", () => {
  const css = readCss();
  // Comments stripped, because the rejected shape is NAMED in a comment in
  // 05-inline-widgets.css — the argument against it is written where the rule
  // that replaced it lives. Matching raw text would fail on the explanation.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("has no per-widget standalone class", () => {
    // THE SHAPE §5 CHOSE AGAINST, PINNED SO IT CANNOT DRIFT BACK. The rejected
    // design adds `.journal-calendar-standalone`, `.journal-activity-standalone`
    // and `.journal-habits-standalone` — three classes for one idea, and three
    // places to forget the fourth widget.
    expect(rules).not.toMatch(/\.journal-[a-z-]+-standalone\b/);
  });

  it("keys the unframed rules off the block", () => {
    expect(rules).toContain(".ca-journal-widget-block.is-unframed");
  });

  it("does not override container-type in the unframed rule", () => {
    // §4's easiest-to-lose rule, asserted on the text because the rule IS the
    // text: the unframed block must give up its background, border, padding,
    // margin and shadow, and nothing else.
    const at = rules.indexOf(".ca-journal-widget-block.is-unframed {");
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("background: none");
    expect(rule).toContain("border: none");
    expect(rule).not.toContain("container-type");
    expect(rule).not.toContain("width");
  });

  it("keeps container-type on the block itself", () => {
    expect(rules).toMatch(/\.ca-journal-widget-block\s*\{[^}]*container-type:\s*inline-size/);
  });

  it("hides only the body when a self-titled section folds", () => {
    // A section that folded itself away entirely would leave a reader nothing
    // to click to get it back.
    expect(rules).toContain(".ca-journal-sec-fold.is-collapsed > .ca-journal-sec-fold-body");
  });

  it("gives the section a surface, not just a bar", () => {
    // THE REGRESSION THIS PINS. `frame: section` shipped withholding the
    // composite card — correctly — and relying on the block surface to replace
    // it. It never arrived: `.ca-journal-sec-block` is applied by `claimOwnBlock`
    // and `markSectionBodies`, which run for `HeaderBar` instances only, and a
    // children-owning section registers none (carrying `.ca-journal-header-bar`
    // would make an enclosing dashboard fold the wrong scope).
    //
    // So the widget rendered with a title bar, no background, no border and no
    // padding, wider than every section around it — §3.1's "nothing replaces
    // it" reached by a second route. A frame that supplies a bar and no surface
    // has done half its job, and the half it skipped is the visible one.
    const at = rules.indexOf(".ca-journal-sec-fold {");
    expect(at, ".ca-journal-sec-fold has no rule at all").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("background:");
    expect(rule).toContain("border:");
    expect(rule).toContain("padding:");
  });

  it("does not hide the band's layout behind the card class", () => {
    // THE THIRD REGRESSION, AND THE ONE WITH A GENERAL SHAPE. `.ca-job-head` is a
    // wrapping flex row, so the `.ca-job-text` inside it is a flex item and
    // shrink-to-fits; `display: block` is what makes it a full-width column and
    // lets the stat strip — a grid — fill the band. That declaration lived
    // under `.ca-journal-overview-card`, which was a reliable proxy for "a period
    // summary is here" only for as long as a summary always took the card.
    //
    // `frame: section` broke the proxy, and the strip collapsed to about a
    // third of the band on a page where nothing about the frame was meant to
    // touch the layout. A selector scoped to a FRAME class must be about the
    // frame; this one was about the band.
    expect(rules).toContain(".ca-journal-overview-banner .ca-job-head");
    expect(rules).not.toContain(
      ".ca-journal-overview-card .ca-journal-overview-banner .ca-job-head"
    );
  });

  it("cancels the band's bleed when the padding it cancels is gone", () => {
    // `.ca-journal-overview-banner` carries a negative margin to run to the edges
    // of the card's padding. `is-unframed` removes that padding, so the margin
    // has nothing to cancel and the band hangs outside the section. A margin
    // that exists to cancel a padding has to go with it.
    const at = rules.indexOf(
      ".ca-journal-widget-block.is-unframed .ca-journal-overview-banner"
    );
    expect(at).toBeGreaterThan(-1);
    expect(rules.slice(at, rules.indexOf("}", at))).toContain("margin: 0");
  });

  it("resolves to the same left edge as a header: section", () => {
    // §1.6's rule: a `frame: section` and a `header:` section side by side on
    // one page must agree about where their content starts, or the whole column
    // reads as ragged. Both name the inset rather than repeating a number.
    const fold = rules.slice(
      rules.indexOf(".ca-journal-sec-fold {"),
      rules.indexOf("}", rules.indexOf(".ca-journal-sec-fold {"))
    );
    const block = rules.slice(
      rules.indexOf(".ca-journal-sec-block {"),
      rules.indexOf("}", rules.indexOf(".ca-journal-sec-block {"))
    );
    expect(fold).toContain("--ca-sec-pad-x: 12px");
    expect(block).toContain("--ca-sec-pad-x: 12px");
  });
});

describe("the section frame is reused, not rebuilt", () => {
  const frameSrc = readSrc("section-frame");

  it("builds the foldable section on sectionFrame", () => {
    // §11 refuses "a second section component" — a new wrapper styled to look
    // like a section is how this codebase grew 39 header-shaped components.
    expect(frameSrc).toContain("export function foldableSection(");
    expect(frameSrc).toMatch(/foldableSection[\s\S]{0,600}sectionFrame\(/);
  });

  it("passes owns: children, so the fold walk cannot find it", () => {
    // §3.2 AND §4. Give an inner section the `.ca-journal-header-bar` class and
    // the fold walk finds it as a descendant, reads the block's level off it,
    // and the enclosing dashboard folds the wrong scope. That does not LOOK
    // wrong, which is why it is asserted rather than eyeballed.
    expect(frameSrc).toMatch(/foldableSection[\s\S]{0,600}owns: "children"/);
  });

  it("takes a store rather than the plugin, so it stays importable", () => {
    // section-frame.ts is imported by widgets.ts, which imports half the
    // plugin. Taking `ChronoAnvilPlugin` here would be the import cycle that put
    // `makeFoldable` inside journals-section.ts in the first place.
    const imports = frameSrc
      .split("\n")
      .filter((l) => l.startsWith("import "))
      .join("\n");
    expect(imports).not.toContain("ChronoAnvilPlugin");
    expect(imports).not.toContain("../main");
    expect(frameSrc).toContain("export interface FoldStore");
  });
});

describe("the diary dashboard uses it", () => {
  const note = composeDiaryDashboardNote();

  it("frames the two card widgets as sections", () => {
    // The two blocks that stood bare and could not be folded. This is the
    // change the modifier was built for, so it is asserted on the composed
    // note rather than only on the catalogue.
    expect(note).toContain("frame: section\ndiary:3");
    expect(note).toContain("frame: section\nmonth-summary");
  });

  it("never pairs frame: section with a header bar", () => {
    // The grammar refuses it; this asserts the catalogue does not write the
    // refusal into a shipped page, which would put an error on a new vault's
    // dashboard.
    for (const block of note.split("```chronoanvil")) {
      if (!block.includes("frame: section")) continue;
      expect(block).not.toMatch(/^header:\S/m);
    }
    // Per fence, which is how the processor reads it — a note has many
    // blocks and each one answers for itself.
    for (const fence of fencesOf(note)) {
      expect(parseFrame(fence).error, fence.join(" / ")).toBeNull();
    }
  });
});

// ── 4.1.2: the fourth, fifth and sixth places the frame class was doing a
// job that was never about the frame ─────────────────────────────────────
//
// 4.1.1 fixed three (see ROADMAP-4.1-OUTCOME.md) and stated the general rule:
// a selector scoped to a composite class is claiming *this applies only when
// there is a card*, and `frame:` finds every place that was not what was meant.
// The rule was pinned; the sweep it implies was not run. These are what the
// sweep found, and the last of them is not a selector at all.
// Where a selector's rule body starts, or -1. A BOUNDARY RATHER THAN
// `indexOf`, and this was found by mutating: renaming `.ca-journals-card` to
// `.journals-card-X` in the stylesheet left every assertion below passing,
// because the mutated selector still CONTAINS the one being searched for. A
// test that cannot tell a class from a longer class with the same prefix is
// not pinning the class.
const ruleAt = (rules: string, sel: string): number =>
  rules.search(
    new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s,{]")
  );

describe("nothing that is not about the frame is scoped to the frame", () => {
  const css = readCss();
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("does not find the now-button through the card class", () => {
    // THE ONE THAT IS TYPESCRIPT RATHER THAN CSS, and so the one the 4.1.1
    // fixes could not have caught. `syncNowButton` walked up to
    // `.ca-journal-overview-card` to reach `.ca-jpn-now-btn` — but the button is
    // drawn from `isOverviewCard`, a fact about the fence's CONTENT set off
    // `OVERVIEW_KINDS` and untouched by the modifier, while the class is
    // withheld by `frame: section`.
    //
    // Two conditions that used to agree by accident. On the shipped diary
    // dashboard the walk found nothing, so stepping the month left the "This
    // Month" button without its "you have navigated away" cue — a control
    // silently not updating, which is the failure mode §4 warns about when it
    // says a frame is a border and changing it is not a read-only mode.
    const nav = readSrc("periodnav");
    expect(nav).not.toContain('closest(".ca-journal-overview-card")');
    expect(nav).toContain('closest(".ca-journal-widget-block")');
  });

  it("still scopes the now-button lookup to one fence", () => {
    // The fix must not become "search the page". `.ca-journal-widget-block` is the
    // fence's own container and §4 names keeping it as the rule every frame
    // value honours, so the search reaches exactly as far as it did and no
    // further — a bare `period-nav` in some other note still finds nothing.
    const nav = readSrc("periodnav");
    const at = nav.indexOf("function syncNowButton(");
    const body = nav.slice(at, nav.indexOf("\n}", at));
    expect(body).toContain("closest(");
    expect(body).not.toContain("document.");
    expect(body).not.toContain("querySelectorAll");
  });

  it("does not reach a widget's height through the frame (4.22 §3.2)", () => {
    // A GROUP INSIDE A SECTION RUN AND ONE UNDER `frame: none` BEHAVE
    // IDENTICALLY — the cards are the same object, only the box around them is
    // withheld. So the three declarations that make a stated height scroll are
    // scoped to the CARD and to nothing else; scoping any of them to the block's
    // frame would be §5's shape all over again, and the symptom would be a card
    // that keeps its height on one page and loses it on another.
    for (const sel of [
      ".ca-journal-widget-card.is-sized",
      ".ca-journal-widget-card.is-sized > .ca-journal-block-head",
      ".ca-journal-widget-card.is-sized > :not(.ca-journal-block-head)",
      ".ca-journal-card-divider",
    ]) {
      const at = ruleAt(rules, sel);
      expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
    }
    expect(rules).not.toContain(".is-unframed .ca-journal-card-divider");
    expect(rules).not.toContain(".is-unframed .ca-journal-widget-card.is-sized");
    expect(rules).not.toContain(".ca-journal-overview-card .is-sized");
  });

  it("gives up the journals card's own frame too", () => {
    // `.ca-journals-card` is the third widget that draws a card INSIDE the block,
    // and it was missing from the reset list — which is the cost of keying off
    // the block, and the one thing in §5's shape that has to be kept in step.
    // Without it, `frame: section` on the journals dashboard would put that
    // card inside a section: a card in a card, which is the doubling the whole
    // part exists to remove.
    const at = ruleAt(rules, ".ca-journal-widget-block.is-unframed .ca-journals-card");
    expect(at, ".ca-journals-card is not in the unframed reset").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("padding: 0");
    expect(rule).toContain("background: none");
  });

  it("cancels the journals hero's bleed with it", () => {
    // `.ca-jjs-hero` carries `margin: -12px -14px 0` to cancel `.ca-journals-card`'s
    // padding, exactly as `.ca-journal-overview-banner` does for the summary —
    // 60-heroes-and-banners.css says so where it defines them. Resetting the
    // card without the band is how 4.1.1's third fault happened; doing it again
    // one widget over would be the same bug with a different name.
    const at = ruleAt(rules, ".ca-journal-widget-block.is-unframed .ca-jjs-hero");
    expect(at, ".ca-jjs-hero bleed is not cancelled").toBeGreaterThan(-1);
    expect(rules.slice(at, rules.indexOf("}", at))).toContain("margin: 0");
  });

  it("cancels every widget-own band whose card it resets", () => {
    // THE GENERAL FORM, so the next widget does not need this test written for
    // it by hand. Any band carrying the negative-margin/padding-cancel pair is
    // paired with a card whose padding it cancels; if that card is reset under
    // `is-unframed`, the band must be cancelled there too. Asserted as a
    // correspondence between the two lists rather than as two more literals.
    const pairs: [string, string][] = [
      [".ca-journal-overview-summary", ".ca-journal-overview-banner"],
      [".ca-journals-card", ".ca-jjs-hero"],
    ];
    for (const [card, band] of pairs) {
      const resets = ruleAt(rules, `.ca-journal-widget-block.is-unframed ${card}`) > -1;
      const cancels = ruleAt(rules, `.ca-journal-widget-block.is-unframed ${band}`) > -1;
      expect(cancels, `${card} is reset but ${band} still bleeds`).toBe(resets);
    }
  });
});

describe("the unframed empty state has its own look (§4)", () => {
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("insets the annotating line when nothing else does", () => {
    // §12 calls this the part most likely to be skipped. `.ca-empty-line` takes
    // `padding: 6px 0` and its left inset from the card its widget drew;
    // `is-unframed` sets that padding to zero, so in a canvas node the sentence
    // sits flush against the node's own border. §4: "the same markup with no
    // card and no padding reads as a rendering bug."
    const at = ruleAt(rules, ".ca-journal-widget-block.is-unframed .ca-empty-line");
    expect(at, "no unframed empty-state rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toMatch(/padding:\s*\d+px\s+\d+px/);
  });

  it("adds no box, because a box is what the node already is", () => {
    // A dashed placeholder would be a border inside the canvas node's border —
    // the doubling Part III exists to remove, reintroduced by the fix for it.
    const at = ruleAt(rules, ".ca-journal-widget-block.is-unframed .ca-empty-line");
    // GUARDED, because `slice(-1, …)` is the empty string and every `not`
    // below would pass on a rule that had been deleted outright — which is how
    // a test goes green for the wrong reason.
    expect(at, "no unframed empty-state rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).not.toContain("border");
    expect(rule).not.toContain("background");
  });

  it("leaves the section case alone, as §4 says to", () => {
    // "Under `frame: section` the section's own body supplies the padding, so
    // that case needs no third treatment." `is-unframed` is on the block under
    // BOTH values, so the two are told apart by the wrapper the section value
    // builds — and the section case is restored to the default rather than
    // given a third look of its own.
    const at = ruleAt(
      rules,
      ".ca-journal-widget-block.is-unframed .ca-journal-sec-fold-body .ca-empty-line"
    );
    expect(at, "the section case is not restored").toBeGreaterThan(-1);
    expect(rules.slice(at, rules.indexOf("}", at))).toContain("padding: 6px 0");
  });

  it("needs nothing for the callout shape", () => {
    // `emptyCallout` builds Obsidian's own `.callout`, which brings its own box
    // and is themed by the host. `empty.ts` calls that split structural rather
    // than stylistic, and this is where it pays: only one of the two shapes
    // depends on a card that `is-unframed` takes away.
    expect(readSrc("empty")).toContain('cls: "callout"');
  });
});

describe("a fence that titles itself — 4.12 §A", () => {
  // THREE PREDICATES OVER ONE IDEA, and the point of asserting them together is
  // that they are deliberately NOT the same test. `parseFrame` refuses a
  // contradiction and needs a NAMED bar to have one; the drag refuses a column
  // and does not care whether anybody named it. Two spellings of "is there a bar
  // here" is how those two refusals would come to disagree about one fence — and
  // disagreeing about this one means the editor offering a gesture that corrupts
  // the page.

  it("recognises a header line exactly, never as a prefix", () => {
    expect(isHeaderLine("header:⏳ Open tasks")).toBe(true);
    expect(isHeaderLine("header:")).toBe(true);
    // A future `header-something` directive is not swallowed — `isFrameLine`'s
    // own rule, and the reason both go through `splitDirective`.
    expect(isHeaderLine("header-bar:x")).toBe(false);
    expect(isHeaderLine("tasks-table")).toBe(false);
  });

  it("tells a named bar from a bare one, which is what the grammar needs", () => {
    expect(hasTitledBar(["header:⏳ Open tasks", "tasks-table"])).toBe(true);
    // A bare `header:` renders the anchored control row and no title, so it does
    // not compete with `frame: section` for who names the block.
    expect(hasTitledBar(["header:", "tasks-table"])).toBe(false);
    expect(hasTitledBar(["header:   ", "tasks-table"])).toBe(false);
  });

  it("and `hasSectionBar` is deliberately looser, which is the whole seam", () => {
    // WHAT MATTERS TO A LAYOUT IS THAT THE BAR EXISTS. An untitled `header:`
    // still renders `.ca-journal-sec`, is still refused as cell content by
    // `NOT_A_CELL`, and still lands below a group. Nobody having named it makes
    // no difference to any of that.
    expect(hasSectionBar(["header:", "tasks-table"])).toBe(true);
    expect(hasTitledBar(["header:", "tasks-table"])).toBe(false);
    expect(hasSectionBar(["tasks-table"])).toBe(false);
  });

  it("calls a fence a section when it carries a bar or declares the frame", () => {
    expect(isSectionFence(["header:🏷️ Tags", "tag-index"])).toBe(true);
    expect(isSectionFence(["header:", "tag-index"])).toBe(true);
    expect(isSectionFence(["frame: section", "journals"])).toBe(true);
    // ASKED OF THE WHOLE BODY, and this is the case that says why: `frame:` is
    // not content, so it sits outside `widgetRun`'s span by construction — which
    // is exactly how a `frame: section` block yields a run at all.
    expect(isSectionFence(["frame: none", "links:home"])).toBe(false);
    expect(isSectionFence(["tasks-table:,period"])).toBe(false);
    expect(isSectionFence(["row", "diary:3", "cell", "journals"])).toBe(false);
  });

  it("recognizes frame: section as a section fence whether titled or bare", () => {
    const titled = ["frame: section", "header:🏷️ Tags", "tag-index"];
    const bare = ["frame: section", "header:", "tag-index"];
    expect(parseFrame(titled).error).toBeNull();
    expect(hasTitledBar(titled)).toBe(true);
    expect(parseFrame(bare).error).toBeNull();
    expect(hasTitledBar(bare)).toBe(false);
    expect(isSectionFence(titled)).toBe(true);
    expect(isSectionFence(bare)).toBe(true);
  });

  it("does not call a refused fence a section on the strength of its frame", () => {
    // `parseFrame` returns `card` for every error it reports, so a fence the
    // grammar has already refused is judged by its `header:` line alone — which
    // is what it renders as. Two `frame:` lines and no bar is a plain block.
    expect(parseFrame(["frame: section", "frame: none", "journals"]).frame).toBe(
      DEFAULT_FRAME
    );
    expect(isSectionFence(["frame: section", "frame: none", "journals"])).toBe(false);
  });
});
