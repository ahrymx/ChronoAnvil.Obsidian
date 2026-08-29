// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A section's title, renamed on the bar that carries it.
//
// WHY THIS EXISTS (3.18 follow-ups §2)
//
// 3.18 gave `path`, `resources` and `children` a `title` question and drew the
// control for it in the section editor. The write was correct and the READ was
// not: `answerIn` resolved the answer with `argSpanIn(lines, "header")` over the
// whole file, on a justification — *a content directive is unique per note* —
// that is true of every directive the mechanism was built for and false of
// `header:`, which is structural and repeats once per section. Study's Topic
// index carries six. So both title boxes displayed the file's FIRST header,
// and the editor showed a control, confidently, over another section's title.
//
// That is fixed at the seam (`soleArgSpanIn`), but fixing the lie is not the
// same as building the feature. This is the feature, and it is the route the
// follow-ups ranked first for three reasons that all still hold:
//
//   • IT NEEDS NO READ-BACK MECHANISM AT ALL. The ambiguity the editor has is
//     "which of six headers is this row's"; a bar does not have it, because it
//     *is* that header. The question the section editor could not answer is one
//     this code never has to ask.
//
//   • THE PLUGIN ALREADY TAUGHT IT. `study-header.ts` row 2 is click-to-edit
//     and renames the file. A reader who has learned that a title in this
//     plugin is edited by clicking it is right, and a box buried behind
//     *Edit sections…* was a second, less discoverable answer to a question the
//     banner already answers one way.
//
//   • THE CODEBASE HAD ALREADY DECIDED HEADERS ARE THE READER'S.
//     `journal-plan.ts::fenceKeywords` excludes `header:` from section
//     identity, and says why: *"Headers are excluded because they are
//     retitleable … a user who renames `header:⏳ Open tasks` keeps it."*
//     So this hands a control to a rule that was already written down, rather
//     than introducing a capability. It is also what makes it SAFE: no
//     `locate`, no probe and no plan reads a header's text, so renaming one
//     cannot declassify a section or make the planner offer a second copy.
//
// It also reaches what §3.2 of the 3.18 roadmap gave up on. The deepest index
// emits one header per note kind, so "the title" was not a thing that section
// had and the roadmap declined to guess at one. On the bar there is no guess to
// make: each header is its own control, so the per-kind headings are renameable
// for free and the section never had to have a single title.
//
// WHAT IT DOES NOT DO. It does not compose, re-render or normalise the line. It
// splices the argument's span and nothing else, so the `<level>:` prefix, a
// `|label`, the reader's spacing and any spelling the catalogue would not have
// chosen all survive — `spliceArg`'s property, and the same pair the task-scope
// cycle writes through.

import { App, MarkdownPostProcessorContext, Notice, TFile, setIcon } from "obsidian";
import { ArgSpan, argSpansIn, readArg, spliceArg } from "../core/directive-grammar";
import {
  getFile,
  isFolderNote,
  parseHeaderDirective,
  plural,
  singularGuess,
} from "../core/util";
import { splitGlyph } from "./section-frame";
import type AlmanacPlugin from "../main";
import { journalTypeAtPath } from "../journals/journal";
import type { JournalKind, JournalType } from "../journals/journal";
import { promptKindRename } from "./modals";
import { notify } from "../core/notify";
import { repaintOpenNotes } from "./livewidget";

// Which header on the page this bar is.
//
// `bounds` is the fence's line range when Obsidian will tell us
// (`getSectionInfo`), and null when it will not — inside an embed, an export,
// or any render outside a live markdown view. `index` counts titled headers
// within that range, in the order they were rendered.
export interface HeaderSite {
  bounds: { from: number; to: number } | null;
  index: number;
  // The title as RENDERED, level prefix already stripped. Used to confirm the
  // located line is the one the reader clicked.
  title: string;
}

// Where in the file this rendered block came from, when Obsidian will say.
//
// THE FIRST USE OF `getSectionInfo` IN THIS PLUGIN, and it is worth naming what
// it buys: it is the only thing that can separate two sections a reader has
// given the same name, because it bounds the search to the fence that was
// actually clicked. It returns null in an embed, an export and anywhere the
// block is rendered outside a live view — which is a real answer, not a
// failure, and `headerTitleSpan` has a weaker but still safe rule for it.
export function boundsOf(
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement
): { from: number; to: number } | null {
  const info = ctx.getSectionInfo(el);
  return info ? { from: info.lineStart, to: info.lineEnd } : null;
}

