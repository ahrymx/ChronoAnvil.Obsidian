// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Editing one file's sections. Any file's.
//
// WHAT THIS IS
//
// The 3.0 editor: one window over a `SectionModel`, which is a journal note, a
// diary dashboard or a diary entry with the difference already resolved. It
// reads on open, plans on every change, shows the plan, and writes only what
// the plan named.
//
// It is the successor to `template-editor.ts`, which did all of that for
// journal notes alone. That file is now a caller — it builds a journal model
// and opens this — because §6 of the 3.0 plan chose replace over beside, and
// the reason to choose it out loud is that it is reversible only before the old
// one is deleted. What is deleted is the second EDITOR; the entry point, its
// signature and its callers are untouched.
//
// WHAT IT MUST NOT LEARN
//
//   Which surface it is on. Nothing below imports a catalogue, reads a grain,
//   or tests for a note kind. If it asks, the interface is wrong — §2, and it
//   is asserted by test rather than promised here.
//
// The two facts that ARE surface-shaped arrive as data: `group` on a section,
// which says which band it may be reordered inside, and `handEdited`, which the
// caller supplies because only a journal template can be measured against what
// the catalogue would compose.
//
// ITS MODEL IS THE FILE
//
// Not a config. Nothing it does is stored anywhere except the markdown, which
// is the decision the section catalogues already made and for the same reason:
// two records of one arrangement is how they come to disagree.
//
// WHAT IT REFUSES TO BE
//
// A markdown editor. It edits STRUCTURE — which sections, and in what order.
// The moment it edits body prose it is a worse editor than the one the reader
// already has open behind it, and it acquires a reason to hold a document
// model, which is the second representation this subsystem keeps declining to
// build.
//
// WHAT MAKES THE WRITE SAFE
//
//   1. a section's extent is exact — declared blocks on the journal side, a
//      declared directive and region on the diary side;
//   2. `plan` names the change before the write;
//   3. `apply` refuses anything the plan did not name;
//   4. unproven blocks — a reader's own fence, a `## ` heading, a region with
//      writing in it — are never deleted.
//
// The Changes tab is item 2 made visible. It is not decoration: it is the
// reason "generates, never regenerates" was allowed to stop being the rule.

import { App, Notice, TFile, setIcon } from "obsidian";
import { EditorModal } from "./editor-modal";
import { createListRow, type ListRowOptions } from "./list-row";
import {
  only,
  promptChoice,
  promptDetailedSuggester,
  promptLayoutSave,
} from "./modals";
import type AlmanacPlugin from "../main";
import { getFile } from "../core/util";
import {
  answerInText,
  fieldLabelOf,
  cellMoveOps,
  idsOf,
  pageBreakOps,
  questionIsRequired,
} from "../core/section-model";
// THE ARRANGEMENT IS NOT THIS WINDOW'S TO IMPROVISE (4.53.0). Every reorder
// here used to be a hand-written swap or splice over `rows`, with the block
// bits patched up afterwards — four of them, each having to remember what a
// group is. They are now one module of plain functions that cannot produce an
// arrangement whose groups are not runs, and this file draws buttons over it.
import {
  blocksOf,
  blockOf,
  breakUp,
  canMoveBlock,
  canMoveRow,
  dropBlock,
  dropCell,
  joinables,
  joinInto,
  moveBlock,
  moveRow,
  pagesOf,
  setPage,
  takeOut,
  unitOf,
} from "../core/row-order";
import type { Arrangement, MoveUnit, NextArrangement } from "../core/row-order";
import { isPageWidgetId } from "../core/widget-sections";
import { panDuringDrag } from "./drag-scroll";
import type {
  FolderQuestion,
  FormQuestion,
  SectionModel,
  SectionOp,
  SectionQuestion,
  SectionView,
  TitleQuestion,
  SectionWant,
} from "../core/section-model";
import { SECTION_FORM, WIDGET_FORM } from "../core/section-model";
import { ArgSuggest } from "./arg-suggest";

// The four panes, one at a time.
//
// WHY NOT TWO COLUMNS, which is what this window had until 3.0.1.
//
// The list sat left and the preview right, in a grid of `1fr 1.2fr` inside a
// modal that is about 560px wide on a default Obsidian setup. That is roughly
// 250px for a list row that carries a reorder control, a token, a title, a
// subtitle, a pill and a Remove button — so the titles wrapped mid-word
// ("Focu / s", "Note / s") and the blurb below them ran to seven lines. It was
// legible on a wide desktop and unusable everywhere else, and the diary
// surfaces made it worse rather than better: an entry adds band headings and a
// longer refusal string to the same 250px.
//
// Splitting the width was the wrong move for a window where the two halves are
// never read at once. You arrange, then you check what that would do. So each
// pane gets the whole width and the reader moves between them, which is also
// what makes this work on a phone.
type Pane = "sections" | "changes" | "markdown" | "layout";

// Storing the arrangement under a name, where the surface has somewhere to
// store one.
//
// OPAQUE ON PURPOSE. On the journal side this is a kind's saved layout and
// carries per-section overrides; this window neither computes nor forwards
// them, because overrides are a journal concept and reading one here would put
// `sectionOverrides` — and with it the journal catalogue — inside a modal that
// is supposed to be agnostic. The caller knows its own context and can resolve
// them from the id list.
export interface ArrangementSink {
  // The button's own words, because "layout" and "variant" are the journal's
  // vocabulary and another surface may not share it.
  buttonLabel: string;
  promptTitle: string;
  promptPlaceholder: string;
  // Where else this arrangement may be offered, and which of those the caller
  // is saving FROM. 3.18 follow-ups §5.
  //
  // OPAQUE, LIKE EVERYTHING ELSE THAT CROSSES THIS SEAM. On the journal side
  // these are note kinds; this window neither knows nor asks — it draws the
  // labels the caller supplied, hands back the ids the reader ticked, and never
  // learns what a kind is, exactly as it never learns what an override is. A
  // caller with one target, or none, supplies one entry and the control is not
  // drawn at all.
  targets?: { id: string; label: string }[];
  originTarget?: string;
  save: (name: string, sections: string[], targets: string[]) => Promise<void>;
}

export interface SectionEditorSpec {
  file: TFile;
  text: string;
  model: SectionModel;
  // Shown in the window title.
  title?: string;
  // Whether the file differs from what the catalogue would compose for the
  // sections it already has.
  //
  // SUPPLIED, NOT ASKED FOR. Only a surface with a composer to compare against
  // can answer it, and the answer is the single most useful sentence in the
  // window — so it is a parameter rather than a method on the interface that
  // two of three implementations would have to return false from.
  handEdited?: boolean;
  onSaved?: () => void;
  arrangement?: ArrangementSink;
}

export class SectionEditorModal extends EditorModal {
  // What the file had when the window opened, the display order now, and which
  // of those rows the reader actually wants.
  //
  // `rows` rather than `want` alone because a section the reader has just
  // unticked has to stay visible — struck through, in its place — so they can
  // see what they are taking out and put it back without hunting the Add menu.
  // `want` is derived from the two: the rows still ticked, in row order, which
  // is what makes reordering expressible at all.
  private original: string[] = [];
  private rows: string[] = [];
  private removed = new Set<string>();
  // What the reader has answered for the rows that asked something.
  //
  // A FOURTH PIECE OF STATE RATHER THAN A RICHER `rows`, for the reason `rows`
  // and `removed` are two things rather than one: an id is what every other
  // part of this window is written in terms of — `view(id)`, `bandOf(id)`,
  // `swap(a, b)`, the drag payload — and threading a record through all of them
  // to carry a field four of them would ignore is how a list of ids becomes a
  // list of objects nobody remembers the shape of. `want` composes the three at
  // the one place that needs them composed.
  //
  // KEYED BY ID AND NEVER PRUNED. A reader who picks a journal, unticks the
  // row, then changes their mind gets their answer back rather than an empty
  // dropdown — the same courtesy the struck-through row itself exists to
  // extend.
  private answers = new Map<string, Record<string, unknown>>();
  // Which of those answers this window changed, as opposed to read out of the
  // reader's file. See `answer` for why this is an interaction rather than a
  // comparison, and `want` for what it decides.
  private dirty = new Set<string>();
  // OPENS ON THE ARRANGER, where the two-column version opened on Changes.
  // With the list always visible, landing on the summary of changes was right:
  // it was the half you could not see. Now it is a pane like the others and the
  // reader came here to arrange, so that is what the window opens on.
  private pane: Pane = "sections";
  // What a drag is carrying, and which list it is moving inside.
  //
  // THE SCOPE TRAVELS WITH THE DRAG (4.53.0). A cell of a group and a block of
  // the list are two different things to move, so they are two different drags:
  // a cell may land only on another cell of its own group, and a block only on
  // another block. Recording it at `dragstart` is what lets `accepts` answer
  // both of dragover's and drop's questions with one predicate, rather than
  // each one re-deriving what was picked up.
  private dragging: { id: string; scope: MoveUnit } | null = null;
  // Which rows share a block with the row above them. 4.8 §2.
  //
  // A FLAG PER ROW RATHER THAN A LIST OF BLOCKS, and the reason is `rows`
  // itself: every other part of this window is written in terms of a flat list
  // of ids — `swap`, `bandOf`, the drag payload, `want` — and a list of lists
  // would have to be unpacked and repacked by all of them. A block is a RUN of
  // consecutive rows, which is exactly what the catalogue means by one
  // (`FlatSection.row`: "consecutive members only"), so "this one is with the
  // one before it" says the whole of it with one bit.
  //
  // It also survives a reorder for free. Drag a row out of the middle of a
  // block and it takes its flag with it; the row that followed it keeps a flag
  // that now points at whatever is above it, which is the same answer the file
  // would give.
  private joined = new Set<string>();
  // Which rows the WRITE could cut out of a shared block. See `BlockView.loose`
  // — a section whose extent is a guess is not offered a split rather than
  // being offered one that quietly does nothing.
  //
  // RE-READ ON EVERY DRAW, AND NOT FROM THE FILE AS IT WAS OPENED (4.53.0).
  // These two sets were filled in the constructor, which meant they had an
  // answer for every row the reader FOUND and none for a row they ADDED — so a
  // widget staged in this session was in neither set, **Make a group** came up
  // disabled, and the sentence it wore said the widget draws its own title bar,
  // which was not true of it and was not why. See `readCaps`: they are facts
  // about a file, so they are asked of the file this arrangement would write.
  private loose = new Set<string>();

  // Which rows may be a COLUMN of a group at all — 4.12 §A.
  //
  // `loose`'s SIBLING, AND A DIFFERENT QUESTION. That one answers "can this
  // leave the block it is in" and gates **Take out of the group**; this answers
  // "is it the kind of thing a column is" and gates **Make a group**. The window
  // does not know what makes the answer no — a page head, two widgets in one
  // fence, or a fence that draws its own title bar — and does not need to: it
  // asks one question, disables one button and says one sentence.
  private column = new Set<string>();

  // Which rows begin a PAGE of their group rather than a column of the page
  // before it — 4.34.2, and the `tab` lines the fence already carries.
  //
  // `joined`'s SIBLING, AND THE SAME ONE BIT PER ROW. That one says "this is
  // with the one above it"; this says "and it starts a new page there". Two
  // independent bits describe every arrangement a group can have — a column of
  // page two is joined and not paged, the first column of page two is both —
  // and neither needs to know how many of anything there are, which is what
  // lets both survive a reorder for free.
  //
  // A ROW THAT IS NOT `joined` CANNOT BE `paged`, because a page is a division
  // INSIDE a group and a row that opens its own block has no group to divide.
  // `normalise` (row-order.ts) is where that is enforced, once, rather than at
  // each of the places that set the bit.
  private paged = new Set<string>();

