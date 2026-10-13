// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Note types window: one door onto the note types a *What's below* card
// lists. 1.0.69.
//
// ── WHAT IT REPLACES, AND THE READER'S WORDS ─────────────────────────────
//
// *"I think the 'add note type' and 'edit' buttons would better fit the
// sections header, right aligned … but the cleanest and cohesive solution would
// be just a cog wheel (matching those other sections), which opens a window
// where a type can be added and the table can be edited, all in one
// interface."*
//
// Four controls were doing one job in four places, which is the same shape
// 1.0.49 found on a Resources section and answered the same way:
//
//   • `+ Add note type` — a dashed row at the foot of the card
//   • `Edit`            — a toggle beside it, opening the selection mode
//   • `⋯` per group     — this page's rating and column words, IN that mode
//   • `✕` per group     — removing an empty type, also in that mode
//
// Three of the four were reachable only from inside a mode a reader had to know
// to turn on first. The reader's second call settles the `⋯`: *remove it
// regardless* — everything type-level is behind the cog now, and a group head
// carries its create button and its chevron and nothing else.
//
// ── THE ONE THING THAT STAYED A MODE ─────────────────────────────────────
//
// Selecting notes. It puts a tick in every row of every table on the card, and
// what it acts on is the rows a reader is looking at — a window would have to
// draw the tables again to offer it, and then a reader would be ticking a copy.
// So the window ENTERS it rather than containing it: the footer's second button
// commits whatever is pending and leaves, and `below-edit.ts` takes over.
//
// ── WHAT IS WRITTEN WHEN ─────────────────────────────────────────────────
//
// Save writes: the per-page overrides for every row that moved, and the new
// note type where one was typed. Both are cheap, reversible and want a commit
// moment — the column words are text fields, and a field that wrote on every
// keystroke would put a frontmatter write between two letters.
//
// REMOVAL DOES NOT WAIT FOR SAVE, and that is deliberate rather than an
// inconsistency. `promptRemoveKind` asks its own question and performs its own
// act — it deletes a template, and it may take the type out of the journal
// altogether — and `templates-one-word-1-0-46` records what it costs to make a
// window the write behind a gesture somebody has already confirmed. So the ✕
// closes this window and opens that one, which is one destructive act behind
// one door, exactly where it was before.

import { App, setIcon } from "obsidian";
import { EditorModal, type ValidationProblem } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import { getFile, plural } from "../core/util";
import { addKindToJournal, promptRemoveKind } from "../journals/kind-create";
import { ROW_NOTE_ATTR } from "./tables";
import { removableKinds, type BelowFoot, type KindHost } from "./widgets/below-edit";
import { notify } from "../core/notify";
import { ratingChoices } from "../core/settings-editors";
import type { JournalKind, JournalType } from "../journals/journal";
import { kindColumns, ratingNoun, type KindColumn } from "../journals/kind-columns";
import { getTracker } from "../trackers/trackers";
import {
  RATED_NONE,
  isBlankOverride,
  kindTableOverrideOf,
  pageKind,
  withHeading,
  withRated,
  type KindTableOverride,
} from "../journals/kind-tables";

// One note type as this window is handed it: the kind itself, and the one fact
// about the CARD that decides whether its row can be removed.
//
// THE COUNT COMES FROM THE CARD, NOT FROM A VAULT WALK. 1.0.24's two-question
// gate, unchanged: a cheap DOM count decides whether the control is drawn, and
// `promptRemoveKind` does the walk that decides whether the act goes ahead. A
// window that counted the vault itself would be slower and would still have to
// be re-counted at the press.
export interface NoteTypeSeed {
  kind: JournalKind;
  rows: number;
  // Whether the ✕ is drawn. NOT `rows === 0` read again here: `removableKinds`
  // is the rule, it also refuses an untitled group and a kind the fence names
  // but the journal has lost, and a second derivation would be a second answer
  // to the question 1.0.24 settled.
  removable: boolean;
}