// The argument span of the `header:` line this bar was drawn from, or null when
// that cannot be established beyond doubt.
//
// NULL IS A REFUSAL, AND IT IS THE POINT. The failure this whole item exists to
// correct was a control acting on a line it had merely assumed was its own, so
// the one outcome forbidden here is renaming the wrong section. Every branch
// below either proves the line or gives up, and giving up costs a reader one
// unavailable rename — where guessing costs them a heading they did not touch.
//
// Two ways to prove it, in order:
//
//   POSITION, CONFIRMED BY TEXT. Within the fence's own lines the nth header is
//   this one, and its argument still reads what the bar is showing. Both halves
//   are needed: position alone trusts `getSectionInfo` against a file that may
//   have been edited since the render, and text alone cannot separate two
//   sections a reader has given the same name.
//
//   TEXT, WHEN IT IS UNIQUE. Without bounds — an embed, an export — position
//   means nothing, but a title appearing exactly once in the file still names
//   one line. This is what keeps the control working where Obsidian declines to
//   locate the block, rather than silently doing nothing there.
export function headerTitleSpan(
  lines: readonly string[],
  site: HeaderSite
): ArgSpan | null {
  const all = argSpansIn(lines, "header");
  const titleOf = (span: ArgSpan): string =>
    parseHeaderDirective(readArg(lines, span)).title;

  if (site.bounds) {
    const inside = all.filter(
      (s) => s.line >= site.bounds!.from && s.line <= site.bounds!.to
    );
    // Untitled `header:` bars anchor widgets under a real markdown heading and
    // are not rendered as a title, so they are not counted by the renderer
    // either — filtered here so the two agree about what "the nth header" is.
    const titled = inside.filter((s) => titleOf(s) !== "");
    const at = titled[site.index];
    if (at && titleOf(at) === site.title) return at;
  }

  const matches = all.filter((s) => titleOf(s) === site.title);
  return matches.length === 1 ? matches[0] : null;
}

// The same line with a new title, preserving everything the argument carries
// besides the title itself.
//
// THE `<level>:` PREFIX IS NOT PART OF THE TITLE and must survive. The span
// covers the whole argument — `2:📚 Resources` — while the reader is editing
// only the second half of it, so a naive splice of the typed text would move a
// level-2 bar to level 1 and change what it folds. `|label` is outside the span
// already and needs no handling here.
export function retitledArgument(current: string, next: string): string {
  const m = current.match(/^(\s*\d+:)/);
  return m ? `${m[1]}${next}` : next;
}

// Whether a string can be a header title at all.
//
// A `|` would be read as the start of a display label by `buildFromSpec`, which
// splits before any directive sees its argument — so a title containing one
// would render as a shorter title plus a label nothing asked for. Refused with
// the reason rather than silently stripped: a reader who typed the character
// meant it, and quietly deleting it is the class of edit this module's whole
// header argues against.
export function headerTitleRefusal(next: string): string | null {
  if (!next.trim()) return "A section heading can't be empty.";
  if (next.includes("|")) return "A section heading can't contain “|”.";
  if (next.includes("\n")) return "A section heading has to be one line.";
  return null;
}

// Rewrite the header, and carry the reader's fold with it.
//
// THE FOLD KEY IS BUILT FROM THE TITLE (`<notePath>::<title>`, headerbar.ts), so
// a rename that ignored it would silently unfold a section the reader had
// collapsed — and leave a dead entry in settings under the old name forever.
// Moving the entry is three lines and is the difference between renaming a
// heading and resetting its state.
async function commitHeaderTitle(
  plugin: AlmanacPlugin,
  notePath: string,
  site: HeaderSite,
  next: string
): Promise<boolean> {
  const file = plugin.app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return false;

  const text = await plugin.app.vault.read(file);
  const lines = text.split("\n");
  const span = headerTitleSpan(lines, site);
  if (!span) {
    new Notice(
      "Almanac couldn't tell which heading this is — rename it in the note's source instead."
    );
    return false;
  }

  const written = retitledArgument(readArg(lines, span), next);
  await plugin.app.vault.modify(
    file,
    spliceArg(lines, span, written).join("\n")
  );

  const folds = plugin.settings.collapsedNoteSections;
  const from = `${notePath}::${site.title}`;
  if (folds?.[from]) {
    delete folds[from];
    folds[`${notePath}::${next}`] = true;
    await plugin.saveSettings();
  }

  // THE HEADING IS WRITTEN BEFORE THIS IS ASKED, and that ordering is the point:
  // the rename the reader made is done and safe whatever they answer, so the
  // question is only ever about the second, larger write. Asking first would
  // make a note-local edit contingent on a journal-wide decision.
  await offerKindRename(plugin, notePath, lines, span, site.title, next);

  // ONE REPAINT, AFTER BOTH WRITES. The heading edit alone leaves a section
  // frame whose fold key, count badge and aria-label were all built from the
  // old title, and Obsidian's own repaint on a file change reuses cached
  // sections — so the bar could keep the previous title's furniture around the
  // new words. Doing it here rather than inside each write also means a reader
  // who renames the note type too gets one repaint rather than two.
  repaintOpenNotes(plugin.app);
  return true;
}

