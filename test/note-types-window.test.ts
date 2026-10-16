// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Note types window, 1.0.69.
//
// *"I think the 'add note type' and 'edit' buttons would better fit the
// sections header ("What's Below"), right aligned … but the cleanest and
// cohesive solution would be just a cog wheel (matching those other sections),
// which opens a window where a type can be added and the table can be edited,
// all in one interface."*
//
// FOUR CONTROLS BECAME ONE DOOR. A *What's below* card carried a dashed
// `+ Add note type` row and an `Edit` toggle in its foot, and — only once that
// toggle was pressed — a `⋯` and a `✕` on every group's head. Three of the four
// were reachable only from inside a mode a reader had to know to turn on first.
//
// THE READER'S TWO BINDING CALLS, collected before any of this was written:
//
//   1. the cog opens a Note types window: add a type, remove an empty one, and
//      each type's table options in one place, absorbing the per-group `⋯`;
//      a *Select notes…* button closes it and turns the ticks on
//   2. the per-group `⋯` is removed regardless — everything type-level moves
//      behind the cog
//
// WHAT THIS SUITE CAN REACH. The window is DOM and this suite has none, so it
// is pinned by its source shape through `test/sources.ts`, as every render path
// in this repo is. What the window WRITES is tested where the record is:
// `test/kind-tables.test.ts` for the per-page override, `test/kind-create.test.ts`
// for the add, `test/page-note-types.test.ts` and `test/below-edit.test.ts` for
// the removal's two-question gate. This file holds the door, the form and the
// four claims that moved here with the controls.

import { describe, expect, it } from "vitest";
import { cssRule, readCode, readCss, readSrc } from "./sources";
import { COL_REMOVE, movedCols, removalHint } from "../src/ui/note-types-window";

const win = () => readSrc("ui/note-types-window");
const code = () => readCode("ui/note-types-window");

// ── the door ─────────────────────────────────────────────────────────────

