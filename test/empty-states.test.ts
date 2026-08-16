// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import { allSrcNames, readCss, readSrc } from "./sources";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";
import { kindWords } from "../src/journals/journals-header";
import { composeJournalsDashboardNote } from "../src/journals/journals-dashboard-sections";
// ── empty states ──────────────────────────────────────────────────────────
//
// An empty widget is the one moment a reader is definitely looking at a feature
// and definitely has no idea what it does. The rule in empty.ts is that it names
// two things: what will appear here, and how to make it happen.
//
// The finding that shaped this patch is worth recording, because it was not the
// one the roadmap predicted. §5.2 said 15 of ~75 widgets had a teaching empty
// state and the rest showed nothing. That counted one of THREE mechanisms —
// `emptyCallout`, a private `emptyState` in event-widgets, another in settings,
// plus about thirty ad-hoc `*-empty` divs. Most widgets did say something. What
// varied was how useful it was, and there was nowhere for the difference to be
// argued. So this patch unified rather than added.

const src = (f: string) => readSrc(f);

describe("one home for the shapes", () => {
  it("owns both shapes in empty.ts", () => {
    const t = src("empty.ts");
    expect(t).toContain("export function emptyCallout(");
    expect(t).toContain("export function emptyLine(");
  });

  it("states the rule where the shapes live", () => {
    // A helper without the argument is how three of them appeared.
    const t = src("empty.ts");
    expect(t).toContain("WHAT WILL APPEAR HERE");
    expect(t).toContain("HOW TO MAKE IT HAPPEN");
  });

  it("distinguishes the two shapes structurally, not by taste", () => {
    // One replaces content, one annotates content that drew itself. A callout
    // inside a card that already has a header is a box inside a box.
    const t = src("empty.ts");
    expect(t).toContain("REPLACES content");
    expect(t).toContain("ANNOTATES content");
  });

  it("keeps tables.ts re-exporting, so a dozen importers stay put", () => {
    const t = src("tables.ts");
    expect(t).toContain('from "./empty"');
    expect(t).toContain("export { emptyCallout, emptyLine };");
    // Owned there no longer.
    expect(t).not.toContain("export function emptyCallout(");
  });

  it("has no second implementation left", () => {
    // event-widgets had a private one-liner; it is a wrapper now. settings.ts
    // keeps its own shape on purpose and says why — asserted below.
    const t = src("event-widgets.ts");
    expect(t).toContain("emptyLine(parent, text");
    expect(t).not.toContain('parent.createDiv({ cls: "am-ev-empty", text })');
  });

  it("lets settings.ts keep its own shape, with the reason stated", () => {
    // Converting it would change how Settings looks in order to share a
    // function — a restyle wearing a refactor's clothes.
    const t = src("settings.ts");
    expect(t).toContain("restyle wearing a refactor's clothes");
  });
});