interface Row {
  kind: JournalKind;
  rows: number;
  removable: boolean;
  // The page's answer for this type, as this sitting has it. Seeded from the
  // note and handed back by Save where it differs from the note's.
  over: KindTableOverride;
  was: string;
}

export class NoteTypesWindow extends EditorModal {
  private rows: Row[];
  private pending = "";
  // Which row's detail is open, or null. ONE AT A TIME, which is the tags
  // window's rule: two open editors over one list is a merge conflict a reader
  // cannot see. Here it is also what keeps the window the height of a list.
  private open_: string | null = null;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private readonly type: JournalType,
    private readonly path: string,
    seeds: readonly NoteTypeSeed[],
    // Enter the selection mode on the card this was opened from. Passed in
    // rather than reached for: the mode belongs to one render of one block and
    // this window has no way to find it.
    private readonly onPick: () => void
  ) {
    super(
      app,
      plugin,
      "Note types",
      `What “${path.split("/").pop()?.replace(/\.md$/, "") ?? "this note"}” lists below it`,
      "Save"
    );
    this.rows = seeds.map((s) => {
      const over = kindTableOverrideOf(app, getFile(app, path), s.kind.id);
      return {
        kind: s.kind,
        rows: s.rows,
        removable: s.removable,
        over,
        was: JSON.stringify(over),
      };
    });
  }

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("ca-tags-editor");
    this.body.addClass("ca-note-types");
    this.renderList();
    this.renderAdd();
  }

  // ── the list ───────────────────────────────────────────────────────────

  private renderList(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({ cls: "ca-tags-heading", text: "On this note" });

    if (this.rows.length === 0) {
      wrap.createDiv({
        cls: "ca-tags-empty",
        text: "This card lists no note types yet — add one below.",
      });
      return;
    }

    const list = wrap.createDiv({ cls: "ca-tags-list" });
    for (const row of this.rows) {
      const el = list.createDiv({ cls: "ca-note-type" });
      this.renderTypeRow(el, row);
      if (this.open_ === row.kind.id) this.renderDetail(el, row);
    }
  }

  private renderTypeRow(host: HTMLElement, row: Row): void {
    const head = host.createDiv({ cls: "ca-tags-row" });
    head.createSpan({ cls: "ca-tags-name", text: plural(row.kind.label) });

    // WHAT IT HOLDS, IN THE SLOT THAT SAYS SO — the categories window's rule,
    // and for the same reason: the count is why the ✕ beside it is drawn at all,
    // and a reader should not have to read a tooltip to find that out.
    head.createSpan({
      cls: "ca-tags-count",
      text: row.rows === 0 ? "empty" : `${row.rows} note${row.rows === 1 ? "" : "s"}`,
    });

    // SAYING SO ON THE ROW, because the detail that holds the answers is closed.
    // A reader scanning this list for the type they changed should not have to
    // open three to find it.
    if (!isBlankOverride(row.over)) {
      head.createSpan({ cls: "ca-note-type-said", text: "changed here" });
    }

    const open = this.open_ === row.kind.id;
    const edit = head.createEl("button", {
      cls: "ca-journal-btn-ghost ca-note-type-open",
      attr: { type: "button", "aria-expanded": open ? "true" : "false" },
    });
    setIcon(edit.createSpan({ cls: "ca-journal-btn-icon" }), open ? "chevron-up" : "sliders-horizontal");
    const hint = `What this note calls ${plural(row.kind.label)}' columns, and what it rates them on`;
    edit.setAttr("aria-label", hint);
    edit.setAttr("title", hint);
    edit.addEventListener("click", () => {
      this.open_ = open ? null : row.kind.id;
      this.clearError();
      this.renderBody();
    });

    // ── AND THE REMOVAL, WHERE THERE IS NOTHING TO LOSE (1.0.24) ─────────
    //
    // The gate is the count this row is already showing. A type with notes in
    // it is not offered the control at all rather than offered it disabled:
    // *"a menu that opens and then explains it cannot help is worse than no
    // menu"*, which `discoverability.test.ts` holds for this surface too.
    if (row.removable) {
      const gone = head.createEl("button", {
        cls: "ca-journal-btn-ghost ca-tags-remove ca-note-type-remove",
        attr: { type: "button" },
      });
      setIcon(gone.createSpan({ cls: "ca-journal-btn-icon" }), "x");
      const why = `Remove ${plural(row.kind.label)} from this note`;
      gone.setAttr("aria-label", why);
      gone.setAttr("title", why);
      gone.addEventListener("click", () => {
        // CLOSES FIRST. See the header: the act behind this asks its own
        // question, and a confirmation that opens on top of an unsaved form is
        // a reader being asked to agree to something while another window is
        // still holding edits they have not committed.
        this.close();
        void this.removeKind(row.kind.id);
      });
    }
  }

  // ── one type's own answers ─────────────────────────────────────────────

  private renderDetail(host: HTMLElement, row: Row): void {
    const box = host.createDiv({ cls: "ca-note-type-detail" });
    this.renderRated(box, row);
    this.renderColumns(box, row);
    this.renderReset(box, row);
  }

  // THE FIRST CHOICE IS THE NOTE TYPE'S OWN AND IT NAMES THE VALUE. Without it
  // the only way back from an override is to guess which tracker the type names
  // — `pageTemplateChoices`' argument for its own ⭐ row, which the `⋯` this
  // window replaces made the same way.
  private renderRated(host: HTMLElement, row: Row): void {
    const field = host.createDiv({ cls: "ca-note-type-field" });
    field.createSpan({ cls: "ca-note-type-label", text: "Rated on" });
    const pick = field.createEl("select", { cls: "dropdown ca-note-type-rated" });

    const word = (id: string | undefined): string =>
      id ? ratingNoun(getTracker(this.plugin, id) ?? null, id) : "nothing";
    pick.createEl("option", {
      value: "",
      text: `The note type's own (${word(row.kind.rating)})`,
    });
    for (const t of ratingChoices(this.plugin, this.type.id)) {
      pick.createEl("option", { value: t.id, text: t.label });
    }
    // ONLY WHERE IT WOULD CHANGE SOMETHING. A type that is not rated draws no
    // rating column already, so "Nothing" beside a selected "The note type's
    // own (nothing)" would be two options meaning one thing.
    if (row.kind.rating) {
      pick.createEl("option", { value: RATED_NONE, text: "Nothing" });
    }
    pick.value = row.over.rated ?? "";
    pick.addEventListener("change", () => {
      row.over = withRated(row.over, pick.value === "" ? null : pick.value);
      this.clearError();
      // THE COLUMNS BELOW DEPEND ON THIS ONE. Re-rating a type changes which
      // columns it draws, so the boxes under this field are a different list
      // the moment it moves.
      this.renderBody();
    });
  }

  // ONE BOX PER COLUMN THIS PAGE DRAWS, each opening on the override and
  // placeheld with what the type calls it — which is the state that makes
  // "clear it to go back" something a reader can see rather than something a
  // sentence has to promise.
  private renderColumns(host: HTMLElement, row: Row): void {
    const { shown, inherited } = this.columnWords(row);
    const field = host.createDiv({ cls: "ca-note-type-field ca-note-type-cols" });
    field.createSpan({ cls: "ca-note-type-label", text: "Columns" });
    const boxes = field.createDiv({ cls: "ca-note-type-boxes" });
    shown.forEach((col, i) => {
      const base = inherited[i]?.heading ?? col.fallback;
      const box = boxes.createEl("input", {
        cls: "ca-note-type-col",
        attr: { type: "text", placeholder: base, "aria-label": `What this note calls the “${base}” column` },
      });
      box.value = row.over.headings?.[col.key] ?? "";
      const commit = (): void => {
        row.over = withHeading(row.over, col.key, box.value, base);
      };
      box.addEventListener("change", commit);
      box.addEventListener("blur", commit);
    });
  }

  private renderReset(host: HTMLElement, row: Row): void {
    if (isBlankOverride(row.over)) return;
    const btn = host.createEl("button", {
      cls: "ca-journal-btn-ghost ca-note-type-reset",
      attr: { type: "button" },
    });
    setIcon(btn.createSpan({ cls: "ca-journal-btn-icon" }), "rotate-ccw");
    btn.createSpan({ text: "Use the note type's own settings" });
    btn.addEventListener("click", () => {
      row.over = {};
      this.clearError();
      this.renderBody();
    });
  }

  // The two readings of one set of columns: what this page shows, and what it
  // would show with every box cleared. Paired by position, which is safe
  // because the rating is the same in both — it is the only thing that decides
  // which columns exist, and `base` carries this page's rating with the type's
  // own WORDS.
  private columnWords(row: Row): { shown: KindColumn[]; inherited: KindColumn[] } {
    const page = pageKind(row.kind, row.over);
    const base = pageKind(row.kind, withRated({}, row.over.rated ?? null));
    return {
      shown: kindColumns(this.plugin, page),
      inherited: kindColumns(this.plugin, base),
    };
  }

  // ── adding one ─────────────────────────────────────────────────────────

  private renderAdd(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({ cls: "ca-tags-heading", text: "Add a note type" });
    const row = wrap.createDiv({ cls: "ca-tags-add" });
    const input = row.createEl("input", {
      cls: "ca-tags-input",
      attr: { type: "text", placeholder: "e.g. Decision", "aria-label": "A new note type's name" },
    });
    input.value = this.pending;
    input.addEventListener("input", () => {
      this.pending = input.value;
      this.clearError();
    });
    // THE SENTENCE `promptAddKind` CARRIED, kept whole. It is the only place
    // either scope is stated — the type joins the JOURNAL, its group joins THIS
    // CARD — and 1.0.33 shipped a patch for a reader surprised by exactly that.
    wrap.createDiv({
      cls: "ca-tags-empty",
      text:
        "Singular, as one note would be called. It gets its own template, its own " +
        "create button and its own group on this card — and on this card only. " +
        "Its emoji, its rating, whether it can be split into pages, and which " +
        "index notes list it are in Settings → ChronoAnvil → Journals.",
    });
  }

  // ── the footer ─────────────────────────────────────────────────────────

  // THE MODE IS THE SECOND ACTION, not a row in the list. It leaves this window
  // — so it belongs beside Cancel and Save, where a control that ends the
  // sitting belongs, rather than in a body a reader is still editing.
  protected renderFooter(footer: HTMLElement): void {
    // ABSENT WHERE THERE IS NOTHING TO TICK, which is the rule the `Edit`
    // toggle this replaces already followed — it came and went with the rows.
    // Disabled means "momentarily inapplicable"; absent means "there is nothing
    // here", and a card whose tables are all empty is the second.
    if (this.rows.every((r) => r.rows === 0)) {
      super.renderFooter(footer);
      return;
    }
    const pick = footer.createEl("button", {
      cls: "ca-note-types-pick",
      attr: { type: "button" },
    });
    setIcon(pick.createSpan({ cls: "ca-journal-btn-icon" }), "list-checks");
    pick.createSpan({ text: "Select notes…" });
    const hint = "Save, then tick notes on the card to move or remove them";
    pick.setAttr("aria-label", hint);
    pick.setAttr("title", hint);
    pick.addEventListener("click", () => void this.submitThen(this.onPick));
    super.renderFooter(footer);
  }

  // ── the writes ─────────────────────────────────────────────────────────

  protected validate(): ValidationProblem | null {
    const label = this.pending.trim();
    if (!label) return null;
    const taken = this.type.kinds.some(
      (k) => k.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (taken) return `“${label}” is already a note type in ${this.type.name}.`;
    return null;
  }

  protected async commit(): Promise<void> {
    // RESOLVED AT THE WRITE, NEVER CAPTURED AT DRAW. `kind-options-menu` made
    // the same point about its own clicks: this window can sit open, and the
    // note it was opened from can be renamed or moved while it does.
    const file = getFile(this.app, this.path);
    if (!file) {
      notify.info("That note has moved — reopen it to change its tables.");
      return;
    }
    for (const row of this.rows) {
      // ONLY WHAT MOVED. `setKindTable` returns early on a no-op of its own, and
      // this is the second half of the same rule: a window that wrote every row
      // would touch the frontmatter of a note whose tables nobody changed, which
      // moves its modified time and lies to the reader's sync.
      if (JSON.stringify(row.over) === row.was) continue;
      await this.plugin.journals.setKindTable(file, row.kind.id, row.over);
    }
    const label = this.pending.trim();
    if (label) {
      const cfg = (this.plugin.settings.customJournals ?? []).find(
        (j) => j.id === this.type.id
      );
      if (cfg) await addKindToJournal(this.plugin, cfg, label, file);
    }
  }

  // Save, and then do something that leaves. Shared by the footer's second
  // button so the mode cannot be entered over edits that were never written.
  private async submitThen(run: () => void): Promise<void> {
    const problem = this.validate();
    if (problem) {
      this.showError(problem);
      return;
    }
    await this.commit();
    this.close();
    run();
  }

  private async removeKind(kindId: string): Promise<void> {
    const file = getFile(this.app, this.path);
    await promptRemoveKind(this.app, this.plugin, this.type.id, kindId, file);
  }
}