describe("the cog on the card's title bar", () => {
  it("matches the other sections' cog rather than inventing a glyph", () => {
    // THE WHOLE OF THE READER'S ASK WAS COHESION — *"matching those other
    // sections"* — so this is the one place in the round where looking like its
    // neighbour is the requirement and not a coincidence. The Attachments cog
    // is that neighbour: same glyph, same slot, same kind of window behind it.
    expect(code()).toContain('setIcon(btn, "settings")');
    expect(readCode("ui/widgets/attachment-widgets")).toContain(
      'setIcon(btn, "settings")'
    );
    // BOTH NAMES, per `addHeadButton`'s rule: `title` is the hover and
    // `aria-label` is the only name a screen reader has for an icon.
    const c = code();
    expect(c).toContain(
      'const hint = "Add a note type, or change what this note\'s tables show"'
    );
    expect(c).toContain('btn.setAttr("aria-label", hint)');
    expect(c).toContain('btn.setAttr("title", hint)');
  });

  it("rides the title row's slot, not the section's action row", () => {
    // `headTools` is the slot 1.0.49 §3 made for exactly this. `frame.actions`
    // at level 1 is `flex: 1 0 100%` — a whole second row of the section — so a
    // labelled pill there costs a card a row for one control, which is why that
    // release moved the categories door onto the title row as a cog.
    expect(readSrc("widgets")).toContain("headTools(frame.root).appendChild(");
    expect(readSrc("section-frame")).toContain("export function headTools(");
  });

  it("does not fire the fold it sits inside", () => {
    // The bar folds the section on click. Every hosted control in a head makes
    // the same separation — and `preventDefault` as well, because this is a
    // `<button>` inside a surface that treats a click as a gesture.
    const c = code();
    const at = c.indexOf("btn.addEventListener");
    expect(c.slice(at)).toContain("evt.preventDefault();");
    expect(c.slice(at)).toContain("evt.stopPropagation();");
  });

  it("resets a chip-shaped button's height rather than inheriting 30px", () => {
    // `obsidian-button-height`: Obsidian gives every `<button>` a `min-height`,
    // and a 1.4em glyph in a 30px box sits off the title's line. The categories
    // cog is the shape being matched, so the rule is its twin.
    const rule = cssRule(".ca-journal-note-types-cog");
    expect(rule).toContain("min-height: 0");
    expect(rule).toContain("border: none");
    expect(rule).toContain("background: none");
    expect(rule).toContain("box-shadow: none");
    // SIZED OFF THE BAR'S GLYPH TOKEN, which is what makes it the same size as
    // the chevron beside it at every section level rather than at one.
    expect(rule).toContain("font-size: var(--ca-bar-glyph)");
  });

  it("reads the card when it is pressed, never when it is built", () => {
    // THE DEFECT THIS PREVENTS, and it is the same one 1.0.14 shipped one
    // surface over. Every table here is a `LiveWidget` that draws its rows in
    // its own `onload`, so at the moment this button is BUILT every table is
    // empty — a count taken here would be zero on every card in the vault, and
    // the window would offer a removal for every type a reader has.
    const c = code();
    const at = c.indexOf("btn.addEventListener");
    expect(at).toBeGreaterThan(-1);
    const after = c.slice(at);
    expect(after).toContain("hosts.map((h) => ({");
    expect(after).toContain("rows: h.host.querySelectorAll(`[${ROW_NOTE_ATTR}]`).length");
    // Nothing is counted before the listener, which is the half a `toContain`
    // alone would not see.
    expect(c.slice(0, at)).not.toContain("querySelectorAll");
    // AND THE TWO LIVE THINGS ARE HANDED IN AS LIVE THINGS: the hosts as the
    // array the dispatcher keeps filling, the foot as a getter because it is
    // assigned after this call returns.
    expect(win()).toContain("foot: () => BelowFoot | null");
    expect(readSrc("widgets")).toContain("() => belowFoot");
  });

  it("counts rows by the stamp the table wrote, not by a class", () => {
    // 4.50.2's identity rule, and the reason `ROW_NOTE_ATTR` exists: a class
    // sweep would catch the heads row and any future chrome the list grows,
    // and the attribute is on exactly the rows that are notes.
    expect(code()).toContain("ROW_NOTE_ATTR");
    expect(readCode("ui/tables")).toContain('export const ROW_NOTE_ATTR = "data-ca-note"');
  });

  it("gives no row to a group naming a type the journal has lost", () => {
    // That fence draws a red *"Unknown … note type"* where its table would be —
    // 1.0.23's `prune` is the repair — so there is no kind to carry the answers
    // and a row here would be a form over nothing.
    const c = code();
    expect(c).toContain("const kind = type.kinds.find((k) => k.id === row.kindId);");
    expect(c).toContain("if (!kind) continue;");
  });
});

// ── the list ─────────────────────────────────────────────────────────────

describe("what each note type's row says before it is opened", () => {
  it("names the type in the plural, because a group lists several", () => {
    expect(code()).toContain("text: plural(row.kind.label)");
  });

  it("says what it holds, in the slot that says so", () => {
    // The categories window's rule, and for the same reason: the count is WHY
    // the ✕ beside it is drawn at all, and a reader should not have to read a
    // tooltip to find that out.
    expect(code()).toContain(
      'text: row.rows === 0 ? "empty" : `${row.rows} note${row.rows === 1 ? "" : "s"}`'
    );
  });

  it("says when this note has an answer of its own, on the closed row", () => {
    // The detail holding the answers is closed, and a reader scanning the list
    // for the type they changed should not have to open three to find it.
    expect(code()).toContain("if (!isBlankOverride(row.over)) {");
    expect(code()).toContain('text: "changed here"');
  });

  it("opens one detail at a time", () => {
    // The tags window's rule: two open editors over one list is a merge
    // conflict a reader cannot see. Here it also keeps the window the height of
    // a list rather than of every form in it.
    const c = code();
    expect(c).toContain("private open_: string | null = null;");
    expect(c).toContain("this.open_ = open ? null : row.kind.id;");
    expect(c).toContain("if (this.open_ === row.kind.id) this.renderDetail(el, row);");
  });
});

// ── the ✕, which is drawn either way as of 1.0.73 ───────────────────────
//
// *"Grey out the remove 'x' button instead of omittence of it … see how lessons
// is missing the x button? that's because lessons has notes, but practices is
// empty"*.
//
// 1.0.69 OMITTED IT, on `discoverability`'s rule that a control which opens and
// then explains it cannot help is worse than no control. The report is the other
// side of that rule and it is the stronger one here: an absence cannot be read,
// so a reader comparing two rows is left to guess which is the special case and
// why. Its sibling window — Attachments categories — had always drawn its ✕
// dimmed with the reason on it.

