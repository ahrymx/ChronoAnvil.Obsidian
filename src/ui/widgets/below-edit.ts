// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The foot of the *What's below* card, and the mode it can be put into. 1.0.14.
//
// ── ONE WRAPPER, WHICH MAKES 1.0.12 SMALLER RATHER THAN LONGER ───────────
//
// `+ Add note type` was a direct child of `.ca-journal-widget-block`, styled as
// one, and 1.0.12's reveal claims it BY NAME in two places because it is the one
// child of that card no directive drew and therefore carries no `data-ca-line`
// stamp. A second loose sibling would mean two names in both of those places, two
// direct-child CSS rules, and a third of each the next time the foot grows a
// control — which is the defect 1.0.12 shipped a patch for, re-armed structurally.
//
// So the foot is a `div` that holds them. The reveal claims the wrapper, the
// chevron folds the whole foot away including the picking bar, and the controller
// below never has to know the reveal exists.
//
// AND THEY HAVE TO BE BESIDE EACH OTHER ANYWAY. Two block-level children of the
// block stack; a row needs a flex parent. The wrapper is not a tidiness.
//
// ── WHERE THE FOOT APPEARS, AND WHY NOT ON A `level-index` ───────────────
//
// Exactly where `+ Add note type` appears: a fence carrying a `kind-table:` line.
// A `level-index` card draws kind tables at its deepest level (`buildLevelIndex`
// calls `kindTable` per kind) and has never carried the add row, because
// `hasKindTable` reads the LINES and a `level-index` fence has no `kind-table:`
// line in it.
//
// THAT BOUNDARY IS INHERITED, NOT CHOSEN HERE, and it is one boundary rather than
// two: widening the foot to `level-index` would put `+ Add note type` on those
// cards as well, which is a change to an existing control nobody asked for. The
// two travel together or not at all, and that is the honest way to leave it —
// stated here so the next reader does not read it as an oversight.
//
// ── THE MODE IS A CONTROLLER THE BLOCK OWNS, NOT A REGISTRY ──────────────
//
// `reveal.ts` keys its targets by `ctx.sourcePath`, deliberately wider than one
// block so a card rendered after the banner still gets its chevron — and 1.0.12
// has just paid for that width: a registration nothing had cleaned up drew a
// chevron for a section that had left the stack, and the fix was to hand
// `RevealBar` the set its own fence declared.
//
// A SELECTION IS NARROWER THAN A REVEAL IN EVERY WAY. It belongs to one card, one
// render and one reader, and a note can carry two `kind-table` fences — so a
// path-keyed edit registry would let one card's Edit tick the other card's rows.
// The controller is handed its hosts by the dispatcher's own loop, which is
// `named`'s stated rule: *recorded at the append, because that is the only place
// both halves are in hand.*
//
// EPHEMERAL, AND WRITING NOWHERE. `note-regions.ts`' `let isCompact = false` is
// the precedent rather than the four `Record<string, …>` maps in settings: those
// exist for answers a reader would be annoyed to lose across a session, and a
// half-made selection is not one. A note that re-opened with ticks already in it
// would be one stray click from a delete.

import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  TAbstractFile,
  TFile,
  setIcon,
} from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { ROW_NOTE_ATTR, buildAddKindRow } from "../tables";
import { LIVE_REDRAW_EVENT } from "../livewidget";
import { getFile, plural } from "../../core/util";
import { notify } from "../../core/notify";
import { trashClause, trashDestination, trashSeveral } from "../../core/trash";
import { confirmAction, promptDetailedSuggester } from "../modals";
import type { DetailedChoice } from "../modals";
import { isPromotedPath } from "../../journals/page-default";
import { containerFoldersOf, journalTypeAtPath } from "../../journals/journal";
import type { JournalType } from "../../journals/journal";

/** Where a picked set of notes can be sent. */
export type MoveTarget =
  | { kind: "type"; id: string; label: string }
  | { kind: "folder"; path: string };

