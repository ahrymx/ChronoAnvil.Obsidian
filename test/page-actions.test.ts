// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The banner's action row. 1.0.11.
//
// WHAT IS PROVABLE HERE AND WHAT IS NOT. There is no jsdom in this project, so
// nothing below builds a button — the renderer is covered by reading its source
// for the two properties that matter (it takes the path from the fence, and it
// draws from the table) rather than by running it. Everything else is data: the
// table, the filter, the composition, and the guard that keeps a note written
// before this release from growing a second banner.

import { describe, expect, it } from "vitest";
import { PAGE_ACTIONS, pageActionsOn } from "../src/core/page-actions";
import {
  NOT_PAGE_WIDGETS,
  WIDGETS,
  isPageWidget,
} from "../src/core/widget-registry";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { goldenNotes } from "./golden-notes";
import {
  applySections,
  journalSectionModel,
  sectionsPresent,
} from "../src/journals/journal-plan";
import { composeTemplate } from "../src/journals/custom-journal";
import { templateTargets } from "../src/journals/journal-sections";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { readCss, readSrc } from "./sources";

const ACTIONS_LINE = "actions";

// The surfaces that compose the row, by golden-note name prefix, and the ones
// that must not. Stated as data because the whole decision is which list a
// surface is in — see `BannerSpec.actions`.
const COMPOSES = ["journal-", "entry-"];
const WITHHOLDS = ["home", "search", "diary-folder", "logbooks-folder", "period-", "logbook-"];

describe("the action table", () => {
  it("gives every action an id, a label, an icon and a blurb", () => {
    for (const a of PAGE_ACTIONS) {
      expect(a.id, a.id).toMatch(/^page-[a-z-]+$/);
      expect(a.label.length, a.id).toBeGreaterThan(0);
      expect(a.icon.length, a.id).toBeGreaterThan(0);
      expect(a.blurb.length, a.id).toBeGreaterThan(0);
      // Sentence case, like every other label in the tree — `section-titles`
      // sweeps the catalogues for this and cannot see a table it does not know
      // about, so the rule is restated where the strings are.
      expect(a.label[0], a.id).toBe(a.label[0].toUpperCase());
      expect(a.label.slice(1), a.id).toBe(a.label.slice(1).toLowerCase());
    }
  });

  it("names each action once", () => {
    const ids = PAGE_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refuses to offer the diary link on a diary entry", () => {
    // The one `when` either shipped action needs: an entry IS the diary, so a
    // button offering to join it to itself asks a question with no true answer.
    const link = PAGE_ACTIONS.find((a) => a.id === "page-link-diary")!;
    expect(link.when).toBeTypeOf("function");
    expect(link.when!({ path: "x.md", surface: "entry" })).toBe(false);
    expect(link.when!({ path: "x.md", surface: "journal" })).toBe(true);
    expect(link.when!({ path: "x.md", surface: "dashboard" })).toBe(true);
  });

  it("offers the copy everywhere, including a managed template", () => {
    // No `when` at all, which is the assertion: `copyPlainMarkdownHere` already
    // argues that an entry template's export is its empty fields and is a
    // truthful answer, so there is nothing here to refuse.
    const copy = PAGE_ACTIONS.find((a) => a.id === "page-copy-plain")!;
    expect(copy.when).toBeUndefined();
  });
});

describe("which actions a reader is left with", () => {
  it("ships every action on, and records refusals rather than acceptances", () => {
    // THE DIRECTION IS THE WHOLE DESIGN. `off` names what is hidden, so an
    // action added in a later release is on for every existing vault — nobody's
    // saved list can name an id that did not exist when they last looked at the
    // settings tab. An `on` list would ship the opposite and the bug would be
    // invisible, because a row missing a new button looks exactly like a row a
    // reader chose.
    expect(DEFAULT_SETTINGS.pageActions.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.pageActions.off).toEqual([]);
    expect(pageActionsOn([])).toEqual([...PAGE_ACTIONS]);
  });

  it("drops exactly the ids the reader turned off, and keeps the order", () => {
    const off = pageActionsOn(["page-copy-plain"]);
    expect(off.map((a) => a.id)).toEqual(
      PAGE_ACTIONS.filter((a) => a.id !== "page-copy-plain").map((a) => a.id)
    );
  });

  it("ignores an id it no longer has, rather than dropping a neighbour", () => {
    // A reader who turned off an action that a later release removed keeps a
    // stale id in their settings for ever — nothing prunes it — so the filter
    // has to be indifferent to one.
    expect(pageActionsOn(["page-something-retired"])).toEqual([...PAGE_ACTIONS]);
  });
});

