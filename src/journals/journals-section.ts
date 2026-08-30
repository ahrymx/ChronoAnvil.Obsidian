// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Journals section, rendered as one continuous card.
//
// This is the sibling of what `diary` does for the Diary section, and it exists
// for the same reason. Until 2.13.9 the Journals section was *generated
// markdown*: a `header:📚 Journals` bar, a `journals-header` widget, then per
// registered type a `header:2:` bar followed by one `[!study]` callout per
// subject. Obsidian renders every markdown block as its own sibling element in
// the preview, so those were four-plus separate boxes with the note's block
// spacing between them, and no amount of styling could close that — a run of
// siblings can be made to *look* welded, but the illusion breaks the moment one
// of them is hidden (collapse) or the list length changes.
//
// The Diary had already solved this by rendering its whole section from one
// directive: `buildCalendar` puts the greeting band, the month grid, the footer
// and the agenda inside a single `.ca-journal-calendar` card, and the band merely
// cancels the card's padding so its tint reaches the edges. One directive, one
// DOM subtree, one object. This module is the same move for Journals.
//
// What that buys, beyond the look:
//
//   • Collapse becomes real containment. headerbar.ts has to *derive* a bar's
//     scope by walking block-level siblings and reconstructing nesting from
//     data-headerLevel, because a header bar physically cannot contain its
//     section. Here a type's body is a child element, so folding is a class on
//     a parent. The persisted keys are unchanged ("<notePath>::<title>"), so
//     state carries over from the header-bar era.
//   • Per-subject folding comes free, which is where long topic lists actually
//     live. A callout can't do this without `[!study]-`, which folds by
//     default and forgets its state.
//   • The section is live. It used to be a snapshot that a full-note rewrite
//     refreshed on every subject/topic change; now it's a widget over the
//     journal roots, so creating a subject repaints it in place.
//
// Everything shown is read straight from the vault's folder tree — the same
// childFolders() walk the markdown builder used. No new persistence.

import { MarkdownPostProcessorContext, setIcon, TFolder } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { buildJournalsHeader } from "./journals-header";
import { openReorganiseJournals } from "./reorganise-journals";
import {
  JournalLevel,
  JournalType,
  journalChildFolders,
  registeredJournalTypes,
  folderEmoji,
  hueOf,
} from "./journal";
import { getFolder, plural } from "../core/util";
import { addCardTile, addTile, childRow, folderLink } from "../ui/tables";
import { sectionFrame } from "../ui/section-frame";

// ── Collapse state ───────────────────────────────────────────────────────
// Shares settings.collapsedNoteSections with headerbar.ts, whose own keys are
// `"<notePath>::<title>"`. This section's are `"<notePath>::journal:<id>…"`
// (see foldKey) — namespaced so the two cannot collide, and keyed by id so
// renaming a journal or changing its emoji doesn't lose the fold.
//
// The keys were the bar's shape exactly, so that a vault which had collapsed
// "🎓 Study" under the old header bar opened with Study still collapsed. There
// are no such vaults — 2.41 deleted the rest of that compatibility surface —
// and the cost of keeping the shape was that the fold state of a journal was
// keyed by two strings the wizard can edit.

function isCollapsed(plugin: ChronoAnvilPlugin, key: string): boolean {
  return plugin.settings.collapsedNoteSections?.[key] === true;
}

async function setCollapsed(
  plugin: ChronoAnvilPlugin,
  key: string,
  v: boolean
): Promise<void> {
  if (!plugin.settings.collapsedNoteSections) {
    plugin.settings.collapsedNoteSections = {};
  }
  const map = plugin.settings.collapsedNoteSections;
  if (v) map[key] = true;
  else delete map[key];
  await plugin.saveSettings();
}