// ── the foot ─────────────────────────────────────────────────────────────

// Build the card's foot, or nothing where there is nothing to put in it.
//
// NULL WHERE THE ADD ROW IS NULL, which is `buildAddKindRow`'s own refusal: an
// index TEMPLATE carries `kind-table:` lines and lives outside the journals root,
// where neither *add a kind to whatever journal this belongs to* nor *move these
// notes to another index note* is a question the surface can answer. One refusal
// rather than two, so the two controls cannot disagree about whether this note is
// a journal's.
export function buildBelowFoot(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  hosts: readonly HTMLElement[]
): HTMLElement | null {
  const add = buildAddKindRow(plugin, ctx);
  if (!add) return null;
  const type = journalTypeAtPath(plugin, ctx.sourcePath);
  if (!type) return null;

  const foot = createDiv({ cls: "ca-journal-below-foot" });
  foot.appendChild(add);

  const edit = foot.createEl("button", {
    cls: "ca-journal-below-edit",
    attr: { type: "button" },
  });
  // `list-checks` — the glyph vocabulary is fixed and argued in
  // `actions-menu.ts`: `settings` acts on the page, `more-horizontal` is more
  // about a row, `zap` is page actions, `pencil` renames, `x` removes. Selecting
  // rows is none of those. It is used once already as an empty-callout icon in
  // the tasks table, which is a picture rather than a control, so it is free
  // where it counts.
  setIcon(edit.createSpan({ cls: "ca-journal-below-edit-icon" }), "list-checks");
  edit.createSpan({ cls: "ca-journal-below-edit-label", text: "Edit" });
  // BOTH STRINGS, THE SAME SENTENCE, which is `addHeadButton`'s rule: the label
  // is the gesture and the tooltip is the consequence, and a reader on a screen
  // reader gets only one of the two.
  const hint = "Select notes to move or delete";
  edit.setAttr("aria-label", hint);
  edit.setAttr("title", hint);
  edit.setAttr("aria-pressed", "false");

  // THE FOLDER THESE NOTES ARE IN IS THE HOST NOTE'S OWN. An index note is a
  // folder note — `Projects/Website/Website.md` — and everything its
  // `kind-table`s list sits beside it, so "where they already are" is a fact
  // about `ctx.sourcePath` rather than something to infer from a row. Derived
  // once, here, because a row-derived answer would be wrong on an empty table.
  const at = ctx.sourcePath.lastIndexOf("/");
  const here = at < 0 ? "" : ctx.sourcePath.slice(0, at);

  ctx.addChild(new BelowEdit(foot, add, edit, hosts, { plugin, type, here }));
  return foot;
}

// ── the pure half ────────────────────────────────────────────────────────

// What the count reads at 0, 1 and N.
//
// *"Nothing selected"* AT ZERO, which is `refreshButton`'s exact phrase in the
// repair window — two surfaces saying one thing rather than two spellings of it.
export function selectionLabel(n: number): string {
  if (n === 0) return "Nothing selected";
  return `${n} note${n === 1 ? "" : "s"} selected`;
}

// The destinations a set of notes can be sent to, in the order they are offered.
//
// ONE LIST WITH TWO RUNS, NOT TWO BUTTONS. `kind-row-menu.ts` made this argument
// for a scope and it is the same argument for a destination: *"they are not two
// things — they are one action at two scopes. The scope belongs in the dialogue,
// beside the sentence describing what it takes, because a reader choosing between
// two menu rows is choosing before reading either consequence."* A reader who has
// ticked three notes and pressed **Move…** has one question — where do these go —
// and two buttons would ask them to classify their own intent before seeing
// either list.
//
// NOTE TYPES FIRST, because the run is short and the folder run is not: twenty
// folders above two types would bury the two.
//
// NEITHER RUN OFFERS WHERE THE NOTES ALREADY ARE. A "move" that does nothing is
// not an option, it is a mistake waiting to be reported — and `fromKind` is the
// kind whose table the reader ticked in, which is why this takes it rather than
// deriving it.
export function moveTargets(
  type: JournalType,
  folders: readonly string[],
  here: string,
  fromKinds: readonly string[]
): MoveTarget[] {
  const out: MoveTarget[] = [];
  for (const kind of type.kinds) {
    // A SET OF ROWS CAN SPAN TWO TABLES, so "the kind they are already" is a
    // list. A kind is excluded only when EVERY ticked note is already of it —
    // otherwise it is a real destination for the ones that are not.
    if (fromKinds.length === 1 && fromKinds[0] === kind.id) continue;
    out.push({ kind: "type", id: kind.id, label: kind.label });
  }
  for (const path of folders) {
    if (path === here) continue;
    out.push({ kind: "folder", path });
  }
  return out;
}