describe("what the messages say", () => {
  // Every message handed to an empty-state helper, across the plugin.
  //
  // The LONGEST string in each call, because the two shapes put it in different
  // places: emptyCallout(icon, title, body) has it last, emptyLine(parent, text,
  // cls) has it in the middle with a short CSS class after it. Taking the last
  // argument would have read the class name; taking the first would have read an
  // icon id. The longest is the message in both.
  const messages = (): { file: string; text: string }[] => {
    const out: { file: string; text: string }[] = [];
    for (const f of allSrcNames()) {
      if (f === "empty") continue;
      const t = readSrc(f);
      // Skips the two DEFINITIONS — settings.ts declares its own method and
      // event-widgets its own wrapper, and matching those read a CSS class as
      // a message.
      const calls =
        /(?<!function )(?<!private )empty(?:Callout|State|Line)\(([\s\S]{0,600}?)\);/g;
      let m: RegExpExecArray | null;
      while ((m = calls.exec(t)) !== null) {
        // ALL the prose in the call, joined — not the longest string in it.
        //
        // Taking the longest was defeated by `Set ${def ? def.label : "a
        // rating"} on a note here…`: the nested double quote inside a template
        // literal splits the body into fragments, so a shorter TITLE won and the
        // test reported a good message as a four-word one. Parsing TypeScript
        // with a regex to fix that is the wrong tool.
        //
        // The concatenation is also the more honest measure of the thing being
        // guarded, which is whether the empty state as a whole says enough —
        // not whether one of its arguments does.
        const strings = [...m[1].matchAll(/["`]([^"`]*)["`]/g)]
          .map((x) => x[1])
          .filter((x) => /\s/.test(x) || x.length > 14);
        if (!strings.length) continue;
        out.push({ file: f, text: strings.join(" ") });
      }
    }
    return out;
  };

  it("finds messages to check", () => {
    // A floor rather than an exact count: the point is that the scan reaches
    // real call sites, and a test that has to be edited every time a widget
    // gains an empty state is a test that gets edited without being read.
    expect(messages().length).toBeGreaterThan(8);
  });

  it("never says only that there is no data", () => {
    // "No data" is a control that isn't a decision, in sentence form. "No
    // lessons yet" already says more, and every message here should.
    for (const { file, text } of messages()) {
      expect(text.toLowerCase(), file).not.toMatch(/^no data\.?$/);
      expect(text.toLowerCase(), file).not.toMatch(/^nothing (here|yet)\.?$/);
    }
  });

  it("says enough to be worth reading", () => {
    // A WORD COUNT, AND KNOWINGLY A PROXY.
    //
    // The first version of this test looked for an action — press, add, turn
    // on, settings — and failed on six messages that were all perfectly good:
    // "Try fewer words, or widen the date range", "Tag a note under Algebra and
    // it'll show up here", "Once you've written a few days, they'll all be
    // listed here newest first". Each points somewhere; none used a word the
    // list happened to hold.
    //
    // A keyword list would have to grow every time someone writes a good
    // sentence a new way, which is a test that penalises good writing and
    // eventually gets deleted for being annoying rather than for being wrong.
    // Six words is cruder and holds: "Nothing coming up." was a real message
    // until this patch — true, and a dead end — and nothing that actually names
    // what appears and how fits in five.
    for (const { file, text } of messages()) {
      expect(text.trim().split(/\s+/).length, `${file}: ${text}`).toBeGreaterThanOrEqual(
        6
      );
    }
  });
});

// ── the shape rule, enforced where it was broken (2.56.1) ─────────────────
//
// The rule was written into empty.ts in 2.55.3 and then quietly broken by a
// widget that predated it. `buildJournalBreakdown` draws its own `jbd-title`
// header and then replaced its body with a CALLOUT — a box inside a box, which
// is the case the rule names — and built that callout's title as
// `No ${title.toLowerCase()} ratings yet`. Two consequences on one line:
//
//   the callout restated the heading two lines above it, which a reader
//   reported as a duplicated title, because that is what it was;
//   lowercasing a string that begins with a glyph produced "No 🎯 confidence
//   ratings yet" — an emoji mid-sentence. A glyph is a slot, not a word.
//
// A rule with one enforcement is a rule with none, which is what the last three
// releases keep re-learning.