describe("which pages compose the row", () => {
  const bannerFenceOf = (text: string): string[] => {
    const lines = text.split("\n");
    const open = lines.findIndex(
      (l, i) =>
        l.trim() === "```chronoanvil" &&
        lines.slice(i + 1).some((n) => /^(title|journal-header|entry-header)\b/.test(n.trim()))
    );
    if (open === -1) return [];
    const close = lines.findIndex((l, i) => i > open && l.trim() === "```");
    return lines.slice(open + 1, close).map((l) => l.trim());
  };

  it("puts it in the banner's own fence on every page that has it", () => {
    // NOT MERELY PRESENT IN THE NOTE — in the BANNER's fence, which is what
    // makes it land inside the banner's card without any composer learning to
    // weld. A page that grew the line in a fence of its own would render a
    // second card and this assertion is what catches that.
    let seen = 0;
    for (const note of goldenNotes()) {
      if (!note.text.includes(`\n${ACTIONS_LINE}\n`)) continue;
      seen++;
      expect(bannerFenceOf(note.text), note.name).toContain(ACTIONS_LINE);
    }
    expect(seen).toBeGreaterThan(10);
  });

  it("composes it on the three chosen surfaces and withholds it from the rest", () => {
    // The surface choice, asserted over every note the plugin composes. The
    // homepage, Search and the two folder notes are places a reader passes
    // through: neither shipped action means anything on a page that is not
    // about a subject or a day.
    const withRow: string[] = [];
    const without: string[] = [];
    for (const note of goldenNotes()) {
      (bannerFenceOf(note.text).includes(ACTIONS_LINE) ? withRow : without).push(
        note.name
      );
    }
    expect(withRow.length).toBeGreaterThan(10);
    for (const name of withRow) {
      expect(COMPOSES.some((p) => name.startsWith(p)), name).toBe(true);
    }
    for (const name of without) {
      expect(WITHHOLDS.some((p) => name.startsWith(p)), name).toBe(true);
    }
  });

  it("draws it under the page's name, never above it", () => {
    // The banner reads as what this page is, where it goes, and what you can do
    // to it. A row of controls above the name inverts that, and on a welded card
    // it would sit between the card's top edge and the title.
    for (const note of goldenNotes()) {
      const body = bannerFenceOf(note.text);
      const at = body.indexOf(ACTIONS_LINE);
      if (at === -1) continue;
      const names = body.findIndex((l) =>
        /^(title|journal-header|entry-header)\b/.test(l)
      );
      expect(names, note.name).toBeGreaterThanOrEqual(0);
      expect(at, note.name).toBeGreaterThan(names);
    }
  });
});

