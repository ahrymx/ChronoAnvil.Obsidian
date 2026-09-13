// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Selecting, moving and deleting entries from *What's below*. 1.0.14.
//
// *"what's below would benefit from a 'edit' button which allows selection of
// entries to either delete or move."*
//
// ── WHAT THIS SUITE CAN AND CANNOT REACH ─────────────────────────────────
//
// There is no jsdom here, so the mode's DOM half — a tick appearing in a row, a
// class landing on a list — cannot be exercised. What CAN be exercised is every
// rule the mode obeys, which is why those rules are plain exported functions
// rather than private methods: which destinations are offered, which are
// withheld, what the count reads, what survives a repaint, and what a partial
// failure tells the reader. `revealButtons` made this trade first and stated
// it — *"a rule that can be asserted is worth more than one that has to be
// eyeballed"* — and the shape it forces on the code is better than the shape it
// replaces.
//
// The DOM wiring that is left is held by source assertions, each naming the
// specific defect it prevents. That is weaker than running it and is said so
// where it happens.

import { describe, expect, it } from "vitest";
import {
  moveChoices,
  moveReport,
  moveTargets,
  parseMoveChoice,
  prunedSelection,
  selectionLabel,
} from "../src/ui/widgets/below-edit";
import type { JournalType } from "../src/journals/journal";
import { cssRule, readCode, readCss, readSrc } from "./sources";

// The reader's own journal, which is where the ask came from: `type: project`,
// two kinds, two `kind-table:` groups on the card.
const PROJECTS: JournalType = {
  id: "projects",
  name: "Projects",
  emoji: "🚀",
  root: "03 - Journals/Projects",
  templatesFolder: "00 - Infrastructure/Templates/Projects",
  levels: [{ id: "area", noun: "Area", fallbackEmoji: "📁" }],
  kinds: [
    { id: "update", emoji: "📋", label: "Update", rating: "status" },
    { id: "decision", emoji: "⚖️", label: "Decision" },
  ],
};

const FOLDERS = [
  "03 - Journals/Projects/Website",
  "03 - Journals/Projects/Almanac",
  "03 - Journals/Projects/Kiln",
];

const HERE = "03 - Journals/Projects/Website";

// ── the count ────────────────────────────────────────────────────────────

describe("what the picking bar says is selected", () => {
  it("says nothing rather than zero", () => {
    // "0 notes selected" is a number a reader has to read before learning it
    // means nothing is happening. `refreshButton` in the repair window settled
    // this phrase already, and two surfaces saying one thing is worth more than
    // either of them saying it better.
    expect(selectionLabel(0)).toBe("Nothing selected");
  });

  it("counts one without pluralising it", () => {
    expect(selectionLabel(1)).toBe("1 note selected");
  });

  it("pluralises everything above one", () => {
    expect(selectionLabel(2)).toBe("2 notes selected");
    expect(selectionLabel(11)).toBe("11 notes selected");
  });
});

// ── which destinations are offered ───────────────────────────────────────