describe("a widget that drew its own header annotates rather than replaces", () => {
  it("uses a line, not a callout, for the breakdown's empty state", () => {
    const t = src("tables.ts");
    const at = t.indexOf("export function buildJournalBreakdown(");
    expect(at).toBeGreaterThan(0);
    const body = t.slice(at, t.indexOf("\nexport ", at + 10));
    expect(body).toContain("emptyLine(");
    expect(body).not.toContain("emptyCallout(");
  });

  it("never builds a message by lowercasing a title", () => {
    // The construction, not the symptom: any `${x.toLowerCase()}` inside a
    // user-facing string will eventually be handed something that starts with
    // a glyph, because tracker labels are where these titles come from and a
    // tracker label is `⚖️ Weight`.
    for (const f of allSrcNames()) {
      const code = src(f)
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(code, f).not.toMatch(/`No \$\{[a-zA-Z.]*\.toLowerCase\(\)\}/);
    }
  });

  it("gives the breakdown a title that says what it is", () => {
    // It sits directly under a chart of the same tracker on a subject index.
    // Titled with the bare label, the two widgets were the same words twice.
    // "Breakdown" is the directive's own name, so it is a word the plugin
    // already owns rather than one invented for a bug fix.
    const t = src("tables.ts");
    expect(t).toContain("} breakdown`");
    // An explicit `|Label` in the directive still wins.
    expect(t).toContain("label ??");
  });
});

// ── the button it names is the button on the page (4.33.1) ───────────────
//
// The rule's second half is HOW TO MAKE IT HAPPEN, and a message that names the
// wrong control fails it while looking like it passes: it is a whole sentence,
// it clears every word count, and it sends the reader somewhere else.
//
// `folderRollup`'s said "Add one from the Journals card on the homepage". That
// does make a container — but the section this callout is drawn inside opens
// with `button:<type>:new-container`, so a Subject with no Topics yet was
// pointing off the page at a control that was six pixels above the sentence.
//
// It was invisible while the branch that reaches it was broken: a Subject with
// no Topics rendered the DEEPEST level's tables instead of this callout, so the
// message only appeared once that was fixed.

describe("an empty state names a control the reader can see", () => {
  const rollup = (): string => {
    const t = src("tables.ts");
    const at = t.indexOf("export function folderRollup(");
    expect(at, "the folder rollup").toBeGreaterThan(0);
    return t.slice(at, t.indexOf("\n}\n", at));
  };

  it("points at the section's own button, not the homepage", () => {
    const body = rollup();
    expect(body).toContain("Press “+ ${noun}” above");
    expect(body).not.toContain("Journals card on the homepage");
  });

  it("derives the button's words from the heading's words", () => {
    // `kindTable` settled this one level down: both halves come from one value,
    // so a relabelled level cannot leave the sentence naming the old button.
    // The button is `journalSubActionSpec`'s `new-container` — a plus and the
    // bare child noun — and `noun` is that same child noun.
    const body = rollup();
    expect(body).toContain("const noun = childNoun(type, folder.path);");
    expect(body).toContain("`No ${plural(noun).toLowerCase()} yet`");
  });
});

// ── the quarter rail (2.56.1) ────────────────────────────────────────────

describe("the activity months fit a phone", () => {
  it("scrolls sideways rather than wrapping into a column", () => {
    // Three fixed-width 172px panels wrap to three rows on a phone, which is
    // ~600px of vertical scroll to say an empty quarter is empty. Fixed-width
    // children in a too-narrow container is the case a rail exists for.
    const css = readCss();
    const at = css.indexOf("@media (max-width: 500px) {\n  .journal-act-months");
    expect(at).toBeGreaterThan(0);
    const block = css.slice(at, at + 700);
    expect(block).toContain("flex-wrap: nowrap");
    expect(block).toContain("overflow-x: auto");
    expect(block).toContain("scroll-snap-align: start");
  });

  it("keeps wrapping above the breakpoint, where three panels fit", () => {
    const css = readCss();
    const at = css.indexOf(".journal-act-months {");
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("flex-wrap: wrap");
  });
});

// ── one box, not two (2.56.16) ───────────────────────────────────────────
//
// empty.ts has named this failure since 2.55.3, in the note explaining why a
// tile gets a LINE rather than a callout: "a callout there would be a box
// inside a box, and the surrounding chrome already says what the widget is".
// That was an argument about tiles. The section surface (§1.6) makes it true
// of every section — the panel a callout draws was doing the job the card now
// does, and drawing it inside the card says the same thing twice.

describe("an info card is a card, wherever it is drawn (4.11)", () => {
  const css = () => readCss();

  // The one rule, found by its first selector anchored to a line start — the
  // bare selector is a substring of nothing else now, but the anchor is what
  // stopped an earlier form of this test reading a scoped rule about the same
  // callout, and the trap it avoids has not gone anywhere.
  const infoCard = (): string => {
    const t = css();
    const at = t.search(/\n\.callout\[data-callout="empty"\],/);
    expect(at, "no info-card rule").toBeGreaterThan(0);
    return t.slice(at, t.indexOf("}", at));
  };

  it("draws the widget frame's box, at the widget frame's weight", () => {
    // WHAT A VAULT RENDER SHOWED, AND THE REASON THIS RULE EXISTS: three widgets
    // with nothing to show, three appearances on one homepage — bare text, a box,
    // and a hand-rolled box at 1px. An empty state stands IN FOR a widget, so it
    // reads as one with nothing in it; `--am-rule` rather than `1px` is what makes
    // that the same statement the card beside it is making.
    const rule = infoCard();
    expect(rule).toContain("border: var(--am-rule) solid");
    expect(rule).toContain("background: var(--background-secondary)");
    expect(rule).toContain("border-radius: var(--am-radius-md)");
    expect(rule).not.toContain("1px solid");
    expect(rule).not.toContain("dashed");
  });

  it("is the same rule for the two that used to hand-roll one", () => {
    // The deletions are what make this ONE rule rather than a fourth appearance,
    // so they are asserted as membership rather than as absence.
    const rule = infoCard();
    expect(rule).toContain(".jjs-empty");
    expect(rule).toContain(".journal-chart-empty");
    // And their own boxes are gone from where they were written.
    const t = css();
    expect(t).not.toContain(".jjs-bare .jjs-empty {");
    const chart = t.indexOf(".journal-chart-empty {");
    expect(chart).toBeGreaterThan(0);
    expect(t.slice(chart, t.indexOf("}", chart))).not.toContain("border:");
  });

  it("draws no box of its own inside a section card (4.13 §2)", () => {
    // THIS ASSERTION IS INVERTED FROM 4.11's, AND BOTH ARGUMENTS ARE WORTH
    // KEEPING. It used to require that the six unboxing rules stay deleted, on
    // the reasoning that "a card whose contents are one grey sentence with no
    // edge reads as a widget that failed rather than as one with nothing in it".
    // That was written without a render.
    //
    // The first render of the journals dashboard settled it the other way: where
    // every section is already a card, the doubled edge was on screen three times
    // — and the ONE empty state that drew no box of its own, the review queue's,
    // was the one that read correctly. `40-journal-views.css` had been making
    // exactly this argument for that single widget since 4.11 while the callouts
    // kept their boxes, so one page carried both decisions at once.
    //
    // What 4.11 was right about is asserted two cases down and is untouched: the
    // glyph, the weight and the sentence stay. It was never the border that said
    // "nothing here yet".
    //
    // NOTE THE SHAPE OF THIS TEST. The old one matched `…"empty"] {` — the rule's
    // opening — and a multi-selector rule ending in a comma slips straight past
    // it. It passed against the new stylesheet, which is the failure mode the
    // house rules call a test that has never failed. This one locates the rule
    // BODY and reads what it says.
    const t = css();
    const at = t.indexOf('.journal-sec-block .callout[data-callout="empty"]');
    expect(at, "an empty state is still boxed inside a section card").toBeGreaterThan(0);
    const rule = t.slice(t.indexOf("{", at), t.indexOf("}", at));
    expect(rule).toContain("border: none");
    expect(rule).toContain("background: none");

    // EVERY FAMILY, or the page keeps two answers. These are the three shapes the
    // info card covers, plus the recall cards' box, which was the last 1px-dashed
    // empty state left in the tree.
    const selectors = t.slice(at, t.indexOf("{", at));
    for (const cls of [
      ".journal-sec-fold-body .callout[data-callout=\"empty\"]",
      ".journal-sec-block .jjs-empty",
      ".journal-sec-fold-body .jjs-empty",
      ".journal-sec-block .journal-chart-empty",
      ".journal-sec-fold-body .journal-chart-empty",
    ]) {
      expect(selectors, cls).toContain(cls);
    }

    // AND THE FOLD BODY AS WELL AS THE RUN. A `frame: section` block and a
    // `header:` run are two different containers for the same idea, and an empty
    // state that unboxed in one and not the other is the defect this closes,
    // one level down.
    expect(selectors).toContain(".journal-sec-fold-body");
  });

  it("draws no box of its own inside a WIDGET card either (4.13.5 §1)", () => {
    // THE THIRD SCOPE, AND IT CLOSES A HOLE THE TEST BELOW USED TO DEFEND.
    // 4.13 scoped the unboxing to the two section containers on the premise that
    // a homepage widget has no first edge — so an empty state there drew its own
    // and that was the only one. It is not: `cardWidget` wraps every widget in a
    // row in a `.journal-widget-card` and `attachBlockHead` turns a headed block
    // into the same object, and both paint `--background-secondary` inside
    // `--am-rule` — precisely what the info card paints. The homepage rendered
    // Open tasks as a bordered box inside an identically-coloured bordered box,
    // and On this day as three of them.
    //
    // `.has-head` IS ONE CONDITION FOR BOTH SCALES, which is not a shortcut taken
    // here: 05-inline-widgets.css already unboxes four composite cards through
    // that exact class and its comment is where the property is argued.
    const t = css();
    const at = t.indexOf('.journal-sec-block .callout[data-callout="empty"]');
    const selectors = t.slice(at, t.indexOf("{", at));
    for (const cls of [
      '.has-head .callout[data-callout="empty"]',
      ".has-head .jjs-empty",
      ".has-head .journal-chart-empty",
      ".has-head .jrc-empty",
      ".has-head .jrq-empty",
    ]) {
      expect(selectors, cls).toContain(cls);
    }
  });

  it("takes the second edge off On this day's body too (4.13.5 §1)", () => {
    // THE MIDDLE OF THE THREE. `.jdr-otd-body` draws its own filled, bordered
    // rectangle — "tinted so it reads as something offered", which is true of a
    // widget standing on a page and says nothing inside a card that is already
    // both. On the homepage it sat between the widget card and the empty state's
    // info card: three borders, one fill.
    //
    // THE SAME THREE SCOPES AS THE EMPTY STATES', deliberately, because
    // `on-this-day` is composed by the homepage AND by the diary dashboard and
    // those reach it through different halves of the list.
    const t = css();
    const at = t.indexOf(".has-head .jdr-otd-body");
    expect(at, "On this day still boxes itself inside a card").toBeGreaterThan(0);
    const selectors = t.slice(at, t.indexOf("{", at));
    expect(selectors).toContain(".journal-sec-block .jdr-otd-body");
    expect(selectors).toContain(".journal-sec-fold-body .jdr-otd-body");
    const rule = t.slice(t.indexOf("{", at), t.indexOf("}", at));
    expect(rule).toContain("border: none");
    expect(rule).toContain("background: none");

    // AND IT KEEPS ITS BOX WHERE IT IS THE ONLY ONE — the unscoped rule above it
    // is untouched, the same way the info card is.
    const bare = t.indexOf("\n.jdr-otd-body {");
    expect(bare).toBeGreaterThan(0);
    expect(t.slice(bare, t.indexOf("}", bare))).toContain(
      "background: var(--background-secondary)"
    );
  });

  it("still draws its box where it is the FIRST edge", () => {
    // THE OTHER HALF, and the reason the rules above are scoped rather than the
    // info card being deleted. A widget with no head, in no section — a bare
    // `tasks-table` a reader typed into their own note — draws no card of its
    // own, so the empty state's edge is the first one and 4.11's argument applies
    // unchanged.
    //
    // THIS TEST USED TO NAME THE HOMEPAGE AS THAT CASE AND IT WAS WRONG: every
    // homepage widget wears a head, and a head is a card. The case is real and it
    // is narrower than the sentence that stood here.
    // `infoCard()` anchors on a NEWLINE before the selector, which is load-bearing
    // now that a scoped rule exists whose first selector ends in the same string.
    const rule = infoCard();
    expect(rule).toContain("border: var(--am-rule) solid");
    expect(rule).toContain("background: var(--background-secondary)");
  });

  it("paints its heading in Almanac's colour, not the theme's (4.13 §2)", () => {
    // `empty` IS NOT ONE OF OBSIDIAN'S CALLOUT TYPES. With no `--callout-color`
    // of its own the title fell through to whatever the host theme paints an
    // unknown callout — blue in the vault this was found in, something else on
    // the next theme — while `.jjs-empty-title` beside it was hand-set to the
    // accent. Two colours for one object on one screen, neither of them chosen
    // here. `[!study]` had declared its own since 2.8; this is the same line.
    const rule = infoCard();
    expect(rule).toContain("--callout-color:");
    expect(rule).toContain("--interactive-accent-rgb");
  });

  it("keeps the title, which is what makes it read as a state", () => {
    // Only ever the container was in question. Without the weight and the icon an
    // empty state is a sentence someone typed into the note.
    const t = css();
    const at = t.indexOf('.callout[data-callout="empty"] > .callout-title');
    expect(at).toBeGreaterThan(0);
    const block = t.slice(at, t.indexOf("}", at));
    expect(block).toContain("font-weight: 600");
    expect(block).not.toContain("display: none");
  });

  it("takes neither the writable callouts' divider nor their height floor", () => {
    // Both were inherited from `[!focus]` and `[!log]`, which are fields you type
    // into: a box that grows from one line as you write reads as unstable, so they
    // reserve their height. An empty state is read-only and one sentence long, and
    // as of 4.11 that is true on a dashboard AND on a bare note — it used to be
    // true only inside a card.
    const title = (() => {
      const at = readCss().indexOf('.callout[data-callout="empty"] > .callout-title');
      return readCss().slice(at, readCss().indexOf("}", at));
    })();
    expect(title).toContain("border-bottom: none");
    const at = readCss().indexOf('.callout[data-callout="empty"] > .callout-content');
    expect(at).toBeGreaterThan(0);
    expect(readCss().slice(at, readCss().indexOf("}", at))).toContain("min-height: 0");
  });

  it("leaves the writable callouts and the calendar exactly as they were", () => {
    // `[!empty]` was split OUT of a group of five. The other four are two fields a
    // reader types into, a `[!note]`, and a month grid — none of them standing in
    // for something absent, and none of them touched by this.
    const t = readCss();
    const at = t.search(/\n\.callout\[data-callout="note"\],/);
    expect(at).toBeGreaterThan(0);
    const group = t.slice(at, t.indexOf("}", at));
    expect(group).toContain("border: 1px solid");
    expect(group).toContain(".journal-calendar");
    expect(group).not.toContain('data-callout="empty"');
  });

  it("leaves an annotation an annotation", () => {
    // `empty.ts` opens by arguing that its two shapes are a STRUCTURAL difference
    // rather than a style choice: `emptyCallout` REPLACES content and `emptyLine`
    // ANNOTATES it. Boxing thirty one-line annotations would be that argument lost
    // by accident, so the info card is the first shape only — and `.jrq-empty`, the
    // one annotation that draws a box of its own, is left exactly as it was.
    const rule = infoCard();
    expect(rule).not.toContain(".am-empty-line");
    expect(rule).not.toContain(".jrq-empty");
    expect(rule).not.toContain(".jjs-empty-row");
    // Nor the settings tab's, which is deliberately unshared and says so.
    expect(rule).not.toContain(".almanac-empty-state");
    // Nor the block explaining itself, which is not an empty state at all.
    expect(rule).not.toContain(".journal-frame-error");
  });
});

// ── the two dashboards on an empty vault (4.1 §2.3) ───────────────────────
//
// AN OPEN QUESTION FROM `ROADMAP-4.1-OUTCOME.md`, CLOSED AS FAR AS SOURCE CAN
// CLOSE IT: "What both pages look like on an empty vault, which is the first
// thing a new reader sees. `ui/empty.ts` has the rule; whether two new pages
// follow it is a check nobody has made."
//
// §2.3 says both dashboards "will be almost entirely empty states for a new
// reader", which makes this the release's most-seen screen and the one nobody
// had audited. It cannot be *rendered* here — there is no DOM — but "does every
// block on these pages have an empty state at all" is answerable, and it is the
// half that goes wrong silently.
//
// THE POPULATION IS DERIVED, THE ANSWERS ARE DECLARED. `test/layout.test.ts`
// records what happens when a test enumerates the same set the code does: 2.52
// rewrote six assets, missed the seventh, and shipped a test written from the
// memory that forgot it. So the directives come out of the composed notes, and
// each one must have a declared answer below — add a section to either
// dashboard and this fails until somebody says what it shows when empty.
describe("every block on the two dashboards says something when empty", () => {
  // What each directive falls back to, and where to find it. A marker rather
  // than a description, so deleting the empty state fails this test.
  const ANSWERS: Record<string, { module: string; marker: string }> = {
    // `emptyCallout` — REPLACES content. The widget is a table or a list and
    // there is no table to draw.
    // THE ONE DIRECTIVE THAT CANNOT BE EMPTY (4.10). Every other entry here
    // names what a widget draws when the vault has nothing for it; the head
    // draws the note's own name, and a note always has one. What CAN be absent
    // is a destination — no journals root, no Journals link — and the rule
    // there is `nothing dead is drawn` rather than an empty state: the link is
    // not drawn at all, and if none of the three resolve the row is not drawn
    // either. `renderLink`'s guard is the marker.
    title: { module: "page-title", marker: "if (!target || (!target.file" },
    "tasks-table": { module: "tables", marker: "emptyCallout(" },
    "tag-index": { module: "tables", marker: "emptyCallout(" },
    "on-this-day": { module: "diary-retrieval", marker: "emptyCallout(" },
    // `emptyLine` — ANNOTATES content that drew itself. Added in 4.1.1, when
    // this fence showed a red "Unknown Almanac widget" on a vault with no
    // journals rather than an empty list.
    "review-queue": { module: "review-queue", marker: "emptyLine(" },
    // Ad-hoc `*-empty` divs. `empty.ts` names about thirty of these as what it
    // unified, and these two are among the survivors — deliberately, because
    // both REPLACE the whole widget rather than a region inside it, and both
    // already carry the two things the rule asks for. Named here so the choice
    // is visible rather than assumed.
    journals: { module: "journals-section", marker: "jjs-empty" },
    // The charts fence composes with a `header:` and no `chart:` lines, so
    // BOTH dashboards show this on a new vault. It is the one empty state on
    // either page that a reader can act on from the page itself.
    "almanac-charts": { module: "chart-grid", marker: "journal-chart-empty" },
    // The two period cards. THE EXCEPTION, and it is a real one: their empty
    // state is a stat strip reading zero, not a sentence. `empty.ts` allows
    // this — "If a widget cannot say the second, because there is genuinely
    // nothing the reader can do, then the first has to carry it" — and a strip
    // saying 0 DAYS LOGGED does name what will appear there. What it must not
    // do is vanish, which is what the marker below pins: the strip is rendered
    // unconditionally, so an empty month is zeroes rather than a blank card.
    diary: { module: "calendar", marker: "renderPeriodStats(" },
    "month-summary": { module: "calendar", marker: "renderPeriodStats(" },
  };

  // Every directive keyword the two pages actually compose, read off the notes.
  const composed = [composeDiaryDashboardNote(), composeJournalsDashboardNote()];
  const keywords = new Set<string>();
  for (const note of composed) {
    let inFence = false;
    for (const line of note.split("\n")) {
      if (line.startsWith("```")) {
        inFence = line.length > 3;
        // THE FENCE CAN BE THE WIDGET. `almanac-charts` holds only a `header:`
        // line — the chart grid is the fence itself, driven by whatever
        // `chart:` lines a reader adds. A population read from lines alone
        // missed it, which is exactly the omission this shape is meant to make
        // impossible, caught by the count assertion below.
        const lang = line.slice(3).trim();
        if (inFence && lang !== "almanac") keywords.add(lang);
        continue;
      }
      if (!inFence || !line.trim()) continue;
      const kw = line.split("|")[0].split(":")[0].trim();
      // Modifiers and bars are not widgets: neither draws anything that could
      // be empty. `header:` is the section bar, `frame:` is 4.1 §3's block
      // modifier.
      if (kw === "header" || kw === "frame") continue;
      keywords.add(kw);
    }
  }

  it("composes something to check", () => {
    // Non-vacuous: a bug that emptied the notes would otherwise make every
    // assertion below pass by having nothing to assert.
    expect(keywords.size).toBeGreaterThanOrEqual(8);
  });

  it("has a declared empty state for every directive on either page", () => {
    for (const kw of [...keywords].sort()) {
      expect(
        ANSWERS[kw],
        `${kw} is composed onto a dashboard with no declared empty state — ` +
          `say what it shows on a new vault, then add it to ANSWERS`
      ).toBeDefined();
    }
  });

  it("and each of those empty states still exists in its module", () => {
    for (const kw of [...keywords].sort()) {
      const answer = ANSWERS[kw];
      if (!answer) continue; // reported by the test above
      expect(src(answer.module), `${kw} → ${answer.module}`).toContain(
        answer.marker
      );
    }
  });

  it("declares nothing that is not on either page", () => {
    // The other direction, so the table cannot rot into a list of widgets that
    // used to be there — which is the state the homepage catalogue's `tags`
    // entry would have been left in if 4.1 had deleted it instead of making it
    // opt-in.
    for (const kw of Object.keys(ANSWERS)) {
      expect(keywords.has(kw), `${kw} is declared but composed nowhere`).toBe(
        true
      );
    }
  });
});

// ── an empty state that survives as hand-rolled is still written ONCE ──
//
// 4.25 §2. Two of the ad-hoc `*-empty` divs are deliberate survivors and the
// ANSWERS table above says why. What was not deliberate is that the charts one
// existed TWICE: `buildChartGrid` (chart-grid.ts) and the private
// `buildJournalChartStack` (widgets/index.ts) are separate render paths for the
// same fence, and each had spelled the sentence out for itself. Only the first
// is pinned by the dashboard test, so an improvement to the sentence would have
// been made in one file, passed, and left the other reading the old words.
describe("the charts empty state is one sentence, not two", () => {
  it("is a shared constant rather than a literal in each render path", () => {
    const grid = readSrc("chart-grid");
    expect(grid).toContain("export const CHART_GRID_EMPTY");
    // The name is used where the div is built, in BOTH paths...
    expect(readSrc("widgets")).toContain("CHART_GRID_EMPTY");
  });

  it("appears as a literal in exactly one place in the source", () => {
    const sentence = "No charts yet";
    const written = allSrcNames()
      .map((n) => ({ n, hits: readSrc(n).split(sentence).length - 1 }))
      .filter((r) => r.hits > 0);
    const total = written.reduce((sum, r) => sum + r.hits, 0);
    expect(
      total,
      `written ${total}× across ${written.map((r) => r.n).join(", ")}`
    ).toBe(1);
  });
});

describe("an empty journal is told to add ITS OWN notes (4.35.1)", () => {
  // THE LEAK, AND IT WAS VISIBLE ON A RENDERED PAGE. The activity band said
  // "activity appears here as you add lessons and entries" on EVERY journal, so
  // a Projects journal — whose notes are Updates and Decisions — was told to
  // add lessons. Same class as the leaks 2.27 and 3.19.1 closed; this was the
  // copy those sweeps did not reach, and nothing found it until 4.35 shipped a
  // journal that is not Study.
  const type = (kinds: { id: string; label: string; plural?: string }[]) =>
    ({
      kinds: kinds.map((k) => ({ emoji: "📝", ...k })),
    }) as unknown as Parameters<typeof kindWords>[0][number];

  it("names one journal's own note types", () => {
    expect(kindWords([type([{ id: "update", label: "Update" }, { id: "decision", label: "Decision" }])]))
      .toBe("updates and decisions");
  });

  it("honours a declared irregular plural", () => {
    // `kindPlural`, not `plural(label)` — Study's Practice says its own word on
    // the buttons and in the rollups, so it says it here too.
    expect(kindWords([type([{ id: "practice", label: "Practice", plural: "Practice" }])]))
      .toBe("practice");
  });

  it("joins across journals, because the strip aggregates across them", () => {
    expect(
      kindWords([
        type([{ id: "lesson", label: "Lesson" }]),
        type([{ id: "update", label: "Update" }]),
      ])
    ).toBe("lessons and updates");
  });

  it("falls back to the generic word past three, rather than listing seven", () => {
    // A vault with four journals has seven or more note types, and naming them
    // all is a list where a sentence was wanted.
    const many = type([
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
      { id: "d", label: "Delta" },
    ]);
    expect(kindWords([many])).toBe("notes");
  });

  it("de-dupes a word two journals share", () => {
    expect(
      kindWords([
        type([{ id: "entry", label: "Entry" }]),
        type([{ id: "entry", label: "Entry" }]),
      ])
    ).toBe("entries");
  });

  it("says nothing Study-specific in the source any more", () => {
    // CODE ONLY, COMMENTS STRIPPED — the same guard `preset-validation.test.ts`
    // spells out: the fix explains what it stopped doing, so a naive substring
    // check trips on its own explanation. This asserts the string is not
    // EMITTED, which is the property; the comment quoting it is the record.
    const code = readSrc("journals-header")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("lessons and entries");
  });
});
