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
// and the agenda inside a single `.journal-calendar` card, and the band merely
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
import type AlmanacPlugin from "../main";
import { buildJournalsHeader } from "./journals-header";
import {
  JournalLevel,
  JournalType,
  journalChildFolders,
  registeredJournalTypes,
  folderEmoji,
} from "./journal";
import { getFile, getFolder, noExt, openFile, plural } from "../core/util";
import { relativeActivity } from "../core/query";
import { folderActivity, sumBodyTasks } from "../ui/tables";
import { sectionFrame, splitGlyph } from "../ui/section-frame";

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

function isCollapsed(plugin: AlmanacPlugin, key: string): boolean {
  return plugin.settings.collapsedNoteSections?.[key] === true;
}

async function setCollapsed(
  plugin: AlmanacPlugin,
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
  plugin: AlmanacPlugin,
  section: HTMLElement,
  head: HTMLElement,
  key: string
): void {
  // THE RIGHT-HAND END, WITH EVERY OTHER HEADER BAR'S (4.13 §1b). `head` is a
  // `.journal-sec` — the same object the dashboards' section bars are — so a
  // chevron prepended here put two fold controls on opposite sides of one page:
  // the Journals section's own bar opening from the right and every group head
  // inside its card opening from the left. Inserted before the actions rather
  // than appended, for the reason `headerbar.ts` gives at its own toggle.
  const chevron = createDiv({ cls: "jjs-toggle" });
  setIcon(chevron, "chevron-down");
  const actions = head.querySelector(".journal-header-widgets");
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
    if (target.closest(".jjs-actions, a")) return;
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
  const group = parent.createDiv({ cls: "jjs-actions" });
  for (const spec of specs) {
    const btn = group.createEl("button", { cls: "journal-btn" });
    if (spec.primary) btn.addClass("mod-cta");
    setIcon(btn.createSpan({ cls: "journal-btn-icon" }), spec.icon);
    btn.createSpan({ cls: "journal-btn-label", text: spec.label });
    btn.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      spec.onClick();
    });
  }
  return group;
}

// A link to a container folder's index note ("Maths/Maths.md"), with the hover
// preview wiring Obsidian's own internal links get. Falls back to plain text
// when the index note is missing, which happens if someone made the folder by
// hand — better a visible, unclickable name than a dead link.
function folderLink(
  plugin: AlmanacPlugin,
  parent: HTMLElement,
  folder: TFolder,
  sourcePath: string,
  cls: string
): void {
  const file = getFile(plugin.app, `${folder.path}/${folder.name}.md`);
  if (!file) {
    parent.createSpan({ cls: `${cls} is-orphan`, text: folder.name });
    return;
  }
  const href = noExt(file.path);
  const a = parent.createEl("a", {
    cls: `${cls} internal-link`,
    text: folder.name,
    href,
    attr: { "data-href": href },
  });
  a.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    void openFile(plugin.app, file);
  });
  a.addEventListener("mouseover", (evt) => {
    plugin.app.workspace.trigger("hover-link", {
      event: evt,
      source: "almanac-journals",
      hoverParent: parent,
      targetEl: a,
      linktext: href,
      sourcePath,
    });
  });
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
  plugin: AlmanacPlugin,
  level: JournalLevel,
  name: string
): string {
  return folderEmoji(plugin, name, level.fallbackEmoji);
}

// "3 topics" / "1 topic" / "" at zero.
//
// NO LONGER USED BY THIS FILE (4.13.2 §2), which took the count off both of its
// bars. It stays exported and stays here: `journals-cards.ts` renders it as a
// card's subtitle, where the thing being counted is NOT on the screen — a card
// says "4 subjects" about a list it does not show, which is a reading rather
// than a tally of visible rows. That is the distinction the removal was about,
// so the function survives it.
//
// Through plural(), not `+ "s"`. This was a second and cruder pluraliser
// sitting a couple of imports away from the real one, and both of the wizard's
// own worked examples broke under it: a Cooking journal's sub-level noun
// "Dish" read "3 dishs", and the default kind "Entry" read "3 entrys". The
// noun is lowercased *after* pluralising, since the rules key off the ending.
export function countLabel(n: number, noun: string): string {
  if (n <= 0) return "";
  return `${n} ${(n === 1 ? noun : plural(noun)).toLowerCase()}`;
}