// Wire a head element as a fold control for a body element. Returns nothing —
// the DOM is the state, and the settings write is fire-and-forget (a failed
// save costs a remembered fold, not correctness).
//
// ONE CALLER AS OF 4.13.3: a journal type. Subjects folded too until this
// release turned them into cards, and a card has no stack under it to close up.
// The function is unchanged and stays general — what it wires is "a head, a
// body, a key", and the second caller went for a reason about the SUBJECT rather
// than a reason about folding.
function makeFoldable(
  plugin: ChronoAnvilPlugin,
  section: HTMLElement,
  head: HTMLElement,
  key: string
): void {
  // THE RIGHT-HAND END, WITH EVERY OTHER HEADER BAR'S (4.13 §1b). `head` is a
  // `.ca-journal-sec` — the same object the dashboards' section bars are — so a
  // chevron prepended here put two fold controls on opposite sides of one page:
  // the Journals section's own bar opening from the right and every group head
  // inside its card opening from the left. Inserted before the actions rather
  // than appended, for the reason `headerbar.ts` gives at its own toggle.
  const chevron = createDiv({ cls: "ca-jjs-toggle" });
  setIcon(chevron, "chevron-down");
  const actions = head.querySelector(".ca-journal-header-widgets");
  if (actions) head.insertBefore(chevron, actions);
  else head.appendChild(chevron);
  head.addClass("is-foldable");

  const apply = (collapsed: boolean) =>
    section.toggleClass("is-collapsed", collapsed);
  apply(isCollapsed(plugin, key));

  head.addEventListener("click", (evt) => {
    // Clicks on the row's own controls (buttons, the subject link) act, they
    // don't fold. Only the bare strip is a fold target — the same rule the
    // header bars use for their anchored widget group.
    const target = evt.target as HTMLElement;
    if (target.closest(".ca-jjs-actions, a")) return;
    evt.preventDefault();
    const next = !isCollapsed(plugin, key);
    apply(next);
    void setCollapsed(plugin, key, next);
  });
}

// ── Small builders ───────────────────────────────────────────────────────

interface BtnSpec {
  label: string;
  icon: string;
  primary?: boolean;
  onClick: () => void;
}

function addButtons(parent: HTMLElement, specs: BtnSpec[]): HTMLElement {
  const group = parent.createDiv({ cls: "ca-jjs-actions" });
  for (const spec of specs) {
    const btn = group.createEl("button", { cls: "ca-journal-btn" });
    if (spec.primary) btn.addClass("mod-cta");
    setIcon(btn.createSpan({ cls: "ca-journal-btn-icon" }), spec.icon);
    btn.createSpan({ cls: "ca-journal-btn-label", text: spec.label });
    btn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      spec.onClick();
    });
  }
  return group;
}

// ── `primaryKindButton` IS DELETED (4.13.4) ─────────────────────────────
//
// It built one `+ {kind}` — "New Entry", "New Recipe" — onto the head of every
// card belonging to a FLAT journal, i.e. one with no sub-level.
//
// ITS OWN HISTORY IS THE ARGUMENT FOR REMOVING IT. It was what remained of
// `kindButtons()`, which hung one button per kind on every row of every table;
// 2.51 took those off the two-level tables because "a subject with six topics was
// rendering twelve buttons, the rows were about half button by width, and the
// buttons repeated down the column while the thing that varied — which topic
// this is — was the short bit on the left." A flat type kept one on the argument
// that it had no other row to put it on and would otherwise have no create path
// on this page.
//
// The first half of that argument was true and the second was not, and the cards
// made the difference visible: a flat journal draws N cards and each one carried
// the same button, so 2.51's complaint reappeared at one per card instead of two
// per row. The create path it was protecting is not lost either — the JOURNAL's
// own bar carries `+ {top level}`, and the note-level action survives where it
// always did: the command palette, `button:<type>:new-<kind>` on a note, and the
// container's own index.
//
// So a flat card is its head. That is a thinner object than a two-level one and
// it is the honest drawing of a journal that has one layer.