// The rows `promptDetailedSuggester` draws for them.
//
// THE CONSEQUENCE IS IN THE ROW, and for the type run it is the sentence that
// keeps the dialogue honest: **nothing moves on disk.** A kind is not a folder —
// `JournalKind` has no folder field, every kind at one journal level shares a
// folder, and `kind-table` selects its rows by frontmatter — so changing a note's
// type is a frontmatter write. A reader who pressed a button called *Move…*
// expects a file to move, and the honest thing is to say it will not.
export function moveChoices(targets: readonly MoveTarget[]): DetailedChoice[] {
  return targets.map((t) =>
    t.kind === "type"
      ? {
          value: `type:${t.id}`,
          label: t.label,
          description: "Re-file as this. Nothing moves on disk.",
          group: "Note type",
        }
      : {
          value: `folder:${t.path}`,
          label: t.path.split("/").pop() ?? t.path,
          description: t.path,
          group: "Index note",
        }
  );
}

// And back again, once.
//
// A TAGGED STRING RATHER THAN TWO PICKERS, following `promptChoice`'s own
// precedent for carrying a row's identity through a list of strings. Parsed in
// one place so the two prefixes cannot drift apart.
export function parseMoveChoice(value: string | null): MoveTarget | null {
  if (!value) return null;
  if (value.startsWith("type:")) {
    const id = value.slice("type:".length);
    return id ? { kind: "type", id, label: id } : null;
  }
  if (value.startsWith("folder:")) {
    const path = value.slice("folder:".length);
    return path ? { kind: "folder", path } : null;
  }
  return null;
}

// What survived a repaint.
//
// THE DOM THIS PASS FOUND IS THE AUTHORITY, NOT THE SET'S MEMORY, which is
// `welded`'s rule from 1.0.12 one surface over. A selection has to survive an
// ordinary repaint — most of them are nothing to do with the reader: a sync
// writing a sibling, a tracker ticked in another pane — because losing ten ticks
// to somebody else's write is how a reader stops trusting a mode. But a note that
// has MOVED OUT from under them must not stay ticked, or the next Delete acts on
// a row nobody can see.
//
// THIS IS NOT A SUBSTITUTE FOR RE-RESOLVING AT THE CLICK. Every act still asks
// `getFile` again per path and skips what has gone. What the prune keeps honest is
// the COUNT on the button.
export function prunedSelection(
  chosen: ReadonlySet<string>,
  onScreen: readonly string[]
): Set<string> {
  const live = new Set(onScreen);
  return new Set([...chosen].filter((p) => live.has(p)));
}

// The report a partial move gets.
//
// WHAT MOVED, NOT WHAT WAS ASKED FOR, and the ones that did not are NAMED —
// `scaffold.ts`' rule and `trashSeveral`'s, because the next thing a reader does
// with a note that would not move is go and look at it.
export function moveReport(
  done: number,
  skipped: readonly string[],
  where: string
): string {
  if (skipped.length === 0) return `Moved ${done} to ${where}`;
  if (done === 0) return `Nothing moved to ${where} — ${skipped.join(", ")}`;
  return `Moved ${done} of ${done + skipped.length} to ${where} — these did not: ${skipped.join(", ")}`;
}