describe("a note written before the row existed", () => {
  // THE 5.28 DEFECT, WHICH IS THE ONE THIS FEATURE COULD REPEAT. A banner fence
  // that gains a keyword the catalogue did not previously write is exactly the
  // shape that broke there: the signature stopped matching, the block belonged
  // to nobody, and *Edit sections…* appended a SECOND grid. Here the equivalent
  // failure would be a second banner on every note in every vault.
  //
  // The two halves of the defence are the claim and the anchor, and each is
  // asserted below against the source rather than against a rendered note,
  // because the failure is a declaration that was not updated.

  it("is still found, because the banner anchors on its name alone", () => {
    // `locate`/`anchor` must not have grown the new line. A banner probed for
    // both of its lines reports ABSENT on every note written before this
    // release, and repair then composes a whole new one.
    const journal = readSrc("journals/journal-sections.ts");
    expect(journal).toContain("locate: (t) => probe(t, /^journal-header\\s*$/m)");
    const flat = readSrc("core/note-sections.ts");
    expect(flat).not.toContain(`anchor: /^${ACTIONS_LINE}\\b/m`);
  });

  // A Study leaf index, and the same note with the action row cut back out of
  // it — which is exactly the file every vault has today.
  const beforeAndAfter = () => {
    const target = templateTargets(STUDY_JOURNAL).find((t) =>
      t.file.includes("topic")
    )!;
    const text = composeTemplate(
      target.ctx,
      undefined,
      STUDY_JOURNAL.layout?.[target.key]
    );
    expect(text).toContain(`\n${ACTIONS_LINE}\n`);
    return { ctx: target.ctx, text, old: text.replace(`\n${ACTIONS_LINE}\n`, "\n") };
  };

  it("reads back exactly as the note that has the row, on every surface", () => {
    // THE WIDEST FORM OF THE 5.28 GUARD, and the one worth running: every note
    // this plugin composes, with the line cut back out of it, is the file every
    // vault already holds. Each must attribute its sections to exactly the same
    // sections as the note that has the row, and each must plan `keep` for all
    // of them — no add, no rewrite, no second banner.
    //
    // IT FAILED BEFORE `NOT_SIGNATURE_KEYWORDS`, and not in the shape the plan
    // predicted: a Study topic index reported NOTHING AT ALL rather than a
    // duplicated banner. The banner heads a welded stack, `ownersBySignature`
    // deals signatures off the front, and a first member it cannot name ends
    // the walk — so `trackers` and `children` were lost with it.
    let seen = 0;
    for (const note of goldenNotes()) {
      if (!note.text.includes(`\n${ACTIONS_LINE}\n`)) continue;
      seen++;
      const model = note.model();
      const old = note.text.replace(`\n${ACTIONS_LINE}\n`, "\n");
      const present = model.present(old);
      expect(present, note.name).toEqual(model.present(note.text));
      expect(present, note.name).toContain("banner");
      const ops = model.plan(
        old,
        present.map((id) => ({ id }))
      );
      expect(
        ops.map((o) => o.kind).filter((k) => k !== "keep"),
        note.name
      ).toEqual([]);
    }
    expect(seen).toBeGreaterThan(20);
  });

  it("still reports ONE banner, and does not plan a second", () => {
    // THE FAILURE THIS GUARDS IS THE 5.28 ONE, in its new clothes: a banner the
    // catalogue no longer recognises is a banner *Edit sections…* offers to
    // ADD, and the reader ends up with two. Asserted on the plan rather than on
    // the source, because how the match is made is a means and this is the end.
    //
    // IT FAILED WHEN IT WAS WRITTEN, and what it caught was worse than the
    // banner: the old note reported NO SECTIONS AT ALL. The banner is the head
    // of a welded stack, `ownersBySignature` deals signatures off the front,
    // and a first member it cannot name ends the walk — so `trackers` and
    // `children` went with it. `NOT_SIGNATURE_KEYWORDS` in `journal-plan.ts` is
    // the fix and holds the argument.
    const { ctx, text, old } = beforeAndAfter();
    const present = sectionsPresent(old, ctx);
    expect(present).toContain("banner");
    expect(present.filter((id) => id === "banner")).toHaveLength(1);
    // The whole card, not just its head — the walk is all-or-nothing.
    expect(present).toEqual(sectionsPresent(text, ctx));
  });

  it("is left exactly as the reader has it", () => {
    // NEWLY-COMPOSED PAGES ONLY was the call, and this is what it costs and what
    // it buys. `applySections` returns null for "nothing to write": saving the
    // old note with the sections it already has plans no add, no move and no
    // rewrite, so a vault full of banners without the row is not quietly
    // rewritten by opening *Edit sections…* on it. The row arrives when the note
    // is composed again, and not before.
    //
    // THE SAME ASSERTION ON THE NEW NOTE is what makes this one mean something:
    // if the composed file planned writes of its own the null above would be
    // saying the catalogue cannot see the row, rather than that it does not mind
    // its absence.
    const { ctx, text, old } = beforeAndAfter();
    expect(old).not.toContain(`\n${ACTIONS_LINE}\n`);
    expect(applySections(old, ctx, sectionsPresent(old, ctx))).toBeNull();
    expect(applySections(text, ctx, sectionsPresent(text, ctx))).toBeNull();
    // And the old fence is still one banner rather than a banner beside a stray.
    const block = journalSectionModel(ctx)
      .blocks!(old)
      .find((b) => b.ids.includes("banner"))!;
    expect(block.ids.filter((id) => id === "banner")).toHaveLength(1);
  });

  it("matches on a signature the row is not part of", () => {
    // The means, since the two tests above are the end and would both pass on a
    // fix that made the row invisible to the RENDERER too. The keyword is
    // dropped from the fence's signature on BOTH sides of the comparison — the
    // rule the tracker region already states one paragraph above it — which is
    // the only way an old fence and a new one can be the same fence.
    const grammar = readSrc("core/directive-grammar.ts");
    const modifiers = /MODIFIER_KEYWORDS: ReadonlySet<string> = new Set\(\[([^\]]*)\]/
      .exec(grammar)?.[1];
    expect(modifiers).toContain("ACTIONS_KEYWORD");
    // Both sides of the comparison go through the one filter, which is the only
    // way an old fence and a new one can be the same fence.
    const plan = readSrc("journals/journal-plan.ts");
    expect(plan).toContain("!MODIFIER_KEYWORDS.has(k)");
    // And it is still the banner's own line, which is what `claims` records.
    const journal = readSrc("journals/journal-sections.ts");
    expect(journal).toContain(`claims: ["journal-header", ACTIONS_KEYWORD]`);
  });
});

