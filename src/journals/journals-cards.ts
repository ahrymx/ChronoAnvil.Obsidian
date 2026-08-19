// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One card per journal, laid out as a grid. 4.2 §1.
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────
//
// THE FRAME, AND THEN THE CONTENT (4.2 §1, completed in 4.37). This header read
// *"THE FRAME, AND THE FRAME ONLY"* for eight minors, and said the card's content
// *"beyond a name, a count and two actions is deferred"*. The reason was honest
// and is worth keeping: the reference design is a course-card dashboard, and what
// could be drawn in 4.2 was the shell plus whatever resolved to something real.
//
// THE DEFERRAL ENDED WHEN THE CARD ACQUIRED A DESTINATION. Its title has pointed
// at `folderNotePath(type.root)` since 4.2 and **nothing wrote that file until
// 4.36** — so for eight minors this card's main control did nothing, silently,
// behind an `if (file)`. A card that could not be opened had little business
// summarising what it opened. Now it opens a journal's dashboard, and the four
// figures under the title are the reading that page states in full.
//
// NOTHING DEAD IS DRAWN, which is the one rule that shaped what "just the
// frame" could include, and it still holds. The reference has four action glyphs
// per card and this has two, because two are all that resolve to something a
// reader can do today. A greyed row of four would look closer to the picture and
// teach a reader that this plugin's controls are decoration — 4.1 §6.2 states the
// rule for the mobile launcher ("a control that cannot do its job should not be
// drawn") and it is not a rule about mobile. The third and fourth glyphs arrive
// with the features behind them.
//
// AND THE FIGURES ARE NOT THIS FILE'S ARITHMETIC. Every one comes from the
// function the level-cards container card already reads, scoped to the journal's
// root — 4.13.3's rule for these two families, *"what is still shared is the
// thing that actually mattered: the NUMBERS"* — so a journal's card and the
// dashboard it opens cannot disagree about what is in it.
//
// ── WHY AN ARGUMENT RATHER THAN A NEW KEYWORD ────────────────────────────
//
// `journals:cards`, not `journal-cards`. 4.1 §3 refuses a `widget:` namespace
// on the grounds that one idea gets one name, and this is the same idea as
// `journals` — every journal, drawn — in a second arrangement. The grammar
// already has a slot for that: `keyword[:argument]`, and `journals` had never
// used its argument. A new keyword would be a second name to keep in step with
// the first forever, which is what `RETIRED_WORDS` exists to delete.
//
// AND AN UNKNOWN ARGUMENT IS REFUSED rather than falling back to the bare
// form — see the dispatcher. `journals:card` (singular) silently drawing the
// list is the kind of near-miss nobody debugs, because it looks like the
// feature not working rather than like the word being wrong.
//
// ── THE BANNER, AND WHERE AN IMAGE COMES FROM ────────────────────────────
//
// `banner` in the frontmatter of the journal's own index note, which is the
// convention every Obsidian banner plugin already reads and the one a reader
// most likely already has. NOT a settings key: 4.1 §2.5's argument is that a
// derived value follows a rename and a configured one goes stale, and a
// journal's index note moves with its folder for free.
//
// The fallback is a wash keyed off the journal's own emoji rather than a grey
// box, because the reference design's flat-colour card (the one with no image)
// is the case a new vault is entirely made of, and it has to look deliberate
// rather than unfinished.

import { setIcon } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";

import type AlmanacPlugin from "../main";
import { getFile, getFolder, openFile } from "../core/util";
import { folderNotePath } from "../core/util";
import { emptyCallout } from "../ui/empty";
import { overflowButton } from "../ui/section-frame";
import { hueOf, journalChildFolders, registeredJournalTypes } from "./journal";
import { moveJournalOnto } from "./journal-order";
// The NUMBERS, shared with the container cards rather than recomputed — 4.13.3's
// rule for these two families, and what stops a journal's card and the dashboard
// it opens disagreeing about how many notes are in it.
import {
  confidenceKinds,
  confidenceStats,
  folderActivity,
  ratingDefOf,
  ratingWord,
  sumBodyTasks,
} from "../ui/tables";
import { pagesUnder, relativeActivity } from "../core/query";
import { statStrip } from "../ui/stat-strip";
import type { StatCard } from "../ui/stat-strip";
import { plural } from "./journal-sections";
import type { JournalType } from "./journal";

