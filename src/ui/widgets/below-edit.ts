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
// ── WHERE A NOTE MAY GO, WHICH IS NOT WHERE IT USED TO BE ALLOWED ────────
//
// The reader asked what moving a note up to an intermediate index level did. The
// honest answer was: nothing visible lists it afterwards. `buildLevelIndex`
// branches on `hasLevelBelow`, a question about the LEVEL rather than about
// contents, so an intermediate index draws a folder rollup — and a note is not a
// folder. It still counted on the journal's card, because that sweep is recursive
// from the root, so the note existed, counted, and was reachable only by link or
// search. `containerFoldersOf` now collects the deepest level only, and BOTH
// callers get the rule, which was the reason for having one list: the create path
// can no longer put a note where nothing will show it either.
//
// AND THE OTHER HALF OF THE SAME ASK: *"allow cross journal transfer."* So the
// folder run is every journal's. Crossing one re-writes the note's `type:`,
// because a kind belongs to a journal and the destination's tables select on it —
// a note carried across with a foreign `type:` would be the invisible-note failure
// again by a second route. That makes a cross-journal move a move AND a
// frontmatter write, which is why it is the one destination that asks a second
// question, and why `reparent` takes an optional `into` rather than there being
// two movers.
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
import { getFile } from "../../core/util";
import { notify } from "../../core/notify";
import { trashClause, trashDestination, trashSeveral } from "../../core/trash";
import { confirmAction, promptDetailedSuggester } from "../modals";
import type { DetailedChoice } from "../modals";
import { isPromotedPath } from "../../journals/page-default";
import {
  containerFoldersOf,
  getJournalType,
  journalTypeAtPath,
  registeredJournalTypes,
} from "../../journals/journal";
import type { JournalKind, JournalType } from "../../journals/journal";
import { kindPlural } from "../../journals/journal-sections";

/** One journal, and the folders of it that may hold a note. */
export interface JournalFolders {
  type: JournalType;
  folders: readonly string[];
}