describe("where a set of ticked notes can go", () => {
  it("offers both kinds of destination from one list", () => {
    // TWO RUNS, NOT TWO BUTTONS. The reader's question is "where do these go",
    // and two buttons would make them classify their own intent before seeing
    // either list — `kind-row-menu.ts`' argument for putting a scope in the
    // dialogue rather than in the menu.
    const targets = moveTargets(PROJECTS, FOLDERS, HERE, []);
    expect(targets.filter((t) => t.kind === "type")).toHaveLength(2);
    expect(targets.filter((t) => t.kind === "folder")).toHaveLength(2);
  });

  it("puts the note types first, because the folder run is the long one", () => {
    const kinds = moveTargets(PROJECTS, FOLDERS, HERE, []).map((t) => t.kind);
    expect(kinds.indexOf("folder")).toBeGreaterThan(kinds.lastIndexOf("type"));
  });

  it("never offers the folder the notes are already in", () => {
    // A "move" that does nothing is not an option, it is a report waiting to be
    // filed. The host index note IS its folder — `Projects/Website/Website.md` —
    // so this is the one exclusion the folder walk cannot make for itself.
    const paths = moveTargets(PROJECTS, FOLDERS, HERE, [])
      .filter((t) => t.kind === "folder")
      .map((t) => (t.kind === "folder" ? t.path : ""));
    expect(paths).not.toContain(HERE);
    expect(paths).toEqual([
      "03 - Journals/Projects/Almanac",
      "03 - Journals/Projects/Kiln",
    ]);
  });

  it("never offers the kind every ticked note already is", () => {
    const ids = moveTargets(PROJECTS, FOLDERS, HERE, ["update"])
      .filter((t) => t.kind === "type")
      .map((t) => (t.kind === "type" ? t.id : ""));
    expect(ids).toEqual(["decision"]);
  });

  it("offers a kind SOME of them are, because a selection can span two tables", () => {
    // THE CARD HAS ONE MODE AND SEVERAL TABLES, so a reader can tick three
    // updates and two decisions in one pass. "Update" is then a real destination
    // for the two decisions, and withholding it because something in the set is
    // already an update would leave the reader unable to say the one thing they
    // are most likely to mean: *make these all the same*.
    const ids = moveTargets(PROJECTS, FOLDERS, HERE, ["update", "decision"])
      .filter((t) => t.kind === "type")
      .map((t) => (t.kind === "type" ? t.id : ""));
    expect(ids).toEqual(["update", "decision"]);
  });

  it("offers nothing where there is nowhere else, rather than a list of one", () => {
    // A one-kind journal whose only container folder is this note's own. The bar
    // reads this to decide whether *Move…* is drawn AT ALL, which is the
    // difference between "momentarily inapplicable" and "structurally
    // impossible" — `discoverability.test.ts`' rule that a menu which opens and
    // then explains it cannot help is worse than no menu.
    const solo: JournalType = { ...PROJECTS, kinds: [PROJECTS.kinds[0]] };
    expect(moveTargets(solo, [HERE], HERE, ["update"])).toEqual([]);
  });
});

// ── how the destinations read ────────────────────────────────────────────

describe("the rows the destination picker draws", () => {
  const rows = () => moveChoices(moveTargets(PROJECTS, FOLDERS, HERE, []));

  it("groups the two runs under headings the suggester already draws", () => {
    const groups = [...new Set(rows().map((r) => r.group))];
    expect(groups).toEqual(["Note type", "Index note"]);
  });

  it("says outright that a type change moves nothing", () => {
    // THE HONEST SENTENCE, and the reason it has to be here. The button says
    // *Move…*, and the clarifying question this feature was specified from said
    // a type change would move the file into that kind's folder. It does not, and
    // it cannot: a kind is NOT a folder — `JournalKind` has no folder field, every
    // kind at one journal level shares a folder, and `kind-table` selects its rows
    // by frontmatter. So the row carries the correction rather than leaving the
    // reader to discover it.
    const type = rows().find((r) => r.group === "Note type");
    expect(type?.description).toBe("Re-file as this. Nothing moves on disk.");
  });

  it("shows a folder by its own name and the whole path beneath it", () => {
    // A run of `03 - Journals/Projects/…` labels is a column of one word the
    // reader has to scan past. The path is still there, as the thing that
    // disambiguates two folders with one name.
    const folder = rows().find((r) => r.group === "Index note");
    expect(folder?.label).toBe("Almanac");
    expect(folder?.description).toBe("03 - Journals/Projects/Almanac");
  });

  it("tags each row so the answer parses back to exactly one destination", () => {
    for (const row of rows()) {
      const back = parseMoveChoice(row.value);
      expect(back, row.value).not.toBeNull();
      expect(back?.kind, row.value).toBe(
        row.group === "Note type" ? "type" : "folder"
      );
    }
  });

  it("refuses an answer it did not write", () => {
    // The suggester can be dismissed, and `promptDetailedSuggester` answers
    // `null` for that. An untagged string is not a destination either.
    expect(parseMoveChoice(null)).toBeNull();
    expect(parseMoveChoice("")).toBeNull();
    expect(parseMoveChoice("decision")).toBeNull();
    expect(parseMoveChoice("type:")).toBeNull();
    expect(parseMoveChoice("folder:")).toBeNull();
  });

  it("keeps a folder path whole, slashes and all", () => {
    // `folder:` is a prefix and not a separator — splitting on ":" would take
    // the path apart at the first colon a reader ever puts in a folder name.
    expect(parseMoveChoice("folder:03 - Journals/Projects/Almanac")).toEqual({
      kind: "folder",
      path: "03 - Journals/Projects/Almanac",
    });
  });
});