  constructor(app: App, plugin: AlmanacPlugin, private spec: SectionEditorSpec) {
    super(
      app,
      plugin,
      spec.title ?? `Edit sections — ${spec.file.basename}`,
      spec.file.path,
      "Save"
    );
    this.original = spec.model.present(spec.text);
    this.rows = [...this.original];
    // The blocks the file already has, where the surface has any. A model that
    // does not implement `blocks` leaves both sets empty, every group is one
    // row long, and this window draws the list it always drew.
    //
    // THE TWO BITS ONLY, AS OF 4.53.0. `loose` and `column` used to be read here
    // too and they are not the same kind of thing: these two are the READER'S
    // arrangement, which this window then owns and changes, and those two are
    // facts about a file, which change under it every time it stages a section.
    // See `readCaps` for what reading them once cost.
    for (const block of spec.model.blocks?.(spec.text) ?? []) {
      for (const id of block.ids.slice(1)) this.joined.add(id);
      // WHAT THE FILE ALREADY SAYS ABOUT ITS PAGES. Without this the window
      // would open on a paged group showing one undivided list, and the first
      // Save would flatten every page the reader had made.
      for (const id of block.pages ?? []) this.paged.add(id);
    }
  }

  // A little wider than the shared frame, and only this window.
  //
  // The frame's default suits a form — a column of fields and a Save button.
  // This is a list of rows that each carry six things, and a Markdown pane
  // showing a file. Bounded by the viewport so a phone gets the full width and
  // nothing more, which is the case the two-column layout failed hardest.
  onOpen(): void {
    super.onOpen();
    this.modalEl.addClass("almanac-section-editor");
  }

  private get model(): SectionModel {
    return this.spec.model;
  }

  // The rows still ticked, in row order, each with whatever the reader answered
  // for it.
  //
  // WIDENED FROM `string[]` IN 3.8 PATCH 7, and it is the whole of the patch on
  // this side: `SectionChoice` has been travelling from here to
  // `EntrySection.directive` since patch 4 and this getter was the one place
  // that could only ever say an id.
  //
  // STILL A BARE STRING WHERE THERE IS NOTHING TO SAY. `SectionWant`'s
  // shorthand is not decoration — a plan over `["links", "log"]` and one over
  // `[{id:"links"},{id:"log"}]` must produce identical ops, and the cheapest
  // way to be sure of that is for the common case to keep passing the spelling
  // it always passed. Only a row that was actually asked something changes
  // shape.
  //
  // A ROW WITH AN UNANSWERED QUESTION IS NOT IN THE LIST AT ALL. See
  // `unanswered`: it stays on screen, wearing the reason, and contributes no
  // `add` op — so the footer will not offer to save it and `apply` is never
  // handed a section it would have to render with a hole in it.
  private get want(): SectionWant[] {
    return this.rows
      .filter((id) => !this.removed.has(id))
      .filter((id) => this.unanswered(id).length === 0)
      .map((id) => {
        // A SETTLED ROW CARRIES OPTIONS ONLY IF THIS WINDOW CHANGED THEM, and
        // that is the sentence §2.3 turns on. The plan reads options on a
        // section it already has as "the answer moved" and rewrites that one
        // line; a row seeded from the file and left alone has nothing to say,
        // so it is copied out verbatim like every other untouched section.
        //
        // A row being ADDED always carries them: there is no line yet, the
        // catalogue composes one, and its answers are what it composes from.
        const settled = this.original.includes(id);
        if (settled && !this.dirty.has(id)) return id;
        const options = this.answers.get(id);
        return options && Object.keys(options).length ? { id, options } : id;
      });
  }

  // The questions this row declares that nobody has answered yet.
  //
  // EMPTY FOR A SECTION ALREADY IN THE FILE, whatever it declares, and that is
  // the load-bearing half. A kept section's directive line is copied out of the
  // reader's file verbatim — the property `applySections` has had since it was
  // written and the one patch 4 was most likely to cost — so its answer is
  // already there, in their words, possibly hand-edited. Asking again would
  // either restate an answer this window cannot read or overwrite one it has no
  // business touching. The row says so instead; see `renderQuestions`.
  //
  // Empty for every row on a surface that declares no questions, which is two
  // of the three and eight of the nine sections on the third.
  // `=== undefined` RATHER THAN FALSY, and the difference is a whole question
  // type. `!answered[q.key]` reads an empty string as no answer, and empty is
  // the folder question's DEFAULT — the host note's own folder, the spelling
  // every journal index ships. A row answered "" would have stayed out of
  // `want` and its section could never have been added.
  //
  // Equivalent for the `<select>`, which deletes the key rather than storing ""
  // when nothing is chosen, so this is not a behaviour change on the control
  // that already existed.
  //
  // AND `questionIsRequired` IS THE MODEL'S ANSWER, NOT THIS WINDOW'S (§4). A
  // folder question is never unanswered because its empty state is a working
  // directive; a choice question with no answer composes a block that looks
  // broken. That difference is carried in the type rather than assumed here.
  private unanswered(id: string): SectionQuestion[] {
    if (this.original.includes(id)) return [];
    const answered = this.answers.get(id) ?? {};
    return (this.view(id)?.questions ?? []).filter(
      (q) => questionIsRequired(q) && answered[q.key] === undefined
    );
  }

  // ASKED OF THIS TEXT (4.15 §4). What a surface offers is a question about the
  // note once a widget may repeat, because a repeating one has a section per
  // occurrence — so the text goes in, and the three models that cannot repeat
  // ignore it and answer exactly as they did.
  private view(id: string): SectionView | undefined {
    return this.model.sections(this.spec.text).find((s) => s.id === id);
  }

  // ── rows (4.8 §2) ─────────────────────────────────────────────────────

  // The three pieces of state that describe the arrangement, handed to the one
  // module that is allowed to change it. 4.53.0.
  private get arrangement(): Arrangement {
    return { rows: this.rows, joined: this.joined, paged: this.paged };
  }

  // And what comes back, taken in one go.
  //
  // NULL IS A MOVE THAT CHANGES NOTHING and is not a repaint: pressing a
  // disabled-looking arrow, dropping a row on itself, joining a block that is
  // already where it would go. `row-order.ts` answers that way for the same
  // reason `applyFlatSections` does, and the window's part of the bargain is not
  // to redraw a list to leave it identical.
  private settle(next: NextArrangement | null): void {
    if (!next) return;
    this.rows = next.rows;
    this.joined = next.joined;
    this.paged = next.paged;
    this.refreshFrame();
  }

  // These ids cut into blocks: a run starts wherever a row is not joined to the
  // one before it.
  //
  // TAKES THE IDS IT IS GIVEN, because it is asked two different questions with
  // the same rule. The LIST asks about every row on screen, struck-through ones
  // included, so a reader can see the block they are taking something out of.
  // The WRITE asks about `want`, where a removed row is already gone — and a
  // block whose first member is being removed is opened by the next one, which
  // falls out of the same walk rather than needing a case.
  private groupsOf(ids: readonly string[]): string[][] {
    return blocksOf(ids, this.joined);
  }

  // One group's rows, cut into its pages. 4.34.2.
  //
  // A ROW ON ITS WAY OUT DOES NOT DIVIDE ANYTHING (4.53.0). `pageBreaks` reads
  // the bits back through `want` at the write, where a removed row is already
  // gone — so a card whose struck-through member carried a page bit was drawing
  // a division the Save would not make, and counting it in the bar's `Group — n
  // pages`. The bit is the reader's and is kept; it just stops being asked.
  private pagesIn(group: readonly string[]): string[][] {
    const breaks = new Set(
      [...this.paged].filter((id) => !this.removed.has(id))
    );
    return pagesOf(group, breaks);
  }

  // The blocks the LIST draws: the ones the write will make, with the rows on
  // their way out put back where they sit. 4.53.0.
  //
  // TWO QUESTIONS THE OLD ONE ANSWERED WITH ONE WALK. `groupsOf(this.rows)`
  // cuts the rows on screen, struck-through ones included, which is right for
  // "show me the group I am taking something out of" and wrong for everything
  // else: a removed row between two members made them look like two blocks when
  // the Save would write one, and **Add to group** — which reads the block above
  // out of `want` — then named a card the reader could not see.
  //
  // So membership is decided over the rows that will be there, and a removed row
  // is drawn inside whatever run it is sitting in. A group whose kept members
  // come down to one stops being drawn as a card, because it stops being a
  // group; the two rows are still next to each other and one of them is still
  // struck through, which says the same thing without promising a group that
  // will not exist.
  private displayBlocks(ids: readonly string[]): string[][] {
    const blocks = blocksOf(
      ids.filter((id) => !this.removed.has(id)),
      this.joined
    );
    const owner = new Map<string, number>();
    blocks.forEach((b, i) => b.forEach((id) => owner.set(id, i)));
    const out: string[][] = [];
    let run = -1;
    for (const id of ids) {
      const at = owner.get(id);
      if (at === undefined) {
        if (out.length) out[out.length - 1].push(id);
        else out.push([id]);
        continue;
      }
      if (at === run && out.length) out[out.length - 1].push(id);
      else {
        out.push([id]);
        run = at;
      }
    }
    return out;
  }

  // Every row that begins a page, across the whole arrangement — what `regroup`
  // is handed.
  //
  // FILTERED THROUGH `groupsOf`, so a row that stopped being part of a group
  // stops being a page break with it. The bit survives a reorder for free (it
  // is one bit on one row) and that is exactly why it has to be read back
  // through the current grouping rather than trusted on its own: a row dragged
  // out of a group would otherwise arrive at the write still claiming to open a
  // page of a group it is no longer in.
  private pageBreaks(ids: readonly string[]): string[] {
    return this.groupsOf(ids).flatMap((group) =>
      group.filter((id, i) => i > 0 && this.paged.has(id))
    );
  }

  // What the file this arrangement would write can be asked to do — read fresh,
  // once per draw. 4.53.0.
  //
  // `loose` AND `column` ARE FACTS ABOUT A FILE, NOT ABOUT A ROW. Whether a
  // section can be cut out of the fence it shares, and whether it is the kind of
  // thing a column is, are answered by reading the lines it actually has — which
  // is why `BlockView` carries them and this window does not compute them. The
  // constructor read them ONCE, from the file as it was opened, and that answer
  // is missing for exactly the rows a reader is most likely to want to group: the
  // ones they have just added, which are not in that file at all.
  //
  // SO IT ASKS ABOUT `apply`'s OUTPUT, which is the same dry run `layoutOps`
  // makes and for the same reason — the honest answer to "what could I do with
  // this" is read off the file the Save would produce, not off the one that is
  // there. A staged section is alone in a fence of its own there, so it is loose
  // and it is a column exactly when its own lines make it one.
  //
  // ONCE PER DRAW, at the top of `renderList`, because `apply` walks the file and
  // the twenty-odd `loose.has` and `column.has` calls a list of rows makes are
  // all asking about the same one.
  private readCaps(): void {
    this.loose = new Set();
    this.column = new Set();
    if (!this.model.blocks) return;
    const base = this.model.apply(this.spec.text, this.want) ?? this.spec.text;
    for (const block of this.model.blocks(base)) {
      for (const id of block.loose) this.loose.add(id);
      for (const id of block.column) this.column.add(id);
    }
  }

