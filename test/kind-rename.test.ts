// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Renaming a heading, and the note type under it. 3.20.
//
// THE REPORT: rename "Lessons" to "Seminars" and the button below it still says
// New Lesson. It is right, and the incoherence is wider than the button — the
// empty state, the confidence average and every OTHER Topic index in the
// subject all keep the old word, because a heading is per-note text and a note
// type is journal-global.
//
// THE ANSWER IS AN OFFER, and the three reasons it is not an inference are the
// three things most of this file checks: the plural does not invert, the scope
// differs by an order of magnitude, and a one-way binding is worse than none.

import { describe, expect, it } from "vitest";
import { kindHeadedBy } from "../src/ui/header-title";
import { argSpansIn, readArg } from "../src/core/directive-grammar";
import { plural, singularGuess } from "../src/core/util";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { studyTemplate } from "./study-template";
import { readCode, readSrc } from "./sources";
import { normaliseKinds } from "../src/core/settings-editors";
import { kindPlural } from "../src/journals/journal-sections";
import type { JournalKind } from "../src/journals/journal";

const topic = (): string[] => studyTemplate("topic-index.md").split("\n");

describe("which headings name a note type", () => {
  it("finds the kind under each per-kind heading", () => {
    // `childrenParts` emits header + button + `kind-table:<id>` per kind, so the
    // id sits two lines below the title in the same fence. That is the handle.
    const lines = topic();
    const spans = argSpansIn(lines, "header");
    const found = spans
      .map((s) => [readArg(lines, s), kindHeadedBy(lines, s, STUDY_JOURNAL)?.id])
      .filter(([, id]) => id);
    expect(found).toEqual([
      ["📖 Lessons", "lesson"],
      ["🛠️ Practice", "practice"],
    ]);
  });

  it("names no kind for a section heading", () => {
    // Review, Charts, Learning Path and Resources are sections, not note types.
    const lines = topic();
    for (const s of argSpansIn(lines, "header")) {
      const title = readArg(lines, s);
      if (title === "📖 Lessons" || title === "🛠️ Practice") continue;
      expect(kindHeadedBy(lines, s, STUDY_JOURNAL), title).toBeNull();
    }
  });

  it("stops at the next heading, so one kind cannot claim another's table", () => {
    // The two per-kind groups share one fence. A search that ran to the end of
    // the fence would give the Lessons heading Practice's table.
    const lines = topic();
    const lessons = argSpansIn(lines, "header").find(
      (s) => readArg(lines, s) === "📖 Lessons"
    )!;
    expect(kindHeadedBy(lines, lessons, STUDY_JOURNAL)?.id).toBe("lesson");
  });

  it("still finds the kind after the heading has been renamed", () => {
    // STRUCTURAL, NOT TEXTUAL. A reader who renamed "Lessons" to "Seminars"
    // last week and is renaming it again today must still be offered the right
    // note type — matching on the text would have lost it at the first rename.
    const lines = topic().map((l) =>
      l.trim() === "header:📖 Lessons" ? "header:🎓 Seminars" : l
    );
    const span = argSpansIn(lines, "header").find(
      (s) => readArg(lines, s) === "🎓 Seminars"
    )!;
    expect(kindHeadedBy(lines, span, STUDY_JOURNAL)?.id).toBe("lesson");
  });
});

describe("the singular is a guess and is treated as one", () => {
  it("handles the ordinary cases", () => {
    expect(singularGuess("Seminars")).toBe("Seminar");
    expect(singularGuess("Entries")).toBe("Entry");
    expect(singularGuess("Sketches")).toBe("Sketch");
  });

  it("leaves alone the words it cannot know", () => {
    // "Practice" is why `JournalKindConfig` carries a `plural` override at all:
    // the pluraliser gets it wrong forwards, so nothing can get it right back.
    expect(singularGuess("Practice")).toBe("Practice");
    expect(singularGuess("Series")).toBe("Series");
    expect(singularGuess("Progress")).toBe("Progress");
  });

  it("is never used to derive a stored value", () => {
    // It only ever pre-fills a field the reader confirms. A wrong guess costs
    // one correction; a wrong silent derivation would rename a note type
    // journal-wide to a word nobody typed.
    expect(readSrc("header-title")).toContain("singularGuess(nowText)");
    expect(readCode("modals")).toContain("Note type name");
  });
});