// `TOPICS_SHOWN = 8` STOOD HERE AND IS DELETED (4.13.4). It capped a card's list
// and sent the remainder to the subject's own note, because 4.13.3 had taken the
// fold away and a thirty-topic card is a column of one card beside a column of
// air. **A fixed height with a scrolling body is the same answer without the
// hiding**: every card is its bar plus four lines whatever is in it, the grid is
// a row rather than a ragged edge, and a long subject is a scroll away rather
// than a page away. The number four now lives in `.jjs-card-body`, which is the
// only place that can honestly hold it — it is a height, not a count.
//
// One child inside a subject's card: its name, when it was last worked, and what
// is open beneath it.
//
// A FUNCTION FOR ONE CALLER, deliberately. It had two until the cap went; what
// it is now is the SHAPE of a line in this card — a link, a relative date, and a
// count that arrives late — and that is worth naming even once, because the
// async fill at the end of it is the part a second copy would get wrong.
function topicRow(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  body: HTMLElement,
  sub: TFolder
): void {
  const { pages, lastActive } = folderActivity(plugin.app, sub.path);
  const row = body.createDiv({ cls: "jjs-card-row" });
  folderLink(plugin, row, sub, ctx.sourcePath, "jjs-row-link");
  // NAMED, BECAUSE THE GLYPHS ONLY EXPLAIN THEMSELVES ONCE THERE IS DATA
  // (4.35.2). Populated, these two read "3d ago" and "2 ◻" and need no header.
  // Empty — which is every row on a journal a reader has just made — they are
  // two bare em dashes with nothing to say which is which, and a screen reader
  // heard "dash dash" in either state, since neither cell carried a name.
  //
  // A `title` rather than a header row: the body's height is stated in ROWS
  // (see `.jjs-card-body`), so a header would cost one of the four notes a card
  // can show. This costs nothing and is also the accessible fix.
  const when = row.createSpan({
    cls: "jjs-card-when",
    text: relativeActivity(lastActive),
  });
  when.setAttr("title", "Last activity");
  when.setAttr(
    "aria-label",
    lastActive
      ? `Last activity: ${relativeActivity(lastActive)}`
      : "Last activity: none yet"
  );
  // An Almanac `- ( )` line lives in a note's BODY and is invisible to the
  // metadata cache, so this cell cannot be filled synchronously. It ships a
  // placeholder and fills on resolve — the idiom the banner's four numbers and
  // `topics-table`'s own Open column both use.
  const openCell = row.createSpan({ cls: "jjs-card-open", text: "…" });
  openCell.setAttr("title", "Open tasks");
  openCell.setAttr("aria-label", "Open tasks: counting…");
  void sumBodyTasks(
    plugin.app,
    pages.map((p) => p.file)
  ).then(({ open }) => {
    // The host may have been torn down, or the LiveWidget rebuilt, while the
    // reads were in flight — `buildJournalsHeader` guards its own fills the same
    // way and for the same reason.
    if (!openCell.isConnected) return;
    openCell.setText(open ? `${open} ◻` : "—");
    // The label is rewritten with the text, so it never describes the
    // placeholder the cell shipped with.
    openCell.setAttr(
      "aria-label",
      open === 0
        ? "No open tasks"
        : `${open} open ${open === 1 ? "task" : "tasks"}`
    );
    openCell.toggleClass("is-zero", open === 0);
  });
}

// ── One subject group (a top-level container folder) ─────────────────────