/** Where a picked set of notes can be sent. */
export type MoveTarget =
  | { kind: "type"; id: string; label: string }
  // A FOLDER CARRIES ITS JOURNAL, WHICH IS WHAT MAKES A CROSS-JOURNAL MOVE
  // POSSIBLE TO DESCRIBE. The destination decides which note types are available
  // to the note afterwards, so "where" and "what it becomes" are one answer and
  // have to travel together. `foreign` is derived once here rather than compared
  // at each of the four places that ask — the confirm, the report, the branch and
  // the heading — because four comparisons against the host's id is four chances
  // to write one of them backwards.
  | {
      kind: "folder";
      path: string;
      journalId: string;
      journalName: string;
      journalEmoji: string;
      foreign: boolean;
    };

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
//
// ── AND ANOTHER JOURNAL IS A DESTINATION ─────────────────────────────────
//
// *"allow cross journal transfer."* So the folder run is every journal's, not one
// journal's, and `journals` is the whole registry rather than a list of paths.
//
// THE HOME JOURNAL'S FOLDERS COME FIRST and keep their old heading, which is what
// a single-journal vault still sees — exactly the list it saw before this
// existed. The others follow in registry order, under their own names, so the
// reader who has one journal is not made to read about a feature they cannot use
// and the reader who has four can tell them apart at a glance.
//
// THE TYPE RUN STAYS HOME-ONLY, and that is not an omission. A foreign kind
// without a move would leave the note where it is, carrying a `type:` its own
// journal does not recognise — which is `recognisedTypeValues`' whole subject and
// the invisible-note failure by a second route. Crossing a journal is always a
// move; re-filing in place is always within one.
export function moveTargets(
  home: JournalType,
  journals: readonly JournalFolders[],
  here: string,
  fromKinds: readonly string[]
): MoveTarget[] {
  const out: MoveTarget[] = [];
  for (const kind of home.kinds) {
    // A SET OF ROWS CAN SPAN TWO TABLES, so "the kind they are already" is a
    // list. A kind is excluded only when EVERY ticked note is already of it —
    // otherwise it is a real destination for the ones that are not.
    if (fromKinds.length === 1 && fromKinds[0] === kind.id) continue;
    out.push({ kind: "type", id: kind.id, label: kind.label });
  }
  const ordered = [
    ...journals.filter((j) => j.type.id === home.id),
    ...journals.filter((j) => j.type.id !== home.id),
  ];
  for (const j of ordered) {
    for (const path of j.folders) {
      if (path === here) continue;
      out.push({
        kind: "folder",
        path,
        journalId: j.type.id,
        journalName: j.type.name,
        journalEmoji: j.type.emoji,
        foreign: j.type.id !== home.id,
      });
    }
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
// AND A FOREIGN ROW SAYS THE SECOND THING THAT WILL HAPPEN TO IT. Moving into
// another journal re-writes the note's `type:`, because a kind belongs to a
// journal and the destination's tables select on it — so the row carries the
// consequence rather than leaving the reader to meet it in the confirm. The path
// stays, because it is what tells two folders of one name apart.
export function moveChoices(targets: readonly MoveTarget[]): DetailedChoice[] {
  return targets.map((t) =>
    t.kind === "type"
      ? {
          value: moveValue(t),
          label: t.label,
          description: "Re-file as this. Nothing moves on disk.",
          group: "Note type",
        }
      : {
          value: moveValue(t),
          label: t.path.split("/").pop() ?? t.path,
          description: t.foreign
            ? `${t.path} — re-filed as one of ${t.journalName}'s note types.`
            : t.path,
          group: t.foreign ? `${t.journalEmoji} ${t.journalName}` : "Index note",
        }
  );
}

// The one place a target is spelled as a string.
//
// A TAGGED STRING, following `promptChoice`'s own precedent for carrying a row's
// identity through a list of strings. A path is unique in a vault, so `folder:`
// needs no journal in it — which is the encoding question this avoids rather than
// answers, and the reason there is no delimiter to get wrong.
export function moveValue(target: MoveTarget): string {
  return target.kind === "type" ? `type:${target.id}` : `folder:${target.path}`;
}

// And back again — by LOOKUP, not by parse.
//
// WHY THIS IS NOT A PARSER ANY MORE. It was one, and a parser can only return
// what the string holds: a `{ kind: "folder", path }` and nothing about which
// journal that path is in. A cross-journal move needs the journal to pick the
// note type, so a parser would have had to put it in the string and then take it
// back out — a second delimiter, in a field that already contains slashes, for a
// fact the caller is holding in its hand.
//
// So the answer comes from the list the question was asked from. That also makes
// the round trip exact rather than merely consistent: a value the picker did not
// offer resolves to nothing, where a parser would happily manufacture a target
// for `folder:/etc/passwd`.
export function targetOf(
  targets: readonly MoveTarget[],
  value: string | null
): MoveTarget | null {
  if (!value) return null;
  return targets.find((t) => moveValue(t) === value) ?? null;
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

// A CLASS, NOT THE `hidden` PROPERTY, AND THIS SHIPPED WRONG IN 1.0.14. Both
// halves of the foot set `el.hidden` and neither of them disappeared: the reader
// saw the dashed `+ Add note type` slot sitting beside a live *Delete…*, which is
// the exact arrangement the mode's own comment says it exists to prevent.
//
// `[hidden] { display: none }` is a USER-AGENT rule, and an author rule of any
// specificity beats every user-agent rule outright — the cascade compares origins
// before it compares selectors. `.ca-jld-add` declares `display: flex` and
// `.ca-journal-below-edit` declares `display: inline-flex`, so both elements went
// on being laid out with the attribute set. There is no specificity to add here;
// the property is simply unreachable once anything in `styles/` states a `display`
// for the element, which is why the plugin hides things with `is-hidden`
// everywhere else (`.ca-journal-task-at-wrap`, `.ca-settings .is-hidden`).
//
// The `hidden` attribute stays alongside it, because it is what a screen reader
// reads and a class is not.
function hide(el: HTMLElement, away: boolean): void {
  el.toggleClass("is-hidden", away);
  el.hidden = away;
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
    hide(this.toggle, !any);
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
      hide(this.addRow, false);
      return;
    }
    // THE BAR REPLACES THE ADD ROW RATHER THAN JOINING IT. `+ Add note type`
    // alters the CARD — it adds a kind to the journal — and the picking bar acts
    // on NOTES. Leaving a live dashed slot offering a card-altering act while the
    // reader's attention is on a destructive one is what 4.37 deleted a
    // row-shaped slot from a card for. One strip, two arrangements, chosen by
    // mode, which is `actionsRow`'s own idiom.
    hide(this.addRow, true);
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

  // Every journal in the vault, with the folders of it that may hold a note.
  //
  // READ AT THE MOMENT IT IS ASKED, not held. A journal added in Settings while
  // this card is on screen is a destination the next press of *Move…* should
  // offer, and `registeredJournalTypes` is a map over stored settings rather than
  // a scan — cheap enough that caching it would be buying nothing with staleness.
  //
  // A JOURNAL WITH NO FOLDERS YET IS DROPPED HERE rather than in the picker,
  // because an empty group heading is a promise the list cannot keep — the reader
  // would open *Move…*, read the name of a journal, and find nothing under it.
  private journalFolders(): JournalFolders[] {
    const { plugin } = this.deps;
    return registeredJournalTypes(plugin)
      .map((type) => ({ type, folders: containerFoldersOf(plugin, type) }))
      .filter((j) => j.folders.length > 0);
  }

  private anyDestination(): boolean {
    // Asked without a selection, because the BUTTON's existence is a fact about
    // the vault rather than about what is ticked. `moveTargets` with no from-kind
    // excludes nothing, which is the right question here: *is there anywhere at
    // all for a note on this card to go.*
    const here = this.deps.here;
    return (
      moveTargets(this.deps.type, this.journalFolders(), here, []).length > 0
    );
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
      this.journalFolders(),
      this.deps.here,
      this.kindsPicked()
    );
    if (targets.length === 0) {
      notify.info("There is nowhere else for these to go.");
      return;
    }
    // NO `only()` SHORT-CIRCUIT. Its own rule names this case: auto-picking a
    // sole option is right for incidental bookkeeping and wrong for a
    // substantive act — *"'there was only one' is not consent"*. Moving a
    // reader's notes is the second kind.
    const chosen = targetOf(
      targets,
      await promptDetailedSuggester(
        plugin.app,
        moveChoices(targets),
        `Move ${picked.length} note${picked.length === 1 ? "" : "s"} where?`
      )
    );
    if (!chosen) return;
    if (chosen.kind === "type") {
      await this.retype(picked, chosen.id);
      return;
    }
    if (!chosen.foreign) {
      await this.reparent(picked, chosen.path, null);
      return;
    }
    // CROSSING A JOURNAL ASKS ONE MORE QUESTION, and only one. The destination
    // decides which note types exist, so the note cannot keep the one it has.
    const into = getJournalType(plugin, chosen.journalId);
    if (!into) {
      notify.fail(`${chosen.journalName} is no longer a journal in this vault.`);
      return;
    }
    const kind = await this.pickForeignKind(into);
    if (!kind) return;
    await this.reparent(picked, chosen.path, { kind, journal: into });
  }

  // Which of the destination journal's note types these become.
  //
  // THE ONE PLACE `only()`'s RULE POINTS THE OTHER WAY, and it is worth saying
  // why. Its rule is about the act the reader CHOSE: auto-picking a sole option
  // is wrong for a substantive act, because *"'there was only one' is not
  // consent"*. This is not the act the reader chose — it is a consequence of it,
  // forced by the destination. A journal with one note type offers no choice to
  // make, and asking a question with a single answer would read as though there
  // were a decision here. The reader is told rather than asked: the confirm names
  // the type either way, which is where the consent actually lives.
  private async pickForeignKind(into: JournalType): Promise<JournalKind | null> {
    if (into.kinds.length === 0) {
      notify.fail(`${into.name} has no note types to file these under.`);
      return null;
    }
    if (into.kinds.length === 1) return into.kinds[0];
    const id = await promptDetailedSuggester(
      this.deps.plugin.app,
      into.kinds.map((k) => ({
        value: k.id,
        label: `${k.emoji} ${k.label}`,
        description: `File them as ${kindPlural(k).toLowerCase()} in ${into.name}.`,
      })),
      `Become which kind of ${into.name} note?`
    );
    return into.kinds.find((k) => k.id === id) ?? null;
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
    // `kindPlural`, NOT `plural`. A kind may declare its own plural and two of
    // the shipped ones do — `plural("Practice")` is "Practices" and the kind says
    // "Practice". Every other surface that names a run of these reads the
    // override; this said the crude pluraliser's answer in a window asking for
    // consent.
    const many = kindPlural(kind).toLowerCase();
    const ok = await confirmAction(
      plugin.app,
      `Re-file ${n} note${n === 1 ? "" : "s"} as ${many}?`,
      `They become ${many}. Nothing moves on disk — they stop showing under the head they are under now and start showing under ${kind.label}.`,
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

  // ONE MOVER, WITH OR WITHOUT THE RETYPE. A cross-journal transfer is a move
  // plus a frontmatter write, and writing it as a second method would mean two
  // copies of the collision refusal, the per-item `try` and the report — the three
  // parts most worth having exactly once. `into` is the only difference, and it
  // reaches the sentence, the loop and nothing else.
  private async reparent(
    paths: readonly string[],
    folder: string,
    into: { kind: JournalKind; journal: JournalType } | null
  ): Promise<void> {
    const { plugin } = this.deps;
    const n = paths.length;
    const notes = `${n} note${n === 1 ? "" : "s"}`;
    // THE SECOND CHANGE IS IN THE SENTENCE, because a reader who pressed a button
    // called *Move…* is not expecting their notes to be re-filed as something
    // else. It is not a side effect to discover afterwards: a kind belongs to a
    // journal, the destination's tables select on `type:`, and a note carrying a
    // foreign one would sit in the new folder listed by nothing — which is the
    // failure this whole round removed from the create path.
    //
    // AND WHAT IS NOT TOUCHED IS SAID TOO. The other properties stay: a Lesson
    // rated on `confidence` keeps its reading after becoming a Project note that
    // does not rate on it. Dropping them would be destroying a reader's data to
    // tidy a table, and they are still there if the note ever goes back.
    const ok = await confirmAction(
      plugin.app,
      into
        ? `Move ${notes} to ${into.journal.name}?`
        : `Move ${notes} to ${folder.split("/").pop() ?? folder}?`,
      into
        ? `They move into ${folder} and become ${kindPlural(into.kind).toLowerCase()}, because note types belong to a journal and ${into.journal.name} has its own. Links from your other notes are updated to follow. Any properties ${into.journal.name} does not use stay on the notes, unread. A note with its own pages takes them with it.`
        : `They move into ${folder}. Links from your other notes are updated to follow. A note with its own pages takes them with it.`,
      into ? `Move and re-file` : "Move them"
    );
    if (!ok) return;

    let done = 0;
    const skipped: string[] = [];
    for (const { file, whole } of this.resolve(paths)) {
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
        // THE MOVE FIRST, THEN THE TYPE, and the order is the recoverable one. A
        // type written before a failed move leaves the note in its OLD journal
        // carrying a `type:` that journal does not recognise — listed by nothing,
        // in the folder the reader was looking at. This way a refused move leaves
        // the note exactly as it was, and the only partial state possible is a
        // note that arrived and kept its old type, which the report names.
        //
        // `file`, NOT a fresh lookup, and 4.50.2's identity rule is why it works
        // rather than why it does not. Obsidian MUTATES a `TFile` in place on
        // rename — including the children of a renamed folder — so the handle
        // FOLLOWS the note to its new path, which is exactly what is wanted here.
        // The rule is about holding one to remember where something WAS.
        if (into) await plugin.journals.setNoteKind(file, into.kind.id);
        done += 1;
      } catch (e) {
        console.error("[ChronoAnvil] could not move", whole.path, e);
        skipped.push(whole.name);
      }
    }
    this.report(moveReport(done, skipped, into ? into.journal.name : folder));
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