// A fold key for one of this section's rows.
//
// KEYED BY ID, NOT BY WHAT THE ROW SAYS. A type's key was
// `<notePath>::<emoji> <name>`, both of which the wizard can edit — so
// changing a journal's emoji or correcting its name silently reset its fold.
// The comment defended that shape as carrying folds over "from the header-bar
// era", but 2.41 deleted the pre-userbase compatibility surface, so the
// migration it was protecting has had nothing to protect since.
//
// Namespaced, so a key cannot collide with a header bar's own
// `<notePath>::<title>` entry in the same map.
//
// VARIADIC FOR ONE CALLER SINCE 4.13.3, which passed a type id and a folder path
// when a subject could fold. Kept as `...parts` rather than narrowed to a single
// id: the shape is what makes a key unambiguous when a second level comes back,
// and a reader's existing two-part subject keys still parse as what they were.
// They are no longer READ — a subject is a card — and they are deliberately not
// migrated away either. A stale entry in a per-note, per-id map costs nothing,
// and rewriting a reader's settings to tidy ours is the worse trade.
function foldKey(sourcePath: string, ...parts: string[]): string {
  return `${sourcePath}::journal:${parts.join("/")}`;
}

// A level always has a fallbackEmoji, and both call sites pass a level that is
// always present, so the extra `fallback` argument this took — Study's
// DEFAULT_SUBJECT_EMOJI / DEFAULT_TOPIC_EMOJI — was unreachable behind the
// level's own. Two Study constants imported into a type-agnostic renderer to
// be ignored.
function levelEmojiFor(
  plugin: ChronoAnvilPlugin,
  level: JournalLevel,
  name: string
): string {
  return folderEmoji(plugin, name, level.fallbackEmoji);
}

// `countLabel` STOOD HERE AND IS DELETED (4.37).
//
// It formatted "3 topics" / "1 topic" / "" at zero. 4.13.2 §2 took the count off
// both of this file's bars and the function survived on ONE caller, with the
// distinction written down: `journals-cards.ts` used it as a card's subtitle,
// where *"the thing being counted is NOT on the screen — a card says '4 subjects'
// about a list it does not show, which is a reading rather than a tally of
// visible rows."*
//
// THAT DISTINCTION IS STILL TRUE AND STILL DRAWN; what is gone is the string.
// The journals card has a stat strip now, and a strip splits the number from the
// noun — a cell is a `--ca-text-2xs` small-caps LABEL over a `1.15em` value, so
// there is nothing for a function returning "4 subjects" to be put into. The
// reading survives as the strip's fourth cell.
//
// Its pluralisation lesson goes with it and is worth carrying: it was once a
// second, cruder pluraliser two imports from the real one, and both of the
// wizard's own worked examples broke under it — "3 dishs", "3 entrys". The cell
// label goes through `plural()` for that reason.

// `TOPICS_SHOWN = 8` STOOD HERE AND IS DELETED (4.13.4). It capped a card's list
// and sent the remainder to the subject's own note, because 4.13.3 had taken the
// fold away and a thirty-topic card is a column of one card beside a column of
// air. **A fixed height with a scrolling body is the same answer without the
// hiding**: every card is its bar plus four lines whatever is in it, the grid is
// a row rather than a ragged edge, and a long subject is a scroll away rather
// than a page away. The number four now lives in `.ca-jjs-card-body`, which is the
// only place that can honestly hold it — it is a height, not a count.
//
// `topicRow` MOVED TO `tables.ts` AS `childRow` (4.36), and is imported above.
//
// It had one caller until `level-cards` drew the same line in the right-hand
// card of a pair. What the two widgets share is the ROW and the NUMBERS rather
// than the card — 4.13.3's own sentence, and the reason the pair is not this
// card at a different size.
//
// RENAMED WITH THE MOVE. "Topic" is Study's word for its second level and this
// draws whatever the journal calls that thing, which was the last Study literal
// left in the row.

// ── One subject group (a top-level container folder) ─────────────────────