// The image a journal's card wears, or null for the wash.
//
// READ FROM THE INDEX NOTE'S FRONTMATTER, through the metadata cache rather
// than by reading the file — the cache is what every other widget in this
// plugin reads and it is already warm. A journal whose index note is missing
// (a folder made by hand) gets the wash, which is the same fallback
// `folderLink` makes one file over for the same reason: better a deliberate
// plain thing than a broken reference.
export function bannerOf(plugin: AlmanacPlugin, type: JournalType): string | null {
  const file = getFile(plugin.app, folderNotePath(type.root));
  if (!file) return null;
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const raw = fm.banner;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

// `hueOf` MOVED TO `journal.ts` IN 4.37, and the move is the interesting part.
//
// It was private to this file because this file was the only surface wearing a
// journal's colour. 4.37 gives the level-cards head the same hue, so `tables.ts`
// needs it — and `tables.ts` cannot import from here, because this file now
// imports `tables.ts` directly for the strip's numbers. The edge would close the
// cycle in one hop. That is the same wall 4.36 hit when `childRow` had to be
// shared, and it was answered the same way — the shared thing moves to the module
// both already depend on rather than a third module appearing to hold it.
//
// `journal.ts` is the right home on its own terms, not just the reachable one: a
// stable hue for a journal id is a fact about the journal model, and it belongs
// beside `folderEmoji` and `foldKey` which are the same kind of fact.

// EXPORTED IN 4.15 §4, unchanged. `journal-card:<id>` draws exactly one of
// these and `journals:cards` draws a grid of all of them, so the two must be the
// same object — a card that looked different depending on how many were asked
// for would be two cards with one name.
export function buildCard(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType
): HTMLElement {
  const card = createDiv({ cls: "jjc-card" });

  // ── The banner ─────────────────────────────────────────────────────────
  const banner = card.createDiv({ cls: "jjc-banner" });
  const src = bannerOf(plugin, type);
  if (src) {
    // `getResourcePath` turns a vault path into something the renderer can
    // load; an external URL is passed through. Set as a background rather than
    // an <img> so the crop is CSS's problem and a wrong aspect ratio cannot
    // change the card's height — every card in the grid must be one height or
    // the rows stop reading as rows.
    const file = getFile(plugin.app, src);
    const url = file ? plugin.app.vault.getResourcePath(file) : src;
    banner.style.backgroundImage = `url("${url}")`;
    banner.addClass("has-image");
  } else {
    // The wash. The emoji is the journal's identity glyph — the same one its
    // row in the Journals card wears — so a vault with no images still reads
    // as four distinct things rather than four grey rectangles.
    banner.style.setProperty("--jjc-hue", String(hueOf(type.id)));
    banner.createDiv({ cls: "jjc-glyph", text: type.emoji });
  }

  // The overflow control, on the banner as in the reference. Built ON CLICK,
  // which is `overflowButton`'s own rule: the menu describes the journal as it
  // is when opened rather than as it was when the grid rendered.
  overflowButton(banner, "jjc-menu", (menu) => {
    menu.addItem((i) =>
      i
        .setTitle(`Open ${type.name}`)
        .setIcon("book-open")
        .onClick(() => void openIndex(plugin, type))
    );
    const top = type.levels[0];
    menu.addItem((i) =>
      i
        .setTitle(`New ${top.noun.toLowerCase()}`)
        .setIcon("plus")
        .onClick(() => void plugin.journals.newTopLevel(type))
    );
  });

  // ── The body ───────────────────────────────────────────────────────────
  const body = card.createDiv({ cls: "jjc-body" });
  const title = body.createEl("a", {
    cls: "jjc-title",
    text: type.name,
    href: folderNotePath(type.root).replace(/\.md$/, ""),
  });
  title.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openIndex(plugin, type);
  });

  // ── The numbers (4.37) ─────────────────────────────────────────────────
  //
  // WHAT STOOD HERE was a subtitle carrying `countLabel(tops.length, …)` — "4
  // subjects" — chosen because the reference design's course code has no
  // equivalent in Almanac and the slot wanted the fact a reader glances for.
  // That was right about the fact and wrong about how much room it deserved: a
  // card 240px wide and 116px of banner tall, on the homepage, saying one thing.
  //
  // The count is still here; it is the strip's fourth cell now, and three more
  // stand beside it. This is the paragraph at the top of this file — *"the
  // card's CONTENT beyond a name, a count and two actions is deferred"* —
  // arriving, so that paragraph is rewritten rather than left standing.
  //
  // NOTHING HERE IS NEW ARITHMETIC, which is the whole reason it is cheap. Every
  // figure comes from the function the container cards already read, scoped to
  // the journal's root instead of one container — so a journal's card and the
  // dashboard it opens cannot disagree about how many notes are in it.
  const folder = getFolder(plugin.app, type.root);
  const tops = journalChildFolders(plugin, type, folder);
  const { pages, lastActive } = folderActivity(plugin.app, type.root);

  const ratingDef = ratingDefOf(plugin, type);
  const cards: StatCard[] = [
    { label: "notes", value: String(pages.length) },
    { label: "last", value: relativeActivity(lastActive) || "—" },
    { label: "open", value: "…" },
  ];

  // THE FOURTH CELL IS THE RATING WHERE THERE IS ONE, AND THE COUNT OTHERWISE.
  //
  // AND THE RATING IS ALLOWED HERE, WHICH IS WORTH SHOWING THE WORKING ON.
  // `journals-header.ts` deleted an "avg confidence" cell in 2.44 and wrote three
  // reasons; two were bugs and the third was a scope. Taking them in order: it
  // averaged across every kind of every type — `confidenceKinds` is the filter
  // that fixes that and is what this reads; it printed `/5` beside a configurable
  // range — nothing here prints a denominator; and *"the band spans every
  // registered journal at once, and a type rates its kinds on whatever it
  // likes"*. **A card is one journal.** That note's own conclusion is the
  // permission: *"an average rating is a fact about one journal."*
  //
  // FOUR CELLS ON EVERY CARD, unlike the container card's three-or-four. A grid
  // of journal cards is read across, so a card with three cells beside cards with
  // four breaks the row — and there is always something honest for the fourth to
  // say, because a journal that rates nothing still has a count of what is in it.
  // What it costs is the count on a journal that DOES rate: `.jjc-menu` still
  // names the level and the dashboard states it in full.
  if (ratingDef) {
    const ratingId = ratingDef.id;
    const conf = confidenceStats(
      pagesUnder(plugin.app, type.root),
      ratingId,
      confidenceKinds(plugin, type.root, ratingId)
    );
    // An em dash rather than 0.0 when nothing is graded — `buildTopicStats`' rule:
    // an average of no readings is absent, not zero.
    //
    // THE BARE NOUN, WITHOUT "avg" (4.38) — the same change and the same reason
    // as `containerCard`'s fourth cell: it was the one label on this grid long
    // enough to wrap in a 240px track, and it is the only one of the four that
    // tried to say how it was computed. See `tables.ts` for the full note.
    cards.push({ label: ratingWord(ratingDef), value: conf ? conf.avg : "—" });
  } else {
    cards.push({
      label: plural(type.levels[0].noun).toLowerCase(),
      value: String(tops.length),
    });
  }

  const strip = body.createDiv({ cls: "jjc-stats" });
  const { cells } = statStrip(strip, cards);

  // Open tasks are `- ( )` lines in note BODIES, invisible to the metadata cache,
  // so this cell ships a placeholder and fills on resolve — the idiom `childRow`
  // and `containerCard` both use.
  const openCell = cells[2].value;
  void sumBodyTasks(
    plugin.app,
    pages.map((p) => p.file)
  ).then(({ open }) => {
    if (!openCell.isConnected) return;
    openCell.setText(open ? String(open) : "—");
  });

  // ── THE ACTION ROW STOOD HERE AND IS DELETED (4.38) ────────────────────
  //
  // It held two icon buttons, and BOTH were already on the card twice over. *Open*
  // is what the title does — the title is a link to the same folder note, which is
  // 4.37's whole reason for making the card link there — and ＋ is the second entry
  // in the ⋯ menu ten lines up. So a card carried three controls for two actions.
  //
  // THIS IS 4.36.3's DELETION, ON THE OTHER CARD FAMILY. The dashboard's level cards
  // had the identical row for the identical reason and it went for the identical
  // argument: *"both were answering questions the card had already answered."* That
  // it survived here is only because the two families are built by two widgets.
  //
  // THE ⋯ IS WHAT STAYS, and it is the right one of the three to keep: it is
  // overflow, it is built on click so it describes the journal as it is rather than
  // as it rendered, and it is the one control on the card that is not a duplicate of
  // something else. What the card loses is ~36px per card and a footer edge.
  void ctx;
  return card;
}