// "Lessons" became "Seminars" — should the note type follow? 3.20.
//
// OFFERED AT THE MOMENT IT BECOMES TRUE, which is the shape §4 of the 3.18
// follow-ups settled on for the same class of problem: the plugin knows
// something the reader would want to decide, it knows it exactly once, and the
// alternative is a silent write or a gap nothing surfaces.
//
// WHY IT IS ONLY EVER REACHABLE NOW. A note type lives in its journal's stored
// config, and until 3.20 Study had none — it was a literal built at module load,
// which is why `saveVariant` refused on it and why it could not be relabelled.
// This offer would have been a dialogue that did nothing on the one journal
// most readers were looking at. Study is an ordinary journal now, so it works
// everywhere or nowhere.
//
// SILENT WHEN THE HEADER NAMES NO KIND. Review, Charts, Learning Path and
// Resources are section headings; renaming one means what it has meant since
// 3.19.0 and there is nothing to ask.
async function offerKindRename(
  plugin: AlmanacPlugin,
  notePath: string,
  lines: readonly string[],
  span: ArgSpan,
  before: string,
  after: string
): Promise<void> {
  const type = journalTypeAtPath(plugin, notePath);
  if (!type) return;
  const kind = kindHeadedBy(lines, span, type);
  if (!kind) return;

  // The heading carries the kind's emoji as well as its name, so a reader who
  // changed only the glyph has not renamed anything and should not be asked.
  const wasText = splitGlyph(before).text;
  const nowText = splitGlyph(after).text;
  if (!nowText || nowText === wasText) return;

  const cfg = plugin.settings.customJournals?.find((j) => j.id === type.id);
  // No stored config means no note type to rename. Nothing in the shipped set
  // can reach this today; a future built-in would, and a dialogue offering a
  // write that cannot happen is worse than no dialogue.
  if (!cfg) return;

  const choice = await promptKindRename(
    plugin.app,
    nowText,
    kind.label,
    singularGuess(nowText)
  );
  if (!choice || choice.scope !== "kind") return;

  const row = cfg.kinds.find((k) => k.id === kind.id);
  if (!row) return;

  // THE ID IS UNTOUCHED, which is what makes this safe to do from here rather
  // than through the note-types window with its declassification warning.
  // `type: lesson` in every note stays `lesson`; the template file keeps the
  // name it was written under; only the label a reader reads changes.
  row.label = choice.label;
  // The stored plural comes with it, or `kindPlural` would derive "Seminars"
  // from the new label and quietly disagree with the heading that started this.
  // Dropped rather than set when the pluraliser already agrees, so a journal
  // does not accumulate overrides that say nothing.
  if (plural(choice.label) === nowText) delete row.plural;
  else row.plural = nowText;

  await plugin.saveSettings();
  await plugin.journals.rebuildJournalHome();
  // The repaint is the caller's, so the two writes share one — see
  // `commitHeaderTitle`. Without it the button, the empty state and the
  // confidence strip beside this heading would go on saying "Lesson" while the
  // heading above them said "Seminars": the exact disagreement the rename was
  // for, and no file event would ever mention it.
  notify.ok(`Almanac: renamed the note type to “${choice.label}”`);
}