// ── what survives a repaint ──────────────────────────────────────────────

describe("a selection across a repaint", () => {
  const ON_SCREEN = ["a/One.md", "a/Two.md", "a/Three.md"];

  it("keeps every tick the table still holds", () => {
    // THIS IS THE POINT OF THE PRUNE, AND NOT THE OPPOSITE OF IT. Most repaints
    // are nothing to do with the reader — a sync writing a sibling, a tracker
    // ticked in another pane — and losing ten ticks to somebody else's write is
    // how a reader stops trusting a mode.
    const kept = prunedSelection(new Set(["a/One.md", "a/Three.md"]), ON_SCREEN);
    expect([...kept].sort()).toEqual(["a/One.md", "a/Three.md"]);
  });

  it("drops a tick whose row has gone", () => {
    // The DOM this pass found is the authority, not the set's memory — 1.0.12's
    // `welded` rule one surface over. A note that has moved out from under the
    // reader must not stay ticked, or the next Delete describes a row nobody can
    // see.
    const kept = prunedSelection(new Set(["a/One.md", "a/Gone.md"]), ON_SCREEN);
    expect([...kept]).toEqual(["a/One.md"]);
  });

  it("empties the selection when the tables do", () => {
    expect(prunedSelection(new Set(["a/One.md"]), [])).toEqual(new Set());
  });

  it("returns a new set rather than editing the one it was handed", () => {
    const before = new Set(["a/One.md", "a/Gone.md"]);
    prunedSelection(before, ON_SCREEN);
    expect(before.size).toBe(2);
  });
});

// ── what a partial move reports ──────────────────────────────────────────

describe("what the reader is told a move did", () => {
  it("reports what moved when all of it moved", () => {
    expect(moveReport(3, [], "Almanac")).toBe("Moved 3 to Almanac");
  });

  it("names the ones that did not, because that is what gets looked at next", () => {
    // WHAT MOVED, NOT WHAT WAS ASKED FOR — `scaffold.ts`' rule and
    // `trashSeveral`'s. A count on its own tells a reader something went wrong
    // and gives them nowhere to start.
    const text = moveReport(2, ["Two.md", "Three.md"], "Almanac");
    expect(text).toContain("Moved 2 of 4");
    expect(text).toContain("Two.md, Three.md");
  });

  it("does not claim a move when nothing moved", () => {
    const text = moveReport(0, ["Two.md"], "Almanac");
    expect(text.startsWith("Nothing moved")).toBe(true);
    expect(text).toContain("Two.md");
  });
});

// ── the parts that need a render, held by the source ─────────────────────

