// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import { allSrcNames, readCss, readSrc } from "./sources";
// ── one row, one notice marker ────────────────────────────────────────────
//
// Both halves of this patch are about a decision that had been made repeatedly
// instead of once, and both found the same cause: reaching the shared thing was
// awkward, so a local copy appeared. That is why a plugin looks inconsistent —
// not because anyone decided a list should differ one click away.

const src = (f: string) => readSrc(f);
const all = allSrcNames();

// The stylesheet with its comments taken out, for the assertions that require a
// selector to be ABSENT. This project replaces a deleted rule with a tombstone
// naming it and saying why — which is where that argument belongs and which a
// raw `not.toContain` would make unwritable.
const cssRules = (): string => readCss().replace(/\/\*[\s\S]*?\*\//g, "");

describe("one list row", () => {
  it("lives in its own module, reachable from anywhere", () => {
    // It was inside settings-editors.ts, which imports the template editor — so
    // the template editor could not import it back and grew its own.
    expect(src("list-row.ts")).toContain("export function createListRow(");
    expect(src("settings-editors.ts")).not.toContain(
      "export function createListRow("
    );
  });

  it("is defined exactly once", () => {
    const defs = all.filter((f) =>
      src(f).includes("export function createListRow(")
    );
    expect(defs).toEqual(["list-row"]);
  });

  it("is what the section editor draws with", () => {
    // RETARGETED IN 3.0, not weakened. The editor moved from
    // template-editor.ts to section-editor.ts when it stopped being the
    // journal's and became the one editor over all three catalogues; both
    // assertions below are about the editor, so they follow it. The old module
    // is now a caller that draws no rows at all.
    const t = src("section-editor.ts");
    expect(t).toContain("createListRow(host, {");
    // The bespoke classes it used to emit.
    for (const dead of [
      "almanac-tpl-label",
      "almanac-tpl-nudge",
      "almanac-tpl-lock",
    ]) {
      expect(t, dead).not.toContain(dead);
    }
  });

  it("puts reorder controls in the leading slot, not beside Remove", () => {
    // "Move this up" next to "remove this" is a pairing one slip away from
    // being expensive.
    const t = src("section-editor.ts");
    const lead = t.indexOf("lead.createEl(\"button\"");
    const action = t.indexOf("actions.createEl(\"button\"");
    expect(lead).toBeGreaterThan(0);
    expect(action).toBeGreaterThan(lead);
  });

  it("hands back a pills handle rather than making callers query for it", () => {
    // The launcher rail read `row.querySelector(".almanac-list-pills")` and
    // silently did nothing when the row had started with no pills.
    expect(src("list-row.ts")).toContain("pills: HTMLElement");
    expect(src("settings-editors.ts")).not.toContain(
      'querySelector(".almanac-list-pills")'
    );
  });
});

describe("one notice marker", () => {
  it("decides the glyph and its position in one place", () => {
    // 37 of 112 notices were marked, 30 leading and 7 trailing. The position is
    // decided here now, and it leads — a notice is glimpsed while looking
    // somewhere else, so a symbol at the end arrives after the sentence it was
    // meant to frame.
    const t = src("notify.ts");
    expect(t).toContain("The marker LEADS");
    expect(t).toContain("\\u2705");
    expect(t).toContain("\\u274c");
  });

  it("leaves no marker written into a notice by hand", () => {
    for (const f of all) {
      if (f === "notify.ts") continue;
      const strays = [
        ...src(f).matchAll(/new Notice\(\s*[`"][^`"]{0,140}/g),
      ].filter((m) => /✅|❌/.test(m[0]));
      expect(strays.map((m) => m[0]), f).toEqual([]);
    }
  });

  it("chooses by intent, not by glyph", () => {
    // A caller says what kind of thing happened. Which means "should we have
    // these at all" is one line here rather than a 37-site sweep.
    const t = src("notify.ts");
    for (const k of ["ok:", "fail:", "info:", "report:"]) {
      expect(t, k).toContain(k);
    }
  });

  it("leaves the unmarked majority unmarked", () => {
    // 75 notices carry no marker, and promoting them all would be a copy
    // decision dressed as a refactor. A screen where everything is flagged
    // flags nothing.
    let plain = 0;
    for (const f of all) plain += (src(f).match(/new Notice\(/g) ?? []).length;
    expect(plain).toBeGreaterThan(60);
  });
});

// ── the row reaches a note (2.56.5) ──────────────────────────────────────
//
// 2.55.4 extracted `createListRow` and asserted it was DEFINED once. It was
// not asserted to be USED where a list exists, and it turned out to have ten
// call sites in three files, every one of them in Settings. `widgets.ts` and
// `tables.ts` are 6,369 lines of what a reader actually looks at, and neither
// imported it. "One list row, everywhere" meant everywhere behind a modal.

describe("note surfaces draw rows with the shared component", () => {
  const src = (f: string) => readSrc(f);

  it("has tables.ts building records with createListRow", () => {
    expect(src("tables.ts")).toContain('from "./list-row"');
    expect(src("tables.ts")).toContain("createListRow(list, {");
  });

  it("stopped drawing the kind table as a <table>", () => {
    // Table columns cannot shrink past their content, so a four-column table at
    // 380px either overflows the pane or squeezes a lesson title to three
    // characters. This is the one thing on a journal note that could not be
    // fixed by styling it.
    const t = src("tables.ts");
    const at = t.indexOf("export function buildKindTable(");
    const body = t.slice(at, t.indexOf("\nexport ", at + 10));
    expect(body).not.toContain('createEl("table"');
    expect(body).not.toContain('createEl("tr"');
  });

  it("keeps one DOM rather than rendering both layouts", () => {
    // The obvious implementation is to build a table and a list and hide one.
    // That is two copies of the data on every dashboard, and they drift.
    const css = readCss();
    const at = css.indexOf("@container (max-width: 460px)");
    expect(at).toBeGreaterThan(0);
    expect(css).toContain(".almanac-list-main.is-columned");
    expect(src("tables.ts")).not.toContain("renderNarrow");
  });

  it("keeps the accessible table roles the element gave for free", () => {
    // Dropping `<table>` drops its semantics unless they are put back. A list
    // of records is still a table to a screen reader.
    const body = src("tables.ts");
    expect(body).toContain('setAttr("role", "table")');
    expect(body).toContain('setAttr("role", "row")');
    expect(body).toContain('setAttr("role", "columnheader")');
    expect(body).toContain('setAttr("role", "cell")');
  });

  it("scales a bounded rating from the tracker, not from the data", () => {
    // `3` on its own is not a reading — three out of what. Normalising to the
    // largest value present would make the best item look full whatever it
    // scored, which is the objection buildJournalBreakdown's scale already
    // makes about its own bars.
    const t = src("tables.ts");
    const at = t.indexOf("function ratingCell(");
    expect(at).toBeGreaterThan(0);
    const body = t.slice(at, at + 900);
    expect(body).toContain("def?.min");
    expect(body).toContain("def?.max");
    // Falls back to the digit where there are no declared bounds: a gauge with
    // no scale is a decoration.
    expect(body).toContain("host.setText(String(value))");
  });

  it("names the shared slots after the component, not the first caller", () => {
    // The scoreboard caught this: the heading strip, the value cell and the
    // gauge went in as `.jkt-*`, which added a twenty-eighth class-prefix
    // family on the patch meant to be retiring them. They are what ANY list of
    // records wants.
    const css = readCss();
    for (const cls of [
      ".almanac-list-heads",
      ".almanac-list-cell",
      ".almanac-list-gauge",
    ]) {
      expect(css, cls).toContain(cls);
    }
    expect(css).not.toMatch(/^\.jkt-/m);
  });
});

// ── three lists, one shape (2.56.9) ──────────────────────────────────────
//
// The kind table, the topics table and the page index are the same object: a
// named thing per row, a link on the name, some values across. They were a
// `<table>`, a second `<table>` with the same shared CSS block, and a private
// `.jpt-*` family. 2.56.5 converted one of the three; converting the second
// would have been the same twenty lines again, which is the mechanism this
// release is about, so the shape is `recordList` and it is decided once.

describe("the record lists share one builder", () => {
  const t = () => readSrc("tables");

  it("builds the heading strip and the tracks in one place", () => {
    const s = t();
    expect(s).toContain("function recordList(");
    // Every list that has columns goes through it.
    expect(s.match(/recordList\(root, \[/g)?.length).toBe(2);
  });

  it("has no <table> left in tables.ts", () => {
    expect(t()).not.toContain('createEl("table"');
  });

  it("puts the page index's ordinal in the component's token slot", () => {
    // `.jpt-index` was a small muted number before a name — which is what the
    // token slot is. A page index has no value columns, so it uses
    // createListRow directly rather than bending recordList to describe a
    // table with no columns.
    const s = t();
    const at = s.indexOf("pages.forEach((page, i) =>");
    expect(at).toBeGreaterThan(0);
    expect(s.slice(at, at + 400)).toContain("token: String(i + 1)");
  });

  it("has retired the page index's private family", () => {
    const css = readCss();
    expect(css).not.toMatch(/^\.jpt-/m);
    expect(t()).not.toContain('"jpt-row"');
  });

  it("keeps `is-done` a generic row state", () => {
    // The task and path widgets already use that class name for their own rows.
    // A bare `.almanac-list-row.is-done` would have been a third meaning for
    // it, so the finished-record styling is scoped by `is-done-able`.
    const css = readCss();
    expect(css).toContain(".almanac-list-row.is-done-able.is-done");
    expect(css).not.toMatch(/\.almanac-list-row\.is-done \{/);
  });
});

// ── buttons: emoji for things, icons for actions (2.56.17) ───────────────
//
// A button's glyph either names something the reader configured or names an
// action. The first is their data — `kind.emoji` is a choice made in Settings
// and shown wherever that kind appears — and the second is the plugin's chrome.
// 2.55.4 declined to convert `JournalSection.icon` on exactly this ground.
//
// The split held before it was written down, which is precisely why it needs an
// assertion: nothing was stopping the next action button from reaching for an
// emoji because it looked friendlier.

describe("button glyphs", () => {
  const w = () => readSrc("widgets");

  it("gives every action button a Lucide icon, never an emoji", () => {
    const src = w();
    const at = src.indexOf("BUTTON_LABELS");
    const block = src.slice(at, src.indexOf("\n};", at));
    const specs = [...block.matchAll(/"([a-z0-9-]+)": \{([^}]*)\}/g)];
    expect(specs.length).toBeGreaterThan(10);
    for (const [, id, body] of specs) {
      expect(body, id).not.toContain("emoji:");
    }
  });

  it("keeps the reader's own glyph on a kind's create button", () => {
    // The one exception, and the only one: `New ${kind.label}` is a button
    // about a thing they named and gave a glyph to.
    const src = w();
    const at = src.indexOf("label: `New ${kind.label}`");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 120)).toContain("emoji: kind.emoji");
  });

  it("draws buttons at the control radius, not as pills or as cards", () => {
    // A pill reads as a tag — something you might remove. These are actions.
    // 2.56 took the pill off and gave them the CARD's corner, which on a 22px
    // box is most of the way back to a capsule; 4.13.1 §1 moved them to the
    // control tier `--am-radius-sm` names, which is where an input, a select and
    // a stepper already sit.
    // Anchored to the start of a line: `.journal-btn {` also appears inside
    // `.journal-sec-l2 .journal-header-widgets .journal-btn {`, and a plain
    // indexOf finds the descendant rule first.
    const css = readCss();
    const at = css.indexOf("\n.journal-btn {");
    expect(at).toBeGreaterThan(0);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("border-radius: var(--am-radius-sm)");
    expect(block).not.toContain("--am-radius-pill");
    expect(block).not.toContain("--am-radius-md");
  });

  it("draws no button in the accent, at rest or under the pointer", () => {
    // 4.13.1 §1: `mod-cta` stops being a colour. It used to fill with
    // `--interactive-accent`, which put two violet capsules on a page whose
    // every other edge is a hairline — and the study table had ALREADY made an
    // exception of it ("repeated on every topic row that accent becomes noise"),
    // which is the argument generalised.
    //
    // READ THE RULE BODIES, not the file: the class name still appears — it has
    // to, because Obsidian styles `button.mod-cta` with the accent from its own
    // sheet and the neutral must be said out loud — and it still MEANS something
    // to the narrow-pane rule that keeps a primary action's label. What must not
    // appear is the hue.
    const css = readCss();
    const bodies = [
      "\n.journal-btn {",
      "\n.journal-btn:hover {",
      "\n.journal-btn.mod-cta {",
      "\n.journal-btn.mod-cta:hover {",
    ].map((sel) => {
      const at = css.indexOf(sel);
      expect(at, `no rule for ${sel.trim()}`).toBeGreaterThan(0);
      return css.slice(at, css.indexOf("}", at));
    });
    for (const body of bodies) {
      expect(body).not.toContain("var(--interactive-accent)");
      expect(body).not.toContain("var(--text-on-accent)");
    }
    // And the exception it replaced is gone rather than restated: the study
    // table keeps its SIZE rule and nothing else.
    expect(css).not.toContain(
      '.callout[data-callout="study"] table td .journal-btn.mod-cta'
    );
  });

  it("does not paint a secondary button in the card's own colour", () => {
    // `--background-secondary` is what a section card is painted with as of
    // §1.6, so a button filled with it survives on its border alone.
    const css = readCss();
    const at = css.indexOf("\n.journal-btn {");
    expect(at).toBeGreaterThan(0);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("background: transparent");
  });
});

// ── surfaces stop colliding (2.56.17) ────────────────────────────────────
//
// §1.6 painted section cards with `--background-secondary`. Three things were
// already filled with it and became invisible against their own container: a
// secondary button, a tracker cell, and — the visible symptom — a logging grid
// whose tiles had nothing between them but two borders, so it read as one box
// with dividers ruled through it.

describe("nothing is painted in its container's colour", () => {
  const css = () => readCss();

  it("fills a tracker cell against the card, not with it", () => {
    const t = css();
    const at = t.indexOf(".journal-tracker-bar .journal-tracker-cell {");
    expect(at).toBeGreaterThan(0);
    const block = t.slice(at, t.indexOf("\n}", at));
    expect(block).toContain("background: var(--am-surface-inset)");
  });

  it("keeps the section card's own fill", () => {
    // The card is the one thing that should be `--background-secondary`; the
    // fix is for the things sitting on it, not the surface itself.
    const t = css();
    const at = t.indexOf(".journal-sec-block {");
    const block = t.slice(at, t.indexOf("\n}", at));
    expect(block).toContain("background: var(--background-secondary)");
  });
});

// ── an empty slot is not a column (2.56.18) ──────────────────────────────
//
// `createListRow` always creates `.almanac-list-pills`, so a caller filling it
// after an async read need not know whether it exists. Harmless in a flex row.
// In a COLUMNED row it is a grid item, and an empty grid item still holds its
// track open — which pushed every value in the Lessons table one column right
// and dropped Status off the end onto a line of its own.

describe("columned rows lay out on the tracks they declare", () => {
  it("collapses an empty pills slot out of the grid", () => {
    const css = readCss();
    expect(css).toContain(
      ".almanac-list-main.is-columned > .almanac-list-pills:empty"
    );
  });

  it("still creates the slot unconditionally", () => {
    // The fix is in the layout, not in the component's contract: a caller that
    // fills pills later must still find them, and `:empty` stops matching the
    // moment it does.
    const src = readSrc("list-row");
    const at = src.indexOf('const pills = main.createDiv(');
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at - 400, at)).not.toContain("if (opts.pills");
  });
});

// ── nothing draws its own edge inside the card (2.56.18) ─────────────────
//
// 2.56.16 flattened the empty callout's outer box and stopped there. The box
// was half of it: the title carries a border-bottom and 1em of padding, and the
// content carries `min-height: 5em` — a floor that exists for the WRITABLE
// callouts so a field you type into does not grow under the cursor. In a card,
// a read-only sentence inherited all three.

describe("empty states inside a section card", () => {
  const css = () => readCss();

  it("drops the callout's internal rule and its height floor", () => {
    // UNCONDITIONALLY AS OF 4.11, which is where these two selectors lost their
    // `.journal-sec-block` scope. The divider and the 5em floor come from the
    // WRITABLE callouts and are wrong for a read-only sentence on any surface; the
    // box, which was the other half of the old scoped rule, is the info card's now
    // and is drawn rather than removed. See 91-card-surface.css §3a.
    const t = css();
    expect(t).toContain('.callout[data-callout="empty"] > .callout-title');
    const at = t.indexOf('.callout[data-callout="empty"] > .callout-content');
    expect(at).toBeGreaterThan(0);
    expect(t.slice(at, t.indexOf("}", at))).toContain("min-height: 0");
  });

  it("unboxes the review queue's line, the only empty line that drew one", () => {
    // `emptyLine` exists precisely because a region inside drawn chrome does
    // not need its own frame; this one had a dashed box anyway.
    expect(css()).toContain(".journal-sec-block .jrq-empty");
  });
});

// ── ONE HERO LEFT (4.13.1 §3) ────────────────────────────────────────────
//
// This pair used to check that the DIARY hero's stat cells and the JOURNALS
// hero's were one shape — 3.12 §14.3 found them built in opposite vertical
// orders, and the follow-up found the caps treatment described twice. Both were
// real and both are settled the hardest way available: the diary hero is
// deleted, so there is one cell left and nothing for it to disagree with.
//
// The checks are kept and narrowed rather than deleted, because what they were
// really pinning is a rule about the survivor — a caption is built before its
// value, and the caps voice is read from tokens rather than restated. Those are
// the terms the next hero would have to meet.
describe("the surviving hero's stat cells", () => {
  it("puts the label above the value", () => {
    // Asserted on the ORDER OF CONSTRUCTION rather than on the CSS, because that
    // is where the original difference lived: both cells are plain block
    // children, so whichever `createDiv` runs first is the one on top.
    const src = readSrc("journals-header");
    const label = src.indexOf('cls: "jjh-stat-label"');
    const value = src.indexOf('cls: "jjh-stat-value"');
    expect(label, "label").toBeGreaterThan(-1);
    expect(value, "value").toBeGreaterThan(-1);
    expect(label, "label must be built before value").toBeLessThan(value);
  });

  it("describes the caps treatment once, in tokens", () => {
    // The Journals label used to restate `font-weight: 700; letter-spacing:
    // 0.06em` where the diary's read `--am-caps-weight` and `--am-caps-tracking`.
    // Two descriptions of one thing is how the two came to differ in the first
    // place, and the tokens are what is left of the pair.
    const css = readCss();
    const at = css.indexOf(".jjh-stat-label {");
    expect(at).toBeGreaterThan(-1);
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("var(--am-caps-weight)");
    expect(body).toContain("var(--am-caps-tracking)");
  });

  it("gives all four figures one colour (4.13.5 §3)", () => {
    // ONE OF FOUR WAS THE ACCENT. `addStat` took an `accent` flag, the first
    // caller passed it, and ACTIVE DAYS printed in `--interactive-accent` beside
    // three cells in `--text-normal` — four zeroes on a fresh vault, one of them
    // violet, with nothing about the value earning it.
    //
    // BOTH ENDS, because either alone leaves the pair half-alive: markup that
    // outlives its rules is the failure the case below this one exists for, and a
    // rule that outlives its markup is the same fault mirrored.
    // READ WITH THE COMMENTS STRIPPED, because the tombstone that replaced the
    // rule names it — the argument for a deletion is worth more where the rule
    // was than in a changelog, and a "not present" assertion over raw sheet text
    // would forbid writing it down.
    expect(readSrc("journals-header")).not.toContain("is-accent");
    expect(cssRules()).not.toContain(".jjh-stat-value.is-accent");
  });

  it("does not repeat the section's own name (4.13.5 §4)", () => {
    // `Journals` at 1.5em/800, twenty pixels under a bar reading `📚 JOURNALS`.
    // The third time this project has deleted the same object — `buildAreaTitlebar`
    // in 4.8.1, the diary hero's in 4.13.1 §3 — and the eyebrow, which names the
    // period and the journals the figures cover, is what titles the band now.
    const src = readSrc("journals-header");
    expect(src).not.toContain("jjh-title");
    expect(src, "the eyebrow is what names it now").toContain('cls: "jjh-eyebrow"');
    expect(cssRules()).not.toContain(".jjh-title");
  });

  it("has no diary twin left to disagree with", () => {
    // The stylesheet must not carry rules for cells nothing builds — the failure
    // mode this project has hit from the other end, where markup outlived its
    // rules for four releases and took a screenshot to notice.
    const css = readCss();
    for (const sel of [".jdh-stats", ".jdh-stat-value", ".jdh-stat-label"]) {
      expect(css, sel).not.toContain(`${sel} {`);
    }
    expect(readSrc("diary-header")).not.toContain("jdh-stat");
  });
});

// ── the diary card is drawn like the card under it (4.13.1 §3) ───────────
//
// `month-summary` — *This month* — sits eight pixels below the diary card on the
// diary dashboard and is the same kind of object: a banner, a rule, a grid, on
// the card's own ground. The diary card answered it with an accent-washed hero
// over a recessed navigator over a boxed, cross-ruled quarter rail. Two idioms
// for one thing on one screen, which is 4.13 §1's finding one widget over.
//
// The reference is the SURVIVOR, so the day cells are deliberately not asserted
// here: both grids draw `.cal-cell` from one rule, and that rule is the thing
// this release is making everything else look like.

describe("the diary card carries no decorative fill", () => {
  const body = (sel: string): string => {
    const t = readCss();
    const at = t.indexOf(`\n${sel} {`);
    expect(at, `no rule for ${sel}`).toBeGreaterThan(0);
    return t.slice(at, t.indexOf("}", at));
  };

  it("sinks none of its bands", () => {
    // Three bands carried `--am-band-recess`: the stats readout (gone with the
    // hero), the navigator and the agenda. A sunk strip on a card whose
    // neighbour has none is the whole of what made these two read as different
    // materials.
    for (const sel of [".jc-header", ".jc-agenda"]) {
      expect(body(sel), sel).not.toContain("background:");
    }
    // And the token itself is gone, not merely unread — a named value nothing
    // reads is the dangling reference `test/tokens.test.ts` exists to catch,
    // arrived at from the other end.
    expect(readCss()).not.toContain("--am-band-recess:");
  });

  it("recesses the week chip, and heads the quarter label (4.14 §1)", () => {
    // THE PAIR SPLITS HERE, AND BOTH HALVES OF THE OLD ARGUMENT SURVIVE IT.
    // 4.13.1 §3b moved these two together because they were "the same kind of
    // object — a key set off from the things it indexes", and unrecessed both:
    // a filled patch beside three unfilled buttons says press me.
    //
    // They stopped being the same object in 4.13.6 §3, when the quarter label
    // was stacked over its months and ruled off from them, and 4.14 §1 finishes
    // the move by sizing it as the header it structurally already was. A wash on
    // a band that spans its cell and has a rule under it says HEADER, which is
    // the thing the 4.13.1 argument was never about. The week chip did not
    // change category — it is still a key beside a row — so it keeps its
    // transparent fill, and the two are now pinned apart on purpose rather than
    // drifting apart by neglect.
    expect(body(".journal-calendar .cal-week")).toContain("background: transparent");
    const label = body(".journal-calendar .jc-qlabel");
    expect(label).not.toContain("background: transparent");
    // 4% OF THE TEXT COLOUR, NOT A LITERAL AND NOT `--background-modifier-hover`.
    // It has to invert with the theme (the idiom `.cal-cell`'s ring already uses
    // at 10%), and it has to stay under the hover fill or the hover has nothing
    // left to say.
    expect(label).toContain("color-mix(in srgb, var(--text-normal) 4%, transparent)");
    expect(body(".journal-calendar .jc-qlabel:hover")).toContain(
      "background: var(--background-modifier-hover)"
    );
    // Their light-theme overrides went with the fills. A theme-specific
    // override can only ever put one back on one theme, which is what made the
    // pair drift in the first place.
    expect(readCss()).not.toContain(".theme-light .journal-calendar .jc-qlabel");
    expect(readCss()).not.toContain(".theme-light .journal-calendar .cal-week");
  });

  it("sizes the quarter header above its own content (4.14 §1)", () => {
    // THE INVERSION THIS RELEASE UNDOES. The header was 11px `--text-faint` over
    // 12.8px `--text-muted` months — smaller AND fainter than the thing it
    // heads, which is a caption, not a quiet header. Both halves are asserted
    // because fixing either one alone leaves the other saying the opposite.
    const label = body(".journal-calendar .jc-qlabel");
    expect(label).toContain("font-size: 0.8125rem");
    expect(label).toContain("min-height: 32px");
    expect(label).toContain("color: var(--text-muted)");
    // One `font-size`, not two. The rule carried `--am-text-2xs` and then the
    // rem floor that overrode it — a leftover the size change had to resolve
    // rather than add a third to.
    expect(label.match(/font-size:/g)).toHaveLength(1);
    // And the months clear the header's floor rather than sitting under it.
    expect(body(".journal-calendar .jc-mcell")).toContain("min-height: 2.25rem");
  });

  it("marks the current quarter with a tick, not with colour alone (4.14 §1)", () => {
    const t = readCss();
    // A pseudo-element, deliberately: the label's one real child is
    // `.jc-qlabel-text`, and the underline that says "this quarter has an entry"
    // has to land on that word alone (3.17 §2). A second real child is a second
    // thing for that rule to miss.
    expect(body(".journal-calendar .jc-qlabel::before")).toContain("width: 3px");
    expect(body(".journal-calendar .jc-qlabel.is-current::before")).toContain(
      "background: var(--interactive-accent)"
    );
    // The word keeps its colour too — the tick reinforces the state, it does not
    // take it over, and a theme that pitches the accent near `--text-muted`
    // leaves the tick carrying it alone.
    expect(body(".journal-calendar .jc-qlabel.is-current")).toContain(
      "color: var(--interactive-accent)"
    );
    // The door says so on hover, and on a device with no hover it rests visible
    // instead. `test/hover-reveal.test.ts` pins the general rule; this pins that
    // THIS control is the one that took it.
    expect(t).toContain(".journal-calendar .jc-qlabel:hover::after");
    expect(t).toContain(".journal-calendar .jc-qlabel::after");
  });

  it("keeps the fills that say where you are", () => {
    // THE SUBTRACTION HAS A FLOOR. Today's ring, the selected month and the
    // current week are the only things on the card telling a reader which day,
    // month and week the grid is about; a card with no state left is not quieter,
    // it is mute. What went is the QUIETER of each pair — the quarter group's
    // wash under the month cell's, on the rail's own "container and the thing
    // selected inside it" argument.
    const t = readCss();
    expect(body(".cal-cell-today")).toContain("var(--interactive-accent)");
    expect(t).toContain(".journal-calendar .jc-mcell.is-selected");
    expect(body(".journal-calendar .cal-week.is-now")).toContain(
      "var(--interactive-accent)"
    );
    expect(t).not.toContain(".jc-qgroup.is-selected");
    // And the class stops being toggled, rather than being toggled onto nothing:
    // a marker no rule reads is a rule someone writes back. Comments stripped —
    // the paragraph where the array stood explains what it did and why it went.
    expect(readSrc("calendar").replace(/\/\/.*$/gm, "")).not.toContain(
      "quarterGroups"
    );
  });

  it("rules the quarter rail as four cells, not as one frame (4.13.6 §3)", () => {
    // TWO ARGUMENTS, AND THE SECOND DOES NOT UNDO THE FIRST. 4.13.1 §3b took the
    // rail's FRAME off — a bordered, rounded box with four segments in it, on a
    // card that is otherwise a stack of horizontal bands — and kept only the rule
    // between the two rows, on the reasoning that "a line between Q1 and Q2 was
    // dividing two things a whole row of months already separates".
    //
    // That reasoning held while the label sat at the HEAD of its row, marking
    // where a group began. 4.13.6 stacks the label over its months so the rail
    // fits a phone, and then nothing marks it: Q1's three months and Q2's three
    // are six equal cells in a line. So the vertical rule comes back — not the
    // frame, which stays gone.
    // AND 4.14 §1 CLOSES IT. The frame comes back — but on a table, not on the
    // segmented control 4.13.1 refused. What that release took off was a boxed
    // INSTRUMENT with a lit segment sitting in a card made of bands; what is
    // here is four cells in a 2x2, each a header over its content. A table's
    // outer edge is not ornament: without it the outermost months are open on
    // two sides and the cross reads as two stray lines rather than as division.
    expect(body(".jc-qrail")).toContain("border: 1px solid");
    // The group is a column: header over content, which is what makes the rules
    // read as a cell's rather than as a box drawn round a strip.
    expect(body(".jc-qgroup")).toContain("flex-direction: column");
    // The cross: rows 1|2 horizontally, columns 1|2 vertically.
    expect(body(".jc-qgroup:nth-child(n + 3)")).toContain("border-top:");
    expect(body(".jc-qgroup:nth-child(2n)")).toContain("border-left:");
    // And the header is divided from its content, or it is a caption floating
    // over three buttons rather than the cell's head.
    expect(body(".journal-calendar .jc-qlabel")).toContain("border-bottom:");
    // THE GROUP STILL HAS NO BOX OF ITS OWN. This is the half of the 4.13.1
    // argument that did not expire: four bordered boxes inside a bordered rail
    // is the box-in-a-box that release was really about, and the frame going
    // back on the OUTSIDE does not license one per quarter.
    expect(body(".jc-qgroup")).not.toContain("border:");
    // And the week gutter's vertical hairline is gone with it.
    expect(readCss()).not.toContain(".jc-grid.jc-grid-weeks::before");
  });

  it("rules the rail at the day grid's weight, not the card's (4.14 §1)", () => {
    // THE STRUCTURE WAS IN THE STYLESHEET AND NOT ON THE SCREEN. Measured off
    // the 4.13.8 vault render: the cross was `--background-modifier-border`
    // (#333333) on a #282828 card — a 2.4% step in lightness, which is a line
    // you can prove and cannot see. `.cal-cell`'s ring one section below already
    // resolves to #3a3a3a, so the two halves of the same card were ruled at two
    // weights for no reason anybody chose.
    //
    // All four edges together: the frame, both arms of the cross, and the
    // header's divide. Any one of them left behind puts the mismatch back.
    for (const sel of [
      ".jc-qrail",
      ".jc-qgroup:nth-child(n + 3)",
      ".jc-qgroup:nth-child(2n)",
      ".journal-calendar .jc-qlabel",
    ]) {
      expect(body(sel), sel).toContain("var(--background-modifier-border-hover)");
      expect(body(sel), sel).not.toContain("solid var(--background-modifier-border)");
    }
  });

  it("draws the links row at the strip's own scale (4.13.7 §32)", () => {
    // ONE STRIP IS ONE SIZE. A links pill drew at `--am-text-sm` with
    // `--am-space-3` of vertical padding — about 32px — in a strip whose buttons
    // are `--am-text-2xs` with `--am-space-1`, about 21px. A flex row centres
    // what it holds, so the 11px difference splits and the pill hangs ~5.5px
    // above the line: measured on the Weekly overview, the `Today` chip paints
    // y=29–60 against a hairline at y=33, and the rule is drawn through it.
    //
    // 4.13.6 fixed a different, real defect in the same element and did not
    // change this, which is what the report coming back said.
    // LOCATED BY ITS BODY, NOT BY `body()`. That helper anchors on
    // `\n<selector> {`, and this rule's first selector ends in a COMMA — the
    // exact miss 4.13's empty-state assertion made, which passed against the
    // opposite of what shipped.
    const t = readCss();
    const at = t.indexOf(
      "\n.journal-header-widgets .journal-nav.journal-links a.jn-pill"
    );
    expect(at, "the links row keeps its own scale").toBeGreaterThan(0);
    const rule = t.slice(t.indexOf("{", at), t.indexOf("}", at));
    expect(rule).toContain("font-size: var(--am-text-2xs)");
    expect(rule).toContain("var(--am-space-1)");

    // ALL THREE SHAPES `renderTarget` BUILDS, or the row is fixed for a
    // destination that exists and not for one that does not.
    const selectors = t.slice(at, t.indexOf("{", at));
    for (const cls of [".jn-flat", ".jn-here"]) {
      expect(selectors, cls).toContain(cls);
    }

    // AND IT MATCHES WHAT THE STRIP'S BUTTONS TAKE, which is the claim: these
    // are two kinds of control in one band, not two bands.
    // (Same comma, same reason: this rule pairs level 1 with level 2.)
    const bAt = t.indexOf(
      "\n.journal-sec-l1 > .journal-header-widgets .journal-btn"
    );
    expect(bAt, "the strip's buttons moved").toBeGreaterThan(0);
    const btn = t.slice(t.indexOf("{", bAt), t.indexOf("}", bAt));
    expect(btn).toContain("font-size: var(--am-text-2xs)");
    expect(btn).toContain("var(--am-space-1)");
  });

  it("lays every slot of the links row out as a row (4.13.6 §2)", () => {
    // THE DEFECT WAS AN OMISSION, NOT A VALUE. `.jn-side` and `.jn-center` both
    // declare `display: flex; align-items: center`; `.jn-right` declared only its
    // auto margin, so it stayed a BLOCK and laid its children out as inline
    // content on a text baseline. What it holds is the scope button — an `<a>` at
    // `display: inline-flex`, ~32px tall against a ~19px line box — and an
    // inline-level box that tall does not grow its parent. It hangs above the
    // baseline and overflows.
    //
    // Measured on the Monthly overview: the button paints y=133–164 while the
    // hairline above it is at y=137, so the rule runs through the control four
    // pixels down. `links:today,scopes` is `band: masthead` in
    // `diary-sections.ts`, which is why every overview showed it.
    //
    // ASSERTED AGAINST ITS TWO SIBLINGS rather than against the literal
    // declarations, because the claim is that the three slots are one object: a
    // fourth slot, or a rewrite of these, has to keep them agreeing.
    for (const sel of [
      ".journal-nav .jn-side",
      ".journal-nav .jn-center",
      ".journal-nav .jn-right",
    ]) {
      expect(body(sel), sel).toContain("align-items: center");
      expect(body(sel), sel).toMatch(/display:\s*(inline-)?flex/);
    }
    // And the row it sits in still centres what it holds, which is what turns a
    // real box into a centred one rather than a taller overflow.
    expect(body(".journal-nav")).toContain("align-items: center");
  });

  it("stops holding a horizontal budget for the quarter label (4.13.6 §3)", () => {
    // THE WIDTH IS THE POINT OF THE CHANGE. Each row of the rail was eight
    // columns — six months plus two labels at a `2.9rem` floor each — and the
    // rail is the widest fixed object on the diary card, so it is what overflows
    // a phone. Stacked, a row is six columns and the ~93px the labels held goes
    // to the months.
    //
    // Asserted as the ABSENCE of the floor rather than as the presence of the
    // column direction, because those are two different claims and the second is
    // already made above: a `min-width` left behind would still be saying the
    // label has a share of the row, and would come back into force the day
    // someone put it back in a row without reading this.
    //
    // COMMENTS STRIPPED, for the reason `cssRules()` exists: the tombstone that
    // replaced the declaration quotes it, and an "is absent" assertion over raw
    // sheet text would forbid writing down what was removed and why.
    const t = cssRules();
    const at = t.indexOf("\n.journal-calendar .jc-qlabel {");
    expect(at).toBeGreaterThan(0);
    expect(t.slice(at, t.indexOf("}", at))).not.toContain("min-width:");
  });

  it("opens on a strip of controls rather than a greeting", () => {
    // None of the hero's prose or its numbers survives; the controls that are
    // not already on the card do.
    //
    // THREE OF THE FIVE WENT IN 4.13.2 §1, and the rule is what is asserted
    // rather than the count: a control this strip draws must not point at
    // something the card under it points at. Open today and Yesterday are the
    // ringed cell and the cell before it; All entries is the diary folder, which
    // the page head links. Capture writes without leaving the note and Search
    // reaches notes no calendar can point at, so those two stay.
    const strip = readSrc("diary-header");
    expect(strip).toContain('"Capture"');
    expect(strip).toContain("buildBannerLinks");
    // Comments stripped: the paragraph in `buildDiaryActions` names all three of
    // the removed controls, and that account is the point of it.
    const built = strip.replace(/\/\/.*$/gm, "");
    for (const label of ["Open today", "Start today", "Yesterday"]) {
      expect(built, label).not.toContain(`"${label}"`);
    }
    // And the row it appends carries Search alone. The default is where that is
    // decided — `buildBannerLinks` takes an override and the single caller does
    // not use one, so a constant that still said `all` would be the row's real
    // definition disagreeing with itself.
    const links = readSrc("links").replace(/\/\/.*$/gm, "");
    expect(links).toContain('const BANNER_LINK_IDS = ["search"]');
    // COMMENTS STRIPPED for the negatives, which is the trap every file in this
    // project sets: the module's header is the ACCOUNT of the hero it replaced
    // and says "greeting" four times. What must not come back is the element.
    const code = strip.replace(/\/\/.*$/gm, "");
    expect(code).not.toContain("greeting");
    expect(code).not.toContain("jdh-status");
    // AND NO BUTTON IN IT IS PRIMARY. §1 flattened the tier out of the plugin;
    // a strip of four actions with one fill in it is the noise that argued for.
    expect(code).not.toContain("mod-cta");
    // The strip is the section bar's object at a third scale, so it carries the
    // hairline and the 4px of air `.journal-group-foot` does — below rather than
    // above, because it opens a card instead of closing a header.
    expect(body(".jc-actions")).toContain(
      "border-bottom: var(--am-rule-hair) solid"
    );
    expect(body(".jc-actions")).toContain("padding-bottom: 4px");
    // ONE AT EACH END, AS OF 4.13.3, where the strip was right-aligned like an
    // ordinary actions cluster. It does not hold one: Capture writes and Search
    // navigates, and two kinds of thing pushed together at one end have to be
    // told apart by reading them.
    expect(body(".jc-actions")).toContain("justify-content: space-between");
  });
});

// ── one directive grammar (4.1 §10.3) ─────────────────────────────────────
//
// The same rule as `createListRow` above, applied to the thing 4.1 §3 refused.
// The v4 draft proposed `widget: calendar`, dispatched through a new
// `parseAlmanacDirectives()` in a new file — and §3's objection was not that a
// second parser is untidy but that it is a SECOND GRAMMAR, agreeing with the
// first only for as long as somebody keeps them in step. `directive-grammar.ts`
// exists because that already happened once: the grammar was written three
// times in three places and agreed by accident.
//
// These assert the shape, not a string in a file: a directive is split in one
// module, and every other module that needs a keyword off a line imports it.
describe("one directive grammar", () => {
  it("splits a directive line in exactly one module", () => {
    const defs = all.filter((f) =>
      src(f).includes("export function splitDirective(")
    );
    expect(defs).toEqual(["directive-grammar"]);
  });

  it("has no second parser under another name", () => {
    // The draft's spelling, and the two shapes it would most likely come back
    // as. A parser that is not exported is still a second grammar — the point
    // is that no module derives a keyword from a line for itself.
    for (const banned of [
      "parseAlmanacDirectives",
      "parseDirectives(",
      "parseDirectiveLine(",
    ]) {
      const found = all.filter((f) => src(f).includes(banned));
      expect(found, banned).toEqual([]);
    }
  });

  it("reads the frame modifier through the grammar, not off the line", () => {
    // `frame:` is the newest keyword and so the likeliest place for a local
    // copy: testing `line.startsWith("frame:")` at the dispatcher is one line
    // and would work, and would then miss the spacing the grammar tolerates.
    // The dispatcher imports the predicate instead.
    const widgets = readSrc("widgets");
    expect(widgets).toContain("isFrameLine");
    expect(widgets).not.toContain('startsWith("frame');
    expect(widgets).not.toMatch(/\/\^\\s\*frame/);
  });

  it("keeps the frame keyword itself in one place", () => {
    // The literal `"frame"` belongs to the grammar. Anywhere else it is a
    // second spelling of one name, which is what `RETIRED_WORDS` exists to
    // delete — and the catalogues compose `frame: section` as note TEXT, which
    // is the string a reader types, not a copy of the keyword constant.
    const defs = all.filter((f) =>
      src(f).includes('FRAME_KEYWORD = "frame"')
    );
    expect(defs).toEqual(["directive-grammar"]);
  });
});

// ── 4.14: the diary calendar says where you are ───────────────────────────
//
// Three surfaces read off one vault render and fixed together, because they are
// one fault at three scales: the card asserted its structure and its state in
// the stylesheet and drew neither strongly enough to be seen. The rail's cross
// was a 2.4% step in lightness; today was one hairline on a grid of hairlines;
// twelve month tiles at 157x97px carried one word each.

describe("the diary calendar draws the state it claims", () => {
  const body = (sel: string): string => {
    const t = readCss();
    const at = t.indexOf(`\n${sel} {`);
    expect(at, `no rule for ${sel}`).toBeGreaterThan(0);
    return t.slice(at, t.indexOf("}", at));
  };

  it("gives the selected month an edge as well as a tint (4.14 §1)", () => {
    // Measured off the 4.13.8 render: the pixel at this cell's boundary was
    // #383149 on BOTH sides — a flat tint and nothing else, on a card where
    // every other control is drawn with an edge. It is the eye that completes it
    // into a box, and a reader reporting "the selected month has a violet
    // border" is describing something the stylesheet never drew.
    //
    // The ring is the construction `.jc-mcell.is-now` already uses one rule
    // above, in the accent instead of the border colour, so the two states read
    // as one idea at two strengths rather than as two inventions.
    // LOCATED BY ITS BODY, NOT BY `body()`. That helper anchors on
    // `\n<selector> {` and this rule's first selector ends in a COMMA — the
    // same miss 4.13's empty-state assertion made, which passed against the
    // opposite of what shipped, and 4.13.7's links row made again.
    const t = readCss();
    const at = t.indexOf("\n.journal-calendar .jc-mcell.is-selected,");
    expect(at, "the selected month has a rule").toBeGreaterThan(0);
    const sel = t.slice(t.indexOf("{", at), t.indexOf("}", at));
    expect(sel).toContain("inset 0 0 0 1px var(--interactive-accent)");
    expect(sel).toContain("color-mix(in srgb, var(--interactive-accent) 16%");
    expect(body(".journal-calendar .jc-mcell.is-now")).toContain(
      "inset 0 0 0 1px var(--background-modifier-border-hover)"
    );
  });

  it("gives today a fill as well as a ring (4.14 §2)", () => {
    // It was a 1.5px accent ring and a bold numeral on a cell whose thirty
    // neighbours each carry a ring of their own — so the whole of "today" was
    // one hairline's worth of hue, measured at #8a5cf5 against #3a3a3a.
    const today = body(".cal-cell-today");
    expect(today).toContain("color-mix(in srgb, var(--interactive-accent) 16%");
    expect(today).toContain("var(--am-rule) var(--interactive-accent)");
    // NOT `--text-on-accent`, WHICH WOULD BE THE OBVIOUS WRONG ANSWER. That
    // variable is for a SOLID accent fill; over a 16% wash it puts white on pale
    // lavender for every light-theme reader. The readable colour on a ground
    // that inverts is the one that inverts with it.
    expect(today).not.toContain("--text-on-accent");
    expect(today).toContain("color: var(--text-normal)");
  });

  it("tells the week apart from the day inside it (4.14 §2)", () => {
    // Both are "you are here", and they are not the same claim — the day is
    // where you are, the row is merely the row it is in. Giving the chip the
    // same 16% tint and nothing else made them one signal drawn twice, so the
    // chip takes a second CHANNEL rather than more of the first.
    const wk = body(".journal-calendar .cal-week.is-now");
    expect(wk).toContain("color-mix(in srgb, var(--interactive-accent) 16%");
    expect(wk).toContain("inset var(--am-rule) 0 0 0 var(--interactive-accent)");
    // The chip at rest is still unfilled — the edge is what `is-now` adds, not a
    // recess put back on every week (see the 4.14 §1 split above).
    expect(body(".journal-calendar .cal-week")).toContain("background: transparent");
  });

  it("counts a month's days off the entries, not off the review note (4.14 §3)", () => {
    // TWO DIFFERENT FACTS. `monthMap` says a Monthly Overview note exists, which
    // is what the tile's border has always drawn; the tally says how many days
    // were written up inside the month. Counting the wrong one would make a tile
    // report 1 for a month with thirty entries.
    const t = readSrc("calendar");
    expect(t).toContain("daysByMonth");
    expect(t).toContain('cls: "cal-month-count"');
    expect(t).toContain('cls: "cal-month-bar"');
    // Off `dayMap`, and NOT off the mood array beside it: a mood is optional and
    // an entry is not, so a vault with the tracker switched off would otherwise
    // read as a year of nothing.
    // The window is the whole loop, taken to its last statement rather than to
    // the first `}` — which is the destructuring brace in `for (const { iso,
    // mood } of …)`, four characters in.
    const at = t.indexOf("const daysByMonth");
    expect(at, "the tally is counted in one pass").toBeGreaterThan(0);
    const loop = t.slice(at, t.indexOf("moodByMonth.set(mk, arr);", at));
    expect(loop).toContain("dayMap.values()");
    expect(loop.indexOf("daysByMonth.set")).toBeLessThan(loop.indexOf("mood == null"));
  });

  it("says nothing with a dash rather than with a zero (4.14 §3)", () => {
    // Twelve `0`s down a fresh vault's first year is a scorecard nobody asked
    // for. The dash says the slot is empty, which is the same thing the bar says
    // by not being drawn — so the two agree instead of one of them grading you.
    const t = readSrc("calendar");
    expect(t).toContain('logged > 0 ? String(logged) : "—"');
    expect(t).toMatch(/if \(logged > 0\) \{/);
    // The bar is scaled against the month's own length, not against the year's
    // fullest month — a relative scale would redraw all twelve tiles every time
    // one of them grew.
    expect(t).toContain("daysInMonth()");
  });

  it("draws the tally without letting it outrank the month (4.14 §3)", () => {
    expect(body(".cal-month-count")).toContain("font-size: var(--am-text-2xs)");
    // Tabular figures: 8 and 21 in proportional numerals wander by a couple of
    // pixels, which is visible with twelve of them stacked four across.
    expect(body(".cal-month-count")).toContain("font-variant-numeric: tabular-nums");
    expect(body(".cal-month-bar")).toContain("height: 3px");
    // The bar runs a rounded box's full width, so the tile has to clip or its
    // square ends sit outside the radius at both bottom corners.
    expect(body(".cal-cell-month")).toContain("overflow: hidden");
  });

  it("repairs the selected tile's fill, which had been dead (4.14 §3)", () => {
    // THE BUG, NOT A PREFERENCE. `.cal-cell-selected` asked for a solid accent
    // tile at 0,1,0 while `.cal-cell-month.cal-cell-has-entry` repainted the
    // background at 0,2,0 — so the fill vanished the moment the selected month
    // had a review note, which is most of the time. Measured off the 4.13.8
    // render: the selected tile's interior is #1c1c1c, and the violet edge on it
    // is `.cal-cell-today`'s ring, not this rule at all.
    const css = readCss();
    // Specific enough to win now. A bare `.cal-cell-selected {` rule coming back
    // is the defect returning, whatever it declares.
    expect(css).toContain("\n.cal-cell-month.cal-cell-selected {");
    expect(cssRules()).not.toContain("\n.cal-cell-selected {");
    const sel = body(".cal-cell-month.cal-cell-selected");
    // AND IT IS NOT REPAIRED BY WINNING HARDER. A solid accent tile 157x97px is
    // the loudest object on either diary page, and it is where the count and the
    // bar this release added both stop being legible. Selection is drawn the way
    // the rest of the card draws it.
    expect(sel).not.toContain("background: var(--interactive-accent);");
    expect(sel).toContain("color-mix(in srgb, var(--interactive-accent) 16%");
    expect(sel).toContain("inset 3px 0 0 0 var(--interactive-accent)");
  });
});

// ── 4.19.1: the banner treatments the render settled ──────────────────
//
// 4.19 shipped the banner unrendered and said so in its roadmap's §"What this
// release owes". The first picture of a real vault answered three of the four
// questions it listed and found one defect the suite could not see, because a
// block's head is DRAWN rather than composed and every 4.19 test asserts what a
// page composes to.

describe("the banner is one material, and the minimal one is quiet", () => {
  const body = (sel: string): string => {
    const t = readCss();
    const at = t.indexOf(`\n${sel} {`);
    expect(at, `no rule for ${sel}`).toBeGreaterThan(0);
    return t.slice(at, t.indexOf("}", at));
  };

  it("puts the figure on the block, and takes it off the card (V3)", () => {
    // THE WASH AND THE HATCH RUN THE WHOLE BANNER. Stopping them at the rule
    // made the banner read as a figured card with a plain strip bolted under
    // it — two materials in one block, which is what the merge existed to end.
    expect(body(".journal-page-banner::before")).toContain("repeating-linear-gradient");
    expect(body(".journal-page-banner::before")).toContain("--interactive-accent");

    // AND ONLY ONCE. Two figures over one banner is two 45° hatches at
    // different origins, beating against each other at the seam — the one
    // artefact a texture cannot survive, and invisible in any test that only
    // asks whether the figure is present.
    expect(body(".journal-page-banner > .jtc-card::before")).toContain("content: none");

    // The children sit above it rather than under it. `inset: 0` needs a
    // positioned ancestor or it resolves against the code-block widget in Live
    // Preview, which is 4.7.0's grip bug.
    for (const sel of [
      ".journal-page-banner",
      ".journal-page-banner > .jtc-card",
      ".journal-page-banner > .journal-links-card",
    ]) {
      expect(body(sel), sel).toContain("position: relative");
    }
  });

  it("separates the banner's two bands with a hairline, not a rule", () => {
    // `--am-rule` is 2px and is what separates two CARDS. This separates two
    // bands of one card, and at full weight it re-drew the seam the figure had
    // just dissolved.
    const pills = body(".journal-page-banner > .journal-links-card");
    expect(pills).toContain("--am-rule-hair");
    expect(pills).not.toContain("border-top: var(--am-rule) ");
  });

  it("gives the entry and the journal leaf one strip height and one name size (M2)", () => {
    // ── THIS TEST PASSED WHILE THE THING IT CHECKS WAS FALSE ────────
    //
    // It read `padding: 7px 14px 8px` out of the entry's rule and out of the
    // leaf's, and both were there — while a THIRD rule a few lines further down
    // 30-header-bars.css overrode the entry's with `padding-top: 20px;
    // padding-bottom: 19px`, a leftover from 3.7. The two strips differed by
    // about 24px, under a comment on each saying they were the same numbers
    // "because a reader moving between an entry and a journal note should not
    // see the strip change height".
    //
    // TWO COPIES OF A VALUE CANNOT SEE A THIRD, which is the general form of
    // that failure and the reason this assertion changed shape rather than
    // gaining a case. Both bands carry `journal-banner-name` as of 4.21.1, so
    // there is ONE rule; a padding that reaches one page kind reaches the other
    // by construction, and no later rule can part them without naming the class
    // they share.
    const band = body(".journal-slim-banner .journal-banner-name");
    expect(band).toContain("padding: 13px 14px 12px");
    // AND NEITHER HEADER PADS ITSELF BACK APART. Both of the old per-banner
    // rules are gone: the entry's entirely, and the leaf's down to the zeroing
    // that lets its two bands bleed the card's padding themselves.
    expect(readCss()).not.toContain(".journal-entry-banner .journal-entry-header {");
    expect(body(".journal-study-banner .journal-study-header")).toContain(
      "padding: 0"
    );

    // THE ENTRY'S NAME WAS THE SIZE OF A SECTION BAR'S LABEL. It inherited
    // `--am-bar-text` (0.7em) from `.journal-header-title`, so the date — which
    // is what the note IS — was set smaller than the words under it.
    // The leaf's rule is a grouped selector — the name and the input it opens on
    // rename have to be one object, or the strip jumps height on the first
    // keystroke — so the rule is found by either spelling.
    const rule = (sel: string): string => {
      const t = readCss();
      const at = Math.max(t.indexOf(`\n${sel} {`), t.indexOf(`\n${sel},`));
      expect(at, `no rule for ${sel}`).toBeGreaterThan(0);
      return t.slice(at, t.indexOf("}", at));
    };
    for (const sel of [
      ".journal-entry-header .jeh-title",
      ".journal-study-header .jsh-title-text",
    ]) {
      expect(rule(sel), sel).toContain("font-size: var(--am-text-lg)");
      expect(rule(sel), sel).toContain("font-weight: 700");
    }
  });

  it("sets the alias above the file's name, and nothing else above either", () => {
    // ── 4.21.1 REVERSES 4.21 ON ONE POINT, DELIBERATELY ─────────────
    //
    // 4.21 moved the alias out of the banner and set it at `--am-text-sm`,
    // reasoning that the file's name is what the note is called and this is a
    // label on it. The first render showed the cost: a daily entry is named
    // `Day-2026-08-13`, so the largest words on the page were an ADDRESS, and
    // the one line saying what the day was sat under them at label size.
    //
    // The alias is the headline. Asserted as a RELATION rather than as a size,
    // because the failure the release fixes is the ordering — a later retune
    // that moved either token would satisfy two literals and break this.
    const scale = (name: string): number => {
      const t = readCss();
      const at = t.indexOf(`${name}:`);
      expect(at, name).toBeGreaterThan(0);
      return Number(/([\d.]+)em/.exec(t.slice(at, at + 60))?.[1]);
    };
    expect(scale("--am-text-xl")).toBeGreaterThan(scale("--am-text-lg"));
    expect(body(".jec-title-text")).toContain("font-size: var(--am-text-xl)");
    for (const sel of [
      ".journal-entry-header .jeh-title",
      ".journal-study-header .jsh-title-text",
    ]) {
      const t = readCss();
      const at = Math.max(t.indexOf(`\n${sel} {`), t.indexOf(`\n${sel},`));
      expect(at, sel).toBeGreaterThan(0);
      expect(t.slice(at, t.indexOf("}", at)), sel).toContain("--am-text-lg");
    }
    // AND THE INPUT IS THE SAME OBJECT AS THE TEXT IT REPLACES, or the strip
    // jumps height on the first keystroke of a rename.
    // AND THE SELECTOR IS SPECIFIC ENOUGH TO WIN (4.21.2). Obsidian styles
    // `input[type="text"]` at (0,1,1) and a bare `.jec-title-input` is (0,1,0),
    // so the size above was written, shipped, and never applied — clicking the
    // title shrank it by a third and re-wrapped the row under the cursor. Pinned
    // as a rule about the SELECTOR, because the declaration was already correct.
    expect(body(".journal-entry-context input.jec-title-input")).toContain(
      "font-size: var(--am-text-xl)"
    );
    expect(readCss()).not.toContain("\n.jec-title-input {");
  });

  it("captions the tracker grid in the strip's register, not a section bar's", () => {
    // The grid is the only section in the plugin with a card and no name — it
    // is a MARKED REGION rather than a directive, so there is no line in the
    // fence for a `header:` title to be an argument to. The block says it
    // instead, as a caption.
    //
    // SMALL CAPS AND FAINT, which is the register the page-context strip above
    // it uses for its own facts. Anything louder would compete with the alias
    // two lines up, which is the one piece of type on the card meant to be read.
    const label = body(".jth-label");
    expect(label).toContain("font-size: var(--am-text-2xs)");
    expect(label).toContain("text-transform: uppercase");
    expect(label).toContain("color: var(--text-faint)");

    // ── AND IT IS PUSHED, NOT SPLIT (4.21.2) ────────────────────────
    //
    // The row's other half is the entry's date, and a journal note has no date
    // to put there — so on that surface the row holds the label alone.
    // `space-between` would strand it on the LEFT, where it reads as a heading
    // over the whole card rather than as a caption on the grid beneath it.
    expect(label).toContain("margin-left: auto");
    expect(body(".journal-tracker-head")).not.toContain("space-between");
  });

  it("rules under the caption, not between it and the strip above it", () => {
    // ── WHICH SIDE OF THE HAIRLINE THE CAPTION IS ON (4.21.3) ───────
    //
    // The card's head is the alias line and the caption line; the rule separates
    // what the page knows about itself from the grid you fill in. It ran between
    // the two halves of the head, which left "Fri 14 Aug 2026 / TRACKING:" on the
    // grid's side of a rule it is the label for.
    //
    // THE CLAIM IS "THE LAST BAND ABOVE THE GRID OWNS THE DIVIDER", and the
    // caption is always that band — a strip is optional on both page kinds, and
    // the caption is not. So the rule moved rather than being duplicated.
    expect(body(".journal-tracker-head")).toContain("border-bottom: var(--am-rule)");
    // AND THE TWO STRIPS ARE ONE RULE, which is why this reads one body rather
    // than two. They were two copies of five declarations, and a divider that
    // moved in one copy would have left a journal note with a rule under its
    // level line AND one under its caption.
    const css = readCss();
    const at = css.indexOf(".journal-tracker-section > .journal-entry-context,");
    expect(at, "the two page-context strips are not one rule").toBeGreaterThan(0);
    const strips = css.slice(at, css.indexOf("}", at));
    expect(strips).toContain(".journal-tracker-section > .journal-note-context");
    expect(strips).toContain("border-bottom: none");
  });

  it("applies subtle banner tinting and engraved texture to the slim banner", () => {
    // The slim banner receives subtle accent tinting and fine engraved hatching
    // texture on .journal-slim-banner::before, while child wrappers stay clean.
    const css = readCss();
    expect(css).toContain(".journal-slim-banner::before");
    expect(css).toContain("--am-head-figure");
    for (const sel of [".journal-entry-banner", ".journal-study-banner"]) {
      expect(css, sel).not.toContain(`${sel}::before {`);
    }
  });
});