describe("the ✕ that says why it cannot go yet", () => {
  it("is drawn on every row, dimmed where the answer is no", () => {
    const c = code();
    expect(c).toContain("const can = row.blocked === null;");
    expect(c).toContain("gone.disabled = !can;");
    expect(c).toContain('gone.toggleClass("is-static", !can);');
    // NOT behind a condition any more. The old shape was `if (row.removable) {`
    // around the whole control, which is exactly what the reader reported.
    expect(c).not.toContain("if (row.removable)");
    expect(c).not.toContain("removable");
  });

  it("refuses the press as well as dimming it", () => {
    // `disabled` is the browser's half and is enough for a pointer; the guard
    // is for every other way a click arrives — a synthetic event, a keyboard on
    // a host that re-enables it, an `is-static` left on by a later edit.
    const c = code();
    const at = c.indexOf('gone.addEventListener("click"');
    expect(at).toBeGreaterThan(-1);
    expect(c.slice(at, at + 160)).toContain("if (!can) return;");
  });

  it("says what it would do, where it can do it", () => {
    expect(removalHint(null, "Lesson", 0)).toBe("Remove Lessons from this note");
  });

  it("counts the notes in the way, because that is the condition", () => {
    // THE SENTENCE THE READER'S REPORT ASKED FOR. "Cannot be removed" would
    // leave them with the same guess the absence did, so the reason names the
    // count they can see in the slot beside it.
    expect(removalHint("notes", "Lesson", 3)).toBe(
      "Lessons still has 3 notes on this note — move or remove them first"
    );
    expect(removalHint("notes", "Lesson", 1)).toBe(
      "Lessons still has 1 note on this note — move or remove them first"
    );
  });

  it("says the other two reasons in their own words", () => {
    // A sentence per reason. One blocked ✕ reading the same words as another
    // would be the omission again, told rather than shown.
    expect(removalHint("solo", "Film", 0)).toContain("the only note type");
    expect(removalHint("unnamed", "", 0)).toContain("cannot be identified");
    const said = new Set([
      removalHint(null, "Lesson", 0),
      removalHint("notes", "Lesson", 2),
      removalHint("solo", "Lesson", 0),
      removalHint("unnamed", "Lesson", 0),
    ]);
    expect(said.size).toBe(4);
  });

  it("names the type in the plural, as the row above it does", () => {
    expect(removalHint("notes", "Practice", 2)).toContain("Practices");
  });

  it("puts the sentence in both names a button has", () => {
    // An icon button's `aria-label` is the ONLY name a screen reader has, and a
    // disabled control is exactly the one a reader needs the reason for.
    const c = code();
    expect(c).toContain(
      "const why = removalHint(row.blocked, row.kind.label, row.rows);"
    );
    expect(c).toContain('gone.setAttr("aria-label", why);');
    expect(c).toContain('gone.setAttr("title", why);');
  });

  it("asks the card's rule for the reason instead of re-deriving it", () => {
    // 1.0.24's gate: `removalBlock` is the one answer, and a `row.rows === 0`
    // read again in the window would be a second one that could disagree.
    const c = code();
    expect(c).toContain("blocked: removalBlock(row)");
    // Scoped to the control, because the row's own COUNT legitimately reads
    // `row.rows === 0` one line up — that is the word "empty", not a gate.
    const at = c.indexOf("const can = row.blocked === null;");
    const block = c.slice(at, c.indexOf('gone.setAttr("title", why);'));
    // The count is still PASSED, because the sentence names it; what must not
    // be here is a second COMPARISON deciding whether the control is live.
    expect(block).toContain("row.rows)");
    expect(block).not.toMatch(/row\.rows\s*[=<>]/);
    expect(block).not.toContain("titled");
  });

  it("is dimmed in the stylesheet, and its red hover is undone with it", () => {
    // `.ca-tags-remove:hover` paints this control red. On a dead one that
    // promises a destructive act it will not perform — which is worse than the
    // omission, not better.
    const rule = cssRule(".ca-note-type-remove.is-static");
    expect(rule).toContain("opacity: 0.35");
    expect(rule).toContain("cursor: default");
    expect(readCss()).toContain(".ca-note-type-remove.is-static:hover");
  });
});