describe("how the mode reaches the rows", () => {
  const src = () => readSrc("ui/widgets/below-edit");

  it("is a render child, so Obsidian's own unload is the teardown", () => {
    // The review checklist's rule, and the reason `RevealBar` is one. Nothing in
    // this file touches `document` or `window`.
    const text = src();
    expect(text).toContain("export class BelowEdit extends MarkdownRenderChild");
    expect(readCode("ui/widgets/below-edit")).not.toContain("document.addEventListener");
    expect(readCode("ui/widgets/below-edit")).not.toContain("window.addEventListener");
  });

  it("listens on every live host, because the redraw event does not bubble", () => {
    // THE DEFECT THIS PREVENTS, precisely. `LiveWidget` dispatches a bare
    // `new CustomEvent(LIVE_REDRAW_EVENT)` on its OWN element — no `bubbles: true`
    // — so one listener on the block would never fire once, and a selection would
    // silently evaporate on the first repaint with no error anywhere.
    const text = src();
    expect(text).toContain("for (const host of this.hosts) {");
    expect(text).toContain("host.addEventListener(LIVE_REDRAW_EVENT, redraw)");
    expect(text).toContain(
      "this.register(() => host.removeEventListener(LIVE_REDRAW_EVENT, redraw))"
    );
    // AND THE EVENT REALLY DOES NOT BUBBLE, asserted from the dispatcher rather
    // than trusted — this whole shape is wrong if it ever starts to.
    expect(readCode("livewidget")).toContain("new CustomEvent(LIVE_REDRAW_EVENT)");
    expect(readCode("livewidget")).not.toContain("bubbles: true");
  });

  it("re-applies from the set rather than rebuilding it", () => {
    expect(src()).toContain("if (this.picking) this.apply();");
    expect(src()).toContain(
      "this.chosen = prunedSelection(this.chosen, this.pathsOnScreen());"
    );
  });

  it("asks whether there is anything to edit AFTER a render, not before", () => {
    // THE LIFECYCLE BUG THIS IS THE FIX FOR. `ctx.addChild` loads a child when
    // the rendered markdown attaches, and every table on this card is a
    // `LiveWidget` that draws its rows in its own `onload` — so at the moment the
    // foot is BUILT every table is empty. The gate asked there would have hidden
    // the Edit button on every card in the vault. Asked here it is asked after
    // each render, which is also how a card that gains its first note gains the
    // button with no reload.
    const text = src();
    expect(text).toContain("private syncAvailable(): void {");
    expect(text).toContain("this.toggle.hidden = !any;");
    const load = text.indexOf("onload(): void {");
    expect(text.indexOf("this.syncAvailable();", load)).toBeGreaterThan(load);
  });

  it("puts the tick in the lead slot, not beside the ⋯", () => {
    // `lead` is what `createListRow` keeps in front of the token for a row that
    // is a choice rather than a record, which is `repair-modal.ts`' own reading
    // of it. `actions` holds the `⋯` whose menu contains *Delete note…* — a tick
    // 22px from a delete is the pairing `list-row.ts` refuses for the reorder
    // arrows, *"one slip away from being expensive"*.
    const text = src();
    expect(text).toContain('row.querySelector<HTMLElement>(".ca-list-lead")');
    expect(text).toContain('cls: "ca-list-tick"');
  });

  it("guards the row click against the tick's own, or the two cancel out", () => {
    // `repair-modal.ts`' rule verbatim. Without this the row handler fires after
    // the box has already toggled itself and puts it straight back — a mode that
    // looks broken and logs nothing.
    expect(src()).toContain("if (evt.target === tick) return;");
  });

  it("leaves the title link alone while picking", () => {
    // A reader in edit mode has not stopped wanting to look at what they are
    // about to delete.
    expect(src()).toContain('closest("a")');
  });

  it("identifies a row by the path the table stamped, never by a TFile", () => {
    // 4.50.2's identity rule: Obsidian MUTATES a `TFile` in place on rename, so
    // anything holding the object holds a live handle to wherever that note went
    // while the table still shows the old row.
    expect(readCode("ui/tables")).toContain('export const ROW_NOTE_ATTR = "data-ca-note"');
    expect(readCode("ui/tables")).toContain("row.setAttr(ROW_NOTE_ATTR, note.file.path);");
    expect(src()).toContain("row.getAttr(ROW_NOTE_ATTR)");
  });

  it("re-resolves every path after the confirm and skips what has gone", () => {
    // `applyDashboardCatchups`' rule: a write built on a stale read silently
    // reverts an edit made in another pane.
    const text = src();
    expect(text).toContain("const file = getFile(this.deps.plugin.app, path);");
    expect(text).toContain("if (!file) continue;");
  });

  it("takes a promoted note's folder, so its pages come with it", () => {
    // `bin()`'s rule, and the reason `trashItem` and `renameFile` both take a
    // `TAbstractFile`: the pages come along by construction rather than by a
    // list that could be wrong.
    expect(src()).toContain("isPromotedPath(file.path)");
    expect(src()).toContain("? (file.parent ?? file)");
  });

  it("takes every mark back off when the block unloads", () => {
    // The ticks and the `is-editing` are on somebody else's elements — a live
    // mode left on a block being recycled is `RevealBar.release()`'s argument.
    const text = src();
    expect(text).toContain("onunload(): void {");
    expect(text).toContain('list.classList.remove("is-editing")');
  });
});