  // Whether this surface has rows at all.
  private get hasRows(): boolean {
    return Boolean(this.model.blocks && this.model.regroup);
  }

  // What regrouping would do, named the way every other change in this window
  // is named: by asking for it and reading the answer.
  //
  // A DRY RUN, NOT A COMPARISON OF INTENTIONS. The obvious shape is to diff the
  // blocks on screen against the blocks in the file and report the difference —
  // and it would report moves that `regroup` declines to make. A section whose
  // extent cannot be bounded stays where it is; a fence of another kind cannot
  // take a directive. Running the write and reading its RESULT is the only way
  // this pane can promise exactly what Save does, which is the whole reason the
  // Changes tab exists.
  private layoutOps(): SectionOp[] {
    if (!this.hasRows) return [];
    const base = this.model.apply(this.spec.text, this.want) ?? this.spec.text;
    const want = this.groupsOf(idsOf(this.want));
    const next = this.model.regroup?.(base, want, this.pageBreaks(idsOf(this.want)));
    if (!next) return [];
    const openerIn = (text: string): Map<string, string> =>
      new Map(
        (this.model.blocks?.(text) ?? []).flatMap((b) =>
          b.ids.map((id) => [id, b.ids[0]] as [string, string])
        )
      );
    const from = openerIn(base);
    const to = openerIn(next);
    const ops: SectionOp[] = [];
    for (const [id, opener] of to) {
      if (from.get(id) === opener) continue;
      const label = this.view(id)?.label ?? id;
      ops.push({
        kind: "regroup",
        sectionId: id,
        label,
        detail:
          opener === id
            ? `${label} takes a block of its own`
            : `${label} joins one block with ${this.view(opener)?.label ?? opener}`,
      });
    }
    // AND THE ORDER INSIDE A BLOCK, WHICH IS THE SAME DRY RUN ASKED ONE
    // QUESTION FURTHER IN (4.44.1). The map above answers "which block is this
    // section in", so two cells of one row trading places is invisible to it —
    // and `regroup`'s phase three had been settling exactly that since 4.8,
    // unnamed and therefore uncounted. The footer disables Save at zero, so the
    // reader dragged, watched the list re-draw, and was told "No changes".
    //
    // WHAT IT SKIPS AND HOW IT MATCHES ARE `cellMoveOps`' TO SAY, beside the
    // `moveOps` it is built out of — so the sentence a reorder gets here is the
    // one the plan writes for every other move, and a block whose MEMBERSHIP
    // changed is left to the regroup ops above rather than being named twice.
    const label = (id: string): string | undefined => this.view(id)?.label;
    const was = this.model.blocks?.(base) ?? [];
    const now = this.model.blocks?.(next) ?? [];
    ops.push(
      ...cellMoveOps(
        was.map((b) => b.ids),
        now.map((b) => b.ids),
        label
      )
    );
    // AND WHERE ITS PAGES BEGIN, WHICH IS THE FOURTH THING `regroup` DOES AND
    // THE LAST ONE THIS PANE COULD NOT SEE (4.44.1). A `tab` line changes
    // neither which block a section is in nor which column of it, so **Start a
    // page here** wrote its bit, the write placed the boundary, and this
    // returned nothing — leaving the footer to say "No changes" over a button
    // the reader had just pressed. `BlockView.pages` has carried the answer
    // since 4.34.2; nothing was asking it.
    ops.push(...pageBreakOps(was, now, label));
    return ops;
  }

  // ── the plan ──────────────────────────────────────────────────────────

  private ops(): SectionOp[] {
    return [...this.model.plan(this.spec.text, this.want), ...this.layoutOps()];
  }

  // WHAT THE BUTTON COUNTS, and as of 3.15 a reconfigure is one of them. It
  // has to be: the footer disables Save at zero, so a reader who changed an
  // answer and nothing else would have been shown "No changes" over a plan
  // that names one. See `SectionOpKind`.
  //
  // AN EXTEND IS ONE TOO, as of 3.18, for exactly that argument one release on.
  // A reader who opens this window on a dashboard written before their journal
  // gained a note kind has changed nothing themselves — the plan's one entry is
  // the catalogue catching the file up — and a disabled Save over a row reading
  // "Practice has no table here" is the same silence with a different cause.
  private changeCount(): number {
    return this.ops().filter(
      (o) =>
        o.kind === "add" ||
        o.kind === "remove" ||
        o.kind === "move" ||
        o.kind === "reconfigure" ||
        o.kind === "extend" ||
        // 4.8: two blocks becoming one is a write like any other, and a reader
        // whose only change is a row would otherwise be shown "No changes" over
        // a plan that names three.
        o.kind === "regroup"
    ).length;
  }

  // ── body ──────────────────────────────────────────────────────────────

  protected renderBody(): void {
    const wrap = this.body.createDiv({ cls: "almanac-tpl-editor" });

    if (this.spec.handEdited) {
      // The single most useful sentence in the window, so it is a line of text
      // and not a tooltip. A reader about to change a file they have been
      // editing for months needs to know the plugin knows that.
      const warn = wrap.createDiv({ cls: "almanac-tpl-edited" });
      setIcon(warn.createSpan({ cls: "almanac-tpl-edited-icon" }), "pencil");
      warn.createSpan({
        text: "You've edited this file since it was written. Only the blocks listed under Changes are touched.",
      });
    }

    this.renderTabs(wrap);

    const pane = wrap.createDiv({ cls: "almanac-tpl-pane" });
    if (this.pane === "sections") this.renderList(pane);
    else if (this.pane === "changes") this.renderChanges(pane);
    else if (this.pane === "markdown") this.renderMarkdown(pane);
    else this.renderLayout(pane);
  }

  private renderTabs(host: HTMLElement): void {
    const tabs = host.createDiv({ cls: "almanac-tpl-tabs" });
    const n = this.changeCount();
    const tab = (key: Pane, label: string): void => {
      const b = tabs.createEl("button", {
        text: label,
        cls: this.pane === key ? "almanac-tpl-tab is-active" : "almanac-tpl-tab",
      });
      b.addEventListener("click", () => {
        this.pane = key;
        this.refreshBody();
      });
    };
    tab("sections", "In this file");
    // THE COUNT IS ON THE TAB, because the pane that would show it is now
    // hidden most of the time. A reader who drags three rows and never opens
    // Changes should still be able to see that three things are pending — the
    // footer says so too, and saying it twice is right here: the footer is what
    // they press and the tab is where they would go to check.
    tab("changes", n === 0 ? "Changes" : `Changes (${n})`);
    tab("markdown", "Markdown");
    tab("layout", "Layout");
  }

  // The rows, in bands.
  //
  // A BAND IS DRAWN ONLY WHERE THERE IS MORE THAN ONE. On a journal note and a
  // dashboard every section's `group` is null, so this renders exactly the flat
  // list it always did; a diary entry has two and gets two headings. The
  // difference is in the data, and this is the only place it shows.
  private renderList(pane: HTMLElement): void {
    // WHAT THE ROWS MAY BE ASKED TO DO, read once for the whole draw. See
    // `readCaps` — every group button below consults it, and a section staged in
    // this session has an answer only because this runs here rather than in the
    // constructor.
    this.readCaps();
    // No heading of its own: the tab it sits behind is already called "In this
    // file", and a pane that repeats its own tab as a title is a line of
    // chrome that pushes the first row down for nothing.
    const host = pane.createDiv({ cls: "almanac-tpl-list" });
    const bands: (string | null)[] = [];
    for (const id of this.rows) {
      const g = this.view(id)?.group ?? null;
      if (!bands.includes(g)) bands.push(g);
    }

    for (const band of bands) {
      if (band !== null && bands.length > 1) {
        host.createDiv({ cls: "almanac-tpl-band", text: band });
      }
      // THE ROWS OF THIS BAND, CUT INTO BLOCKS. A block is a run of consecutive
      // rows, so it is grouped after the band filter rather than before it —
      // a block cannot span a band any more than a fence can.
      const inBand = this.rows.filter(
        (id) => (this.view(id)?.group ?? null) === band && this.view(id)
      );
      for (const group of this.displayBlocks(inBand)) {
        // A CARD IS DRAWN FOR THE GROUP THE SAVE WILL WRITE. Counting every row
        // on screen would put one round a member and the struck-through row it
        // is replacing, which is two rows and no group.
        const kept = group.filter((id) => !this.removed.has(id));
        if (kept.length < 2) {
          for (const id of group) {
            const section = this.view(id);
            if (section) this.renderRow(host, section);
          }
          continue;
        }
        this.renderBlock(host, group);
      }
    }

    this.renderAdd(host);
  }

  // A block holding more than one section, drawn as the card it is. 4.8 §2.2.
  //
  // A CARD RATHER THAN A MARKER ON EACH ROW. What the reader is looking at is
  // ONE THING on their page — the top row of the homepage is a single block
  // holding three widgets side by side — and three rows each wearing a "in a
  // row" pill would be describing that thing three times without ever drawing
  // it. The card is the block, and the rows inside it are its cells.
  //
  // AND IT IS CALLED A GROUP, AS OF 4.9 §1. The object now draws itself on the
  // page with a box and a foot, so the window and the page have to call it the
  // same thing — "one block" describes the file, which is the one place a reader
  // is not looking. The fence keyword stays `row`: that is how a group is
  // written, and the documentation says so in those words.
  private renderBlock(host: HTMLElement, group: readonly string[]): void {
    const card = host.createDiv({ cls: "almanac-tpl-block" });
    const pages = this.pagesIn(group);
    const bar = card.createDiv({ cls: "almanac-tpl-block-bar" });

    // ── THE GROUP MOVES AS ONE THING, FROM THE CARD (4.53.0) ──────────────
    //
    // The card has drawn a group since 4.8 and there was no way to move one. A
    // reader who wanted their group further down the page had to press Move down
    // on each of its cells in turn and watch the group come apart doing it —
    // which is the report this release is about, from the other end.
    //
    // ON THE BAR, WHICH IS WHERE THE OBJECT IS. The arrows inside the card move
    // a CELL within the group; these move the group among the blocks of the
    // list. Two levels, two places, and the one you press is the one that
    // belongs to the thing you are pointing at.
    const band = this.bandOf(group[0]);
    const shift = (delta: number, label: string, icon: string): void => {
      const b = bar.createEl("button", {
        cls: "almanac-tpl-arrow",
        attr: { "aria-label": label, title: label },
      });
      setIcon(b, icon);
      b.disabled = !canMoveBlock(band, this.joined, group[0], delta);
      b.addEventListener("click", () => {
        this.settle(moveBlock(this.arrangement, band, group[0], delta));
      });
    };
    shift(-1, "Move the group up", "chevron-up");
    shift(1, "Move the group down", "chevron-down");
    // PICKED UP BY THE BAR, DROPPED ON THE CARD. The bar is the handle because
    // the rows inside the card are drag sources of their own and a handle has to
    // be somewhere that is not one; the target is the whole card because a thin
    // strip is a bad thing to have to hit, and because what lands beside a group
    // lands beside all of it. A cell drop inside the card is refused here by
    // scope and handled by the row it was let go on.
    this.attachDrag(bar, group[0], "block", card);
    this.attachDrop(card, group[0], "block");

    bar.createSpan({
      cls: "almanac-tpl-block-title",
      // WHAT THE BAR SAYS, AND IT NO LONGER COUNTS COLUMNS (4.34.2). `Group — 4
      // columns` was accurate until a group could hold pages and then was
      // exactly wrong: a group of two pages with two columns each is not a group
      // of four columns, and the number was the one thing on this card a reader
      // would have taken as a description of their page.
      //
      // It says how many PAGES instead, and only where there is more than one —
      // a plain `Group` for the common case, which is the same restraint the
      // foot exercises by carrying no count at all.
      text: pages.length > 1 ? `Group — ${pages.length} pages` : "Group",
    });
    const split = bar.createEl("button", {
      cls: "almanac-tpl-move",
      text: "Break up the group",
    });
    // EVERY MEMBER LEAVES AT ONCE, which is the one operation on a block that
    // needs no per-row judgement: they each get the block they would have had
    // if nobody had put them together.
    //
    // ASKED OF THE MEMBERS THAT WILL STILL BE THERE (4.53.0). A struck-through
    // row is not in the file the Save writes, so it has no lines to be cut out
    // of anything — and `loose`, which is read off that file, has nothing to say
    // about it. Counting it disabled the button over a group the write would
    // have broken up perfectly well.
    const kept = group.filter((id) => !this.removed.has(id));
    split.disabled = !kept.slice(1).every((id) => this.loose.has(id));
    // AND IT SAYS WHY, AS OF 4.12 §A. This button has been drawn disabled with
    // no explanation since 4.8, which is the same defect the join button is
    // getting fixed for in this release — a control that is visibly there and
    // visibly refusing, with nothing saying what would make it work.
    if (split.disabled) {
      split.title =
        "One of these sections' lines can't be told apart from the others in its block, so the group can't be broken up. Move it out of the block by hand first.";
    }
    split.addEventListener("click", () => {
      this.settle(breakUp(this.arrangement, band, group[0]));
    });

    const body = card.createDiv({ cls: "almanac-tpl-block-body" });
    // ONE BAND PER PAGE, AND ONLY WHERE THERE IS MORE THAN ONE. A single page is
    // the group itself, and a band saying `Page 1` over the whole card would be
    // naming a division that is not there — the same label-for-nothing the foot's
    // column count turned out to be.
    pages.forEach((page, n) => {
      if (pages.length > 1) {
        body.createDiv({
          cls: "almanac-tpl-page",
          text: `Page ${n + 1}`,
        });
      }
      for (const id of page) {
        const section = this.view(id);
        if (section) this.renderRow(body, section);
      }
    });
  }