describe("what the offer writes", () => {
  const src = (): string => readSrc("header-title");

  it("never renames without being told to", () => {
    expect(src()).toContain('if (!choice || choice.scope !== "kind") return;');
  });

  it("writes the heading first, whatever the answer", () => {
    // The rename the reader made is done and safe before the question is asked.
    // Asking first would make a note-local edit contingent on a journal-wide
    // decision — and closing the window would then look like an undo.
    const s = src();
    expect(s.indexOf("spliceArg(lines, span, written)")).toBeLessThan(
      s.indexOf("offerKindRename")
    );
    expect(readCode("modals")).toContain('this.picked ?? { scope: "heading", label: "" }');
  });

  it("keeps the kind's id, so no note is declassified", () => {
    // THE REASON THIS IS SAFE FROM HERE rather than only from the note-types
    // window with its declassification warning. `type: lesson` stays `lesson`,
    // and the template file keeps the name it was written under.
    const s = src();
    expect(s).toContain("row.label = choice.label;");
    expect(s).not.toMatch(/row\.id\s*=/);
  });

  it("carries the plural so the heading and the type agree", () => {
    // Without this, `kindPlural` would derive "Seminars" from the new label and
    // could disagree with the very heading that started the rename.
    expect(src()).toContain("row.plural = nowText;");
  });

  it("drops a plural the pluraliser already produces", () => {
    // A journal should not accumulate overrides that say nothing.
    expect(src()).toContain("if (plural(choice.label) === nowText) delete row.plural;");
    expect(plural("Seminar")).toBe("Seminars");
  });

  it("does not ask when only the glyph changed", () => {
    // The heading carries the kind's emoji too. Changing "📖 Lessons" to
    // "📕 Lessons" renames nothing.
    expect(src()).toContain("if (!nowText || nowText === wasText) return;");
  });

  it("does not ask when there is no config to write to", () => {
    // A dialogue offering a write that cannot happen is worse than no dialogue
    // — which is exactly what this would have been on Study before 3.20.
    expect(src()).toContain("if (!cfg) return;");
  });
});

describe("the dialogue itself", () => {
  const modals = (): string => readCode("modals");

  it("offers the two choices, and says what each costs", () => {
    const m = modals();
    expect(m).toContain('text: "Just this heading"');
    expect(m).toContain('text: "Rename the note type"');
    expect(m).toContain("changes it on this note only");
  });

  it("names the note type being renamed", () => {
    // "Lessons is the heading for the Lesson note type" — the sentence that
    // makes the two scopes distinguishable at all.
    expect(modals()).toContain("is the heading for the ");
  });

  it("refuses to rename a note type to nothing", () => {
    // Enter lands on the CTA, so an empty field must not commit.
    expect(modals()).toMatch(/scope === "kind" && !label/);
  });
});

describe("the note repaints when a name changes", () => {
  it("repaints after a heading rename and after a type rename", () => {
    // ONE REPAINT COVERING BOTH, at the end of the commit rather than inside
    // each write, so a reader who does both gets one rather than two.
    const s = readSrc("header-title");
    expect(s).toContain("repaintOpenNotes(plugin.app)");
    expect(s.indexOf("offerKindRename")).toBeLessThan(
      s.lastIndexOf("repaintOpenNotes(plugin.app)")
    );
  });

  it("repaints after the journal editor changes a type too", () => {
    // The other route to renaming a kind. Same invisibility, same fix.
    expect(readCode("settings-editors")).toContain("repaintOpenNotes(this.app)");
  });

  it("rebuilds fully rather than reusing cached sections", () => {
    // The cached section is exactly the stale thing.
    expect(readCode("livewidget")).toContain("rerender(true)");
  });

  it("does not touch a file to provoke the repaint", () => {
    // Writing a note to force a render would put an edit in the reader's undo
    // history, move its modified time, and on a synced vault send a change
    // nobody made. The settings changed; the notes did not.
    const s = readCode("livewidget");
    const fn = s.slice(s.indexOf("export function repaintOpenNotes"));
    expect(fn).not.toContain("vault.modify");
    expect(fn).not.toContain("vault.append");
  });

  it("a widget refresh alone would not have been enough", () => {
    // `LiveWidget.refresh()` rebuilds a widget's own subtree, and the button
    // beside it is not in that subtree — buttons, headers and the section frame
    // are drawn once by the block processor.
    expect(readCode("livewidget")).toContain("getLeavesOfType(\"markdown\")");
  });
});

