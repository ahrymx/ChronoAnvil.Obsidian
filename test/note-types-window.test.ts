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
import { COL_REMOVE, movedCols } from "../src/ui/note-types-window";

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

  it("placeholds each box with the word a cleared box would show", () => {
    // WHICH IS WHAT MAKES "CLEAR IT TO GO BACK" VISIBLE rather than promised in
    // a sentence. The placeholder is this page's INHERITED word — the type's
    // own, under this page's rating and this page's chosen columns — so a
    // reader who re-rated the type here sees the words that rating brings
    // rather than the ones it replaced.
    const c = code();
    expect(c).toContain("const base = inherited[i + 1]?.heading ?? col.fallback;");
    expect(c).toContain("placeholder: base");
    expect(c).toContain('input.value = row.over.headings?.[col.key] ?? "";');
    expect(c).toContain("withHeading(row.over, col.key, input.value, base)");
  });

  it("strips only the WORDS to derive what a cleared box would show", () => {
    // `shown` and `inherited` are paired BY POSITION, and that is only safe
    // while the two lists are the same list. Two things decide which columns
    // exist and in what order — the rating and `cols` — so `base` carries both
    // and drops `headings` alone.
    //
    // THE DEFECT THIS IS THE FIX FOR, caught before it shipped: building `base`
    // from `withRated({}, …)` was right until a page could choose its columns,
    // and would then pair this page's chosen ORDER against the journal's
    // derived one — putting the wrong placeholder under every box after the
    // first difference, and so renaming the wrong column.
    const c = code();
    expect(c).toContain("const page = pageKind(row.kind, row.over);");
    expect(c).toContain("...(row.over.rated !== undefined ? { rated: row.over.rated } : {})");
    expect(c).toContain("...(row.over.cols ? { cols: [...row.over.cols] } : {})");
    expect(c).toContain("shown: kindColumns(this.plugin, page)");
    expect(c).toContain("inherited: kindColumns(this.plugin, pageKind(row.kind, wordless))");
    expect(c).not.toContain("withRated({}, row.over.rated ?? null)");
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
    expect(c).toContain(
      "const offer = offerableColumns(this.plugin, pageKind(row.kind, row.over));"
    );
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

describe("the word for a column, now behind a pencil", () => {
  it("is still per-page, because 1.0.33 shipped that and nobody asked for it back", () => {
    // The dropdowns answered a different question. A box that was the only way
    // to rename a column on one page cannot be replaced by a control that
    // cannot rename anything.
    const c = code();
    expect(c).toContain("withHeading(row.over, col.key, input.value, base)");
    expect(c).toContain('cls: "ca-note-type-word"');
  });

  it("names the column it renames, in both names a button has", () => {
    const c = code();
    expect(c).toContain("const why = `What this note calls the “${base}” column`;");
    expect(c).toContain('pencil.setAttr("aria-label", why);');
    expect(c).toContain('pencil.setAttr("title", why);');
  });

  it("opens one at a time, and says which is open", () => {
    // `aria-expanded` is the only thing a screen reader has to tell a toggled
    // pencil from an idle one, and `this.naming` holding a single key is what
    // keeps the row from becoming a wall of text boxes.
    const c = code();
    expect(c).toContain('"aria-expanded": this.naming === col.key ? "true" : "false"');
    expect(c).toContain("this.naming = this.naming === col.key ? null : col.key;");
    expect(c).toContain("if (this.naming !== col.key) return;");
  });

  it("offers no pencil on the slot that has nothing to name yet", () => {
    const c = code();
    expect(c).toContain("if (!col) return;");
  });

  it("commits a word on leaving the box, never on a keystroke", () => {
    // 1.0.33's rule and 1.0.49's scar both: a per-keystroke write re-reads the
    // note mid-type and loses the rest of the word.
    const c = code();
    const at = c.indexOf("private renderColumnSlot(");
    const body = c.slice(at, c.indexOf("private moveColumn("));
    expect(body).toContain('input.addEventListener("change", commit);');
    expect(body).toContain('input.addEventListener("blur", commit);');
    expect(body).not.toContain('input.addEventListener("input"');
  });
});

// ── the add field ────────────────────────────────────────────────────────

describe("adding a note type, where the dashed row was", () => {
  it("keeps the sentence the dashed row's prompt carried, whole", () => {
    // It is the only place either scope is stated — the type joins the JOURNAL,
    // its group joins THIS CARD — and 1.0.33 shipped a patch for a reader
    // surprised by exactly that. A field with no sentence is that patch undone.
    const c = code();
    expect(c).toContain("Singular, as one note would be called.");
    expect(c).toContain("and on this card only.");
    expect(c).toContain("Settings → ChronoAnvil → Journals.");
  });

  it("refuses a name the journal already has, and says which journal", () => {
    const c = code();
    expect(c).toContain(
      "(k) => k.label.trim().toLowerCase() === label.toLowerCase()"
    );
    expect(c).toContain(
      "return `“${label}” is already a note type in ${this.type.name}.`"
    );
  });

  it("treats an empty field as nothing asked for, not as an error", () => {
    // The field is one part of a window a reader may have opened to change a
    // column word. Validating it as required would make Save impossible for
    // everything else the window does.
    const c = code();
    expect(c).toContain("if (!label) return null;");
    expect(c).toContain("if (label) {");
  });
});

// ── what Save writes, and what does not wait for it ──────────────────────

describe("the writes", () => {
  it("writes only the rows that moved", () => {
    // THE NO-OP-WRITE RULE, which this window could break more widely than
    // anything that came before it: it holds every type on the card at once, so
    // a loop that wrote them all would touch the frontmatter of a note whose
    // tables nobody changed — moving its modified time, which is a lie about
    // the reader's vault that sync then propagates.
    const c = code();
    expect(c).toContain("was: JSON.stringify(over)");
    expect(c).toContain("if (JSON.stringify(row.over) === row.was) continue;");
    expect(c).toContain(
      "await this.plugin.journals.setKindTable(file, row.kind.id, row.over);"
    );
  });

  it("does not write a keystroke at a time", () => {
    // The column words are text fields. A field that wrote on every keystroke
    // would put a frontmatter write between two letters of a heading.
    const c = code();
    const slot = c.slice(
      c.indexOf("private renderColumnSlot("),
      c.indexOf("private moveColumn(")
    );
    expect(slot).toContain('input.addEventListener("change", commit)');
    expect(slot).toContain('input.addEventListener("blur", commit)');
    expect(slot).not.toContain('addEventListener("input"');
    // The add field's `input` listener is NOT this and is correct: it moves a
    // string into `this.pending`, which is memory. Nothing reaches a note until
    // Save either way, and scoping the sweep is what keeps that distinction
    // visible rather than forbidding the event everywhere.
    expect(c).toContain("this.pending = input.value;");
  });

  it("lets the removal out of the batch, deliberately", () => {
    // `templates-one-word-1-0-46`'s rule: *a repair window must never be the
    // write behind a confirmed gesture*. `promptRemoveKind` asks its own
    // question and performs its own act — it deletes a template and may take
    // the type out of the journal — so this window CLOSES and that one opens.
    // A confirmation on top of an unsaved form asks a reader to agree to
    // something while another window holds edits they have not committed.
    const c = code();
    const at = c.indexOf("gone.addEventListener");
    expect(at).toBeGreaterThan(-1);
    const body = c.slice(at, at + 300);
    expect(body).toContain("this.close();");
    expect(body).toContain("void this.removeKind(row.kind.id);");
    expect(body.indexOf("this.close()")).toBeLessThan(body.indexOf("this.removeKind"));
    // And it is NOT in the batch — `commit` says nothing about a removal.
    const commit = c.slice(
      c.indexOf("protected async commit()"),
      c.indexOf("private async submitThen(")
    );
    expect(commit).not.toContain("removeKind");
  });

  it("draws the ✕ from the rule, not from the count again", () => {
    // 1.0.24's TWO-QUESTION GATE, unchanged by the move. Whether a group may be
    // OFFERED a removal is about this card — `removableKinds`, which also
    // refuses an untitled group and a type the fence names but the journal has
    // lost. Whether it may HAPPEN is about the whole journal and is
    // `kindRemovalRefusal`, at the press. A `rows === 0` read again in this
    // window would be a third answer to the first question.
    const c = code();
    expect(c).toContain("const removable = new Set(removableKinds(counted));");
    expect(c).toContain("removable: removable.has(row.kindId)");
    expect(c).toContain("if (row.removable) {");
    // The row's own count is NOT what the control is drawn from.
    expect(c).not.toContain("if (row.rows === 0) {");
  });
});

// ── the one thing that stayed a mode ─────────────────────────────────────

describe("the door into the selection mode", () => {
  it("sits in the footer, because it ends the sitting", () => {
    // It leaves the window — so it belongs beside Cancel and Save rather than
    // in a body a reader is still editing.
    const c = code();
    expect(c).toContain("protected renderFooter(footer: HTMLElement): void {");
    expect(c).toContain('pick.createSpan({ text: "Select notes…" })');
    expect(c).toContain("super.renderFooter(footer);");
  });

  it("saves before it leaves, so the mode cannot open over uncommitted edits", () => {
    const c = code();
    expect(c).toContain("pick.addEventListener(\"click\", () => void this.submitThen(this.onPick));");
    const then = c.slice(c.indexOf("private async submitThen("));
    expect(then).toContain("const problem = this.validate();");
    expect(then).toContain("await this.commit();");
    expect(then).toContain("this.close();");
    expect(then).toContain("run();");
    expect(then.indexOf("this.commit()")).toBeLessThan(then.indexOf("this.close()"));
  });

  it("is absent where there is nothing to tick, not disabled", () => {
    // The rule the `Edit` toggle it replaces already followed: it came and went
    // with the rows. Disabled means *momentarily inapplicable*; absent means
    // *there is nothing here*, and a card whose tables are all empty is the
    // second.
    const c = code();
    expect(c).toContain("if (this.rows.every((r) => r.rows === 0)) {");
    const at = c.indexOf("if (this.rows.every((r) => r.rows === 0)) {");
    expect(c.slice(at, at + 200)).toContain("super.renderFooter(footer);");
    expect(c.slice(at, at + 200)).toContain("return;");
  });

  it("asks the card again at the press, because the count is older than the window", () => {
    // THE WINDOW'S COUNT IS A SNAPSHOT. A note can be filed, or the last one
    // moved away, while a reader reads a form — so the handle `below-edit.ts`
    // exposes asks the live card rather than turning the mode on over nothing.
    // One predicate, two moments: the same `pathsOnScreen().length === 0` that
    // closes the mode on a redraw declines to open it here.
    const b = readCode("ui/widgets/below-edit");
    expect(b).toContain("startPicking(): void {");
    expect(b).toContain("notify.info(\"There are no notes on this card to select yet.\")");
    expect(win()).toContain("private readonly onPick: () => void");
  });

  it("reaches the mode through the foot it was handed, never by looking for it", () => {
    // The mode belongs to one render of one block. A window that went looking
    // for it would find whichever card the query hit first, which on a note
    // with two *What's below* cards is a coin toss.
    expect(code()).toContain("foot()?.pick()");
    expect(readSrc("ui/widgets/below-edit")).toContain(
      "return { el: foot, pick: () => child.startPicking() };"
    );
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

  it("gives the word box its own line, which is what the wrap is for", () => {
    // `100%` of a wrapping flex row IS a new line. Without it the box would
    // squeeze the dropdown that opened it down to nothing.
    expect(cssRule(".ca-note-type-word")).toContain("flex: 1 0 100%");
  });

  it("resets the pencil's height, because a chip-shaped button is 30px", () => {
    // `obsidian-button-height`, and beside a dropdown it is the one thing that
    // would make the row ragged — a failure whose signature is looking fine.
    expect(cssRule(".ca-note-type-rename")).toContain("min-height: 0");
  });

  it("says which pencil is open in ink as well as in ARIA", () => {
    expect(cssRule('.ca-note-type-rename[aria-expanded="true"]')).toContain(
      "color: var(--text-accent)"
    );
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