  // Which rows this one may trade places with: the ones in its own band, in
  // display order.
  //
  // THE WHOLE OF THE REORDERING RULE, and it is one sentence with no surface
  // test in it. On a surface with one band it is every other row, which is what
  // the journal editor has always done. On a diary entry it is the rows on the
  // same side of the rule — so a section cannot be dragged from the structural
  // half into the personal one, because there is nowhere in that band to drop
  // it, rather than because a check said no.
  // AND AN IMMOVABLE ROW IS NOT IN ANY BAND. 3.2 §4 fixes navigation to the top
  // row of every diary surface, and the cheapest way to say so is the way the
  // rule above already works: not a check that refuses the drop, but a band it
  // was never a member of. A fixed row is therefore not a drag source, not a
  // drop target, and gets no arrows — three behaviours from one omission, and
  // none of them asks what surface this is.
  //
  // It still RENDERS, with its refusal in the subtitle. A row that vanished
  // would take the explanation with it, and "navigation is fixed" is exactly
  // the thing a reader hunting for the setting needs to be told.
  //
  // AND IT IS THE LIST THE BLOCKS ARE CUT FROM (4.53.0), not the list a row is
  // swapped inside. `row-order.ts` takes a band and answers in blocks, so the
  // one rule this method states — which rows may be rearranged together — is
  // still the only rule about crossing, and everything about groups is read off
  // it rather than checked beside it.
  //
  // WHICH IS WHY A ROW ON ITS WAY OUT IS NOT IN ONE EITHER, the same omission
  // doing a fourth job. A struck-through row is not in the file the Save writes,
  // so it is not in the blocks the Save writes — and a band that still held it
  // would have every control asking about an arrangement one row wider than the
  // one being planned. It keeps its slot on screen exactly as an immovable row
  // does (see `restack`), so the reader finds it where they left it and gets its
  // arrows back the moment they press Keep.
  private bandOf(id: string): string[] {
    if (this.view(id)?.movable === false) return [];
    const band = this.view(id)?.group ?? null;
    return this.rows.filter(
      (x) =>
        this.view(x) !== undefined &&
        !this.removed.has(x) &&
        (this.view(x)?.group ?? null) === band &&
        this.view(x)?.movable !== false
    );
  }