// Which note kind this header is the heading for, if any. 3.20.
//
// A HEADER ON THE DEEPEST INDEX IS A KIND'S HEADING, and `childrenParts` is
// where that becomes true: it emits three lines per kind — the header, the
// kind's create button, and `kind-table:<id>` — so the id sits two lines below
// the title in the same fence. That is the handle, and it is a structural one
// rather than a guess from the text: a reader who has already renamed the
// heading to something unrelated is still pointed at the right kind.
//
// NULL FOR EVERY OTHER HEADER. Review, Charts, Learning Path and Resources are
// section headings that name no kind, and renaming one means exactly what it
// has meant since 3.19.0 and nothing more.
export function kindHeadedBy(
  lines: readonly string[],
  span: ArgSpan,
  type: JournalType
): JournalKind | null {
  // Only the lines between this header and the next one, so a two-kind fence
  // cannot let one heading claim the other's table.
  for (let i = span.line + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("header:") || line === "```") break;
    const m = line.match(/^kind-table:(\S+)$/);
    if (m) return type.kinds.find((k) => k.id === m[1]) ?? null;
  }
  return null;
}

// Make a bar's title slot click-to-edit.
//
// ON THE TITLE SLOT, NOT THE BAR. The bar is already a click target — the whole
// strip folds the section — so putting a second meaning on the same click would
// make folding and renaming one slip apart. `stopPropagation` on the title is
// what keeps the two separable, and it is why the pencil sits inside the slot:
// the affordance has to name the smaller target it belongs to.
export function attachHeaderRename(
  plugin: AlmanacPlugin,
  slot: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  site: HeaderSite
): void {
  const notePath = ctx.sourcePath;
  let title = site.title;

  // THE GLYPH IS NOT IN THE SLOT, and rendering the title as written put it
  // there twice — "📖 📖 Lessons" on every editable bar.
  //
  // `sectionFrame` splits a title into a fixed glyph box and a text slot,
  // because that fixed box is what lines section titles up down the page. It
  // sets the slot's text to the SPLIT half and draws the glyph itself as a
  // sibling. This function is handed the slot and the title as WRITTEN — which
  // it needs, because the directive's argument is the whole string and that is
  // what a rename rewrites — so it has to do the same split before displaying.
  //
  // EDITING STILL SEES THE WHOLE STRING. The glyph is part of the title as the
  // note carries it, and a reader who wants "📕 Lessons" should be able to type
  // it; an input pre-filled with the text half alone would silently drop the
  // glyph on every save.
  const glyphSlot = (): HTMLElement | null =>
    slot.parentElement?.querySelector(".journal-header-glyph") ?? null;

  const render = (): void => {
    slot.empty();
    slot.addClass("journal-header-title-editable");
    const shown = splitGlyph(title);
    slot.createSpan({
      cls: "journal-header-title-text",
      text: shown.glyph ? shown.text : title,
    });
    slot.setAttribute("aria-label", `Rename “${title}”`);
    slot.title = "Click to rename this section";
  };

  const beginEdit = (): void => {
    slot.empty();
    slot.removeAttribute("aria-label");
    slot.title = "";
    const input = slot.createEl("input", {
      type: "text",
      cls: "journal-header-title-input",
    });
    input.value = title;

    // ONE COMMIT PER EDIT, the flag `study-header.ts` needed and for the same
    // reason: Enter commits, the write repaints the note, the repaint detaches
    // this input, and detaching a focused element fires `blur` — which would
    // commit a second time against a file that has already moved. Escape is the
    // same shape and worse, because it would commit the edit just cancelled.
    let settled = false;

    const finish = async (save: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      const next = input.value.trim();
      if (!save || next === title) {
        render();
        return;
      }
      const refusal = headerTitleRefusal(next);
      if (refusal) {
        new Notice(refusal);
        render();
        return;
      }
      const ok = await commitHeaderTitle(plugin, notePath, { ...site, title }, next);
      // On success the write repaints the note and this element goes with it;
      // repainting here anyway keeps the bar honest in the window before that
      // lands, and is the only visible state on failure.
      if (ok) {
        title = next;
        // The glyph lives outside this slot, so a rename that changed it would
        // otherwise leave the old one showing beside the new text until the
        // repaint landed.
        const box = glyphSlot();
        if (box) box.setText(splitGlyph(title).glyph);
      }
      render();
    };

    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void finish(true);
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        void finish(false);
      }
    });
    input.addEventListener("blur", () => void finish(true));
    input.addEventListener("click", (evt) => evt.stopPropagation());
    input.focus();
    input.select();
  };

  slot.addEventListener("click", (evt) => {
    // The bar folds on click; the title renames. Stopping here is what keeps
    // one gesture from doing both.
    evt.preventDefault();
    evt.stopPropagation();
    beginEdit();
  });

  render();
}