// ── the four claims that moved here with the `⋯` ──────────────────────────

describe("the per-page answers the ⋯ used to hold", () => {
  it("offers the note type's own answer as a choice, not only as an absence", () => {
    // `pageTemplateChoices`' argument for its own ⭐ row: without a row that
    // NAMES the inherited value, the only way back from an override is to guess
    // which tracker the type is rated on.
    const c = code();
    expect(c).toContain("text: `The note type's own (${word(row.kind.rating)})`");
    expect(c).toContain('pick.value = row.over.rated ?? "";');
    // And `Nothing` only where it would change something — a kind nobody rates
    // already draws no rating column, so the two options would mean one thing.
    expect(c).toContain("if (row.kind.rating) {");
    expect(c).toContain("text: \"Nothing\"");
  });

  it("re-reads the note at the write rather than trusting the draw", () => {
    // `block-drag.ts`' rule, one scope out. The `⋯` re-read the override at
    // each click because the menu was built when it opened; a window can sit
    // open for minutes, so the file is resolved in `commit` and the window
    // holds only the path.
    const c = code();
    expect(c).toContain("private readonly path: string");
    expect(c).toContain("const file = getFile(this.app, this.path);");
    expect(c).toContain('notify.info("That note has moved — reopen it to change its tables.")');
  });

  it("names the window after the note, because a type is on several", () => {
    // The `⋯` was per-group and said so — *"Options for Lessons on this note"*.
    // One window over the whole list cannot, so the subtitle carries the scope
    // instead: which note's tables these answers are about.
    expect(win()).toContain(
      '`What “${path.split("/").pop()?.replace(/\\.md$/, "") ?? "this note"}” lists below it`'
    );
  });

  it("is a form, with no submenu and no menu at all", () => {
    // 4.47 §5 forbade a submenu in the `⋯` because a reader has to find it by
    // hovering. The reader's second call retires the question: there is no menu
    // here to probe. The module is gone rather than left unreferenced.
    expect(code()).not.toContain("new Menu(");
    expect(code()).not.toContain("setSubmenu");
    expect(readSrc("widgets")).not.toContain("buildKindOptions");
    expect(readSrc("widgets")).not.toContain("kind-options-menu");
  });

  it("reads every slot off one list, which is what this page draws", () => {
    // ONE DERIVATION, NOT TWO PAIRED BY POSITION. Until 1.0.72 a second list
    // was derived — the words a cleared rename box would fall back to — and
    // paired against this one by index, which is only safe while the two are
    // the same list. The pencil is gone and so is the second list, and with it
    // the whole hazard: every dropdown's label comes off the column it is drawn
    // from.
    const c = code();
    expect(c).toContain("const page = pageKind(row.kind, row.over);");
    expect(c).toContain("const shown = kindColumns(this.plugin, page);");
    expect(c).toContain("const offer = offerableColumns(this.plugin, page);");
    expect(c).not.toContain("inherited");
    expect(c).not.toContain("wordless");
  });

  it("re-draws the boxes when the rating moves, because they are a different list", () => {
    const c = code();
    const at = c.indexOf('pick.addEventListener("change"');
    expect(at).toBeGreaterThan(-1);
    expect(c.slice(at, at + 400)).toContain("this.renderBody();");
  });

  it("offers a way back that is one press, and only where there is something to undo", () => {
    const c = code();
    expect(c).toContain("if (isBlankOverride(row.over)) return;");
    expect(c).toContain('text: "Use the note type\'s own settings"');
    expect(c).toContain("row.over = {};");
  });
});

// ── the columns, 1.0.71 ──────────────────────────────────────────────────
//
// *"make columns drop-down menus instead of free-text"* — and of the three
// readings that sentence has, the reader chose the one that is new capability:
// WHICH columns this page shows, and in what order. Renaming, which is what the
// boxes used to be, keeps its place behind a pencil on each slot.