  private renderRow(host: HTMLElement, section: SectionView): void {
    const gone = this.removed.has(section.id);
    const isNew = !this.original.includes(section.id);
    // Asked of THIS text, not of the section alone: a section that is
    // removable in principle can still be holding the reader's writing.
    const refusal = this.model.refusal(section.id, this.spec.text);
    // IN THE SAME PLACE AS THE REFUSAL, and for the same argument. "This will
    // not be added yet, and here is what it is waiting for" is exactly the
    // class of thing §3 says a graphical editor must state in place rather than
    // discover on Save.
    const waiting = gone ? [] : this.unanswered(section.id);

    const isSection = section.movable !== false && !this.column.has(section.id) && !this.joined.has(section.id);
    const isWidget = !isSection && section.movable !== false;

    const typePills: NonNullable<ListRowOptions["pills"]> = isSection
      ? [{ text: "Section", tone: "accent" }]
      : isWidget
        ? [{ text: "Widget", tone: "muted" }]
        : [];

    const statusPills: NonNullable<ListRowOptions["pills"]> = gone
      ? [{ text: "removing", tone: "off" }]
      : waiting.length
        ? waiting.map((q) => ({ text: `needs ${q.label}`, tone: "muted" }))
        : isNew
          ? [{ text: "adding", tone: "on" }]
          : refusal
            ? [{ text: "can't be removed", tone: "muted" }]
            : section.movable === false
              ? [{ text: "fixed", tone: "muted" }]
              : [];

    const { row, lead, actions } = createListRow(host, {
      // THE ACTIONS GET A LINE OF THEIR OWN (4.15 §2). This is the caller the
      // flag was added for: a row here carries a dropdown or a text field
      // alongside a group button and a Remove button, and until now all four
      // divided one line with the title and the blurb. See `ListRowOptions`.
      actionsRow: true,
      token: section.icon,
      title: section.label,
      // SHOWN IN PLACE, NOT ON SAVE. Discovering a refusal after committing to
      // the change is the failure 2.59.7 fixed on the plan side, and §3 exists
      // because a graphical editor is exactly where it would come back.
      subtitle: refusal ?? section.blurb,
      pills: [...typePills, ...statusPills],
      cls: [
        gone ? "almanac-tpl-row-removed" : "",
        isNew && !gone && !waiting.length ? "almanac-tpl-row-added" : "",
        refusal ? "almanac-tpl-row-locked" : "",
        waiting.length ? "almanac-tpl-row-waiting" : "",
        isSection ? "almanac-tpl-row-section" : "",
        isWidget ? "almanac-tpl-row-widget" : "",
      ],
    });

    const band = this.bandOf(section.id);
    // WHICH LIST THIS ROW MOVES INSIDE, and the whole of 4.53.0 in one word. A
    // cell of a group moves among its group's cells; anything else moves among
    // the blocks of its band, and a group is one block. Read from the
    // arrangement rather than from where this row happens to be being drawn, so
    // the card and the mover cannot disagree about what a group is.
    const unit = unitOf(band, this.joined, section.id);
    this.attachDrag(row, section.id, unit);
    this.attachDrop(row, section.id, unit);

    // ARROWS AS WELL AS DRAG, not instead of it.
    //
    // §3 of the plan assumes drag, and the row this replaces argued for arrows:
    // "the list is short, the rows are a fixed height, and a button is
    // keyboard-reachable in a way a handle is not". Both are right, and they
    // are not in conflict — the argument against drag was never that it is a
    // bad gesture, it was that it is the only one. So the gesture is added and
    // the affordance is kept, and the keyboard path survives.
    //
    // In `lead` rather than beside the toggle: "move this up" next to "remove
    // this" is a pairing one slip away from being expensive.
    //
    // WHAT THEY SAY DEPENDS ON WHAT THEY MOVE (4.53.0), because a reader
    // pressing an arrow on a row below a group needs to know before they press
    // it that the row is going OVER the group rather than into it. "Move up
    // past the group" is the sentence the old control could not say,
    // because it did not know: it swapped with whatever row was above,
    // discovered the group afterwards, and left the file describing an
    // arrangement nobody had asked for.
    const nudge = (delta: number, icon: string): void => {
      const label = this.moveLabel(band, section.id, unit, delta);
      const b = lead.createEl("button", {
        cls: "almanac-tpl-arrow",
        attr: { "aria-label": label, title: label },
      });
      setIcon(b, icon);
      b.disabled = !canMoveRow(band, this.joined, section.id, delta);
      b.addEventListener("click", () => {
        this.settle(moveRow(this.arrangement, band, section.id, delta));
      });
    };
    nudge(-1, "chevron-up");
    nudge(1, "chevron-down");

    this.renderQuestions(actions, section);

    // ── which block this row is in (4.8 §2.2) ──────────────────────────
    //
    // A BUTTON RATHER THAN A SECOND MEANING FOR THE DRAG. The drag reorders,
    // and it has meant exactly that since 3.0; teaching a drop to sometimes
    // join instead would make the outcome depend on where inside a row the
    // pointer let go — which is the ambiguity 4.7 removed from the page and has
    // no more business here. It is also the argument the arrows already won: a
    // button is keyboard-reachable and a gesture is not.
    //
    // `movable !== false` CAME OUT IN 4.12 §A, and it was doing two jobs badly.
    // It was the whole of the head's exclusion — and the head is now excluded in
    // the MODEL, by `column`, where the write's own refusal already lives. What
    // it also did was withhold the row entirely rather than disabling it, which
    // is the one case where "nothing dead is drawn" is the wrong rule: the
    // reader is looking for the control and its absence explains nothing.
    if (this.hasRows && !gone) {
      // WHICH OF THE TWO SETS OF CONTROLS THIS ROW GETS, asked once. A cell of a
      // group can leave it and can open a page of it; a block can join the block
      // above. Reading `unit` rather than `joined` is what finally gives the
      // row that OPENS a group the right controls — it is as much a cell of that
      // group as the ones below it, and its bit is the absence of a bit, so
      // asking `joined` put it in the other branch and offered it a join with
      // whatever was outside the card. That is where the two-groups-become-one
      // surprise came from.
      if (unit === "cell") {
        // AN ICON UNDER THE ARROWS, NOT A PILL IN THE ACTIONS ROW (4.53.1).
        //
        // It is the same question the arrows ask. Up, down and out are three
        // answers to "where does this row sit"; the actions row answers "what
        // is this row for" — a dropdown, a text field, Remove. Sorting the
        // controls by the question they answer is also what keeps Remove away
        // from the movers, which is the pairing `lead` exists to avoid.
        //
        // It stopped being the widest thing on the line, too: "Take out of the
        // group" is the longest label in the editor, and it was setting the
        // wrap of every actions row that carried it.
        //
        // LABELLED, NOT JUST DRAWN. An icon button with no text is a button
        // with no name to a screen reader and a guess to everyone else, so the
        // name goes in `aria-label` and the sentence in `title` — the same
        // pairing the arrows use one block up.
        const out = lead.createEl("button", {
          cls: "almanac-tpl-arrow almanac-tpl-leave",
          attr: {
            "aria-label": "Take out of the group",
            title: "Take out of the group — give this section a block of its own",
          },
        });
        setIcon(out, "unlink");
        // A SECTION WHOSE EXTENT IS A GUESS IS NOT OFFERED THE SPLIT. See
        // `BlockView.loose`: the alternative is a button that plans a move the
        // write then declines to make.
        out.disabled = !this.loose.has(section.id);
        if (out.disabled) {
          out.title =
            "This section's lines can't be told apart from the others in its block, so it can't be split out.";
        }
        // IT LEAVES THROUGH THE NEAREST EDGE, and `takeOut` is where that is
        // decided. The old handler was `joined.delete(id)`, which does not take
        // a row OUT of a run — it cuts the run in two at that row, so taking the
        // middle cell out of a group of three carried the third one with it into
        // a group the reader had not asked for.
        out.addEventListener("click", () => {
          this.settle(takeOut(this.arrangement, band, section.id));
        });

        // ── AND WHERE ITS PAGE BEGINS (4.34.2) ──────────────────────────
        //
        // The second bit a row in a group carries. `Take out of the group`
        // decides WHETHER it is in one; this decides whether it starts a new
        // page of it or sits beside what came before.
        //
        // OFFERED ON EVERY JOINED ROW, INCLUDING ONES THAT ALREADY BREAK — a
        // toggle rather than a one-way control, because the reader who made a
        // page in the wrong place has no other way to unmake it here.
        //
        // AND NOT ON THE ROW THAT OPENS THE GROUP, which is the one cell that
        // cannot begin a page of it: the `row` line opens page one exactly as it
        // opens the first column. `normalise` enforces that on the bits; this is
        // the same fact, drawn.
        if (this.joined.has(section.id)) {
          const breaks = this.paged.has(section.id);
          const page = actions.createEl("button", {
            cls: "almanac-tpl-move",
            text: breaks ? "Join the page before" : "Start a page here",
            attr: {
              title: breaks
                ? "Put this section back beside the one before it, in the same page"
                : "Begin a new page of this group at this section — the group draws a numbered strip to switch between its pages",
            },
          });
          // THE SAME REFUSAL THE SPLIT MAKES, AND FOR THE SAME REASON. Placing a
          // boundary means knowing which line this section starts on; a section
          // whose lines cannot be told from its neighbours' would have the `tab`
          // written above somebody else's widget.
          page.disabled = !this.loose.has(section.id);
          if (page.disabled) {
            page.title =
              "This section's lines can't be told apart from the others in its block, so a page can't be started at it.";
          }
          page.addEventListener("click", () => {
            this.settle(setPage(this.arrangement, band, section.id, !breaks));
          });
        }
      } else {
        // THE BLOCK ABOVE, NOT THE ROW ABOVE (4.53.0). These are the same thing
        // only when the row above is on its own: where it is the last cell of a
        // group, "the row above" is a member of something, and a join is into
        // the WHOLE of that something. Reading the block is also what stops the
        // control appearing on a row whose neighbour is being removed, and what
        // lets it say which of the two things it is about to do.
        //
        // AND THE GROUPS FURTHER OFF (4.53.2). `joinables` adds every group on
        // the page to the block above, because "put this beside that" was only
        // ever offered for a destination that happened to be touching — a widget
        // three rows under the group it belongs in had to be walked there one
        // arrow at a time. Where there is more than one answer the reader is
        // asked which; see `askJoin` for why the question is not always put.
        const near = joinables(band, this.joined, section.id);
        if (near.length > 0) {
          // WHICH OF THEM WOULD ACTUALLY TAKE IT. The column rule is a fact
          // about the destination as much as about this row, so it decides how
          // many answers there are and therefore whether there is a question.
          const open = near.filter((b) => b.every((x) => this.column.has(x)));
          const target = only(open);
          const name = (b: readonly string[]): string =>
            this.view(b[0])?.label ?? b[0];
          // TWO LABELS FOR ONE BUTTON (4.9 §1), because the click does two
          // things and the old name described neither: "Join above" is about a
          // LIST, and what a reader gets is a group on their page. Three now,
          // and the third is the honest one for a button that opens a dialog:
          // it does not yet know which group, because that is the question.
          let label = "Make a group";
          let title = "Put this section and the one above it in one group, side by side";
          if (open.length > 1) {
            label = "Add to a group";
            title =
              "Put this section in one of this page's groups, as another column — you'll be asked which";
          } else if (target && target.length > 1) {
            label = "Add to group";
            title = `Put this section in the group with “${name(target)}”, as another column`;
          } else if (target) {
            title = `Put this section and “${name(target)}” in one group, side by side`;
          } else if (near[0].length > 1) {
            // Nothing will take it; the refusal below replaces this title. The
            // NAME still has to be right, because that is what a screen reader
            // reads out of a disabled control.
            label = "Add to group";
          }
          // BESIDE ITS OPPOSITE, NOT ACROSS THE ROW FROM IT (4.53.2). Take out
          // of the group went into `lead` one patch ago on the argument that up,
          // down and out are three answers to "where does this row sit". In is
          // the fourth, and it is the same control on the other side of one
          // fact — a row is in a group or it is not, and exactly one of the two
          // icons is ever drawn. Putting them anywhere but the same place would
          // make a reader hunt for the mirror of a button they just used.
          const make = lead.createEl("button", {
            cls: "almanac-tpl-arrow almanac-tpl-join",
            attr: { "aria-label": label, title },
          });
          setIcon(make, "link");
          // A SECTION THAT DRAWS ITS OWN TITLE BAR IS NOT A COLUMN (4.12 §A),
          // and it is DISABLED WITH THE SENTENCE rather than omitted — which is
          // the one place this window departs from "nothing dead is drawn". The
          // page draws nothing at all for this rule: no quarter lights, no
          // notice appears, and a reader who wants to know why has to be told
          // somewhere.
          //
          // AND THE DESTINATION REFUSES IN THE SAME VOICE (4.53.0). A group is
          // made out of two blocks, so a destination that cannot be a column is
          // a join the write declines — and until this release that case drew NO
          // BUTTON AT ALL. The reader saw the control on some rows and not
          // others, with nothing anywhere saying what the difference was, which
          // is the same defect one step along from the one the sentence above
          // was written for.
          make.disabled =
            waiting.length > 0 ||
            !this.column.has(section.id) ||
            open.length === 0;
          // A SECTION THAT IS NOT BEING ADDED YET CANNOT BE PUT ANYWHERE, and
          // says so in its own words rather than in the column rule's. A row
          // with an open question contributes no `add` op, so it is not in the
          // file `readCaps` reads — which used to leave it wearing the sentence
          // about title bars, a true statement about some other section.
          if (waiting.length > 0) {
            make.title = `Choose ${waiting[0].label} first — this section isn't being added yet, so there is nothing to group.`;
          } else if (!this.column.has(section.id)) {
            make.title =
              "This section draws its own title bar, so it can't be a column of a group — a group's columns each carry their own head. Add the widget on its own instead.";
          } else if (open.length === 0) {
            // NAMED, AND THE NAME COMES FROM THE NEAREST ONE. With several
            // destinations all refusing, one example plus "every" is the
            // shortest true sentence; with one, the old wording stands, because
            // "every block" reads as evasive when there is only the one.
            const stuck = near.flatMap((b) =>
              b.filter((x) => !this.column.has(x))
            );
            const who = this.view(stuck[0])?.label ?? stuck[0];
            make.title =
              near.length > 1
                ? `Every group here has a section that draws its own title bar — “${who}” is one — so none of them can hold a column beside it.`
                : `“${who}” draws its own title bar, so it can't hold a column beside it. Move this section under a plain widget instead.`;
          }
          make.addEventListener("click", () => {
            void this.askJoin(band, section.id, open);
          });
        }
      }
    }

    if (refusal) return;

    const toggle = actions.createEl("button", {
      cls: "almanac-tpl-toggle",
      text: gone ? "Keep" : "Remove",
    });
    toggle.addEventListener("click", () => {
      if (gone) this.removed.delete(section.id);
      else this.removed.add(section.id);
      this.refreshFrame();
    });
  }

  // Which group this row is joining, asked only when there is more than one.
  //
  // `only` FIRST, AND IT IS THE RULE IN `modals.ts` AND NOT A SHORTCUT. That
  // block draws the line at whether the choice IS the request or is bookkeeping
  // for it: "add which section" must always ask, because the section is the
  // substance; "which folder" with one folder must not, because it is a
  // keystroke charged for nothing. This is the second kind. The reader pressed
  // a button on a specific row that means "put this in a group", and with one
  // destination the page has already answered — a dialog there would be a
  // question whose answer was on screen before it opened. It is also what keeps
  // the ordinary page, where the only destination is the block above, at the
  // one press it has always been.
  //
  // NOTHING IS WRITTEN BY THIS. It settles an arrangement like every other
  // control here; Save is still the only thing that touches the file, so a
  // reader who picks the wrong group has the same undo they had before — Cancel.
  private async askJoin(
    band: string[],
    id: string,
    targets: string[][]
  ): Promise<void> {
    const pick =
      only(targets) ??
      (await promptChoice(
        this.app,
        targets,
        (b) => this.joinLabel(b),
        "Add this section to which group?"
      ));
    if (!pick) return;
    // THE ARRANGEMENT IS READ AFTER THE AWAIT, not captured before it. The
    // window stays live while the dialog is open, and a `band` computed a
    // moment ago is a list, not a promise about the arrangement it came from.
    // `joinInto` re-derives the blocks and returns null if the row is no longer
    // a block of one — so a stale answer settles nothing rather than something
    // wrong.
    this.settle(joinInto(this.arrangement, band, id, pick[0]));
  }

  // How a destination reads in that dialog: what it is made of, and what
  // joining it does. "Diary + Go to" is a group the reader can find on the
  // page by looking at it, where "the group above Tasks" is a description they
  // would have to resolve — and the two verbs are kept apart because arriving
  // in a group of three and inventing a group of two are different outcomes.
  private joinLabel(block: readonly string[]): string {
    const names = block.map((id) => this.view(id)?.label ?? id).join(" + ");
    return block.length > 1
      ? `Add to the group: ${names}`
      : `Make a new group with: ${names}`;
  }