// ── the controller ───────────────────────────────────────────────────────

interface BelowEditDeps {
  plugin: ChronoAnvilPlugin;
  type: JournalType;
  /** The folder the host index note lives in — where its notes already are. */
  here: string;
}

export class BelowEdit extends MarkdownRenderChild {
  private picking = false;
  private chosen = new Set<string>();
  private bar: HTMLElement | null = null;
  private count: HTMLElement | null = null;
  private moveBtn: HTMLButtonElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;

  constructor(
    private foot: HTMLElement,
    private addRow: HTMLElement,
    private toggle: HTMLElement,
    private hosts: readonly HTMLElement[],
    private deps: BelowEditDeps
  ) {
    // ANCHORED ON THE FOOT, so Obsidian's own unload drives the teardown — the
    // reason `RevealBar` and `RevealTargetChild` are both render children, and
    // the reason there is no `document` listener anywhere in this file for
    // `review-checklist.test.ts` to find.
    super(foot);
  }

  onload(): void {
    this.registerDomEvent(this.toggle, "click", (evt) => {
      evt.preventDefault();
      // The card's head folds on click and its rows open notes. Neither should
      // fire because a reader asked to select something.
      evt.stopPropagation();
      this.setPicking(!this.picking);
    });

    // ONE LISTENER PER HOST, BECAUSE THE EVENT DOES NOT BUBBLE. `LiveWidget`
    // dispatches a bare `new CustomEvent(LIVE_REDRAW_EVENT)` on its own element,
    // so a single listener on the block would never fire — this is the mistake
    // the next person makes, which is why it is written down. `liftEmptyHead` is
    // wired the same way one screen up in the dispatcher, for the same reason.
    for (const host of this.hosts) {
      // `addEventListener` PLUS `register`, NOT `registerDomEvent`. The latter is
      // typed against `HTMLElementEventMap` and `ca-live-redraw` is not in it —
      // the dispatcher wires `liftEmptyHead` the same plain way one screen up. The
      // teardown is still Obsidian's, because `register` runs on unload and these
      // hosts belong to the block rather than to this child.
      const redraw = (): void => {
        this.syncAvailable();
        if (this.picking) this.apply();
      };
      host.addEventListener(LIVE_REDRAW_EVENT, redraw);
      this.register(() => host.removeEventListener(LIVE_REDRAW_EVENT, redraw));
    }
    this.syncAvailable();
  }

  // NO EDIT CONTROL WHERE THERE IS NOTHING TO EDIT, and it comes and goes with the
  // rows. A card whose tables are all empty has nothing to tick, and a button that
  // opens a mode in which nothing can be selected is `discoverability.test.ts`'
  // rule broken: *a menu that opens and then explains it cannot help is worse than
  // no menu.*
  //
  // WHY THIS IS THE CONTROLLER'S JOB AND NOT THE BUILDER'S. `ctx.addChild` loads a
  // child when the rendered markdown is attached, and every table here is a
  // `LiveWidget` that draws its rows in its own `onload` — so at the moment the
  // foot is BUILT the tables are empty, and a gate asked there would hide the
  // button on every card in the vault. Asked here it is asked after each render,
  // which is also how a card that gains its first note gains the button without a
  // reload.
  private syncAvailable(): void {
    const any = this.pathsOnScreen().length > 0;
    this.toggle.hidden = !any;
    if (!any && this.picking) this.setPicking(false);
  }

  onunload(): void {
    // THE MARKS ARE ON SOMEBODY ELSE'S ELEMENTS. A tick left in a row nothing is
    // listening to, or an `is-editing` left on a list, would read as a live mode
    // on a block being recycled — `RevealBar.release()`'s argument exactly.
    this.release();
  }

  // ── the mode ──────────────────────────────────────────────────────────