describe("what the two moves actually write", () => {
  const src = () => readSrc("ui/widgets/below-edit");

  it("changes a type by writing frontmatter and moving nothing", () => {
    expect(src()).toContain("plugin.journals.setNoteKind(file, kindId)");
    expect(readCode("journals/journal")).toContain(
      'front["type"] = id;'
    );
  });

  it("re-parents with the mover that fixes links", () => {
    // `fileManager.renameFile`, NEVER `vault.rename` — the former updates every
    // link that pointed at what moved, which is the difference between a moved
    // note that still resolves and a page of broken links. The tree-wide sweep
    // for this lives in `journal-removal.test.ts`; this is the local claim.
    const text = readCode("ui/widgets/below-edit");
    expect(text).toContain("plugin.app.fileManager.renameFile(whole, target)");
    expect(text).not.toContain("vault.rename(");
  });

  it("refuses a collision rather than suffixing around it", () => {
    // `header-title.ts` and `promoteToDashboard` both refuse for the same
    // reason: silently producing `Quadratics 1.md` in a reader's own folder is
    // the `The Avengers-2026-08-20-2026-08-20.md` failure by another route.
    const text = src();
    expect(text).toContain("if (plugin.app.vault.getAbstractFileByPath(target)) {");
    expect(text).toContain('skipped.push(`${whole.name} (already there)`);');
  });

  it("does not auto-pick a sole destination", () => {
    // `only()`'s own rule names this case: auto-picking is right for incidental
    // bookkeeping and wrong for a substantive act. Moving a reader's notes is the
    // second kind.
    expect(readCode("ui/widgets/below-edit")).not.toContain("only(");
  });

  it("reads one answer for which folders can hold a note", () => {
    // The walk was inside `pickContainerFolder`. Extracted rather than copied, so
    // "which folders can hold a note" cannot come to have two answers.
    const journal = readCode("journals/journal");
    expect(journal).toContain("export function containerFoldersOf(");
    expect(journal).toContain("const options = containerFoldersOf(this.plugin, type);");
    expect(src()).toContain("containerFoldersOf(this.deps.plugin, this.deps.type)");
  });
});

describe("what the delete says before it deletes", () => {
  const src = () => readSrc("ui/widgets/below-edit");

  it("names where the notes are about to go", () => {
    // THE WHOLE OF 1.0.13 IS THIS SENTENCE. The bin was retired because the
    // reader now knows Obsidian's *Deleted files* setting exists — *"This should
    // be the default way for all chronoanvil's deletion processes"* — and what
    // the bin's existence used to carry, the confirm has to carry instead.
    const text = src();
    expect(text).toContain("const where = trashClause(trashDestination(plugin.app));");
    expect(text).toContain("Links from your other notes to them will break.");
  });

  it("dresses it as a deletion", () => {
    // `confirmAction`'s fifth argument, which paints `mod-warning` rather than
    // `mod-cta` on the button that does it.
    const text = src();
    const call = text.indexOf("`Delete ${n} note${n === 1 ? \"\" : \"s\"}?`");
    expect(call).toBeGreaterThan(-1);
    expect(text.slice(call, call + 500)).toMatch(/\n\s+true\n\s+\);/);
  });

  it("reaches the one deletion in the tree", () => {
    // `src/core/trash.ts` is the only module that calls `trashFile`, asserted
    // tree-wide in `page-default.test.ts`. This is the claim that the bulk
    // delete went through it rather than re-rolling one.
    expect(readCode("ui/widgets/below-edit")).toContain("trashSeveral(plugin.app, items)");
  });

  it("offers no second scope, because across N notes it has N answers", () => {
    // The note/pages split belongs to the single row's `⋯`, where 4.50.2 put it.
    expect(src()).toContain("NO \"PAGES ONLY\" SECOND ANSWER");
    expect(readCode("ui/widgets/below-edit")).not.toContain("promptAction(");
  });
});