  // The control a section that asks something gets, beside its row.
  //
  // WHAT THIS WINDOW KNOWS ABOUT IT: that there is a question, what it is
  // called, and what may be answered. Not what the key means, not what the
  // answer will be written into, not which surface asked. It puts a string
  // under a string and hands both to the model — which is the same amount this
  // window has always known about `group`, and it is deliberate that adding the
  // first configurable section to any catalogue needed no branch here.
  //
  // A DROPDOWN RATHER THAN A PROMPT. Every value is a thing the vault already
  // defines, so there is a list; a free-text field would let a reader type a
  // kind that does not exist and find out at render time, which is the failure
  // the whole "refuse by listing the alternatives" rule exists to avoid. It
  // also sits in the row, so the answer is beside the thing it answers for
  // rather than behind a second modal.
  //
  // IN `actions`, NOT `lead`. `lead` is for controls that act on the row's
  // POSITION — that is list-row.ts's rule and the reason the arrows are there.
  // This acts on the thing the row describes, which is the other slot.
  //
  // ON A SECTION ALREADY IN THE FILE IT USED TO BE INERT, and said why:
  //
  //   The answer is in the directive line, the directive line is copied out
  //   verbatim on Save, and this window cannot read it.
  //
  // That was the right refusal for as long as it was true. 3.15 makes it false:
  // a question now names the directive its answer is written into
  // (`SectionQuestion.directive`), `core/directive-grammar.ts` finds the span,
  // and the control is seeded from the reader's own line. So the affordance now
  // has the capability behind it, which is 3.0 patch 1's rule satisfied rather
  // than waived — and where it does NOT (a question with no `directive`, a
  // folder question on a surface with no host folder) the old label is exactly
  // what still gets drawn.
  private renderQuestions(host: HTMLElement, section: SectionView): void {
    const questions = section.questions ?? [];
    if (!questions.length) return;
    const settled = this.original.includes(section.id);

    // A FIELD IS A LABEL AND A CONTROL (4.15 §2), which is what the row could
    // not afford until the actions had a line of their own.
    //
    // THE PILL IS NOT THIS, AND BOTH STAY. "needs a journal to pull from" says
    // the row is incomplete; "Journal" says what the box is. The first goes away
    // when the box is filled and the second does not, so they are two statements
    // rather than one said twice — which is the test the `count` pill's own rule
    // sets for whether a second label is doubling.
    //
    // SENTENCE CASE OFF `q.label`, NOT A SECOND STRING. `label` is written as a
    // noun phrase to sit inside a sentence — "a journal to pull from" — and the
    // field name is its head word. Taking it here rather than adding a
    // `fieldLabel` to `SectionQuestionCommon` keeps the catalogues writing one
    // string: a second would drift from the first, and this window is the only
    // place both would be read.
    const field = (q: SectionQuestion): HTMLElement => {
      const wrap = host.createDiv({ cls: "almanac-tpl-field" });
      wrap.createSpan({
        cls: "almanac-tpl-field-label",
        text: fieldLabelOf(q),
      });
      return wrap;
    };

    for (const q of questions) {
      // A settled section whose answer cannot be read back keeps the wording it
      // has had since 3.8. The route it names still works.
      if (settled && !this.readable(section, q)) {
        const note = host.createSpan({
          cls: "almanac-tpl-choice-fixed",
          text: q.settled?.text ?? "set when added",
        });
        note.title =
          q.settled?.hint ??
          `This section's choice of ${q.label} is written into the note. Remove it, save, then add it again to change it.`;
        continue;
      }
      if (q.kind === "folder") {
        this.renderFolderQuestion(field(q), section, q);
        continue;
      }
      if (q.kind === "title") {
        this.renderTitleQuestion(field(q), section, q);
        continue;
      }
      if (q.kind === "form") {
        this.renderFormQuestion(field(q), section, q);
        continue;
      }
      // NOTHING TO CHOOSE FROM IS A SENTENCE, NOT AN EMPTY MENU. A dropdown
      // with no entries is a control that looks broken; the catalogue supplied
      // wording for this case precisely so the reader is told what is missing
      // and where to get it.
      if (!q.values.length) {
        host.createSpan({ cls: "almanac-tpl-choice-empty", text: q.empty });
        continue;
      }
      const select = field(q).createEl("select", { cls: "almanac-tpl-choice" });
      select.setAttribute("aria-label", `Choose ${q.label}`);
      // THE PLACEHOLDER NAMES ITS QUESTION AGAIN (4.15 §2), and the reason it
      // stopped is worth keeping rather than deleting:
      //
      //   Spelling it out inside a <select> made a 26-character placeholder in a
      //   slot sharing its row with two arrows and a Remove button, and it
      //   rendered as "Choose a journal to p" — a control whose visible text is
      //   a truncated fragment of a question answered in full beside it.
      //
      // That was true of the slot it had. The control now sits on a line of its
      // own under a field label, so the phrase can be measured rather than only
      // read — which is what the note about `aria-label` was standing in for.
      // THE FIRST ROW IS A PROMPT OR AN ANSWER, AND `emptyLabel` DECIDES WHICH
      // (4.46). A choice with no working empty state must not be left unpicked,
      // so its first row is a disabled prompt and `questionIsRequired` holds the
      // section back until the reader answers. A choice that NAMES its empty
      // state has an answer already — a bare `stats-band` draws the scope's own
      // preset — so the row is selectable and says what it does, which is the
      // same treatment `renderFolderQuestion` gives a placeholder.
      const none = select.createEl("option", {
        text: q.emptyLabel ? `${q.emptyLabel} (default)` : `Choose ${q.label}…`,
        value: "",
      });
      select.title = `Choose ${q.label}`;
      none.disabled = q.emptyLabel === undefined;
      // SEEDED FROM THE FILE ON A SETTLED SECTION, which is the whole of patch
      // 5 on this control: the answer is in their note, this window can now
      // read it, so it shows what they chose rather than "Choose…" over an
      // answer that already exists.
      const current = this.shownAnswer(section, q);
      none.selected = !current;
      for (const v of q.values) {
        const opt = select.createEl("option", { text: v.label, value: v.value });
        opt.selected = current === v.value;
      }
      select.addEventListener("change", () => {
        this.answer(section.id, q.key, select.value || undefined);
        // A repaint rather than a local update, because answering the last
        // open question turns this row into an `add`: the pill, the footer
        // count, the Changes tab and the Markdown pane all move together, and
        // the one that must not lag is the count on the button they press.
        this.refreshFrame();
      });
    }
  }

  // The folder field, and Obsidian's type-ahead over it.
  //
  // A TEXT INPUT RATHER THAN A DROPDOWN (§3.1): a vault's folder list is
  // unbounded and mostly irrelevant, the default is a rule rather than a folder
  // name and has nowhere in a list to sit, and a folder that does not exist yet
  // has to be typeable by a reader scaffolding a vault.
  //
  // THE PLACEHOLDER CARRIES THE DEFAULT, because empty is the one answer the
  // control cannot show. It is kept SHORT and the resolved path goes on the
  // title and the aria-label — the argument the `<select>` above already had to
  // make, where a 26-character placeholder rendered as a truncated fragment of
  // a question answered in full two lines above it. This slot is no wider.
  // A free-text title, written into the section's `header:` argument. 3.18 §3.
  //
  // PLACEHOLDER, NEVER PRE-FILLED. Empty means "the catalogue's own heading",
  // which is what every shipped template carries — so seeding the box with that
  // heading would write it into the note as though the reader had chosen it,
  // and a later change of default could never reach a file again. The
  // placeholder says what empty gets you; the box says what you asked for.
  //
  // COMMITS ON `change`, NOT ON EVERY KEYSTROKE. `answer()` triggers a repaint
  // of the frame, and repainting under the cursor moves the field being typed
  // into — the same reason the folder control commits the way it does.
  private renderTitleQuestion(
    host: HTMLElement,
    section: SectionView,
    q: TitleQuestion
  ): void {
    const input = host.createEl("input", {
      type: "text",
      cls: "almanac-tpl-title-input",
    });
    input.placeholder = q.placeholder;
    input.setAttribute("aria-label", `Set ${q.label}`);
    input.title = `Set ${q.label}. Leave empty for “${q.placeholder}”.`;
    input.value = this.shownAnswer(section, q) ?? "";
    input.addEventListener("change", () => {
      this.answer(section.id, q.key, input.value.trim() || undefined);
      this.refreshFrame();
    });
  }

  // The section/widget toggle. 4.59.0.
  //
  // A CHECKBOX RATHER THAN A `<select>`, which is the one place this question
  // departs from the three beside it. Those pick a value out of a list the vault
  // supplies and have a meaningful unanswered state; this has two answers, one
  // of which is what every catalogue composes, so it is a thing that is either
  // on or off. The label says what ticking it DOES rather than naming both
  // sides, for the reason the folder box's placeholder states its default: a
  // control that describes its own effect needs no legend.
  //
  // THE SENTENCE UNDER IT IS THE POINT, not decoration. "So it can sit in a row
  // beside another block" is the only reason a reader would want this, and it is
  // not guessable from a bar disappearing — `isSectionFence` refuses a fence
  // that titles itself as a column of a group, and nothing in this window would
  // otherwise say so.
  private renderFormQuestion(
    host: HTMLElement,
    section: SectionView,
    q: FormQuestion
  ): void {
    const wrap = host.createDiv({ cls: "almanac-tpl-form" });
    const box = wrap.createEl("input", {
      type: "checkbox",
      cls: "almanac-tpl-form-box",
    });
    const id = `almanac-form-${section.id.replace(/[^a-z0-9]+/gi, "-")}`;
    box.id = id;
    const label = wrap.createEl("label", {
      cls: "almanac-tpl-form-label",
      text: q.widget,
    });
    label.htmlFor = id;
    // UNANSWERED READS AS A SECTION, which is what the catalogue composes and
    // what every note written before this release holds. `shownAnswer` returns
    // the empty string for a section the window has not read, and the empty
    // string is not `WIDGET_FORM`.
    box.checked = this.shownAnswer(section, q) === WIDGET_FORM;
    box.title = box.checked ? q.section : q.widget;
    box.setAttribute("aria-label", q.widget);
    box.addEventListener("change", () => {
      this.answer(section.id, q.key, box.checked ? WIDGET_FORM : SECTION_FORM);
      this.refreshFrame();
    });
  }

  private renderFolderQuestion(
    host: HTMLElement,
    section: SectionView,
    q: FolderQuestion
  ): void {
    const current = this.shownAnswer(section, q);
    const input = host.createEl("input", {
      cls: "almanac-tpl-folder",
      type: "text",
    });
    input.value = current;
    // WHAT EMPTY MEANS IS THE CATALOGUE'S TO SAY, not this window's. 4.16.1: the
    // hard-coded wording below was right for every folder question but one, and
    // wrong for the one — `level-index`'s second piece falls back to the journal
    // its first piece names, so a box promising "This note's folder" described a
    // rule it does not follow. `emptyLabel` is the model saying otherwise, and
    // its absence is the ordinary case spelled exactly as it was.
    input.placeholder = q.emptyLabel ?? "This note's folder";
    const resolved = q.hostFolder ? q.hostFolder : "the vault root";
    const empty = q.emptyLabel ?? `this note's own folder (${resolved})`;
    input.title = `${q.label} — leave empty for ${empty}`;
    input.setAttribute("aria-label", `${q.label}, empty for ${empty}`);
    new ArgSuggest(this.app, input, q.keywords ?? [], (value) => {
      this.answer(section.id, q.key, value);
      this.refreshFrame();
    });
    // ON `change`, NOT ON `input`. Every keystroke is not an answer: repainting
    // the frame under a cursor moves the field the reader is typing into, and
    // the plan would name a folder half-spelled. Blur and Enter both fire this.
    input.addEventListener("change", () => {
      this.answer(section.id, q.key, input.value.trim());
      this.refreshFrame();
    });
  }

  // Record an answer, and remember that this window is the one that changed it.
  //
  // THE DIRTY SET IS THE WHOLE OF §2.3's MECHANISM. The rule — a directive line
  // is re-rendered only when its section's answers changed HERE — needs
  // something to carry "here", and the tempting carrier is a comparison: render
  // what the catalogue would write, compare it to the file, rewrite on
  // difference. That makes the editor a formatter. It would "fix" a reader's
  // spacing, their label, their hand-typed folder — every line the catalogue
  // would have spelled differently — and losing a hand edit is the one risk in
  // this release that destroys work rather than annoying somebody.
  //
  // So dirtiness is an INTERACTION. Nothing but a control writes to this set,
  // and a section that is not in it is copied out of the file byte for byte,
  // which is the property `applySections` has had since it was written.
  private answer(id: string, key: string, value: string | undefined): void {
    const next = { ...(this.answers.get(id) ?? {}) };
    if (value === undefined) delete next[key];
    else next[key] = value;
    this.answers.set(id, next);
    this.dirty.add(id);
  }