  private setPicking(on: boolean): void {
    this.picking = on;
    this.toggle.setAttr("aria-pressed", on ? "true" : "false");
    this.toggle.toggleClass("is-on", on);
    if (!on) {
      // LEAVING CLEARS THE SELECTION. Ticks are not a draft — the acts have
      // already happened when they happened — so there is nothing to keep, and
      // keeping it would mean a reader who pressed Edit again found somebody
      // else's half-made choice waiting.
      this.chosen.clear();
      this.release();
      this.addRow.hidden = false;
      return;
    }
    // THE BAR REPLACES THE ADD ROW RATHER THAN JOINING IT. `+ Add note type`
    // alters the CARD — it adds a kind to the journal — and the picking bar acts
    // on NOTES. Leaving a live dashed slot offering a card-altering act while the
    // reader's attention is on a destructive one is what 4.37 deleted a
    // row-shaped slot from a card for. One strip, two arrangements, chosen by
    // mode, which is `actionsRow`'s own idiom.
    this.addRow.hidden = true;
    this.bar = this.buildBar();
    this.apply();
  }

  // Put the ticks in, take the stale ones out, and re-read the count.
  private apply(): void {
    this.chosen = prunedSelection(this.chosen, this.pathsOnScreen());
    for (const host of this.hosts) {
      for (const list of Array.from(host.querySelectorAll(".ca-list"))) {
        // A STATE CLASS, NOT A BUILD-TIME FLAG, and that is the one place this
        // differs from `hasActions`. The `⋯` is on every row on every paint, so
        // its reserve is a constructor argument; a tick is on no row until the
        // reader asks, so a permanent left reserve would indent every kind table
        // in every vault for a mode nobody is in.
        list.classList.add("is-editing");
      }
      for (const row of Array.from(
        host.querySelectorAll<HTMLElement>(`[${ROW_NOTE_ATTR}]`)
      )) {
        this.tickIn(row);
      }
    }
    this.refresh();
  }

  private tickIn(row: HTMLElement): void {
    const path = row.getAttr(ROW_NOTE_ATTR);
    if (!path) return;
    const lead = row.querySelector<HTMLElement>(".ca-list-lead");
    if (!lead) return;

    let box = lead.querySelector<HTMLInputElement>("input.ca-list-tick");
    if (!box) {
      // THE TICK GOES IN `lead`, which `createListRow` builds on every row and
      // `:empty` collapses — *"a caller that fills it in later should not have to
      // know whether it exists"*, the rule the file states about `pills` and the
      // reason `recordList` needs no new slot for this. `repair-modal.ts` has
      // already decided the same thing: *the `lead` slot is the one
      // `createListRow` keeps in front of the token for exactly this — a row that
      // is a choice rather than a record.*
      //
      // AND NOT `actions`, which already holds the `⋯` whose menu contains
      // *Delete note…*. A tick 22px from a delete is the pairing `list-row.ts`
      // refuses for the reorder arrows: *"one slip away from being expensive".*
      box = lead.createEl("input", {
        cls: "ca-list-tick",
        attr: { type: "checkbox" },
      });
      box.setAttr("aria-label", `Select ${path.split("/").pop() ?? path}`);
      // Captured, so the guard below compares against the box this row actually
      // got rather than against whatever `box` last pointed at.
      const tick = box;
      this.registerDomEvent(tick, "change", () => this.pick(path, tick.checked));
      // THE WHOLE ROW TOGGLES IT, guarded — `repair-modal.ts`'s rule verbatim:
      // without `if (evt.target === box) return;` the row handler fires after the
      // box's own and the two cancel out.
      this.registerDomEvent(row, "click", (evt) => {
        if (!this.picking) return;
        if (evt.target === tick) return;
        // THE TITLE STILL OPENS THE NOTE. A reader in edit mode has not stopped
        // wanting to look at what they are about to delete, so a click that
        // landed on the row's own link is the link's.
        if ((evt.target as HTMLElement | null)?.closest("a")) return;
        this.pick(path, !this.chosen.has(path));
      });
    }
    box.checked = this.chosen.has(path);
  }