function buildGroup(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType,
  folder: TFolder
): HTMLElement {
  const twoLevel = type.levels.length > 1;
  const childLevel = type.levels[1];
  const subs = twoLevel ? journalChildFolders(plugin, type, folder) : [];

  // ── THE SUBJECT IS A CARD (4.13.3) ─────────────────────────────────────
  //
  // It was a bar with an accent left-rail and a fold chevron, in a stack of
  // other bars. Three arrangements of this list have now been rendered and the
  // maintainer's reading of the third was that it should be cards — **at the top
  // level only**, so a subject is a card and a topic is a line inside one rather
  // than a card of its own.
  //
  // THE HEAD IS STILL `sectionFrame`, AND THAT IS THE WHOLE OF WHY THIS IS
  // CHEAP. The chosen mockup's head is a slim recessed band carrying a glyph in
  // a fixed slot and a name in small caps at `--ca-bar-text` — which is what a
  // level-2 section bar already IS since 4.13 §1. The card is a box around it
  // and a ground under it; nothing about the title, its truncation, its glyph
  // slot or its link is re-stated here.
  //
  // AND THE FOLD GOES WITH THE BAR. A card is not a section run — there is no
  // stack for a chevron to close up — and the maintainer took that trade
  // explicitly when choosing this shape. Consequences, both deliberate:
  // `makeFoldable` is no longer called for a group, so `foldKey`'s three-part
  // spelling now has one caller (the type); and a reader who had collapsed
  // subjects keeps those keys in `collapsedNoteSections`, unread. They are left
  // rather than migrated — the map is keyed per note and per id, so a stale entry
  // costs nothing and deleting a reader's settings to tidy our own is a worse
  // trade than an unread key.
  const card = createDiv({ cls: "ca-jjs-card" });
  // The one section whose title is a link — see `titleRender` in
  // section-frame.ts. The slot is the frame's, so the size, the truncation and
  // the alignment match every other section; what goes in it is a subject's
  // own name, wired to open that subject.
  //
  // NO COUNT ON THE BAR SINCE 4.13.2 §2. It read "1 topic" beside a subject
  // whose topics are listed directly underneath it, which is a number counting
  // something already on the screen.
  sectionFrame(card, {
    title: folder.name,
    glyph: levelEmojiFor(plugin, type.levels[0], folder.name),
    level: 2,
    owns: "children",
    titleRender: (slot) =>
      folderLink(plugin, slot, folder, ctx.sourcePath, "ca-jjs-group-name"),
  });

  if (!twoLevel) {
    // Flat type: no sub-level to list, so there is no body and, as of 4.13.4, no
    // button either — the card is its head. See `primaryKindButton`'s deletion
    // above for why. A flat card and a two-level one differ in what is UNDER the
    // bar and in nothing else, which is why the frame above is built before this
    // branch and its return value is no longer needed by either of them.
    //
    // Before 2.51 this branch built a body holding one row that read "Add a
    // note" followed by a button per kind. That row existed to give the buttons
    // somewhere to live; the buttons are gone and so is any reason for a body.
    return card;
  }

  const body = card.createDiv({ cls: "ca-jjs-card-body" });

  if (subs.length === 0) {
    // ── THE EMPTY STATE IS THE CONTROL (4.38) ──────────────────────────
    //
    // This sentence read *"add one from this journal's row above"*, and the row it
    // named was deleted in 4.36–4.37 — the second time this exact string went stale
    // by describing chrome that moved. The comment it replaces had already spotted
    // the pattern and drawn the wrong conclusion from it: it named the PLACE rather
    // than the label, on the theory that a place is more stable than a word. A
    // place is not more stable, and prose about a control is the wrong shape of
    // answer either way.
    //
    // So the empty body IS the affordance — `addTile`, the same dashed slot the
    // level grid ends with, filling the space the rows would have used. Nothing to
    // keep in step, because there is no longer a sentence describing where anything
    // is.
    body.appendChild(addTile(plugin, type, folder, childLevel.noun));
    return card;
  }

  // ── The lines inside the card ──────────────────────────────────────────
  //
  // A name, when a note under it was last dated, and what is open beneath it.
  // Those two numbers are 4.13.2's and the argument for them is unchanged:
  // *Activity* answers "have I kept this up" per topic — the question the banner
  // answers for the whole vault at once — and *Open* answers "is there work left
  // in it". Per-kind counts and an average rating were both considered and
  // refused there, and a card does not revive them.
  //
  // NOT `recordList` ANY MORE, AND THAT IS THE ONE THING THIS RELEASE GIVES UP.
  // 4.13.2 drew these through the shared record list for its heading strip, its
  // tracks and its ARIA roles. A card has no heading strip — that was the
  // rejected variant D, whose whole difficulty was that the column key repeats
  // once per card — and a table's roles over three rows with no header is markup
  // describing a table that is not there. So the rows are the card's own, and
  // what is still shared is the thing that actually mattered: the NUMBERS.
  //
  // `folderActivity` IS STILL `topics-table`'s HELPER. A subject's own dashboard
  // and this card read one implementation of "which of these notes is newest",
  // which is the drift `topic-stats` warns about in its own comment.
  //
  // NO GLYPH ON A LINE, which is the mockup's own answer to the head being a
  // band: the card's identity is in its head, and a column of emoji down the
  // left of three grey lines is a second identity competing with it.
  // EVERY CHILD IS DRAWN, AND THE CARD SCROLLS (4.13.4). 4.13.3 showed eight and
  // sent the rest to the subject's own note, because a card cannot fold and a
  // thirty-topic card is a column of one card beside a column of air. A fixed
  // height with a scrolling body answers the same problem without hiding
  // anything: every card in the grid is the height of its bar plus four lines,
  // whatever is in it, and the rest of a long one is a scroll away rather than a
  // page away. The cap, the `+ N more` link and the branch for a folder with no
  // index note all go with it — see `.ca-jjs-card-body` in
  // 60-heroes-and-banners.css, which is where the four is stated.
  for (const sub of subs) childRow(plugin, ctx, body, sub);

  return card;
}