// ── the foot, and what the chevron folds ─────────────────────────────────

describe("the foot the Edit button sits in", () => {
  it("is one wrapper, so the reveal claims one name", () => {
    // 1.0.12 fixed a defect where the add row stayed visible under a folded
    // head, by claiming it BY NAME in two places — it carries no `data-ca-line`
    // stamp because no directive drew it. Two loose siblings would mean two names
    // in both of those places and a third of each the next time the foot grows a
    // control, which is that defect re-armed structurally.
    const src = readSrc("widgets");
    expect(src).toContain("buildBelowFoot(this.plugin, ctx, kindHosts)");
    expect(src).toContain("if (belowFoot) container.appendChild(belowFoot);");
    expect(src).toContain(
      "belowFoot && kindTableAt >= part.from && kindTableAt < part.to"
    );
    expect(src).toContain(
      "if (belowFoot && !within.includes(belowFoot)) within.push(belowFoot);"
    );
  });

  it("appears exactly where + Add note type appears, and nowhere new", () => {
    // The Edit button rides the existing gate rather than widening it. Widening
    // it would put `+ Add note type` on a `level-index` card too — a change to a
    // control nobody asked about, made as a side effect of adding a second one.
    const src = readSrc("widgets");
    expect(src).toContain(
      'const hasKindTable = lines.some((l) => keywordOf(l) === "kind-table");'
    );
    // And the foot refuses for the add row's own reason where the path resolves
    // to no journal: an index TEMPLATE carries `kind-table:` lines and lives
    // outside the journals root.
    const foot = readCode("ui/widgets/below-edit");
    expect(foot).toContain("if (!add) return null;");
    expect(foot).toContain("if (!type) return null;");
  });

  it("collects the live hosts at the append, while both halves are in hand", () => {
    // A `querySelectorAll` afterwards would have to read classes to guess at
    // directives, and would sweep up the stats band, the chart and the tasks
    // table along with the tables it wants. `named` is collected here for the
    // same reason one line up.
    const src = readSrc("widgets");
    expect(src).toContain("const kindHosts: HTMLElement[] = [];");
    expect(src).toContain('if (kind === "kind-table") kindHosts.push(widget);');
  });

  it("wears a glyph none of the other vocabularies had claimed", () => {
    // `settings` acts on the page, `more-horizontal` is more about a row, `zap`
    // is page actions, `pencil` is rename. Selecting rows is none of those.
    const foot = readCode("ui/widgets/below-edit");
    expect(foot).toContain('"list-checks"');
    expect(foot).toContain('const hint = "Select notes to move or delete";');
    // BOTH, per `addHeadButton`'s rule: `title` is the hover and `aria-label` is
    // the only name a screen reader has for an icon.
    expect(foot).toContain('edit.setAttr("aria-label", hint)');
    expect(foot).toContain('edit.setAttr("title", hint)');
  });

  it("keeps aria-pressed in step with the mode", () => {
    expect(readCode("ui/widgets/below-edit")).toContain(
      'this.toggle.setAttr("aria-pressed", on ? "true" : "false");'
    );
  });

  it("does not fire the fold it sits inside", () => {
    // The card's head folds on click. Every other control inside a section makes
    // the same separation.
    expect(readCode("ui/widgets/below-edit")).toContain("evt.stopPropagation();");
  });
});