  private pick(path: string, on: boolean): void {
    if (on) this.chosen.add(path);
    else this.chosen.delete(path);
    for (const host of this.hosts) {
      const row = host.querySelector<HTMLElement>(
        `[${ROW_NOTE_ATTR}="${CSS.escape(path)}"]`
      );
      const box = row?.querySelector<HTMLInputElement>("input.ca-list-tick");
      if (box) box.checked = on;
      row?.toggleClass("is-picked", on);
    }
    this.refresh();
  }

  // Take every mark back off.
  private release(): void {
    for (const host of this.hosts) {
      for (const list of Array.from(host.querySelectorAll(".ca-list"))) {
        list.classList.remove("is-editing");
      }
      for (const row of Array.from(
        host.querySelectorAll<HTMLElement>(`[${ROW_NOTE_ATTR}]`)
      )) {
        row.removeClass("is-picked");
        row.querySelector("input.ca-list-tick")?.remove();
      }
    }
    this.bar?.remove();
    this.bar = null;
    this.count = null;
    this.moveBtn = null;
    this.deleteBtn = null;
  }

  // ── the bar ───────────────────────────────────────────────────────────

  private buildBar(): HTMLElement {
    const bar = this.foot.createDiv({ cls: "ca-journal-below-pick" });
    // A LEADING LABEL RATHER THAN A NUMBER ON THE BUTTONS. `refreshButton` puts
    // its count on the CTA because it has one act; there are two here, and the
    // same number twice is the doubling this codebase keeps removing.
    // `aria-live` so a reader who is not looking hears it change.
    this.count = bar.createSpan({ cls: "ca-journal-below-count" });
    this.count.setAttr("aria-live", "polite");

    const acts = bar.createDiv({ cls: "ca-journal-below-acts" });
    // ABSENT RATHER THAN DEAD WHERE THERE IS NOWHERE TO GO. A journal with one
    // kind and one container folder has no destination that is not where the
    // notes already are, and `discoverability.test.ts`' rule is that *a menu
    // that opens and then explains it cannot help is worse than no menu.*
    // Disabled means "momentarily inapplicable"; absent means "structurally
    // impossible", and they are different sentences.
    if (this.anyDestination()) {
      this.moveBtn = acts.createEl("button", {
        text: "Move…",
        attr: { type: "button" },
      });
      this.registerDomEvent(this.moveBtn, "click", (evt) => {
        evt.stopPropagation();
        void this.move();
      });
    }
    this.deleteBtn = acts.createEl("button", {
      cls: "mod-warning",
      text: "Delete…",
      attr: { type: "button" },
    });
    this.registerDomEvent(this.deleteBtn, "click", (evt) => {
      evt.stopPropagation();
      void this.remove();
    });

    // *Done*, NOT *Cancel*. Nothing is pending — the acts happened when they
    // happened — so "Cancel" would promise an undo this bar cannot deliver.
    const done = bar.createEl("button", {
      cls: "ca-journal-below-done",
      text: "Done",
      attr: { type: "button" },
    });
    this.registerDomEvent(done, "click", (evt) => {
      evt.stopPropagation();
      this.setPicking(false);
    });
    return bar;
  }

  private refresh(): void {
    const n = this.chosen.size;
    if (this.count) this.count.setText(selectionLabel(n));
    // DEAD RATHER THAN HIDDEN AT ZERO, which is the one exception
    // `repair-modal.ts` states to this codebase's rule against drawing a dead
    // control: a control momentarily inapplicable because of a choice the reader
    // just made, in a strip where it is the only route back to acting.
    if (this.moveBtn) this.moveBtn.disabled = n === 0;
    if (this.deleteBtn) this.deleteBtn.disabled = n === 0;
  }

  // ── what the acts read ────────────────────────────────────────────────

  private pathsOnScreen(): string[] {
    const out: string[] = [];
    for (const host of this.hosts) {
      for (const row of Array.from(
        host.querySelectorAll<HTMLElement>(`[${ROW_NOTE_ATTR}]`)
      )) {
        const path = row.getAttr(ROW_NOTE_ATTR);
        if (path) out.push(path);
      }
    }
    return out;
  }

