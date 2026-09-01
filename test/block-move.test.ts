// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A block's head, and what it calls the block — 4.7, cut back in 4.8.1.
//
// WHAT THIS FILE WAS. 4.7's swap: the arithmetic behind dragging a whole block,
// checked here because a mistake in it eats somebody's page. That gesture was
// removed at a vault's request — see the second describe — and what is left is
// the half of 4.7 that survived it: the lookup the cell gesture still needs, the
// rule that decides what a head says, and the head itself.

import { describe, expect, it } from "vitest";
import { blockIndexAt } from "../src/core/block-move";
import { blockTitle } from "../src/ui/widgets/index";
import { readCode, readCss, readSrc } from "./sources";

// A note of three blocks with the composer's own spacing: one blank line
// between fences, and a spacer on the body's first line.
//
// KEPT AT THREE BLOCKS though only the lookup reads it now: `blockIndexAt` has
// to be right about the LAST block as well as the first, and a two-block note
// cannot tell a bug that walks one too far from a correct answer.
const NOTE = [
  "`chronoanvil:spacer`",
  "```chronoanvil",
  "title",
  "```",
  "",
  "```chronoanvil",
  "row",
  "diary:3",
  "```",
  "",
  "```chronoanvil",
  "journals",
  "```",
  "",
];

describe("what a note's blocks are", () => {
  it("finds the block a line belongs to", () => {
    // The bridge from a rendered block to a movable one: `boundsOf` gives a
    // line range and this turns it into the index a drop speaks in.
    expect(blockIndexAt(NOTE, 1)).toBe(0);
    expect(blockIndexAt(NOTE, 3)).toBe(0);
    expect(blockIndexAt(NOTE, 6)).toBe(1);
    expect(blockIndexAt(NOTE, 11)).toBe(2);
  });

  it("says null for a line in no fence", () => {
    // A real answer for a click on prose or on the spacer, not a failure.
    expect(blockIndexAt(NOTE, 0)).toBeNull();
    expect(blockIndexAt(NOTE, 4)).toBeNull();
  });
});

describe("the swap, and what replaced it", () => {
  it("is gone, and took its arithmetic with it", () => {
    // WHAT IT WAS. 4.7 made a block draggable and a drop SWAPPED two of them;
    // `swapBlocks` did the write, and this file held eight cases pinning the
    // separators, the verbatim re-emission and the refusals.
    //
    // 4.8.1 removed the gesture at a vault's request. 4.8.5 put it back, from
    // the same vault — *"the 02 diary dashboard's sections can only be moved
    // from the section editor and the grips are missing"* — but NOT the swap:
    // a block now lands in a place, like everything else this release moves,
    // and `moveCell` does the write. Two blocks trading places was symmetric
    // and could not say "put this one at the top".
    //
    // ASSERTED RATHER THAN DELETED SILENTLY, because a tested pure function is
    // exactly the kind of thing that gets quietly re-added.
    const src = readSrc("block-move");
    expect(src).not.toContain("export function swapBlocks");
    expect(src).not.toContain("export function blockCount");
    // The lookup survives: `moveCell` names blocks by the same index.
    expect(src).toContain("export function blockIndexAt");
    // And the block's own drag is an insert over `moveCell`, not a second write
    // path of its own.
    const drag = readSrc("block-drag");
    expect(drag).toContain("whole: { from: 0, to: body.length }");
    expect(drag).not.toContain("swapBlocks");
  });
});