// The same staleness, one host further out. 4.18.2.
//
// WHAT WAS STILL WRONG. Everything above fixes a note open in a markdown tab,
// because re-rendering the note was the only way the repaint knew to re-run a
// block processor. A block drawn anywhere else keeps its old words: there is no
// note to re-render, so a kind rename updated one pane and not the copy of the
// same note embedded in another. `MarkdownRenderer.render` is public API and
// dashboard plugins render notes through it, so "anywhere else" is a real place.
describe("the repaint reaches blocks outside a markdown view", () => {
  const live = (): string => readCode("livewidget");

  it("repaints registered sites as well as markdown leaves", () => {
    // The leaf loop is no longer the whole function.
    const fn = live().slice(live().indexOf("export function repaintOpenNotes"));
    expect(fn).toContain("repaintForeignSites(rerendered)");
  });

  it("collects the re-rendered containers before re-rendering them", () => {
    // ORDERING IS LOAD-BEARING: `rerender` tears the preview down and rebuilds
    // it, so a container read afterwards would no longer hold the elements the
    // list exists to exclude.
    const fn = live().slice(live().indexOf("export function repaintOpenNotes"));
    expect(fn.indexOf("rerendered.push(view.containerEl)")).toBeGreaterThan(-1);
    expect(fn.indexOf("rerendered.push(view.containerEl)")).toBeLessThan(
      fn.indexOf("rerender(true)")
    );
  });

  it("skips a site the note re-render already covered", () => {
    // Redrawing it again would race Obsidian's teardown, and from a weaker
    // source: the re-render re-reads the file, a repaint replays the source
    // string captured at mount.
    const fn = live().slice(live().indexOf("function repaintForeignSites"));
    expect(fn).toContain("rerendered.some((root) => root.contains(el))");
    expect(fn).toContain("continue");
  });

  it("drops a site whose element has left the document", () => {
    // Pruned at repaint time rather than watched — a MutationObserver per block
    // to save two fields and a closure is the wrong trade.
    const fn = live().slice(live().indexOf("function repaintForeignSites"));
    expect(fn).toContain("!el.isConnected");
    expect(fn).toContain("sites.delete(site)");
  });

  it("iterates a copy, because a repaint can register a site", () => {
    // `repaint` runs the block's own render path; a block that draws a nested
    // block would mutate the set mid-iteration.
    const fn = live().slice(live().indexOf("function repaintForeignSites"));
    expect(fn).toContain("Array.from(sites)");
  });

  it("gives each drawing its own component and unloads the last", () => {
    // WITHOUT THIS A REPAINT IS A LEAK. The widgets a block draws register
    // watchers through `ctx.addChild`; re-running against the same context would
    // add a second set beside the first, and the old ones keep listening and
    // rebuilding into elements no longer on screen.
    const s = live();
    expect(s).toContain("function scopedContext");
    expect(s).toContain("addChild: (child) => owner.addChild(child)");
    const draw = s.slice(s.indexOf("private repaint(): void {"));
    expect(draw.indexOf("this.discard()")).toBeLessThan(draw.indexOf("this.draw()"));
  });

  it("still asks Obsidian's own context where the block is", () => {
    // `getSectionInfo` must reach the real renderer to answer truthfully about
    // the file; a scoped context that answered for itself would be a lie the
    // block-drag rewrite acts on.
    expect(live()).toContain("getSectionInfo: (el) => ctx.getSectionInfo(el)");
  });

  it("anchors the inline site on the parent, not on the widget", () => {
    // The inline path REPLACES its element on every repaint. Anchoring the child
    // on the widget would arm `addChild`'s removal-driven unload against our own
    // swap: the first repaint detaches it, Obsidian unloads the child, and the
    // site stops repainting after exactly one try.
    const s = live();
    const mount = s.slice(s.indexOf("export function mountInline"));
    expect(mount).toContain("const anchor = code.parentElement");
    expect(mount).toContain("new InlineSite(anchor ?? first");
  });

  it("keeps what is on screen when a directive no longer builds", () => {
    // `build` returns null for a retired widget or a deleted tracker, and a
    // stale button serves a reader better than a control vanishing out of a
    // table cell mid-session.
    const s = live();
    const fn = s.slice(s.indexOf("class InlineSite"));
    expect(fn).toContain("if (!next) {");
    expect(fn).toContain("generation.unload();");
  });

  it("routes every fenced language through the repaintable wrapper", () => {
    // A fence registered straight on Obsidian would render once and never be
    // heard from again, which is the whole defect.
    const w = readCode("widgets");
    expect(w).toContain('this.registerBlock("chronoanvil", ');
    expect(w).toContain('this.registerBlock(\n      "chronoanvil-charts"');
    expect(w).toContain('this.registerBlock(\n      "chronoanvil-journal-charts"');
    // And nothing bypasses it.
    expect(w).not.toContain("this.plugin.registerMarkdownCodeBlockProcessor(\n");
    expect(w).not.toContain('this.plugin.registerMarkdownCodeBlockProcessor("chronoanvil"');
  });

  it("mounts the inline widget through the wrapper too", () => {
    // These are the table-cell buttons a kind rename renames.
    expect(readCode("widgets")).toContain(
      "mountInline(code, ctx, (scoped) => this.build(text, scoped))"
    );
  });
});