async function openIndex(plugin: AlmanacPlugin, type: JournalType): Promise<void> {
  const file = getFile(plugin.app, folderNotePath(type.root));
  if (file) await openFile(plugin.app, file);
}

// `action` STOOD HERE AND IS DELETED WITH ITS ROW (4.38). It built one `.jjc-action`
// icon button and had two callers, both of which were duplicating a control the card
// already had. `overflowButton` covers what is left; see the note above.

// ── DRAG A CARD TO REORDER THE JOURNALS (4.40) ─────────────────────────
//
// THE READER'S ASK, AND THE SHAPE IT CAME IN: *"cards should gain the drag and
// drop ... similar to dragging sections"*, with the reorganise BUTTON asked for
// separately. Those are two surfaces, and 4.40 gives each the affordance that
// suits it rather than the same one twice: this grid draws journals as cards, in
// a row, at a size a hand can move — so the cards are dragged. The Journals page
// draws them as full-width stacked sections with their contents inside, which is
// not a thing to pick up, so there the order is changed from a window behind a
// button. One write underneath both (`journal-order.ts`).
//
// ── AND 4.8.1 IS THE PRECEDENT THAT HAD TO BE ANSWERED ───────────────────
//
// It REMOVED whole-block dragging, on the argument that a drag and a dialog were
// two ways to do one thing and *"keeping both meant every block on every page
// carrying a permanent invitation to the weaker one"*. That argument is about
// two controls on the SAME surface, and it is why the button is not also on this
// grid and the drag is not also on the sections: a reader on either page is
// offered exactly one way to reorder journals. The gesture is not competing with
// anything here — the homepage's card grid has no window to lose to.
//
// WRITES ON DROP, WITH NO CONFIRMATION, which is that file's other rule and its
// reason holds unchanged: *"the gesture IS the consent, and a confirmation after
// a direct manipulation is the dialog again with extra motions."* The cards
// visibly move, because `applyJournalOrder` fires the repaint every journals
// widget already subscribes to.
function attachCardDrag(
  plugin: AlmanacPlugin,
  card: HTMLElement,
  id: string
): void {
  card.draggable = true;
  card.dataset.journalId = id;
  card.addEventListener("dragstart", (e) => {
    // THE ID TRAVELS IN THE PAYLOAD, not in a variable in this closure. A grid
    // rebuilds on every repaint — including the one this drag causes — so a
    // module-level "currently dragging" would be read by handlers belonging to
    // cards that no longer exist. `dataTransfer` is owned by the gesture and
    // dies with it, which is the lifetime we actually want.
    e.dataTransfer?.setData(JOURNAL_DRAG_TYPE, id);
    e.dataTransfer?.setData("text/plain", id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    card.addClass("is-dragging");
  });
  card.addEventListener("dragend", () => card.removeClass("is-dragging"));
  card.addEventListener("dragover", (e) => {
    // ONLY A JOURNAL CARD IS A DROP TARGET. A file dragged in from the explorer,
    // a link from another note, a selection of text — all of those fire
    // `dragover` on anything under the pointer, and a grid that lit up for them
    // would be promising a move it has no way to make. The custom MIME type is
    // in `types` during the drag even though `getData` is blocked until drop,
    // which is exactly what it is there for.
    if (!e.dataTransfer?.types.includes(JOURNAL_DRAG_TYPE)) return;
    if (card.hasClass("is-dragging")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    card.addClass("is-drop-target");
  });
  card.addEventListener("dragleave", () => card.removeClass("is-drop-target"));
  card.addEventListener("drop", (e) => {
    card.removeClass("is-drop-target");
    const from = e.dataTransfer?.getData(JOURNAL_DRAG_TYPE);
    if (!from) return;
    e.preventDefault();
    void moveJournalOnto(plugin, from, id);
  });
}

// A MIME TYPE OF OUR OWN, lowercase because the drag-and-drop spec lowercases
// every type it stores and a mixed-case constant would never match `types`.
const JOURNAL_DRAG_TYPE = "application/x-almanac-journal";

export function buildJournalCards(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const root = createDiv({ cls: "jjc-grid" });
  const types = registeredJournalTypes(plugin);

  if (types.length === 0) {
    // `emptyCallout` REPLACES content, which is this case: there is no grid to
    // draw and the callout stands in for it. `empty.ts`'s rule wants both what
    // will appear and how to make it happen, and both are sayable here.
    root.addClass("is-empty");
    root.appendChild(
      emptyCallout(
        "book-open",
        "No journals yet",
        "Turn on Study or add a journal in Settings → Almanac → Journals, and each one gets a card here."
      )
    );
    return root;
  }

  for (const type of types) {
    const card = buildCard(plugin, ctx, type);
    attachCardDrag(plugin, card, type.id);
    root.appendChild(card);
  }

  // ── AND THE GRID ENDS IN THE SLOT FOR THE NEXT JOURNAL (4.38) ─────────
  //
  // Measured on `dev-screenshots/20260817_13h45m16s_grim.png`: two cards in a
  // 1170px section, which `auto-fill` had already divided into four tracks, so half
  // the grid was ground. As with `.jjs-grid`, the track minimum was NOT narrowed —
  // it would have made five tracks for two cards — because the gap is a count and
  // the honest thing to put at the end of a list is what adds to it.
  //
  // IT IS NOT `addTile`, AND THAT IS THE INTERESTING PART. Every other tile in the
  // plugin creates a FOLDER, so its action is `addContainer` and its parent is a
  // place. A journal is not a folder: it is a declared type with levels, kinds and
  // trackers, written by `scaffold.createJournalType` from a draft the settings
  // editor builds. There is no modal a widget could open to make one, so this tile
  // goes where journals are actually made — `openJournalSettings`, the guarded cast
  // `main.ts` already keeps for exactly this, and the same destination the empty
  // state above names in words.
  const label = "New journal";
  // NO `title` — the tile's own label says it. See `addTile`, which lost the
  // same duplicate in the same release.
  const tile = createEl("button", {
    cls: "jld-add jld-add-tile jjc-add",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(tile.createSpan({ cls: "jld-add-icon" }), "plus");
  tile.createSpan({ cls: "jld-add-label", text: label });
  tile.addEventListener("click", (evt) => {
    evt.preventDefault();
    // The section's head folds it on click and the cards open notes; neither
    // should fire because Settings was asked for.
    evt.stopPropagation();
    plugin.openJournalSettings();
  });
  root.appendChild(tile);
  return root;
}