describe("what a block's head calls it", () => {
  it("names a block that is one nameable thing", () => {
    expect(blockTitle(["journals"])).toBe("📚 Journals");
    // The argument after the keyword is not part of the name, and neither is a
    // label — the head is titled by WHICH widget, not by how it was configured.
    expect(blockTitle(["diary:3"])).toBe("📆 Today");
    expect(blockTitle(["tasks-table:02 - Diary/Weekly|Open"])).toBe("⏳ Open tasks");
  });

  it("says nothing about a row of three widgets", () => {
    // THE CASE THAT DECIDED THE RULE. The homepage's top row holds `diary`,
    // `tasks-table` and `on-this-day`, all three of which the map can name, and
    // taking the first would have the head announce a third of what is under it
    // — above two columns that already carry their own titles.
    expect(blockTitle(["diary:3", "tasks-table", "on-this-day:always"])).toBeNull();
  });

  it("counts a repeated widget as the one thing it is", () => {
    // A fence with two task tables is still a block of task tables, so the rule
    // is over DISTINCT kinds rather than over lines.
    //
    // ON A LIVE KEYWORD, AS OF 4.12. This read `calendar:2026-01` /
    // `calendar:2026-02` — and `calendar` was retired in 3.11, so the case was
    // pinning a title for a widget nothing dispatches. It passed, because
    // `SECTION_TITLES` still carried the dead entry; the two were wrong together
    // and agreed, which is the only way a test like this survives. Both are gone
    // now and `test/widget-registry.test.ts` is what keeps them gone.
    expect(
      blockTitle(["tasks-table:02 - Diary/Weekly", "tasks-table:03 - Journals"])
    ).toBe("⏳ Open tasks");
  });

  it("never names a banner after a widget inside it", () => {
    // ── THE DEFECT, AND THE TWO PLACES IT WAS FIXED ────────────────────
    //
    // 4.19 welded `title:` and `links:` into one fence. `title` has no
    // `SECTION_TITLES` entry and `links` has "🔗 Links", so exactly one keyword
    // matched and every dashboard drew a bar naming the page after the smaller
    // of the two widgets in it. It shipped, and a render found it.
    //
    // 4.19.1 FIXED IT IN `hasOwnBar`, BY ADDING `.ca-jtc-card` — right for the
    // surface it was tested on and the wrong mechanism. `hasOwnBar` asks only
    // about a block's FIRST CHILD, deliberately; an ENTRY's banner opens with
    // its links row, so the entry banner drew the same wrong head and the next
    // render found THAT.
    //
    // 4.21 PUTS IT WHERE THE NAME IS CHOSEN. A banner names the note, so it is
    // never named by a widget in it — one rule, asked of the fence, and it holds
    // whatever order the directives are in.
    for (const fence of [
      ["title:home,diary,journals", "links:today,scopes#diary"],
      ["links:home,today,scopes#diary", "entry-header"],
      ["journal-header", "links:home,up"],
    ]) {
      expect(blockTitle(fence), fence.join(" + ")).toBeNull();
    }

    // AND A FENCE WITH NO BANNER IN IT IS UNAFFECTED, which is what keeps this a
    // rule about banners rather than a rule about navigation rows.
    expect(blockTitle(["links:today,scopes#diary"])).toBe("🔗 Links");
  });

  it("says nothing rather than something wrong for what it cannot name", () => {
    // Every block gets a head, including the ones nobody declared anything
    // about — an untitled head is the honest answer for a fence of sliders.
    expect(blockTitle(["slider:mood|Mood", "button:new"])).toBeNull();
    expect(blockTitle([])).toBeNull();
  });

  it("shares the section modifier's titles rather than keeping a second list", () => {
    // Two tables would start disagreeing the day one of them gained an entry:
    // a block titled "📚 Journals" by `frame: section` is the same block under a
    // head. One map, read twice.
    const widgets = readCode("widgets");
    expect(widgets).toContain("export function blockTitle");
    const at = widgets.indexOf("export function blockTitle");
    expect(widgets.slice(at, at + 900)).toContain("SECTION_TITLES");
    expect(widgets.match(/const SECTION_TITLES/g) ?? []).toHaveLength(1);
  });
});