describe("a stored plural survives an edit", () => {
  it("is carried through normaliseKinds rather than rebuilt", () => {
    // Study's Practice kind stores `plural: "Practice"` for exactly the reason
    // the field exists. `normaliseKinds` rebuilds every row from the fields the
    // editor knows about and did not know this one, so opening the journal in
    // Settings and pressing Save turned the heading into "Practices" — on a
    // word the config had explicitly spelled out. Same shape of loss as
    // `variants` in 3.19.0.
    expect(readCode("settings-editors")).toContain("row.plural && row.plural !== plural(label)");
  });

  it("keeps Study's Practice heading singular through an edit", () => {
    // BEHAVIOURAL, not a source check: this is the exact round trip the report
    // came from — open the journal in Settings, save, and read the heading.
    const [practice] = normaliseKinds(
      [{ id: "practice", emoji: "🛠️", label: "Practice", plural: "Practice" }],
      { preserveIds: true }
    ).filter((k) => k.id === "practice");
    expect(practice.plural).toBe("Practice");
    expect(kindPlural(practice as JournalKind)).toBe("Practice");
  });

  it("is what the widgets print, rather than a second derivation", () => {
    // AN OVERRIDE IS ONLY WORTH STORING IF EVERY SURFACE READS IT. Three in
    // tables.ts did not, and each called `plural` on the kind's LABEL: the
    // rollup's column heading, `level-index`'s per-kind heading, and the stats
    // band's label. So a subject's table was headed "Practices" over a topic
    // whose own section header, buttons and empty states — all of which go
    // through `kindPlural` — said "Practice". One kind, two spellings, on two
    // pages a click apart.
    const tables = readCode("tables");
    expect(tables).not.toMatch(/plural\(k(?:ind)?\.label\)/);
    expect(tables).toContain("type.kinds.map((k) => kindPlural(k))");
  });

  it("drops an override the new label already produces", () => {
    // A kind relabelled to "Seminar" whose stored plural is the one the
    // pluraliser would derive anyway keeps nothing — a journal should not
    // accumulate overrides that say nothing. The LABEL is the singular, which
    // is what gets pluralised.
    const [k] = normaliseKinds(
      [{ id: "practice", emoji: "🛠️", label: "Seminar", plural: "Seminars" }],
      { preserveIds: true }
    );
    expect(k.plural).toBeUndefined();
  });

  it("drops one the pluraliser already produces", () => {
    // A relabelled kind should not keep an override pinning the OLD label's
    // plural, and a journal should not accumulate overrides saying nothing.
    expect(plural("Seminar")).toBe("Seminars");
    expect(plural("Practice")).toBe("Practices");
  });
});