// ── One journal type (Study, or a custom type) ───────────────────────────

function buildType(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType
): HTMLElement {
  const root = getFolder(plugin.app, type.root);
  const tops = journalChildFolders(plugin, type, root);
  const topLevel = type.levels[0];
  // `childLevel` STOOD HERE and went with the `＋ Topic` button in 4.38.4. The
  // level itself is not gone — `buildGroup` reads it to name a subject's rows and
  // its empty tile — only this function's use of it.

  const section = createDiv({ cls: "ca-jjs-type" });
  // THE HUE, ON THE TYPE (4.38). Every card in this group belongs to this
  // journal, so the tint on their heads is set once here and read from an ancestor
  // — a card that resolved its own could not be made to disagree with its
  // siblings, which is the same reason `buildLevelCards` sets it on the grid.
  // `.ca-jjs-card > .ca-journal-sec` is what reads it.
  section.style.setProperty("--jjc-hue", String(hueOf(type.id)));
  // `owns: "children"` — the type's body is the `jjs-type-body` div below,
  // inside this widget's own DOM. It folds by toggling a class on itself
  // (makeFoldable), not by walking the note's blocks, so it must not carry the
  // fold walk's marker. See section-frame.ts.
  // NO COUNT HERE EITHER (4.13.2 §2) — "1 subject" over a list of one subject.
  // See the same removal on the group bar below; the two went together because
  // they were one habit rather than two decisions.
  const frame = sectionFrame(section, {
    title: type.name,
    glyph: type.emoji,
    level: 1,
    owns: "children",
    // ── THE TITLE OPENS THE JOURNAL (4.42) ──────────────────────────────
    //
    // The head named the journal and went nowhere, while every card BELOW it has
    // been a link to its own folder note since 4.13.3. So the page's shallowest
    // object was the only one you could not enter, and the way in was the file
    // explorer.
    //
    // `folderLink` RATHER THAN AN ANCHOR WRITTEN HERE, and the reason is one
    // line in it: a card's head is a fold target, so the link stops propagation
    // as well as preventing the default — *"a click that opened the subject and
    // ALSO folded its journal would do two things for one press"*. That is
    // exactly this bar's situation one rank up, and a second implementation is
    // one that will be missing that line.
    //
    // THE TITLE ONLY. The glyph, the empty span past the name and the chevron all
    // still fold, which is the same division the subject cards already use — so
    // the gesture means the same thing at both ranks rather than inverting
    // between them.
    //
    // A JOURNAL WHOSE FOLDER NOTE IS NOT THERE stays plain text: `folderLink`
    // draws `is-orphan` instead of a dead link, which is the rule a container row
    // has followed since it was written — *"a folder with no index note of its
    // own is still a row; it just has nothing to open"*.
    titleRender: root
      ? (slot) =>
          folderLink(plugin, slot, root, ctx.sourcePath, "ca-jjs-type-name", type.name)
      : undefined,
  });
  const head = frame.root;

  // `+ Subject` / `+ Topic`, not `+ New Subject` / `New Topic`.
  //
  // The plus sign already says "new"; the word repeated it, and it repeated it
  // on the widest control in the busiest row. Both buttons take the same icon
  // for the same reason — the child's `folder-plus` was drawing a distinction
  // (this one makes a folder, that one makes a folder) that is true of both and
  // interesting about neither, while making the pair look like two unrelated
  // controls rather than one level and the level below it.
  // ── THE HEAD KEEPS ONLY WHAT THE GRID DOES NOT OFFER (4.38.1) ──────────
  //
  // `＋ Subject` stood first in this list, and 4.38 put a "New subject" tile at
  // the end of the grid below — the SAME action, twice, about 40px apart, on
  // every journal on the page. Four journals meant four duplicated buttons.
  //
  // THE TILE IS THE ONE THAT SURVIVES, and it is the better of the two on its
  // own terms rather than merely the newer: it sits in the place the thing it
  // makes will appear, at the end of the list of them, which is the shape
  // `journal-tracker-add` argued for and 4.37 already applied to the level cards.
  // A button on a section head is chrome about the section; a slot at the end of
  // a grid is the grid saying what comes next.
  //
  // THE CHILD BUTTON STAYS, because nothing else offers it. A topic belongs to a
  // subject, and only an EMPTY subject card carries a "New topic" tile — a
  // subject that already has topics has no tile, so this is the only path to a
  // second one from this page.
  //
  // AND THE TOP-LEVEL BUTTON COMES BACK WHERE THERE IS NO TILE. `buildType` draws
  // the tile only when the journal's root folder exists; a registered journal
  // whose folder has never been made has no tile in either branch, and removing
  // this button unconditionally would leave that journal with no create path at
  // all. `newTopLevel` does not need the folder, so the button is the fallback
  // exactly where the tile cannot be.
  const specs: BtnSpec[] = [];
  if (!root) {
    specs.push({
      label: topLevel.noun,
      icon: "plus",
      primary: true,
      onClick: () => void plugin.journals.newTopLevel(type),
    });
  }
  // ── AND THE CHILD-LEVEL BUTTON IS GONE TOO (4.38.4) ───────────────────
  //
  // `＋ Topic` / `＋ Project` stood here, kept in 4.38.1 on the argument that
  // nothing else offered a second child. The maintainer's call is that a second
  // control on every journal's title bar is noise the page does not earn — four
  // journals is four of them, on bars whose job is to say which journal you are
  // looking at.
  //
  // WHAT THIS COSTS, STATED PLAINLY because it is a real gap rather than a
  // tidy-up with no downside: a subject that ALREADY has topics has no ＋ on this
  // page. An empty one shows the add tile in its body, and the journal's own
  // dashboard carries the ＋ on every card head — but from the homepage, adding a
  // second topic to Chemistry is now the command palette or the dashboard.
  // AND THE GAP IS THE DECISION, NOT A LOOSE END (4.39.1). A ＋ on the subject
  // card's own head was offered — it is what the level cards do and it would have
  // closed this exactly — and was declined. **The homepage is read-only for
  // topics.** It lists what is in a journal; making things in it is the journal's
  // own dashboard's job, and the command palette's. Anyone reading this comment
  // and reaching for the obvious fix should know it was considered and refused,
  // rather than that nobody had got to it.
  //
  // NOTHING DRAWN WHERE THERE IS NOTHING TO DRAW. Most journals now have no head
  // control at all, and `addButtons` would otherwise leave an empty `.ca-jjs-actions`
  // div inside the widgets bar, which defeats the `:empty` rule in
  // 30-header-bars.css that hides an unused slot.
  if (specs.length > 0) addButtons(frame.actions, specs);

  makeFoldable(plugin, section, head, foldKey(ctx.sourcePath, type.id));

  const body = section.createDiv({ cls: "ca-jjs-type-body" });

  if (tops.length === 0) {
    // ── THE TILE IS THE EMPTY STATE (4.39.1) ────────────────────────────
    //
    // This branch drew three things that said one thing: a title `No subjects
    // yet`, a sentence `Subjects appear here automatically.`, and then a
    // card-shaped dashed tile reading `＋ New subject`. Since 4.38.4 the tile is
    // an empty card in the same grid the populated branch draws, and an empty
    // card in an otherwise empty grid ALREADY says the level is empty — that is
    // the whole reason it was given card chrome. The title restated it in words
    // and the sentence restated the title. Two of the three go.
    //
    // WHAT WENT WITH THEM, AND WHY IT IS NOT A LOSS OF INFORMATION. The sentence
    // carried a real fact — a folder made in the file explorer is picked up here
    // without being registered — and the fact survives being unsaid, because the
    // only reader it can reach is one who has already made such a folder, and
    // that reader is by definition not looking at this branch. The empty state is
    // read by someone with nothing, and the one thing worth telling them is where
    // to start.
    if (root) {
      body
        .createDiv({ cls: "ca-jjs-grid" })
        .appendChild(addCardTile(plugin, type, root, topLevel.noun));
      return section;
    }
    // NO FOLDER, NO TILE, SO THE WORDS STAY. `getFolder` returns null for a
    // registered journal whose root has not been created yet — a preset enabled
    // and never used — and the tile's action needs the parent to work out which
    // level it is creating. This is the one state where nothing is drawn unless
    // the callout draws it, and where the sentence is the true answer rather than
    // a restatement: the folder, and with it the tile, appears when the journal is
    // first used.
    const empty = body.createDiv({ cls: "ca-jjs-empty" });
    empty.createDiv({
      cls: "ca-jjs-empty-title",
      // IT NAMES WHAT IS MISSING, NOT WHAT IT IS INSIDE (4.38.4). This read
      // `No ${splitGlyph(type.name).text.toLowerCase()} journals yet` and
      // disagreed with the line under it about what was absent. The journal is
      // not missing; it is titled two lines up. What is missing is a SUBJECT.
      text: `No ${plural(topLevel.noun).toLowerCase()} yet`,
    });
    empty.createDiv({
      cls: "ca-jjs-empty-body",
      text: `${plural(topLevel.noun)} appear here automatically.`,
    });
    return section;
  }

  // A GRID, NOT A STACK (4.13.3). The subjects were bars laid one under another
  // because a bar is full-width by nature; a card is not, and four of them in a
  // column would be four boxes each wasting two-thirds of a wide page.
  //
  // `auto-fill` WITH A MIN TRACK, which is `.ca-jjc-grid`'s shape and its argument:
  // the column count answers to the WIDGET's width — the pane, the canvas node
  // or the row cell it was dropped into, all of which are `container-type:
  // inline-size` — rather than to the window's. A media query here would be the
  // fault 4.3.1 spent a release on, where a breakpoint on the block could not
  // describe a cell.
  const grid = body.createDiv({ cls: "ca-jjs-grid" });
  for (const folder of tops) {
    grid.appendChild(buildGroup(plugin, ctx, type, folder));
  }
  // AND THE GRID ENDS IN THE SLOT FOR THE NEXT ONE (4.38), which is the level
  // grid's argument at `addTile` and the fix for a measured complaint: in
  // `dev-screenshots/20260817_13h45m10s_grim.png` this grid drew two 334px tracks
  // and had one subject, so half the section was bare.
  //
  // THE TRACK WIDTH IS NOT THE PROBLEM AND WAS NOT NARROWED. `auto-fill` had
  // already made more tracks than there were cards, so a smaller minimum would have
  // made MORE empty tracks, not fewer — the gap is a card count, and the only thing
  // that fills a trailing gap honestly is the control that adds the next card.
  if (root) grid.appendChild(addCardTile(plugin, type, root, topLevel.noun));
  return section;
}