describe("a slot's dropdown, as arithmetic", () => {
  // The pure half of `renderColumnSlot`, pulled out because it is the only part
  // that can be wrong without LOOKING wrong: every other line is on screen the
  // moment it draws, while a swap that drops a column instead of trading places
  // draws a perfectly ordinary row of dropdowns.
  it("replaces the role in the slot the reader used", () => {
    expect(movedCols(["rating", "status"], 1, "created")).toEqual([
      "rating",
      "created",
    ]);
  });

  it("swaps when the chosen role is already in another slot", () => {
    // WHICH IS WHAT MAKES A ROW OF DROPDOWNS A REORDERING. Without this, moving
    // Status to the front would draw Status twice and lose whatever was there —
    // or, with the role withheld, would make reordering inexpressible.
    expect(movedCols(["rating", "status"], 0, "status")).toEqual([
      "status",
      "rating",
    ]);
    expect(movedCols(["rating", "status", "created"], 2, "rating")).toEqual([
      "created",
      "status",
      "rating",
    ]);
  });

  it("appends from the slot past the end, which is the add row", () => {
    expect(movedCols(["rating"], 1, "status")).toEqual(["rating", "status"]);
    expect(movedCols([], 0, "status")).toEqual(["status"]);
  });

  it("takes the column out, which is how a page shows fewer", () => {
    expect(movedCols(["rating", "status"], 0, COL_REMOVE)).toEqual(["status"]);
    expect(movedCols(["status"], 0, COL_REMOVE)).toEqual([]);
  });

  it("is nothing at all when the add slot is left on its placeholder", () => {
    // A `change` can fire back to the empty option, and freezing the list
    // because the reader opened a menu and closed it is a write nobody asked
    // for — the no-op-write rule, one level up from the file.
    expect(movedCols(["rating"], 1, "")).toBeNull();
  });

  it("never edits the list it was handed", () => {
    const picked = ["rating", "status"];
    movedCols(picked, 0, "status");
    movedCols(picked, 0, COL_REMOVE);
    expect(picked).toEqual(["rating", "status"]);
  });
});

describe("the row of dropdowns", () => {
  it("offers what the table could draw, asked rather than listed again", () => {
    const c = code();
    expect(c).toContain("const offer = offerableColumns(this.plugin, page);");
    expect(c).toContain('pick.createEl("option", { value: one.key, text: one.heading || one.fallback })');
  });

  it("draws the title as a word, because it is the row and not a column", () => {
    // `recordList` draws `cols[0]` as the LINK. A page that could drop it or
    // move it would be a page of rows nobody can open, so the first slot says
    // what it is and carries no dropdown at all.
    const c = code();
    expect(c).toContain("if (!slot) {");
    expect(c).toContain('cls: "ca-note-type-fixed"');
    const at = c.indexOf("const lead = shown[0];");
    expect(at).toBeGreaterThan(-1);
    expect(c.slice(at, at + 260)).toContain("null, offer)");
    expect(c).toContain("const picked = shown.slice(1).map((c) => c.key);");
  });

  it("keeps a role another slot holds, because picking it is the swap", () => {
    // The ADD slot is the exception: there is no slot to trade with, so a role
    // already shown would silently MOVE a column under a control that says it
    // adds one.
    expect(code()).toContain("if (!col && slot.picked.includes(one.key)) continue;");
  });

  it("stops offering to add one when there is nothing left to add", () => {
    // `discoverability`'s rule: a menu that opens and then explains it cannot
    // help is worse than no menu.
    expect(code()).toContain("if (offer.some((c) => !picked.includes(c.key))) {");
  });

  it("offers removal in the slot's own menu, not as a second button", () => {
    // ONE CONTROL PER SLOT. A ✕ beside each dropdown would be a second way to
    // say the same thing, and `remove-not-delete` would then want the word
    // twice over.
    const c = code();
    expect(c).toContain('pick.createEl("option", { value: COL_REMOVE, text: "Remove this column" })');
    expect(c).not.toContain('"Add a column…", text');
    expect(c).toContain('pick.createEl("option", { value: "", text: "Add a column…" })');
  });

  it("re-draws the whole list after a pick, because the slots moved", () => {
    const c = code();
    const at = c.indexOf("private moveColumn(");
    expect(at).toBeGreaterThan(-1);
    const body = c.slice(at, c.indexOf("private renderReset("));
    expect(body).toContain("row.over = withCols(row.over, next);");
    expect(body).toContain("this.renderBody();");
  });

  it("writes nothing to the note until Save, as every other answer here does", () => {
    // `row.over` is the draft. The window's one write is `commit`, which is
    // what makes Cancel mean cancel.
    const c = code();
    const at = c.indexOf("private moveColumn(");
    const body = c.slice(at, c.indexOf("private renderReset("));
    expect(body).not.toContain("processFrontMatter");
    expect(body).not.toContain("withKindTable");
  });
});