describe("the menu is the banner's and cannot be added anywhere else", () => {
  it("is not a widget a page can be given", () => {
    // A MODIFIER IS UNOFFERABLE BY CONSTRUCTION, which is why it is in neither
    // table: the picker is built from `WIDGETS`, and `widget-registry.test.ts`
    // requires every key in `NOT_PAGE_WIDGETS` to be a `case` in the switch.
    // `actions` is a `case` in neither, and `pageWidgetKeywords` cannot yield
    // what `WIDGETS` does not hold.
    expect(WIDGETS[ACTIONS_LINE]).toBeUndefined();
    expect(NOT_PAGE_WIDGETS[ACTIONS_LINE]).toBeUndefined();
    expect(isPageWidget(ACTIONS_LINE)).toBe(false);
  });

  it("is offered by no surface's section picker", () => {
    // END TO END, over every note the plugin composes, because the two tables
    // above are the means. What a reader can ADD is what `addable` answers, and
    // the failure this forbids is a second action menu spliced into a fence
    // somewhere that is not the page's banner.
    let seen = 0;
    for (const note of goldenNotes()) {
      seen++;
      for (const view of note.model().addable(note.text)) {
        expect(view.id, note.name).not.toBe(ACTIONS_LINE);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it("draws nothing of its own, so the dispatcher never meets it", () => {
    // THE DEFECT THIS FORBIDS IS 4.51's, MADE TWICE ALREADY IN THIS FILE'S
    // HISTORY. `null` from a case is how the switch says *unknown directive*,
    // and the loop then prints a red "Unknown ChronoAnvil widget" where the
    // banner should be. A modifier with no predicate in the loop's filter is a
    // modifier the loop walks into, so the filter and the missing case are one
    // assertion.
    const widgets = readSrc("ui/widgets/index.ts");
    expect(widgets).toContain("!isActionsLine(l)");
    expect(widgets).not.toContain(`case "${ACTIONS_LINE}":`);
    // And the fact reaches the banner, which is the only thing that reads it.
    expect(widgets).toContain(
      "const wearsActions = rawLines.some((l) => isActionsLine(l));"
    );
    expect(widgets).toContain("livePageHead(this.plugin, ctx, wearsActions)");
  });
});

describe("the control", () => {
  const src = readSrc("ui/widgets/actions-menu.ts");

  it("takes the note from the head it is drawn in, never from the workspace", () => {
    // THE REASON THIS TABLE IS NOT `ACTIONS`. In a split pane, a hover preview
    // or a sidebar leaf, the note under the control is routinely not the active
    // one — and a menu that quietly acts on a different file than the one it is
    // drawn in is the worst kind of wrong, because it looks like it worked.
    // `buildPageHead` resolved its own file; the control is handed that path.
    expect(readSrc("ui/widgets/page-head.ts")).toContain(
      "addPageActionsControl(row, plugin, file.path)"
    );
    expect(src).not.toContain("activeNotePath");
    expect(src).not.toContain("actionWithNote");
    expect(src).not.toContain("getActiveFile");
    expect(src).not.toContain("activeMarkdownFile");
  });

  it("knows nothing about what either action does", () => {
    // The menu draws the table and dispatches through `run`. A renderer that
    // named an action would be a second place the set of items is decided.
    for (const a of PAGE_ACTIONS) {
      expect(src).not.toContain(a.id);
      expect(src).not.toContain(a.label);
    }
    expect(src).toContain("action.run(plugin, path)");
  });

  it("honours the master toggle and each action's own refusal", () => {
    expect(src).toContain("opts.enabled");
    expect(src).toContain("pageActionsOn(opts.off)");
    expect(src).toContain("a.when({ path, surface })");
  });

  it("draws no control at all when it would open empty", () => {
    // `discoverability.test.ts`'s rule, which `sectionsMenuFor` and
    // `journalBannerMenu` both follow: a menu that opens and then explains it
    // cannot help is worse than no menu. Turning both actions off must leave the
    // banner exactly as it was, not a dead glyph beside the name.
    expect(src).toContain("if (!actions.length) return null;");
  });

  it("builds the menu on click, not when the head renders", () => {
    // `overflowButton`'s rule and for its reason: this control is on every
    // ChronoAnvil page in the vault, so the list must describe the note as it is
    // when opened rather than as it was when the head was drawn.
    const at = src.indexOf("addEventListener(\"click\"");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at)).toContain("new Menu()");
  });

  it("wears a glyph that is neither the cog nor the ellipsis", () => {
    // `section-frame.ts` states the vocabulary and it is worth keeping: the cog
    // "acts on the PAGE — its name, its sections", the ⋯ means "more things
    // about this row". This is neither, and the vault banner's cog is on screen
    // at the same time opening a different list.
    expect(src).toContain('setIcon(button, "zap")');
    expect(src).not.toContain('"settings"');
    expect(src).not.toContain('"more-horizontal"');
  });

  it("is rebuilt with the head rather than docked into it", () => {
    // THE DEFECT THIS FORBIDS. `livePageHead` wraps a `LiveWidget`, which empties
    // its host and calls `build` again on every write to the note's frontmatter.
    // A control moved into the title row from the block loop would survive until
    // the reader's next property edit and then silently vanish — so the head
    // builds it, and the flag rather than the node is what crosses the boundary.
    const head = readSrc("ui/widgets/page-head.ts");
    expect(head).toContain("withActions = false");
    expect(head).toContain("buildPageHead(plugin, ctx, withActions)");
    expect(head).toContain("if (withActions) addPageActionsControl(");
  });
});

describe("the control's chrome", () => {
  const css = readCss();
  const flat = css.replace(/\s+/g, " ");

  it("docks to the far corner of the name's own row", () => {
    // `margin-left: auto` is the whole of the placement: the title row is a flex
    // line holding the name and its pencil, and an auto margin pushes this to
    // the far edge without a second column that would collapse on a narrow pane.
    const rule = flat.slice(
      flat.indexOf(".ca-journal-page-head .ca-jph-actions {"),
      flat.indexOf(".ca-journal-page-head:hover .ca-jph-actions")
    );
    expect(rule).toContain("margin-left: auto");
    // The row is baseline-aligned at a 700-weight title, so a square glyph
    // sitting ON that baseline hangs below the letterforms.
    expect(rule).toContain("align-self: center");
  });

  it("rests visible rather than appearing on hover", () => {
    // THE OPPOSITE OF `.ca-jsh-more`, deliberately. That control is an overflow
    // — a second door to things the banner already offers — so fading out of the
    // way is right for it. This is the ONLY door: both actions behind it were
    // reachable from the command palette and nowhere else, which is the whole
    // reason the menu exists. *A control revealed by hover is a control that
    // does not exist.*
    const rule = flat.slice(
      flat.indexOf(".ca-journal-page-head .ca-jph-actions {"),
      flat.indexOf(".ca-journal-page-head:hover .ca-jph-actions")
    );
    expect(rule).toContain("color: var(--text-faint)");
    expect(rule).not.toContain("opacity: 0;");
  });

  it("states the glyph's size, so it does not inherit the title's", () => {
    // An icon that inherits the head's 700-weight title metrics is a 24px glyph
    // beside a 15px pencil. Same size as that pencil: they are the two controls
    // on this row.
    expect(flat).toContain(
      ".ca-journal-page-head .ca-jph-actions .svg-icon { width: 15px; height: 15px; }"
    );
  });

  it("leaves nothing behind from the row of buttons it replaced", () => {
    // The band, its `:empty` rule and its two insets are gone. A dead selector
    // in a shipped stylesheet is the staleness this project sweeps for
    // everywhere else.
    expect(css).not.toContain("ca-journal-actions-bar");
  });
});