// ── the door ─────────────────────────────────────────────────────────────

// The cog on a *What's below* bar.
//
// ON THE TITLE ROW, THROUGH `headTools`, which is the slot 1.0.49 §3 made for
// exactly this: *"`frame.actions` at level 1 is `flex: 1 0 100%`"*, so a control
// put there takes a whole second row of the section where this one fits beside
// the chevron. The Attachments cog is its neighbour in every sense — same glyph,
// same size, same slot, same kind of window behind it.
//
// EVERYTHING IS READ WHEN IT IS PRESSED. The tables under this bar are
// `LiveWidget`s that draw their rows in their own `onload`, so at the moment
// this button is BUILT every one of them is empty and a count taken here would
// be zero on every card in the vault. The hosts are handed in as a live array
// and the foot as a getter for the same reason: both are filled in after this
// returns.
export function buildNoteTypesCog(
  plugin: ChronoAnvilPlugin,
  path: string,
  type: JournalType,
  hosts: readonly KindHost[],
  foot: () => BelowFoot | null
): HTMLElement {
  const btn = createEl("button", {
    cls: "ca-journal-note-types-cog",
    attr: { type: "button" },
  });
  setIcon(btn, "settings");
  const hint = "Add a note type, or change what this note's tables show";
  btn.setAttr("aria-label", hint);
  btn.setAttr("title", hint);
  btn.addEventListener("click", (evt) => {
    // The bar folds the section on click. It must not, because a reader asked
    // for the window — the separation every hosted control in a head makes.
    evt.preventDefault();
    evt.stopPropagation();
    const counted = hosts.map((h) => ({
      kindId: h.kindId,
      rows: h.host.querySelectorAll(`[${ROW_NOTE_ATTR}]`).length,
      titled: h.head !== null,
    }));
    const removable = new Set(removableKinds(counted));
    const seeds: NoteTypeSeed[] = [];
    for (const row of counted) {
      const kind = type.kinds.find((k) => k.id === row.kindId);
      // A GROUP NAMING A TYPE THE JOURNAL NO LONGER HAS GETS NO ROW. That fence
      // draws a red *"Unknown … note type"* where its table would be — 1.0.23's
      // `prune` is the repair — and there is no kind to carry the answers, so a
      // row here would be a form over nothing.
      if (!kind) continue;
      seeds.push({ kind, rows: row.rows, removable: removable.has(row.kindId) });
    }
    new NoteTypesWindow(plugin.app, plugin, type, path, seeds, () =>
      foot()?.pick()
    ).open();
  });
  return btn;
}