describe("the gesture around it", () => {
  const src = readSrc("block-drag");

  it("makes the slots the target, not the block", () => {
    // The ring around a hovered block meant "swap with this one", and the block
    // drag is an insert now: the block is not itself a drop target, its slots
    // are, and each of them says which place it means. A highlight over the
    // whole block would be claiming an answer none of them gives.
    expect(src).not.toContain("is-drop-target");
    expect(readCss()).not.toContain(".ca-journal-widget-block.is-drop-target");
    expect(src).toContain('container.addClass("is-slotting")');
  });

  it("gives a charts block a head too, on the same call", () => {
    // IT WAS THE ONLY BLOCK ON THE HOMEPAGE WITHOUT ONE. All three processors
    // go through one entry point, so a fourth would have to opt out rather than
    // be remembered.
    const widgets = readCode("widgets");
    // The call rather than its arguments: only the main processor passes a
    // title, and it passes it over four lines.
    const attaches = widgets.match(/attachBlockHead\(\s*this\.plugin,\s*container,\s*ctx/g) ?? [];
    expect(attaches.length).toBeGreaterThanOrEqual(3);
    const charts = widgets.indexOf("buildChartGrid(this, container, specs, ctx, el, header)");
    expect(charts).toBeGreaterThan(-1);
    expect(widgets.slice(charts, charts + 400)).toContain("attachBlockHead");
  });

  it("draws no grip where the block cannot be found in the file", () => {
    // `boundsOf` returns null in an embed, an export and any render outside a
    // live view. A widget that cannot be located cannot be moved, so it gets no
    // grip rather than a grip that fails — the rule the title card's cog
    // follows, one level out.
    expect(src).toContain("if (!boundsOf(ctx, container)) return;");
    const at = src.indexOf("if (!boundsOf(ctx, container)) return;");
    // Asserted against the place a grip is ATTACHED rather than the class it
    // wears: `attachGrip` is a module-level helper and sits above everything, so
    // its definition says nothing about whether the gate ran first.
    //
    // AND SINCE 5.2 SO IS ITS ONLY CALLER. `source` was lifted out to
    // `makeSource`, so what is below the gate is no longer the grip's
    // declaration but the one line that MAKES a grip factory for this block —
    // which is the fact this test was always about.
    expect(at).toBeLessThan(src.indexOf("const source = makeSource("));
    expect(src.match(/attachGrip\(/g) ?? []).toHaveLength(2);
  });

  it("draws the head anyway, because a name is true in an embed too", () => {
    // The gate moved BELOW the head in 4.8.1. While the head carried the grip
    // the two were one decision; now the bar is a label and the label is
    // readable wherever the block is rendered.
    const head = src.indexOf("buildHead(container, title)");
    expect(head).toBeGreaterThan(-1);
    expect(head).toBeLessThan(src.indexOf("if (!boundsOf(ctx, container)) return;"));
  });

  it("resolves the block's index at drag time AND at drop time", () => {
    // THE BUG A VAULT FOUND: *"some sections do not move, but others will be
    // re-arranged instead."* The line range was resolved once, at render, and
    // kept. Every swap rewrites the note, so a block that did not itself
    // re-render went on pointing at lines that now belong to a different block
    // — and the gesture moved that one, correctly, from a wrong premise.
    //
    // Both ends have to ask, not just the one that starts the drag: the block
    // being dropped ON is just as stale as the one being dragged.
    expect(src).toContain("const indexNow = (): number | null => {");
    // THE DROP END ASKS THROUGH THE SLOT. A slot's target is built by a
    // callback rather than baked in when the slot is drawn, for this reason
    // exactly — `where()` runs at the drop, on a file that every previous drop
    // has rewritten.
    expect(src).toContain("const dst = where();");
    const at = src.indexOf('addEventListener("dragstart"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 400)).toContain("indexNow()");
    // And no handler reads a line range of its own: `indexNow` resolves one
    // freshly and is the only place that may. Scoped to the handlers rather
    // than to the file, because `indexNow` itself must read one — the first
    // form of this assertion banned the string outright and failed on the fix.
    expect(src.slice(at, at + 400)).not.toContain("bounds");
  });

  it("keeps the grip to an area around the dots, not the block's width", () => {
    // THREE REPORTS BEFORE THIS ONE. "Too far right": it sat in the block's left
    // margin, which exists on a wide window and does not on a page that has
    // capped its own width, so what showed was the half of the grip that cleared
    // the edge. Then a 16px square in the corner, which is the size of a
    // checkbox for a gesture that moves a whole block. Then a 14px strip in
    // flow, which ADDED HEIGHT — inside a section, between the card's top edge
    // and the bar under it.
    //
    // Full width was right while the strip WAS the affordance and held nothing
    // else. In a head it would lay an invisible drag target over the title, so
    // it is a fixed width centred on the dots.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf(".ca-jbd-handle {");
    expect(at, "no grip rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("position: absolute");
    expect(rule).toMatch(/width:\s*\d+px/);
    expect(rule).toContain("left: 50%");
    expect(rule).toContain("translateX(-50%)");
    expect(rule).not.toMatch(/[;{]\s*right:\s*0/);
    // AND NO GROUND OF ITS OWN. The fill it used to take was
    // `--background-secondary` — the section surface's own colour — so on a card
    // all that ever showed of the strip was two rules ruled across the header.
    expect(rule).not.toContain("background");
    expect(rule).not.toContain("box-shadow");
  });

  it("gives every block a head, and the grip a place inside it", () => {
    // 4.7.2, asked for after the drag was used: a block with a `header:` bar had
    // somewhere for a grip to sit and a name for what it holds, and a block
    // without one had neither — the grip was dots floating over a card.
    //
    // THE BAR IS ALWAYS DRAWN AND THE GRIP IS NOT, which is the split the whole
    // design rests on: a page of permanent grips reads as a form under
    // construction, a page of quiet labels reads as a page.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    // ANCHORED ON A NEWLINE, and it was not until 4.13.6 — when a legitimate
    // second rule, `.ca-journal-widget-card > .ca-journal-block-head`, ended in this
    // exact string and a bare `indexOf` read IT while believing it had read the
    // base rule. Third time in this suite; `section-frame.test.ts` carries the
    // other two and RESUME states the rule.
    const at = rules.indexOf("\n.ca-journal-block-head {");
    expect(at, "blocks have no head").toBeGreaterThan(-1);
    const head = rules.slice(at, rules.indexOf("}", at));
    expect(head).toContain("border-bottom");
    // The grip centres against the head rather than against the block, in every
    // one of the head's forms.
    expect(head).toContain("position: relative");
    // Drawn first though attached last — `layOutRow` would collect an earlier
    // child into a cell, and 20-charts.css reads the block's first child.
    expect(head).toContain("order: -1");
    expect(rules).toContain(".ca-journal-block-head-title {");
    // A head with nothing to say is not drawn at all — both refusals are made
    // where the answer is known, and 4.8.1 turned "no bar" into "no head" now
    // that there is no grip left to keep.
    expect(src).toContain("if (title && !hasOwnBar(container)) {");
    expect(src).not.toContain("is-grip-only");
  });

  it("puts the head on a card, and takes the widget's own card off", () => {
    // REPORTED FROM A VAULT: "I was expecting it to be the same consistent card
    // style surface, not a blank background." A titled bar on the page's own
    // background is a label floating above a card rather than the head of one,
    // so the block draws the card — the same four lines and the same 12/14 the
    // three composite cards use, which is what lets the head bleed those numbers
    // and meet the card's edges.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf(".ca-journal-widget-block.has-head:not(");
    expect(at, "a titled head draws no card under itself").toBeGreaterThan(-1);
    const rule = rules.slice(rules.indexOf("{", at), rules.indexOf("}", at));
    expect(rule).toContain("background: var(--background-secondary)");
    expect(rule).toContain("border-radius: var(--ca-radius-md)");
    expect(rule).toContain("padding: 12px 14px");
    // AND NOT WHERE THERE IS CHROME ALREADY: the three composite cards paint it
    // themselves, `is-unframed` gave it up on purpose, and a block inside a
    // section run is on someone else's surface.
    const guard = rules.slice(at, rules.indexOf("{", at));
    for (const cls of [
      "is-unframed",
      "journal-sec-block",
      "ca-journal-overview-card",
      "ca-journal-entry-banner",
      "ca-journal-study-banner",
    ]) {
      expect(guard, `${cls} is handed a second card`).toContain(cls);
    }

    // THE WIDGET'S OWN CARD COMES OFF, and the list saying which is written
    // twice — once per condition — because three tests in two files read those
    // selectors as literals. So the two halves are compared here instead.
    // SCOPED TO THE RESET RULE, not to the whole stylesheet: `.has-head` also
    // scopes the empty callout two files over, and a search over every line
    // would collect that as one of the cards.
    const resetAt = rules.indexOf(
      ".ca-journal-widget-block.is-unframed .ca-journal-overview-summary"
    );
    expect(resetAt, "the unframed reset is gone").toBeGreaterThan(-1);
    const reset = rules.slice(resetAt, rules.indexOf("{", resetAt));
    const widgetsOf = (cond: string): string[] =>
      reset
        .split("\n")
        .filter((l) => l.trim().startsWith(`${cond} .`))
        .map((l) => l.trim().replace(`${cond} `, ""))
        // The last selector of a rule carries the brace, the rest a comma.
        .map((l) => l.replace(/\s*[,{]\s*$/, "").trim());
    const unframed = widgetsOf(".ca-journal-widget-block.is-unframed");
    // NOT SCOPED TO THE BLOCK: `has-head` is worn by a block that drew its own
    // head and by the card `cardWidget` puts around a widget inside a row, so
    // one condition covers both scales.
    const headed = widgetsOf(".has-head");
    expect(headed.length).toBeGreaterThan(0);
    // Every card the unframed reset names is named by the head's copy too. The
    // unframed list is longer on purpose: it also cancels the bands those cards
    // carry (`.ca-journal-overview-banner`, `.ca-jjs-hero`), which a headed block must
    // NOT cancel — there the card's padding is real, so the bands bleed to the
    // card's edges exactly as they were written to.
    // THREE SINCE 5.2. `.ca-jtc-card` was the fourth and left the reset with the
    // widget that drew it — the 4.5 head, unreachable since 4.10.
    const cards = [
      ".ca-journal-overview-summary",
      ".ca-journal-entry-card",
      ".ca-journals-card",
    ];
    for (const card of cards) {
      expect(unframed, `${card} left the unframed reset`).toContain(card);
      expect(headed, `${card} is not reset under a head`).toContain(card);
    }
    expect(headed.sort()).toEqual([...cards].sort());
  });

  it("gives every widget in a row a card and a name of its own", () => {
    // A CARD PER WIDGET, NOT PER CELL. The homepage's aside is one `cell`
    // holding the launcher, open tasks and on this day — one head over the
    // three of them would have to name all three or say nothing, and each of
    // them can name itself.
    const widgets = readCode("widgets");
    expect(widgets).toContain("for (const { el, title } of named) cardWidget(el, title)");
    // Recorded at the append, where the element and the directive that produced
    // it are both in hand. A pass afterwards would be reading classes to guess
    // at directives.
    expect(widgets).toContain("named.push({ el: widget, title: SECTION_TITLES[kind] })");

    // WRAPPED BEFORE THE ROW IS LAID OUT, and in place: one wrapper where one
    // widget was, so the block keeps the same number of children in the same
    // order and `cellPlan`'s recorded counts still point at the same
    // boundaries. This is the assertion that fails if the two are ever swapped.
    const wrap = widgets.indexOf("cardWidget(el, title)");
    const row = widgets.indexOf("layOutRow(");
    expect(wrap, "widgets are never carded").toBeGreaterThan(-1);
    expect(wrap).toBeLessThan(row);
    expect(src).toContain("parent.insertBefore(card, widget)");

    // AND THE ROW STOPS NAMING ITSELF, or a one-widget row says the same thing
    // twice — once over the row and once inside it.
    expect(widgets).toContain("rowSpec.row ? null : blockTitle(lines)");
  });

  it("puts no head on a widget that already has a band", () => {
    // THE SAME RULE THE BLOCK FOLLOWS, ONE LEVEL DOWN. A period dashboard's
    // summary says MONTHLY OVERVIEW across its own top
    // (`.ca-journal-overview-banner`); "📅 This month" above it in smaller letters
    // is the same sentence twice.
    expect(src).toContain("if (hasOwnBar(widget)) return;");
    // A LIST, WITH THE COST THE RESET LIST DECLARES: a band a WIDGET drew has
    // to be named here, because only that widget knows it drew one. Missing an
    // entry shows as two bars stacked.
    for (const band of [
      "ca-journal-overview-banner",
      "ca-jjs-hero",
      "ca-journal-entry-header",
      "ca-journal-study-header",
      "ca-journal-sec",
      "ca-journal-sec-fold",
      "ca-journal-header-bar",
    ]) {
      expect(src, `${band} is not counted as a band`).toContain(`"${band}"`);
    }
  });

  it("no longer counts the diary hero, because there is no diary hero", () => {
    // 4.13.1 §3 deleted `.jc-diary-header` — the accent-washed band that named
    // the card — and the entry went with it. Asserted rather than left implicit:
    // a class in `BANDS` that nothing can carry reads as a decision protecting
    // something, and the next reader would have to go looking for the widget
    // that draws it. The diary card opens on a strip of controls now, which
    // names nothing, so its block head is the only thing saying what it is.
    //
    // COMMENTS STRIPPED, which is the trap every file in this project sets: the
    // paragraph above `BANDS` still tells the story of the band it used to hold,
    // and that prose is worth keeping. What must not come back is the ENTRY, so
    // the match is made against the code alone.
    const code = src.replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("jc-diary-header");
  });

  it("no longer has a bleed to pay back, except where it still bleeds", () => {
    // WHAT 4.13.6 §1 FIXED, AND WHY THE FIX IS NOW IN ONE PLACE. The head ran
    // `margin: -12px -14px 0` so its rule reached the card's edges — and the top
    // `-12px` consumed the card's `padding-top` outright, leaving whatever the
    // card held sitting on the hairline. The answer was a 12px bottom margin:
    // the bleed paid back exactly where it was taken.
    //
    // 4.34.3 TOOK THE BLEED OUT OF THE HOVER PATH ENTIRELY. The head is
    // `position: absolute` over the card's top edge, so it consumes no padding
    // and displaces nothing — there is no longer anything to pay back, and a
    // margin here would be compensation for a debt that is not incurred.
    //
    // IT SURVIVES ON TOUCH, WHERE THE HEAD IS STILL IN FLOW, and so does its
    // payback: that branch keeps the pair together, which is the whole of the
    // rule. Asserted as a pair rather than as two values, because either one
    // alone is the defect.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf("\n.ca-journal-widget-card > .ca-journal-block-head {");
    expect(at, "the card head rule is gone").toBeGreaterThan(-1);
    const desktop = rules.slice(at, rules.indexOf("}", at));
    expect(desktop).toContain("position: absolute");
    expect(desktop).not.toContain("-12px");
    // The touch branch, where the head is a band in flow again.
    const touch = rules.indexOf("  .ca-journal-widget-card > .ca-journal-block-head {");
    expect(touch, "touch keeps the head in flow").toBeGreaterThan(-1);
    const flowed = rules.slice(touch, rules.indexOf("}", touch));
    expect(flowed).toContain("margin: -12px -14px 12px");
    // And it is NOT on the head itself, where it would reach the block too.
    const base = rules.indexOf("\n.ca-journal-block-head {");
    expect(rules.slice(base, rules.indexOf("}", base))).not.toContain(
      "margin-bottom"
    );
  });

  it("draws no bar where a bar would say nothing", () => {
    // FOUR CASES, TWO OF THEM THE STYLESHEET'S. `attachBlockHead` builds no
    // head at all where it can see the answer at render: the block's first
    // child is already a bar, or `blockTitle` could not name the block. The
    // other two are classes that arrive AFTER it — `journal-sec-block` from
    // `SectionPass`, `is-unframed` from a frame that gave up the block's chrome
    // — so those two are hidden rather than never drawn.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf(".ca-journal-widget-block.ca-journal-sec-block > .ca-journal-block-head");
    expect(at, "a block inside a section draws a second bar").toBeGreaterThan(-1);
    const sel = rules.slice(at, rules.indexOf("{", at));
    expect(sel).toContain("is-unframed");
    expect(rules.slice(rules.indexOf("{", at), rules.indexOf("}", at))).toContain(
      "display: none"
    );

    // AND THE ONE BLOCK THAT IS NOT A FLEX CONTAINER IS IN THAT LIST, which is
    // what makes the head's `order: -1` safe. `.ca-journal-sec-block` sets
    // `display: flow-root` and wins over the block's `display: flex` on file
    // order at equal specificity — an order there is inert, and a head that
    // relied on one would draw at the FOOT of its block, which in a section run
    // is the head of the next one. That was 4.7.1's bug and this is why it
    // cannot come back.
    const secAt = rules.indexOf(".ca-journal-sec-block {");
    expect(
      rules.slice(secAt, rules.indexOf("}", secAt)),
      "the section surface no longer turns the flex context off"
    ).toContain("display: flow-root");
  });

  it("gives the block the positioning context the grip reads", () => {
    // THIS LINE WAS LOST FOR ONE BUILD and the failure is worth pinning. An
    // absolute strip with no positioned ancestor anchors to whatever IS
    // positioned above it: the code-block widget in Live Preview, which sits
    // exactly where the block does — and the note's sizer in reading view, which
    // does not. It looked perfect in one mode and was gone from every section in
    // the other.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.lastIndexOf(".ca-journal-widget-block {");
    expect(at, "no block rule").toBeGreaterThan(-1);
    const all = rules
      .split(".ca-journal-widget-block {")
      .slice(1)
      .map((r) => r.slice(0, r.indexOf("}")));
    expect(
      all.some((r) => /position:\s*relative/.test(r)),
      "the block no longer positions its own grip"
    ).toBe(true);
    // The query container is NOT this: `container-type: inline-size` is layout
    // containment, not position, and a reader deleting one as a duplicate of the
    // other is how the line went missing the first time.
    expect(all.some((r) => r.includes("container-type: inline-size"))).toBe(true);
  });

  it("never writes a file to say nothing happened", () => {
    // `swapBlocks` returns null for a drop on the block being dragged — a
    // reader picking something up and putting it back — and a write there would
    // put an entry in every sync log in the vault.
    expect(src).toContain("if (!next) return;");
    const at = src.indexOf("if (!next) return;");
    expect(src.indexOf("vault.modify")).toBeGreaterThan(at);
  });

  it("draws no pop-up after a drop", () => {
    // The section dialog plans, previews and asks; a drag does none of those,
    // because the gesture IS the consent. What §4 wanted after the write was a
    // way back, and the first build put a guarded restore in a notice.
    //
    // THE DROP IS A SWAP, so dragging the block back is that way back — the same
    // gesture, no deadline, and no refusal once something else has touched the
    // note. A notice would then be a toast announcing a move the reader just
    // watched, on every drag.
    expect(src).not.toContain("Notice");
    expect(src).not.toContain("Undo");
    // And one write per drop: nothing keeps the old text to put back.
    //
    // ONE APPLIER SINCE 4.8.1 — `applySwap` went with the block drag. It reads,
    // decides, and writes once, and holds nothing it replaced, which is the
    // property this is really asserting.
    for (const fn of ["applyMove"]) {
      const at = src.indexOf(`async function ${fn}(`);
      expect(at, fn).toBeGreaterThan(-1);
      const body = src.slice(at, src.indexOf("\n}", at));
      expect(body.match(/vault\.modify/g) ?? [], fn).toHaveLength(1);
    }
  });

  it("is attached after the row and the frame, or the head becomes a cell", () => {
    // `isCellContent` collects the block's children into cells, so a head
    // attached before `layOutRow` would be given a column of its own. It is
    // also how the card grips find their cards: `cardWidget` has to have built
    // them first.
    const widgets = readCode("widgets");
    const drag = widgets.indexOf("attachBlockHead(this.plugin, container, ctx)");
    const row = widgets.indexOf("layOutRow(");
    expect(drag, "the head is never attached").toBeGreaterThan(-1);
    expect(row, "the row is never laid out").toBeGreaterThan(-1);
    expect(drag).toBeGreaterThan(row);
  });

  it("has a resting state on touch, like every other hover affordance", () => {
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf("@media (hover: none)");
    expect(rules.slice(at).includes(".ca-jbd-handle")).toBe(true);
  });

  it("reveals grabber icon on hover across section blocks, review queue, tables, and collapsible note sections", () => {
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf(".ca-jbd-host:hover > .ca-jbd-handle");
    expect(at, "grip hover selector missing").toBeGreaterThan(-1);
    const sel = rules.slice(at, rules.indexOf("{", at));
    expect(sel).toContain(".ca-journal-sec-block:hover .ca-jbd-handle");
    expect(sel).toContain(".ca-journal-sec-fold:hover > .ca-jbd-handle");
    expect(sel).toContain(".ca-journal-widget-block:hover > .ca-jbd-handle");
    expect(sel).toContain(".ca-journal-widget-card:hover > .ca-jbd-handle");
    expect(sel).toContain(".ca-journal-note--collapsible:hover > .ca-jbd-handle");
    expect(sel).toContain(".ca-journal-table:hover .ca-jbd-handle");
  });
});