// ── A NOTE'S NAME, RENAMED BY CLICKING IT ─────────────────────────────
//
// EXTRACTED IN 4.5, NOT WRITTEN. Every line of this was `buildStudyHeader`'s
// second row, and it moved here whole the moment a second surface wanted it —
// the page title card. The alternative was a copy, and a copy of a rename is
// how two callers start disagreeing about which characters a name may have.
// That is not hypothetical: `attachments.ts` already carries a second, wider
// spelling of the illegal-character rule for a different job, and a third would
// have been one too many to keep in step.
//
// THE TITLE *IS* THE FILENAME, which is the decision this is built on and it is
// older than this function. A diary entry keeps its name as a date and carries
// an editable `title` property on top, because the date is a sort key that must
// not move — but a page's name is already the human name, and it is what the
// quick switcher, the graph, every backlink and every table display. Storing a
// second title in frontmatter would let those disagree with the banner, so
// editing here renames the file instead.
//
// Via `fileManager.renameFile` rather than `vault.rename`, which is what updates
// every wikilink pointing at this note across the vault.
//
// `prefix` NAMES THE FOUR CLASSES, because the two callers style the same
// control differently and neither should have to pass four strings: `jsh-title`
// gives `jsh-title`, `-text`, `-edit` and `-input`, which is the shape the
// banner already used.
const ILLEGAL_NAME = /[\\/:*?"<>|]/;

// The same control, writing a PROPERTY instead of the filename. 4.51.6.
//
// WHY IT LIVES BESIDE `attachNoteRename` RATHER THAN AT ITS CALLER. They are one
// affordance with two targets — `titleTargetFor` picks between them and says
// why — and a reader who learns the pencil on a journal note meets the same
// pencil on a diary entry. Two implementations in two files is how one of them
// grows a placeholder or an Escape key the other has not got.
//
// THE PLACEHOLDER IS THE VALUE'S FALLBACK, WHICH IS THE WHOLE OF THE DIFFERENCE
// FROM A RENAME. An entry with no title is not untitled — it is called by its
// date — so clearing the field deletes the property and the date comes back.
// There is no way to end up with a nameless entry, which is why this one may
// commit an empty value where a rename may not.
export function attachPropertyRename(
  app: App,
  row: HTMLElement,
  file: TFile,
  prefix: string,
  prop: string,
  fallback: string
): void {
  const el = row.createDiv({ cls: prefix });
  const read = (): string => {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const v = fm[prop];
    return typeof v === "string" ? v.trim() : "";
  };

  const render = (): void => {
    el.empty();
    el.createSpan({ cls: `${prefix}-text`, text: read() || fallback });
    setIcon(el.createSpan({ cls: `${prefix}-edit` }), "pencil");
  };

  const edit = (): void => {
    el.empty();
    const input = el.createEl("input", {
      type: "text",
      cls: `${prefix}-input`,
      attr: { placeholder: fallback },
    });
    input.value = read();
    // ONE COMMIT PER EDIT, for `attachNoteRename`'s reason two screens down:
    // Enter commits, the commit re-renders, re-rendering detaches the focused
    // input, and detaching fires `blur` — which would commit a second time.
    let settled = false;
    const commit = (save: boolean): void => {
      if (settled) return;
      settled = true;
      const next = input.value.trim();
      // NOTHING IS WRITTEN WHEN NOTHING WOULD CHANGE. A `processFrontMatter`
      // that leaves a file identical still moves its modified time, which is a
      // lie about the reader's vault that sync then propagates.
      if (save && next !== read()) {
        void app.fileManager.processFrontMatter(file, (fm) => {
          if (next) fm[prop] = next;
          else delete fm[prop];
        });
      }
      render();
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        commit(true);
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        commit(false);
      }
    });
    input.addEventListener("blur", () => commit(true));
    input.focus();
    input.select();
  };

  el.addEventListener("click", edit);
  render();
}