  private folders(): string[] {
    return containerFoldersOf(this.deps.plugin, this.deps.type);
  }

  private anyDestination(): boolean {
    // Asked without a selection, because the BUTTON's existence is a fact about
    // the journal rather than about what is ticked. `moveTargets` with no
    // from-kind excludes nothing, which is the right question here: *is there
    // anywhere at all for a note on this card to go.*
    const here = this.deps.here;
    return moveTargets(this.deps.type, this.folders(), here, []).length > 0;
  }

  // The files a set of paths names, re-resolved, with a promoted note standing
  // for its folder.
  //
  // RE-RESOLVED AFTER THE CONFIRM AND NOT BEFORE THE QUESTION, which is
  // `applyDashboardCatchups`' rule: a write built on a stale read silently
  // reverts an edit made in another pane. A path that no longer names a file is
  // skipped rather than reported.
  private resolve(paths: readonly string[]): { file: TFile; whole: TAbstractFile }[] {
    const out: { file: TFile; whole: TAbstractFile }[] = [];
    for (const path of paths) {
      const file = getFile(this.deps.plugin.app, path);
      if (!file) continue;
      // A PROMOTED NOTE GOES AS ITS FOLDER, in one call, which is `bin()`'s rule
      // and the reason `trashItem` and `renameFile` both take a `TAbstractFile`:
      // the pages come along by construction rather than by a list that could be
      // wrong.
      const whole: TAbstractFile = isPromotedPath(file.path)
        ? (file.parent ?? file)
        : file;
      out.push({ file, whole });
    }
    return out;
  }

  private kindsPicked(): string[] {
    const { plugin } = this.deps;
    const ids = new Set<string>();
    for (const path of this.chosen) {
      const file = getFile(plugin.app, path);
      if (!file) continue;
      const id = plugin.journals.noteKindOf(file);
      if (id) ids.add(id);
    }
    return [...ids];
  }

  // ── move ──────────────────────────────────────────────────────────────

  private async move(): Promise<void> {
    const picked = [...this.chosen];
    if (picked.length === 0) return;
    const { plugin, type } = this.deps;

    const targets = moveTargets(
      type,
      this.folders(),
      this.deps.here,
      this.kindsPicked()
    );
    if (targets.length === 0) {
      notify.info("There is nowhere else in this journal for these to go.");
      return;
    }
    // NO `only()` SHORT-CIRCUIT. Its own rule names this case: auto-picking a
    // sole option is right for incidental bookkeeping and wrong for a
    // substantive act — *"'there was only one' is not consent"*. Moving a
    // reader's notes is the second kind.
    const chosen = parseMoveChoice(
      await promptDetailedSuggester(
        plugin.app,
        moveChoices(targets),
        `Move ${picked.length} note${picked.length === 1 ? "" : "s"} where?`
      )
    );
    if (!chosen) return;
    if (chosen.kind === "type") await this.retype(picked, chosen.id);
    else await this.reparent(picked, chosen.path);
  }

  private async retype(paths: readonly string[], kindId: string): Promise<void> {
    const { plugin, type } = this.deps;
    const kind = type.kinds.find((k) => k.id === kindId);
    if (!kind) return;
    const n = paths.length;
    // THE SENTENCE SAYS NOTHING MOVES, because the button said *Move…* and a
    // reader is entitled to expect a file to move. A kind is not a folder; this
    // is a frontmatter write and the row simply reappears under another head at
    // the next repaint, which the live widget does by itself.
    const ok = await confirmAction(
      plugin.app,
      `Re-file ${n} note${n === 1 ? "" : "s"} as ${plural(kind.label).toLowerCase()}?`,
      `They become ${plural(kind.label).toLowerCase()}. Nothing moves on disk — they stop showing under the head they are under now and start showing under ${kind.label}.`,
      "Change the type"
    );
    if (!ok) return;

    let done = 0;
    const skipped: string[] = [];
    for (const { file } of this.resolve(paths)) {
      try {
        await plugin.journals.setNoteKind(file, kindId);
        done += 1;
      } catch (e) {
        console.error("[ChronoAnvil] could not re-file", file.path, e);
        skipped.push(file.path);
      }
    }
    this.report(moveReport(done, skipped, kind.label));
  }