function buildGroup(
  plugin: AlmanacPlugin,
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
  // a fixed slot and a name in small caps at `--am-bar-text` — which is what a
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
  const card = createDiv({ cls: "jjs-card" });
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
      folderLink(plugin, slot, folder, ctx.sourcePath, "jjs-group-name"),
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

  const body = card.createDiv({ cls: "jjs-card-body" });

  if (subs.length === 0) {
    body.createDiv({
      cls: "jjs-empty-row",
      // Names the place, not the label. Prose that quotes a button breaks
      // silently every time the button is reworded — which it now has been
      // twice — and the card this sits in has the control two rows above it.
      text: `No ${plural(childLevel.noun).toLowerCase()} yet — add one from this journal's row above.`,
    });
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
  // index note all go with it — see `.jjs-card-body` in
  // 60-heroes-and-banners.css, which is where the four is stated.
  for (const sub of subs) topicRow(plugin, ctx, body, sub);

  return card;
}

// ── One journal type (Study, or a custom type) ───────────────────────────

function buildType(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType
): HTMLElement {
  const root = getFolder(plugin.app, type.root);
  const tops = journalChildFolders(plugin, type, root);
  const topLevel = type.levels[0];
  const childLevel = type.levels[1];

  const section = createDiv({ cls: "jjs-type" });
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
  const specs: BtnSpec[] = [
    {
      label: topLevel.noun,
      icon: "plus",
      primary: true,
      onClick: () => void plugin.journals.newTopLevel(type),
    },
  ];
  if (childLevel) {
    specs.push({
      label: childLevel.noun,
      icon: "plus",
      onClick: () => void plugin.journals.newContainer(type, 1),
    });
  }
  addButtons(frame.actions, specs);

  makeFoldable(plugin, section, head, foldKey(ctx.sourcePath, type.id));

  const body = section.createDiv({ cls: "jjs-type-body" });

  if (tops.length === 0) {
    const empty = body.createDiv({ cls: "jjs-empty" });
    empty.createDiv({
      cls: "jjs-empty-title",
      // `splitGlyph`: a type's name is "🎓 Study", and lowercasing it whole
      // renders "No 🎓 study journals yet". Third instance of one
      // construction — tables.ts, journal.ts, here — which is why the guard in
      // empty-states.test.ts is a pattern match over every source file rather
      // than three corrected strings.
      text: `No ${splitGlyph(type.name).text.toLowerCase()} journals yet`,
    });
    empty.createDiv({
      cls: "jjs-empty-body",
      text:
        `Create one from the buttons on the row above, or from the command ` +
        `palette. ${plural(topLevel.noun)} appear here automatically.`,
    });
    return section;
  }

  // A GRID, NOT A STACK (4.13.3). The subjects were bars laid one under another
  // because a bar is full-width by nature; a card is not, and four of them in a
  // column would be four boxes each wasting two-thirds of a wide page.
  //
  // `auto-fill` WITH A MIN TRACK, which is `.jjc-grid`'s shape and its argument:
  // the column count answers to the WIDGET's width — the pane, the canvas node
  // or the row cell it was dropped into, all of which are `container-type:
  // inline-size` — rather than to the window's. A media query here would be the
  // fault 4.3.1 spent a release on, where a breakpoint on the block could not
  // describe a cell.
  const grid = body.createDiv({ cls: "jjs-grid" });
  for (const folder of tops) {
    grid.appendChild(buildGroup(plugin, ctx, type, folder));
  }
  return section;
}

// ── The section ──────────────────────────────────────────────────────────

export function buildJournalsSection(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  refresh: () => void
): HTMLElement {
  const types = registeredJournalTypes(plugin);
  const root = createDiv({ cls: "journals-card" });

  // No types enabled: no numbers to show and no list to head, so the card is
  // just the explanation. The hero would be a band of zeroes saying the same
  // thing louder — the objection that kept journals-header.ts returning an
  // empty root in this case.
  if (types.length === 0) {
    root.addClass("jjs-bare");
    const empty = root.createDiv({ cls: "jjs-empty" });
    empty.createDiv({ cls: "jjs-empty-title", text: "📚 No journals enabled" });
    empty.createDiv({
      cls: "jjs-empty-body",
      text: "Turn on Study or add a custom journal in Settings → Almanac → Journals.",
    });
    return root;
  }

  const list = createDiv({ cls: "jjs-list" });

  // The hero band: the same numbers and 53-week strip as before, but as the
  // card's top band rather than a card of its own — the exact relationship the
  // diary hero had to .journal-calendar until 4.13.1 §3 removed it. This is the
  // last band of that kind, and it is left alone deliberately: nobody has
  // rendered this page's hero and judged it.
  //
  // NO AREA TITLEBAR SINCE 4.8.1 — see the same removal in calendar.ts. The
  // strip named the root this card covers; the block's head names the block,
  // and the hero below already says JOURNALS in the largest type on the card.
  const band = root.createDiv({ cls: "jjs-hero" });
  band.appendChild(
    buildJournalsHeader(plugin, {
      actions: [{ label: "Refresh", icon: "refresh-cw", onClick: refresh }],
    })
  );

  for (const type of types) list.appendChild(buildType(plugin, ctx, type));
  root.appendChild(list);

  return root;
}