export function attachNoteRename(
  app: App,
  row: HTMLElement,
  file: TFile,
  prefix: string
): void {
  const title = file.basename;
  const titleEl = row.createDiv({ cls: prefix });

  const renderTitle = (): void => {
    titleEl.empty();
    titleEl.createSpan({ cls: `${prefix}-text`, text: title });
    setIcon(titleEl.createSpan({ cls: `${prefix}-edit` }), "pencil");
  };

  const restore = (): void => {
    row.empty();
    row.appendChild(titleEl);
    renderTitle();
  };

  const beginEdit = (): void => {
    row.empty();
    const input = row.createEl("input", {
      type: "text",
      cls: `${prefix}-input`,
      attr: { placeholder: "Name this note…" },
    });
    input.value = title;

    // ONE COMMIT PER EDIT.
    //
    // Enter calls commit, commit awaits a rename, the rename detaches this
    // input, and detaching a focused element fires `blur` — which calls commit
    // again. The second pass reads the same value out of the now-detached
    // input, finds `next` still differs from the `title` captured at render,
    // and re-runs the whole thing against a vault that has already moved:
    // "Surds already exists here", reported for the folder it had itself just
    // created a moment earlier.
    //
    // Escape is the same shape and worse. It calls `restore()`, which empties
    // the row, which detaches the input, which fires blur, which commits the
    // edit the reader had just cancelled.
    //
    // A flag rather than removing the listener, because the reentry can come
    // from either handler and from a path that has not run yet.
    let settled = false;

    // Guard before renaming rather than letting the vault throw: the three
    // ways this fails are all things the reader can fix, and each deserves
    // to say which one it was.
    const commit = async (save: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      if (!save) {
        restore();
        return;
      }
      const next = input.value.trim();
      if (!next || next === title) {
        restore();
        return;
      }
      if (ILLEGAL_NAME.test(next)) {
        new Notice("A note name can't contain \\ / : * ? \" < > |");
        restore();
        return;
      }
      // A LAYER'S NAME IS ITS FOLDER'S, not its note's.
      //
      // A subject or topic is `Subjects/Algebra/Algebra.md`, and everything
      // that links to it derives the path from the FOLDER — the Journals card
      // on the home note, the breadcrumbs, the topic tables, `folderNotePath`
      // itself. Renaming the note alone left a folder still called Algebra with
      // no note of its own inside it, so every one of those links pointed at a
      // file that no longer existed. The banner looked right, because it reads
      // the file it was rendered for; everything pointing AT it broke.
      //
      // So the folder moves first and the note follows it. `renameFile` on a
      // folder is what updates links to the notes inside it, and doing the note
      // first would strand the folder note for the moment in between.
      //
      // A PAGE THAT IS NOT A FOLDER NOTE — the homepage — takes the second
      // branch and renames one file, which is the whole of what it needs.
      const folder = isFolderNote(file) ? file.parent : null;
      if (folder) {
        const above = folder.parent?.path ?? "";
        const folderTarget = above && above !== "/" ? `${above}/${next}` : next;
        if (app.vault.getAbstractFileByPath(folderTarget)) {
          new Notice(`"${next}" already exists here`);
          restore();
          return;
        }
        try {
          await app.fileManager.renameFile(folder, folderTarget);
          // Obsidian updates `file.path` in place when its folder moves, so
          // the note is now `<folderTarget>/<old name>.md` and this second
          // rename is the one that makes the pair agree again.
          await app.fileManager.renameFile(file, `${folderTarget}/${next}.md`);
        } catch (err) {
          new Notice(`Couldn't rename this: ${String(err)}`);
          restore();
        }
        return;
      }

      const parent = file.parent?.path ?? "";
      const target = parent ? `${parent}/${next}.md` : `${next}.md`;
      if (getFile(app, target)) {
        new Notice(`"${next}" already exists in this folder`);
        restore();
        return;
      }
      try {
        await app.fileManager.renameFile(file, target);
      } catch (err) {
        new Notice(`Couldn't rename this note: ${String(err)}`);
        restore();
      }
      // On success Obsidian re-renders the view for the renamed file, which
      // rebuilds this header — no manual repaint here.
    };

    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void commit(true);
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        void commit(false);
      }
    });
    input.addEventListener("blur", () => void commit(true));
    input.focus();
    input.select();
  };

  renderTitle();
  titleEl.addEventListener("click", beginEdit);
}