  // Whether this window can show this question's current answer rather than
  // asserting it can.
  //
  // TWO WAYS TO ANSWER NO, and both are the model's rather than this window's.
  // A question with no `directive` names no line to read the answer out of. A
  // folder question with no `hostFolder` is being asked on a surface with no
  // host — a journal TEMPLATE, composed once and used in every folder of its
  // level — where a path typed here would be written literally into every note
  // made from it afterwards. Neither is a surface test: one field is absent and
  // the other is null, and this window does not know why.
  // THE MODEL'S ANSWER FIRST (4.15 §4). Where the model located the section it
  // can say what that section's own line holds, and it is the only one that
  // can: the read below finds a directive in the whole file and gives up when
  // there are two, which is correct for this window and wrong for a widget a
  // page may hold several of — every card would lose its selector as soon as a
  // second one existed.
  private readable(section: SectionView, q: SectionQuestion): boolean {
    if (!q.directive) return false;
    if (q.kind === "folder" && q.hostFolder == null) return false;
    if (section.answered?.[q.key] !== undefined) return true;
    return this.answerIn(q) !== null;
  }

  // What the control should be showing: what the reader has said in this
  // window, else what their file already says, else nothing.
  //
  // READING THE FILE IS NOT ANSWERING IT. Seeding a control does not put the
  // section in `dirty`, so a reader who opens the window, looks at the folder
  // their note names and closes it again has changed nothing — and the plan
  // says so, because the plan is built from `want` and `want` only carries
  // options for rows this window touched.
  private shownAnswer(section: SectionView, q: SectionQuestion): string {
    const held = this.answers.get(section.id)?.[q.key];
    if (typeof held === "string") return held;
    if (!this.original.includes(section.id)) return "";
    // THE MODEL'S READ OF THIS SECTION'S OWN LINE, where it has one. See
    // `readable` — the whole-file read below cannot tell two cards apart.
    return section.answered?.[q.key] ?? this.answerIn(q) ?? "";
  }

  // What the file already says for this question, or null when the directive it
  // names is not in the file — or is in it more than once.
  //
  // OVER THE WHOLE TEXT RATHER THAN THE SECTION'S OWN LINES, because this
  // window has the file and not the section's extent — `present()` returns ids
  // and the runs are the catalogue's. It is only ever READ here; the write goes
  // through `apply`, which does hold the section's lines and splices inside
  // them.
  //
  // AMBIGUITY IS AN ABSENT ANSWER, NOT THE FIRST ONE (3.18 follow-ups §2). The
  // justification above used to end "that is safe … because a content directive
  // is unique per note", and 3.18 introduced the first question naming a
  // directive that is not: `header:` is structural and repeats once per section.
  // Study's Topic index carries six, so `argSpanIn` handed the Task Manager's
  // box and the Resources box the same value — the first header in the file —
  // and this window drew a control over another section's title, whose write
  // would then commit somewhere other than where it was read from.
  //
  // `soleArgSpanIn` states the rule the seam actually needs, and it is a
  // narrowing rather than a surface test: this window still does not know what
  // a header is, what a title means, or which catalogue asked. It knows that an
  // answer it cannot tell apart from another section's is one it must not
  // claim to have read — and `readable()` therefore falls back to the honest
  // wording exactly where the ambiguity is real.
  //
  // THE READ ITSELF MOVED TO `section-model.ts` IN 4.29, and this is now the
  // one-line caller. A second reader arrived — saving a page as a grain's
  // default template has to carry the same answers — and two spellings of "what
  // does this file already say" would be two chances to get the ambiguity rule
  // wrong. The rule above is the one being shared.
  private answerIn(q: SectionQuestion): string | null {
    return answerInText(this.spec.text, q);
  }

  // What an arrow is about to do, in the reader's words.
  //
  // WRITTEN BEFORE THE PRESS, NOT DISCOVERED AFTER IT. This is the whole reason
  // the release is not just a bug fix: a row below a group and a row below a row
  // wore the same two chevrons and the same "Move up", and did two very
  // different things. Saying which is what lets a reader predict a list that has
  // groups in it — and the sentence is available only because `unit` is decided
  // before the button is drawn rather than inside the handler.
  private moveLabel(
    band: readonly string[],
    id: string,
    unit: MoveUnit,
    delta: number
  ): string {
    const where = delta < 0 ? "up" : "down";
    // A row in no band — fixed, or on its way out — gets the plain words. It has
    // no neighbours to name and no rule to explain; the reason it cannot move is
    // in its own subtitle or in the strike through its title.
    if (!band.includes(id)) return delta < 0 ? "Move up" : "Move down";
    if (!canMoveRow(band, this.joined, id, delta)) {
      return unit === "cell"
        ? `This is the ${delta < 0 ? "first" : "last"} column of its group`
        : `Nothing to move ${where} past`;
    }
    if (unit === "cell") return `Move ${where} inside the group`;
    // WHAT IT IS ABOUT TO STEP OVER. A group is one block, so a row below one
    // moves past the whole of it in a single press — which is the behaviour the
    // report asked for and the one a reader will not expect unless told.
    const blocks = blocksOf(band, this.joined);
    const at = blocks.findIndex((b) => b.includes(id));
    const past = blocks[at + delta];
    if (past && past.length > 1) return `Move ${where} past the group`;
    const label = past ? this.view(past[0])?.label : undefined;
    return label ? `Move ${where} past ${label}` : `Move ${where}`;
  }

  // Drag to reorder — direct manipulation, and STILL PLANNED MANIPULATION.
  //
  // §3 of the plan says this explicitly and it is the thing most easily lost:
  // drag-and-drop that writes on drop is the natural thing to build and it
  // removes the preview. Nothing here writes. A drag reorders a list in the
  // modal, the summary re-reads, and the reader can drag six times and change
  // their mind before pressing Save.
  //
  // AND IT CARRIES ITS SCOPE (4.53.0). A cell of a group and a block of the list
  // are two different things to pick up, so they are two different drags: the
  // group's bar lifts the group, a cell lifts itself, and a cell may land only
  // among its own group's cells. Until this release every drag was over the flat
  // list of rows, so dropping anything anywhere could land it in the middle of
  // somebody's group — and the arrangement that came back was whatever the
  // leftover bits happened to describe.
  private attachDrag(
    el: HTMLElement,
    id: string,
    scope: MoveUnit,
    // WHAT LIGHTS UP, where that is not what you grabbed. A group is picked up
    // by its bar and it is the CARD that should fade — the object being moved is
    // the whole block, and a bar that dimmed on its own would say the reader was
    // dragging a title.
    mark: HTMLElement = el
  ): void {
    // `bandOf` already makes a fixed row an impossible drop, so the drag would
    // fail on release rather than be accepted. That is one failure too late:
    // `draggable = true` is a promise the cursor makes before the reader has
    // committed to anything, and letting them lift a row that cannot land is
    // the same class of lie as a refusal that offers a move (3.2 §4).
    //
    // ASKED AS "IS IT IN ITS OWN BAND" (4.53.0), which is one question covering
    // both rows that are not: the immovable one and the one being removed. A
    // second test beside this one would be a second place to forget.
    if (!this.bandOf(id).includes(id)) return;
    el.draggable = true;
    // AND THE LIST SCROLLS WHILE A ROW IS IN THE AIR (4.57). A page with a
    // dozen sections and four groups is taller than the window this draws in,
    // and a native drag stops the scroller dead — so the rows a reader could
    // reach were the ones already on screen. `drag-scroll.ts` reads the same
    // `dragover` the drop targets read and pans the modal's own scroller.
    let stopPan: (() => void) | null = null;
    el.addEventListener("dragstart", (e) => {
      this.dragging = { id, scope };
      mark.addClass("is-dragging");
      e.dataTransfer?.setData("text/plain", id);
      stopPan = panDuringDrag(el);
    });
    el.addEventListener("dragend", () => {
      stopPan?.();
      stopPan = null;
      this.dragging = null;
      mark.removeClass("is-dragging");
    });
  }

  // And where it may land.
  //
  // ONE PREDICATE, ASKED TWICE. `dragover` decides whether this is a drop target
  // at all — no `preventDefault`, no drop, so the gesture reports "no" the way
  // every other drag does rather than accepting the drop and then explaining
  // itself — and `drop` asks again rather than trusting that dragover ran. A
  // rule enforced in one of two paths is a rule with a way round it.
  private attachDrop(
    el: HTMLElement,
    id: string,
    scope: MoveUnit,
    mark: HTMLElement = el
  ): void {
    if (!this.bandOf(id).includes(id)) return;
    el.addEventListener("dragover", (e) => {
      if (!this.accepts(id, scope)) return;
      e.preventDefault();
      mark.addClass("is-drop-target");
    });
    el.addEventListener("dragleave", () => mark.removeClass("is-drop-target"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      mark.removeClass("is-drop-target");
      const drag = this.dragging;
      this.dragging = null;
      if (!drag || !this.accepts(id, scope)) return;
      const band = this.bandOf(id);
      // Lifted out and re-inserted at the target's slot, so dragging three
      // places up moves it three places rather than swapping it with whatever
      // happened to be there — `dropOnto`'s rule, over cells or over blocks
      // depending on what was picked up.
      this.settle(
        scope === "cell"
          ? dropCell(this.arrangement, band, drag.id, id)
          : dropBlock(this.arrangement, band, drag.id, id)
      );
    });
  }

  // Whether what is being dragged may land here.
  //
  // THREE QUESTIONS, AND THE BAND IS STILL THE FIRST OF THEM. A row in another
  // band is not a target, which is the rule 3.2 §4 states and the one an
  // immovable row is excluded by. What 4.53.0 adds is the other two: a drag
  // knows what it picked up, and a cell drop must stay inside the group it
  // started in.
  private accepts(onto: string, scope: MoveUnit): boolean {
    const drag = this.dragging;
    if (!drag || drag.id === onto || drag.scope !== scope) return false;
    if (!this.bandOf(onto).includes(drag.id)) return false;
    if (scope !== "cell") return true;
    return blockOf(this.bandOf(onto), this.joined, onto).includes(drag.id);
  }