  private async reparent(paths: readonly string[], folder: string): Promise<void> {
    const { plugin } = this.deps;
    const n = paths.length;
    const ok = await confirmAction(
      plugin.app,
      `Move ${n} note${n === 1 ? "" : "s"} to ${folder.split("/").pop() ?? folder}?`,
      `They move into ${folder}. Links from your other notes are updated to follow. A note with its own pages takes them with it.`,
      "Move them"
    );
    if (!ok) return;

    let done = 0;
    const skipped: string[] = [];
    for (const { whole } of this.resolve(paths)) {
      const target = `${folder}/${whole.name}`;
      // A COLLISION REFUSES AND SAYS SO, rather than suffixing. `header-title.ts`
      // and `promoteToDashboard` both refuse for the same reason: silently
      // producing `Quadratics 1.md` in a reader's own folder is the
      // `The Avengers-2026-08-20-2026-08-20.md` failure by another route. A bin
      // could suffix, because there a collision was bookkeeping.
      if (plugin.app.vault.getAbstractFileByPath(target)) {
        skipped.push(`${whole.name} (already there)`);
        continue;
      }
      try {
        // `fileManager.renameFile`, NEVER `vault.rename` — the former updates
        // every link that pointed at what moved, which is the difference between
        // a moved note that still resolves and a page of broken links.
        await plugin.app.fileManager.renameFile(whole, target);
        done += 1;
      } catch (e) {
        console.error("[ChronoAnvil] could not move", whole.path, e);
        skipped.push(whole.name);
      }
    }
    this.report(moveReport(done, skipped, folder));
  }

  // ── delete ────────────────────────────────────────────────────────────

  private async remove(): Promise<void> {
    const picked = [...this.chosen];
    if (picked.length === 0) return;
    const { plugin } = this.deps;
    const n = picked.length;

    // THE DESTINATION IS IN THE QUESTION, which is the whole of 1.0.13:
    // `trashClause` names where the notes go in the words the reader's own
    // *Deleted files* setting uses, and says outright when that is permanent.
    const where = trashClause(trashDestination(plugin.app));
    const ok = await confirmAction(
      plugin.app,
      `Delete ${n} note${n === 1 ? "" : "s"}?`,
      `They ${where}. Links from your other notes to them will break. A note with its own pages takes them with it.`,
      n === 1 ? "Delete" : `Delete ${n}`,
      true
    );
    if (!ok) return;

    // NO "PAGES ONLY" SECOND ANSWER. That scope belongs to the single row's `⋯`,
    // where 4.50.2 put it; across N notes it is a question with N answers.
    const items = this.resolve(picked).map((r) => r.whole);
    const { deleted, failed } = await trashSeveral(plugin.app, items);
    if (failed.length > 0) {
      notify.fail(
        `ChronoAnvil deleted ${deleted} of ${items.length} — these could not be deleted: ${failed.join(", ")}`
      );
    } else {
      notify.ok(`Deleted ${deleted} note${deleted === 1 ? "" : "s"}`);
    }
    // THE MODE STAYS OPEN AND THE SELECTION GOES. The rows that were ticked are
    // on their way out of the table, and the live widget's own folder watch is
    // what takes them off the screen — so clearing the set here is what keeps the
    // count from describing notes that no longer exist before that repaint lands.
    this.chosen.clear();
    this.refresh();
  }

  private report(text: string): void {
    if (text.includes("did not") || text.startsWith("Nothing moved")) {
      notify.fail(`ChronoAnvil ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
    } else {
      notify.ok(text);
    }
    this.chosen.clear();
    this.refresh();
  }
}