// ── and the pencil is gone again, 1.0.72 ────────────────────────────────

describe("what renaming a column is now", () => {
  // *"Remove the pencil to edit the titles, I don't think it is necessary."*
  //
  // The control shipped in 1.0.71 and lasted one release. A column's word is
  // named on the NOTE TYPE, in Settings, which is where every table of that
  // type reads it from — 1.0.32 — and that is the one that stays.
  it("has no pencil, no box and nothing listening for a word", () => {
    const c = code();
    expect(c).not.toContain("ca-note-type-rename");
    expect(c).not.toContain("ca-note-type-word");
    expect(c).not.toContain("withHeading");
    expect(c).not.toContain("this.naming");
  });

  it("left no writer behind in the record either", () => {
    // `test/dead-code.test.ts`' subject: the field's only writer was this
    // control, so it goes with the control rather than sitting in the module
    // unreachable for the next hand to re-wire by symmetry.
    expect(readCode("journals/kind-tables")).not.toContain(
      "export function withHeading"
    );
  });

  it("still READS a word a page already carries", () => {
    // Which is the asymmetry worth stating: removing the read would re-word the
    // tables of every page that used the control while it existed. `pageKind`
    // lays the stored words over the type's, and that line is untouched.
    expect(readCode("journals/kind-tables")).toContain(
      "const headings = { ...(kind.headings ?? {}), ...(over.headings ?? {}) };"
    );
    // And the way out of one is the button that was already there.
    expect(code()).toContain("row.over = {};");
  });

  it("leaves no stylesheet rule for the pencil or its box", () => {
    const css = readCss();
    for (const dead of [".ca-note-type-rename", ".ca-note-type-word"]) {
      expect(css, dead).not.toContain(dead);
    }
  });
});

// ── the order the card draws them in, 1.0.72 ────────────────────────────

describe("the arrows that order the note types", () => {
  it("are arrows, and they are the categories window's arrows", () => {
    // *"implement up/down buttons to re-order note types within the edit
    // window"*. The same control the reader asked for on the Attachments list
    // in 1.0.49, so it is the same gesture, the same glyphs and the same
    // disabled-at-the-end behaviour rather than a second idea of reordering.
    const c = code();
    expect(c).toContain('move(-1, "chevron-up", "up")');
    expect(c).toContain('move(1, "chevron-down", "down")');
    expect(readCode("ui/attach-categories-editor")).toContain(
      'move(-1, "chevron-up", "up")'
    );
  });

  it("re-orders the rows and nothing else, so a move undone costs nothing", () => {
    // THE LIST IS THE ANSWER, NOT A SEQUENCE OF MOVES. Nothing records that a
    // move happened; `commit` hands back the ids as the rows are showing.
    const c = code();
    expect(c).toContain("const next = this.rows.slice();");
    expect(c).toContain("next.splice(to, 0, ...next.splice(at, 1));");
    expect(c).toContain("const ids = this.rows.map((r) => r.kind.id);");
  });

  it("says which end a row is already at, rather than going quiet", () => {
    const c = code();
    expect(c).toContain("const can = to >= 0 && to < this.rows.length;");
    expect(c).toContain("btn.disabled = !can;");
    expect(c).toContain(
      "`${name} is already ${delta < 0 ? \"first\" : \"last\"}`"
    );
  });

  it("draws nothing at all where there is one type", () => {
    // Both arrows could only ever be disabled, and a card with one note type
    // composes no group heads either — there is not even a visible order.
    expect(code()).toContain("if (this.rows.length < 2) return;");
  });

  it("writes the order into the note, because the fence order is the draw order", () => {
    const c = code();
    expect(c).toContain("await this.writeOrder(file);");
    expect(c).toContain("const ctx = this.plugin.sections.contextFor(this.path);");
    expect(c).toContain(
      "await this.app.vault.process(file, (text) => planKindOrder(text, ctx, ids) ?? text);"
    );
  });

  it("writes nothing when the rows are showing in the order they arrived", () => {
    const c = code();
    expect(c).toContain("private readonly wasOrder: string[];");
    expect(c).toContain("this.wasOrder = this.rows.map((r) => r.kind.id);");
    expect(c).toContain(
      'if (ids.join("\\u0000") === this.wasOrder.join("\\u0000")) return;'
    );
  });

  it("writes the body BEFORE the frontmatter, which is the safe order", () => {
    // `processFrontMatter` re-reads the note and rewrites its property block
    // alone, so it cannot lose a body change that has landed; a `vault.process`
    // running after it could read a stale text and write the old frontmatter
    // back. 1.0.34's cache lag, which bit three ways before it was named.
    const c = code();
    const order = c.indexOf("await this.writeOrder(file);");
    const fm = c.indexOf("await this.plugin.journals.setKindTable(");
    expect(order).toBeGreaterThan(-1);
    expect(fm).toBeGreaterThan(order);
  });
});