// ── the styles ───────────────────────────────────────────────────────────

describe("how the foot is drawn", () => {
  it("pays the groups' gap once, on the strip", () => {
    // The gap was the add row's and is the strip's now: the strip is what has a
    // top edge, and a second `margin-top` inside it would charge the gap twice.
    const strip = cssRule(".ca-journal-widget-block > .ca-journal-below-foot");
    expect(strip).toContain("display: flex");
    expect(strip).toContain("margin-top: var(--ca-sec-gap)");
    const add = cssRule(".ca-journal-below-foot > .ca-journal-kind-add");
    expect(add).toContain("flex: 1 1 auto");
    expect(add).not.toContain("margin-top");
  });

  it("names the parent, the element AND the class on every button", () => {
    // THE 5.31.2 GOTCHA, WHICH COST A RELEASE. A single class is (0,1,0), and a
    // theme needs only `.markdown-rendered button` to reach (0,1,1) and take
    // every property the rule left at a default — the reveal pills shipped a
    // release sitting on a `#333333` ground their own rule called transparent.
    const css = readCss();
    expect(css).toContain(".ca-journal-below-foot > button.ca-journal-below-edit");
    expect(css).toContain(".ca-journal-below-pick > button.ca-journal-below-done");
  });

  it("states ground, edge and shadow rather than trusting them to be nothing", () => {
    const rule = cssRule(".ca-journal-below-foot > button.ca-journal-below-edit");
    expect(rule).toContain("background: transparent");
    expect(rule).toContain("box-shadow: none");
    expect(rule).toContain("border: var(--ca-rule-hair) solid");
  });

  it("takes Delete's red from Obsidian rather than picking one", () => {
    // `mod-warning` is the host's own class for exactly this, which is why the
    // shared rule reaches every button in the bar EXCEPT it.
    expect(readCss()).toContain(
      ".ca-journal-below-pick > .ca-journal-below-acts > button:not(.mod-warning)"
    );
    expect(readCode("ui/widgets/below-edit")).toContain('cls: "mod-warning"');
  });

  it("reserves the lead column only while picking", () => {
    // `has-row-actions` is a build-time flag because the `⋯` is on every row on
    // every paint. A tick is on no row until the reader asks, so a permanent left
    // reserve would indent every kind table in every vault for a mode nobody is
    // in — which is why this one is a state class.
    const css = readCss();
    expect(css).toContain(".ca-list.is-editing .ca-list-heads");
    expect(css).toContain("--ca-row-tick-w");
    // ONE CUSTOM PROPERTY READ BY BOTH, so the strip and the rows cannot drift —
    // the rule the actions reserve beside it already keeps.
    expect(cssRule(".ca-list.is-editing .ca-list-heads")).toContain(
      "var(--ca-row-tick-w)"
    );
    expect(cssRule(".ca-list.is-editing .ca-list-lead")).toContain(
      "var(--ca-row-tick-w)"
    );
  });

  it("marks a picked row with a ground, not a border", () => {
    // A border would reflow the row a pixel and the list would jitter as ticks
    // went on and off.
    const rule = cssRule(".ca-list.is-editing .ca-list-row.is-picked");
    expect(rule).toContain("background:");
    expect(rule).not.toContain("border");
  });
});

// ── and nothing composed changed ─────────────────────────────────────────

describe("no note needs migrating to gain any of this", () => {
  it("is renderer-drawn, so the catalogue says nothing about it", () => {
    // The counter-design is a directive the catalogue composes, which would
    // reach exactly the notes written after it. Every index already in a vault
    // has this at the next repaint instead — the same claim the add row makes.
    for (const mod of ["journals/journal-sections", "journals/journal-plan"]) {
      expect(readSrc(mod), mod).not.toContain("below-foot");
      expect(readSrc(mod), mod).not.toContain("below-edit");
    }
  });
});