  private renderAdd(host: HTMLElement): void {
    // A WIDGET STAYS OFFERED, A SECTION DOES NOT (4.15 §4, every widget as of
    // 4.56). A section drops out of this list the moment it is staged, because
    // there is one of it and the reader has it — a second copy would claim the
    // first one's region and overwrite it. A widget renders and remembers
    // nothing, so "you already added this" is not a reason to stop offering
    // another. The flag is the model's, so this window still does not know what
    // makes one.
    const absent = this.model
      .addable(this.spec.text)
      .filter((s) => s.repeatable || !this.rows.includes(s.id));
    if (!absent.length) return;

    // THE CATALOGUE'S OWN SECTIONS FIRST, THEN THE WIDGETS (4.12 §C).
    //
    // A PAGE OFFERS TWO OR THREE OF ITS OWN AND ABOUT TWENTY-FIVE WIDGETS, and a
    // flat list of twenty-eight buries the two the page was designed around under
    // an alphabet of things it merely permits.
    //
    // PARTITIONED ON THE ID, WHICH IS THE ONE THING THIS WINDOW LEARNS ABOUT
    // KINDS. It is a real departure from `SectionView`'s discipline and it is the
    // smallest available one: the predicate is imported from the model layer
    // rather than spelled here, the way `questionIsRequired` and `optionsFor`
    // already are, so the rule has one home and this file does not know what
    // makes an id a widget. The alternative was a `family` field on
    // `SectionView` that three of the four models would never set.
    const own = absent.filter((s) => !isPageWidgetId(s.id));
    const widgets = absent.filter((s) => isPageWidgetId(s.id));

    // A SUGGESTER, NOT A `<select>` (4.15 §3).
    //
    // WHAT THE `<select>` COULD NOT DO IS DRAW THE SENTENCE. Every section
    // carries a `blurb` — one line saying what it puts on the page, in the
    // reader's words — and `WidgetSpec.blurb`'s own comment says it is written
    // for `DetailedChoice.description` and for the row. This control showed
    // neither: twenty-eight entries of glyph and label, where "Entry rollup",
    // "Entry timeline" and "Period recap" are three names for things a reader
    // has no way to tell apart.
    //
    // IT WAS ADEQUATE WHEN IT WAS WRITTEN and stopped being so without being
    // touched. It was a list of the two or three sections a catalogue declared;
    // 4.12 §C made every page widget addable and multiplied it by ten, and the
    // partition above was added in that release to cope — a label over a list
    // that had outgrown the control it was in.
    //
    // AND `addSectionHere` HAS SHOWN THE BLURB ALL ALONG, through this exact
    // modal, searching it too. `section-insert.ts` states the rule that makes
    // that a defect rather than a difference: "One command knowing something
    // its neighbour does not is the drift that keeps costing a release." Two
    // routes to one write now use one control.
    const row = host.createDiv({ cls: "almanac-tpl-add" });
    const button = row.createEl("button", { text: "Add a section…" });
    button.addEventListener("click", () => {
      void this.promptAdd([...own, ...widgets], widgets.length > 0);
    });
  }

  // The add prompt, and where what it returns lands.
  private async promptAdd(
    choices: readonly SectionView[],
    grouped: boolean
  ): Promise<void> {
    const chosen = await promptDetailedSuggester(
      this.app,
      choices.map((s) => ({
        value: s.id,
        label: `${s.icon} ${s.label}`,
        description: s.blurb,
        // THE HEADING ONLY WHERE THERE IS SOMETHING TO SEPARATE. A page whose
        // widgets are all present already offers its own sections alone, and
        // "Sections" over an undivided list names a distinction that is not on
        // screen.
        ...(grouped
          ? { group: isPageWidgetId(s.id) ? "Widgets" : "Sections" }
          : {}),
      })),
      "Add a section…"
    );
    if (!chosen) return;
    // THE ID TO STAGE IS THE MODEL'S TO SAY (4.15 §4). For a repeatable widget
    // the offered id is whichever instance was free when the list was built, and
    // a reader adding a third card in one session has already claimed it — so
    // the model is asked for one nothing holds, given what this window holds.
    // The window never learns how an instance id is spelled.
    const view = this.model
      .addable(this.spec.text)
      .find((s) => s.id === chosen);
    const id =
      view?.repeatable && this.model.instanceOf
        ? this.model.instanceOf(chosen, this.spec.text, this.rows)
        : chosen;
    // Appended to the END OF ITS OWN BAND, then nudgeable. Guessing a
    // position from the catalogue would be right often enough to be annoying
    // when it wasn't, and the reader is two clicks from where they want it —
    // but a new section still has to land on the correct side of the rule,
    // and its band is the only thing that says which that is.
    const band = this.view(id)?.group ?? null;
    const last = this.rows
      .map((row, i) => ({ i, g: this.view(row)?.group ?? null }))
      .filter((r) => r.g === band)
      .pop();
    const at = last ? last.i + 1 : this.rows.length;
    this.rows = [...this.rows.slice(0, at), id, ...this.rows.slice(at)];
    this.refreshFrame();
  }

  // ── the panes ─────────────────────────────────────────────────────────

  private renderChanges(pane: HTMLElement): void {
    const ops = this.ops();
    if (!ops.some((o) => o.kind !== "keep")) {
      pane.createDiv({
        cls: "almanac-tpl-empty",
        text: "No changes — this file already has exactly these sections.",
      });
    }
    for (const op of ops) {
      const row = pane.createDiv({
        cls: `almanac-tpl-op almanac-tpl-op-${op.kind}`,
      });
      const mark =
        op.kind === "add"
          ? "＋"
          : op.kind === "remove"
            ? "－"
            : op.kind === "move"
              ? "↕"
              : op.kind === "extend"
                ? "⊕"
                : op.kind === "regroup"
                  ? "▥"
                  : op.kind === "foreign"
                    ? "⚠"
                    : "";
      row.createSpan({ cls: "almanac-tpl-op-mark", text: mark });
      row.createSpan({ cls: "almanac-tpl-op-label", text: op.label });
      row.createSpan({ cls: "almanac-tpl-op-detail", text: op.detail });
    }
  }

  private renderMarkdown(pane: HTMLElement): void {
    // The bytes, and it cannot fire a button. A live rendered preview would
    // need every widget's action stubbed — a second render path through
    // widgets.ts, which is a parallel implementation of the thing being
    // previewed.
    const next = this.model.apply(this.spec.text, this.want);
    pane.createEl("pre", {
      cls: "almanac-editor-mono almanac-tpl-md",
      text: next ?? this.spec.text,
    });
  }

  private renderLayout(pane: HTMLElement): void {
    let band: string | null | undefined;
    // IDS, because this pane draws the SHAPE of the note — which blocks, in
    // which bands, in which order — and an answer changes what a block says
    // rather than whether it is there or where it sits.
    //
    // AND A ROW IS DRAWN AS ONE, side by side (4.8 §2). This pane's whole job
    // is the shape, and a block holding three widgets across the page drawn as
    // three stacked bars is the one thing on screen that would still be lying
    // about it.
    for (const group of this.groupsOf(idsOf(this.want))) {
      const first = this.view(group[0]);
      if (!first) continue;
      if (first.group !== undefined && first.group !== band) {
        band = first.group;
        if (band) pane.createDiv({ cls: "almanac-tpl-band", text: band });
      }
      const host =
        group.length > 1
          ? pane.createDiv({ cls: "almanac-wizard-row" })
          : pane;
      for (const id of group) {
        const s = this.view(id);
        if (!s) continue;
        const block = host.createDiv({ cls: "almanac-wizard-block" });
        block.createSpan({ cls: "almanac-wizard-block-icon", text: s.icon });
        block.createSpan({ cls: "almanac-wizard-block-label", text: s.label });
      }
    }
  }

  // ── footer ────────────────────────────────────────────────────────────

  protected renderFooter(footer: HTMLElement): void {
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());

    // SAVE THE ARRANGEMENT — what is on screen, kept under a name.
    //
    // The one place an arrangement is persisted, and the reason it is allowed
    // to be: it is a recipe for a note that does not exist yet, so there is no
    // file to be the record. Once that file has been written, it is the truth
    // and this window edits it like any other. The stored arrangement is only
    // ever the seed.
    //
    // Reads the rows rather than the file, so a reader can arrange, save the
    // arrangement under a name, and leave this file untouched — which is the
    // common case: you want the variant, not the change.
    const sink = this.spec.arrangement;
    if (sink) {
      const b = footer.createEl("button", { text: sink.buttonLabel });
      b.addEventListener("click", () => void this.saveArrangement(sink));
    }

    const n = this.changeCount();
    const save = footer.createEl("button", {
      text: n === 0 ? "No changes" : `Save ${n} change${n === 1 ? "" : "s"}`,
      cls: "mod-cta",
    });
    save.disabled = n === 0;
    save.addEventListener("click", () => void this.trySubmit());
  }

  private async saveArrangement(sink: ArrangementSink): Promise<void> {
    // THE NAME AND WHERE IT APPLIES ARE ONE DECISION, so they are one window —
    // `promptNewNote`'s rule, and the reason this is not a name prompt followed
    // by a second modal a reader can cancel half-way through. With one target
    // the kind list is not drawn and this is the name prompt it has always been.
    const targets = sink.targets ?? [];
    const origin = sink.originTarget ?? targets[0]?.id ?? "";
    const details = await promptLayoutSave(
      this.app,
      sink.promptTitle,
      sink.promptPlaceholder,
      targets,
      origin
    );
    const label = details?.label;
    if (!label?.trim()) return;
    // IDS, NOT CHOICES, and `ArrangementSink.save` still says so in its type.
    // An arrangement is a recipe for a note that does not exist yet and is
    // named by ids for the reason `SectionChoice`'s header gives: an id is
    // stable and its options are not part of it, so a stored arrangement must
    // not start disagreeing with the catalogue the day a reader renames a
    // journal kind. The one surface with a sink is the journals', whose
    // sections ask nothing — so nothing is dropped here today, and the day one
    // does, the honest thing is to widen the sink rather than to have this
    // window quietly store half an answer.
    await sink.save(label.trim(), idsOf(this.want), details!.kinds);
    this.close();
  }

  protected validate(): string | null {
    return this.changeCount() === 0 ? "Nothing to save." : null;
  }

  protected async commit(): Promise<void> {
    // RE-READ, rather than writing back the copy taken when the window opened.
    // section-insert.ts learned this one first: "a suggester is modal but not
    // instantaneous, and writing a stale body back would silently drop anything
    // that arrived from sync in between". A window a reader can leave open is a
    // much longer gap than a suggester — and on a diary entry the thing that
    // would be dropped is a day's writing.
    const current = await this.app.vault.read(this.spec.file);
    if (current !== this.spec.text) {
      new Notice(
        "Almanac: this file changed while the window was open — nothing was written. Reopen it to see the current sections."
      );
      return;
    }

    const next = this.model.apply(current, this.want);
    // THE SECTIONS FIRST, THEN THE BLOCKS THEY SIT IN. 4.8 §2.3.
    //
    // Two passes over the text rather than one operation that does both, and
    // that is the design rather than a compromise. `apply` decides WHICH
    // sections the note has and in what order, over whole blocks; `regroup`
    // decides which of them share a block, by moving lines between the blocks
    // `apply` left behind. Neither knows about the other, both return null for
    // "nothing to do", and each is a reconciler on its own.
    //
    // ONE WRITE. The reader pressed Save once.
    const base = next ?? current;
    const regrouped = this.hasRows
      ? this.model.regroup?.(
          base,
          this.groupsOf(idsOf(this.want)),
          this.pageBreaks(idsOf(this.want))
        ) ?? null
      : null;
    const final = regrouped ?? next;
    if (final === null) {
      new Notice("Almanac: nothing to change.");
      return;
    }

    await this.app.vault.modify(this.spec.file, final);

    const kept = this.ops().flatMap((o) => o.keepsContent ?? []);
    const keptLines = kept.reduce((n, k) => n + k.lines, 0);
    new Notice(
      keptLines > 0
        ? `Almanac: ${this.spec.file.basename} updated — kept ${keptLines} line${
            keptLines === 1 ? "" : "s"
          } of your text ✅`
        : `Almanac: ${this.spec.file.basename} updated ✅`
    );
    this.spec.onSaved?.();
  }
}

// Open the editor on a file whose model the caller has already resolved.
//
// Returns false when the path is not a file, so the caller can say so in its
// own words — the refusal a command owes a reader is longer than the one a
// settings row does, and neither of them is this function's to write.
export async function openSectionEditor(
  app: App,
  plugin: AlmanacPlugin,
  path: string,
  spec: Omit<SectionEditorSpec, "file" | "text">
): Promise<boolean> {
  const file = getFile(app, path);
  if (!file) return false;
  const text = await app.vault.read(file as TFile);
  new SectionEditorModal(app, plugin, {
    ...spec,
    file: file as TFile,
    text,
  }).open();
  return true;
}