describe("how a slot is laid out", () => {
  it("wraps the slots rather than scrolling one long row", () => {
    // Up to six slots on a window that is also a phone's width. `10em` is the
    // basis rather than a fixed width, so three fit on a desktop and one fits
    // on a phone without a breakpoint deciding it.
    const rule = cssRule(".ca-note-type-col");
    expect(rule).toContain("flex: 1 1 10em");
    expect(rule).toContain("flex-wrap: wrap");
  });

  it("resets the arrows' height, because a chip-shaped button is 30px", () => {
    // `obsidian-button-height`, and on a row of them that is the one thing that
    // would make it ragged — a failure whose signature is looking fine.
    expect(cssRule(".ca-note-type-move")).toContain("min-height: 0");
  });

  it("says a spent arrow in ink, not only in `disabled`", () => {
    // Obsidian leaves a `:disabled` button looking pressable, so the row would
    // read as four live controls with two that do nothing.
    expect(cssRule(".ca-note-type-move.is-static")).toContain("opacity: 0.35");
  });

  it("draws the title slot as a value, on the dropdowns' line", () => {
    const rule = cssRule(".ca-note-type-fixed");
    expect(rule).toContain("color: var(--text-muted)");
    expect(rule).toContain("text-overflow: ellipsis");
  });
});

// ── and the four controls really are gone ────────────────────────────────

describe("what 1.0.69 removed", () => {
  it("leaves no module behind the ⋯", () => {
    // The reader's second call: *remove it regardless.* A file left in the tree
    // unreferenced would be dead code the next hand re-wires by symmetry, which
    // is the shape `test/dead-code.test.ts` sweeps for.
    expect(() => readSrc("kind-options-menu")).toThrow();
  });

  it("leaves no stylesheet rule for any of them", () => {
    // Four rules for the `⋯`, five for the add row and the toggle. A rule with
    // no element is a rule the next hand tunes for an hour.
    const css = readCss();
    for (const dead of [
      ".ca-journal-kind-options",
      ".ca-journal-kind-add",
      ".ca-journal-below-edit",
    ]) {
      expect(css, dead).not.toContain(dead);
    }
  });

  it("leaves no builder and no prompt for the add row", () => {
    expect(readCode("ui/tables")).not.toContain("buildAddKindRow");
    expect(readCode("journals/kind-create")).not.toContain("promptAddKind");
  });

  it("leaves a group's head carrying its create button and its chevron, and nothing else", () => {
    // What the `⋯` and the `✕` hung off. Both synced onto `head` on every
    // redraw and were taken off again on release; all five methods that did it
    // are deleted rather than left unreachable.
    const b = readCode("ui/widgets/below-edit");
    for (const dead of [
      "syncOptions",
      "clearOptions",
      "syncRemovals",
      "clearRemovals",
      "buildRemove",
    ]) {
      expect(b, dead).not.toContain(dead);
    }
  });
});