// ── The section ──────────────────────────────────────────────────────────

export function buildJournalsSection(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  refresh: () => void
): HTMLElement {
  const types = registeredJournalTypes(plugin);
  const root = createDiv({ cls: "ca-journals-card" });

  // No types enabled: no numbers to show and no list to head, so the card is
  // just the explanation. The hero would be a band of zeroes saying the same
  // thing louder — the objection that kept journals-header.ts returning an
  // empty root in this case.
  if (types.length === 0) {
    root.addClass("ca-jjs-bare");
    const empty = root.createDiv({ cls: "ca-jjs-empty" });
    empty.createDiv({ cls: "ca-jjs-empty-title", text: "📚 No journals enabled" });
    empty.createDiv({
      cls: "ca-jjs-empty-body",
      text: "Turn on Study or add a custom journal in Settings → ChronoAnvil → Journals.",
    });
    return root;
  }

  const list = createDiv({ cls: "ca-jjs-list" });

  // The hero band: the same numbers and 53-week strip as before, but as the
  // card's top band rather than a card of its own — the exact relationship the
  // diary hero had to .journal-calendar until 4.13.1 §3 removed it. This is the
  // last band of that kind, and it is left alone deliberately: nobody has
  // rendered this page's hero and judged it.
  //
  // NO AREA TITLEBAR SINCE 4.8.1 — see the same removal in calendar.ts. The
  // strip named the root this card covers; the block's head names the block,
  // and the hero below already says JOURNALS in the largest type on the card.
  const band = root.createDiv({ cls: "ca-jjs-hero" });
  band.appendChild(
    buildJournalsHeader(plugin, {
      // ── REORGANISE, BESIDE REFRESH (4.40) ──────────────────────────
      //
      // THE READER'S ASK — *"a feature to reorganize journal, via a button on the
      // header bar"* — and this bar is the only one the section has. It is also
      // the right one: the button acts on the LIST below it, and this band is
      // what heads that list.
      //
      // FIRST, AND NOT BY HABIT. Refresh re-reads what is already there; this
      // changes it. The band's actions run left to right, and the one that
      // alters the page should not sit past the one that merely repaints it.
      //
      // NO EQUIVALENT ON THE HOMEPAGE, deliberately: that page draws journals as
      // cards and the cards are dragged. Both write through `journal-order.ts`.
      // See `attachCardDrag` for the 4.8.1 argument that keeps them apart.
      actions: [
        {
          label: "Reorganise",
          icon: "arrow-up-down",
          onClick: () => openReorganiseJournals(plugin),
        },
        { label: "Refresh", icon: "refresh-cw", onClick: refresh },
      ],
    })
  );

  for (const type of types) list.appendChild(buildType(plugin, ctx, type));
  root.appendChild(list);

  return root;
}
