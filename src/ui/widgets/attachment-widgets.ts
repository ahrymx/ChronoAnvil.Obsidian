// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The attach: widget — chips, tiles, the lightbox, and the file plumbing
// underneath them.
//
// Eleven methods and 656 lines, all of which existed only to serve one
// directive. They were spread through the Widgets class in the order they were
// written rather than grouped, so the cluster was invisible: reading
// buildAttachments meant jumping to nine other places in a 4,800-line file to
// find out what a chip does when it is dragged, or where a pasted image ends up
// on disk. Together in one file they are a readable unit; apart they were a
// third of the class's private surface.
//
// WHY ONE `deps` OBJECT AND NOT SEPARATE PARAMETERS
//
// This cluster needs both halves of what the class owns: the note-region
// contract from ./note-regions.ts (it writes an attachments block into the
// note body) and the plugin (it reads the attachments settings and resolves
// vault paths). Threading two parameters through eleven functions that call
// each other four deep is noise, and it invites the signatures to drift apart.
// One object keeps every function in here the same shape.
//
// It is NOT named `host`. `attachmentPathFor` and `storeAttachmentFile` both
// already take a `host: TFile` — the note an attachment belongs to — and
// shadowing that with a different meaning of the same word inside functions
// that use both would be a genuinely nasty way to save four characters.

import {
  MarkdownPostProcessorContext,
  TFile,
  setIcon,
  Menu,
  Notice,
  normalizePath,
} from "obsidian";
import { basename, ensureFolder, moment, noExt, openFile } from "../../core/util";
import { isValidNoteKey, noteKeyOf, readNoteRegion } from "../../core/notestore";
import { panDuringDrag } from "../drag-scroll";
import { confirmAction, promptText } from "../modals";
import { AttachCategoriesEditor } from "../attach-categories-editor";
import { splitArgHead } from "../../core/directive-grammar";
import {
  ATTACH_FORMATS,
  applyAttachCategories,
  attachFormatOf,
  categoryItemCount,
  categoryNonImageCount,
  planAttachCategories,
  readAttachCategories,
  type AttachCategoryRow,
} from "../attach-categories";
import { trashClause, trashDestination, trashItem } from "../../core/trash";
import {
  Attachment,
  applyTokens,
  coerceUrl,
  displayTitle,
  extensionForMime,
  hasTarget,
  hostLabel,
  isExternalUrl,
  isSafeUrl,
  moveAttachment,
  newAttachment,
  parseAttachmentLine,
  parseAttachments,
  sanitizeFileName,
  sanitizeFolderPath,
  serializeAttachments,
  splitExtension,
  uniquePath,
} from "../attachments";
import type { PluginNoteRegionHost } from "./note-regions";
import { fieldFoldStore, fieldHead } from "./note-field";
import { fieldFrame, headTools } from "../section-frame";


// MIME type used by the attachments widget's own drag-to-reorder, so its drop
// handler can tell an internal tile move apart from a file arriving from
// outside. Lowercase: the DataTransfer type list is normalised to lowercase.
const ATTACH_DRAG_TYPE = "application/x-ca-attachment";

// Callbacks a tile/chip fires back to the widget that owns the list.
export interface AttachmentHandlers {
  onCaption: (index: number) => void;
  onToggleEmbed: (index: number) => void;
  onRemove: (index: number) => void;
  onDelete: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onLightbox: (index: number) => void;
}

// Lucide icon for a non-image vault attachment, by extension — enough of a
// hint to tell a PDF from an audio note at a glance without a full icon set.
export function attachmentFileIcon(target: string): string {
  const ext = target.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "file-text";
  if (["md", "txt", "rtf"].includes(ext)) return "file-text";
  if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)) return "file-audio";
  if (["mp4", "mov", "mkv", "webm", "avi"].includes(ext)) return "file-video";
  if (["zip", "gz", "tar", "7z", "rar"].includes(ext)) return "file-archive";
  if (["csv", "xlsx", "xls", "ods"].includes(ext)) return "table";
  if (["base", "json", "yaml", "yml"].includes(ext)) return "braces";
  return "file";
}


export function resolveAttachmentFile(
  deps: PluginNoteRegionHost,
  target: string,
  ctx: MarkdownPostProcessorContext
): TFile | null {
  if (!target || isExternalUrl(target)) return null;
  return deps.app.metadataCache.getFirstLinkpathDest(target, ctx.sourcePath);
}


export function openAttachment(
  deps: PluginNoteRegionHost,item: Attachment, ctx: MarkdownPostProcessorContext): void {
  if (isExternalUrl(item.target)) {
    if (!isSafeUrl(item.target)) {
      new Notice("That link uses a scheme ChronoAnvil won't open.");
      return;
    }
    window.open(item.target, "_blank");
    return;
  }
  const file = resolveAttachmentFile(deps, item.target, ctx);
  if (!file) {
    new Notice(`Not found in the vault: ${item.target}`);
    return;
  }
  void openFile(deps.app, file);
}


export function wireAttachmentDrag(
  el: HTMLElement,
  index: number,
  cb: AttachmentHandlers
): void {
  // The list goes on scrolling while a row is in the air (4.57) — an entry with
  // twenty attachments is taller than the pane it is read in. See
  // `drag-scroll.ts`.
  let stopPan: (() => void) | null = null;
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData(ATTACH_DRAG_TYPE, String(index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    el.addClass("is-dragging");
    stopPan = panDuringDrag(el);
  });
  el.addEventListener("dragend", () => {
    stopPan?.();
    stopPan = null;
    el.removeClass("is-dragging");
  });
  el.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes(ATTACH_DRAG_TYPE)) return;
    e.preventDefault();
    el.addClass("is-drop-target");
  });
  el.addEventListener("dragleave", () => el.removeClass("is-drop-target"));
  el.addEventListener("drop", (e) => {
    const from = e.dataTransfer?.getData(ATTACH_DRAG_TYPE);
    el.removeClass("is-drop-target");
    if (!from) return;
    e.preventDefault();
    e.stopPropagation();
    cb.onReorder(Number(from), index);
  });
}


export function attachmentMenu(
  deps: PluginNoteRegionHost,
  evt: MouseEvent,
  item: Attachment,
  index: number,
  ctx: MarkdownPostProcessorContext,
  cb: AttachmentHandlers
): void {
  evt.preventDefault();
  const menu = new Menu();
  const external = isExternalUrl(item.target);

  if (item.kind !== "text") {
    menu.addItem((i) =>
      i
        .setTitle(external ? "Open in browser" : "Open in vault")
        .setIcon(external ? "external-link" : "file-symlink")
        .onClick(() => openAttachment(deps, item, ctx))
    );
    menu.addItem((i) =>
      i
        .setTitle(external ? "Copy URL" : "Copy path")
        .setIcon("copy")
        .onClick(() => {
          void navigator.clipboard.writeText(item.target);
          new Notice("Copied.");
        })
    );
  }

  menu.addItem((i) =>
    i
      .setTitle(item.kind === "text" ? "Edit text…" : "Edit caption…")
      .setIcon("pencil")
      .onClick(() => cb.onCaption(index))
  );

  // An external image is the one case where the same target is meaningful
  // both ways, so it gets an explicit toggle. Remote images are links by
  // default — see the note in attachments.ts about not firing off network
  // requests from a private journal without being asked.
  if (external && (item.kind === "image" || item.kind === "link")) {
    menu.addItem((i) =>
      i
        .setTitle(item.kind === "image" ? "Show as link" : "Show as image")
        .setIcon(item.kind === "image" ? "link" : "image")
        .onClick(() => cb.onToggleEmbed(index))
    );
  }

  menu.addSeparator();
  menu.addItem((i) =>
    i
      .setTitle("Remove from note")
      .setIcon("x")
      .onClick(() => cb.onRemove(index))
  );
  if (!external && item.kind !== "text") {
    menu.addItem((i) =>
      i
        .setTitle("Remove file from vault…")
        .setIcon("trash-2")
        .onClick(() => cb.onDelete(index))
    );
  }
  menu.showAtMouseEvent(evt);
}


export function openAttachmentLightbox(
  deps: PluginNoteRegionHost,
  items: Attachment[],
  index: number,
  ctx: MarkdownPostProcessorContext
): void {
  const images = items.filter((a) => a.kind === "image");
  if (images.length === 0) return;
  let at = Math.max(0, images.indexOf(items[index]));

  const overlay = document.body.createDiv({
    cls: "ca-journal-attach-lightbox",
    attr: { tabindex: "-1" },
  });
  const stage = overlay.createDiv({ cls: "ca-journal-attach-lightbox-stage" });
  const img = stage.createEl("img");
  const caption = stage.createDiv({ cls: "ca-journal-attach-lightbox-caption" });

  const close = (): void => {
    overlay.remove();
  };

  const show = (): void => {
    const item = images[at];
    const file = resolveAttachmentFile(deps, item.target, ctx);
    img.src = file ? deps.app.vault.getResourcePath(file) : item.target;
    img.alt = displayTitle(item);
    caption.setText(
      images.length > 1
        ? `${displayTitle(item)}  ·  ${at + 1} / ${images.length}`
        : displayTitle(item)
    );
  };

  const step = (delta: number): void => {
    at = (at + delta + images.length) % images.length;
    show();
  };

  if (images.length > 1) {
    const prev = overlay.createEl("button", {
      cls: "ca-journal-attach-lightbox-nav is-prev",
      attr: { type: "button", "aria-label": "Previous" },
    });
    setIcon(prev, "chevron-left");
    prev.addEventListener("click", (e) => {
      e.stopPropagation();
      step(-1);
    });
    const next = overlay.createEl("button", {
      cls: "ca-journal-attach-lightbox-nav is-next",
      attr: { type: "button", "aria-label": "Next" },
    });
    setIcon(next, "chevron-right");
    next.addEventListener("click", (e) => {
      e.stopPropagation();
      step(1);
    });
  }

  const closeBtn = overlay.createEl("button", {
    cls: "ca-journal-attach-lightbox-close",
    attr: { type: "button", "aria-label": "Close" },
  });
  setIcon(closeBtn, "x");
  closeBtn.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target === stage) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  show();
  overlay.focus();
}


export function renderAttachmentChip(
  deps: PluginNoteRegionHost,
  chips: HTMLElement,
  item: Attachment,
  index: number,
  ctx: MarkdownPostProcessorContext,
  cb: AttachmentHandlers,
  // HOW LONG THE LIST IS, OR NULL WHERE THIS ROW IS NOT IN ONE (1.0.49 §6).
  // The `list` format is an ORDERED list — a numbered row per item, in the
  // order the note has them — and two things need that length: the number
  // itself is `index + 1` (a reader counts from one) and the row's two move
  // chevrons have to know when they are at an end.
  //
  // ONE PARAMETER AND NOT TWO. `index` is already this item's position, so a
  // separate ordinal would be the same fact passed twice and able to disagree.
  listOf: number | null = null
): void {
  const chip = chips.createDiv({
    cls: `ca-journal-attach-chip ca-journal-attach-chip--${item.kind}`,
  });
  chip.draggable = true;

  // A SPAN RATHER THAN A CSS COUNTER, which was the first shape of this. The
  // number is then selectable text a reader can copy out with the row and it
  // is in the accessibility tree.
  if (listOf !== null) {
    chip.createSpan({
      cls: "ca-journal-attach-index",
      text: `${index + 1}.`,
    });
  }

  const icon = chip.createSpan({ cls: "ca-journal-attach-chip-icon" });
  if (item.kind === "link") setIcon(icon, "external-link");
  else if (item.kind === "text") setIcon(icon, "text-cursor-input");
  else setIcon(icon, attachmentFileIcon(item.target));

  const body = chip.createDiv({ cls: "ca-journal-attach-chip-body" });
  body.createSpan({ cls: "ca-journal-attach-chip-title", text: displayTitle(item) });
  if (item.kind === "link" && item.title.trim()) {
    body.createSpan({
      cls: "ca-journal-attach-chip-sub",
      text: hostLabel(item.target),
    });
  }

  if (item.kind !== "text") {
    chip.addClass("is-openable");
    chip.addEventListener("click", () => openAttachment(deps, item, ctx));
  } else {
    chip.addEventListener("click", () => cb.onCaption(index));
  }

  // ── MOVING A ROW WITHOUT A POINTER (1.0.49 §6) ────────────────────────
  //
  // *"The ordered list needs chevrons on the cards themselves."*
  //
  // AN ORDERED LIST IS ABOUT ITS ORDER, and until now the only way to change
  // one was to drag a row — which needs a pointer, gives nothing to a reader
  // on a phone or a keyboard, and says nothing about where a row can go. Two
  // chevrons per row, the same answer the Categories window gives for the same
  // question one level up: *"ARROWS RATHER THAN DRAG"*, with a disabled one
  // saying "this is already the first" where a dead drop zone says nothing.
  //
  // ONLY IN THE NUMBERED LIST. A gallery's tiles and a default shelf's chips
  // are a wrapping grid and a wrapping row — "up" and "down" do not name
  // anything a reader can see there, and the drag they already have does.
  // `listOf` is therefore the whole condition, the same flag the number is on.
  //
  // THROUGH `onReorder`, which is the drag's own handler — one definition of
  // what moving a row means, so a chevron and a drag cannot disagree about
  // where the row lands or about when the note is written.
  if (listOf !== null) {
    const move = (delta: number, icon: string, word: string): void => {
      const to = index + delta;
      const can = to >= 0 && to < listOf;
      const btn = chip.createEl("button", {
        cls: "ca-journal-attach-move",
        attr: { type: "button" },
      });
      setIcon(btn, icon);
      btn.disabled = !can;
      btn.toggleClass("is-static", !can);
      const why = can
        ? `Move ${displayTitle(item)} ${word}`
        : `${displayTitle(item)} is already ${delta < 0 ? "first" : "last"}`;
      btn.setAttr("aria-label", why);
      btn.setAttr("title", why);
      btn.addEventListener("click", (e) => {
        // The chip opens what it names on click. A control inside it is not
        // the chip being pressed — the same stop the `⋯` makes.
        e.stopPropagation();
        if (!can) return;
        cb.onReorder(index, to);
      });
    };
    move(-1, "chevron-up", "up");
    move(1, "chevron-down", "down");
  }

  const menuBtn = chip.createEl("button", {
    cls: "ca-journal-attach-menu",
    attr: { type: "button", "aria-label": "Attachment options" },
  });
  setIcon(menuBtn, "more-horizontal");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    attachmentMenu(deps, e, item, index, ctx, cb);
  });
  chip.addEventListener("contextmenu", (e) =>
    attachmentMenu(deps, e, item, index, ctx, cb)
  );

  wireAttachmentDrag(chip, index, cb);
}


export function renderAttachmentTile(
  deps: PluginNoteRegionHost,
  gallery: HTMLElement,
  item: Attachment,
  index: number,
  ctx: MarkdownPostProcessorContext,
  cb: AttachmentHandlers
): void {
  const tile = gallery.createDiv({ cls: "ca-journal-attach-tile" });
  tile.draggable = true;

  const frame = tile.createDiv({ cls: "ca-journal-attach-thumb" });
  const external = isExternalUrl(item.target);
  const target = external ? item.target : resolveAttachmentFile(deps, item.target, ctx);

  if (external && isSafeUrl(item.target)) {
    const img = frame.createEl("img", { attr: { alt: displayTitle(item) } });
    img.src = item.target;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      frame.empty();
      frame.addClass("is-missing");
      setIcon(frame.createDiv({ cls: "ca-journal-attach-missing-icon" }), "unlink");
      frame.createDiv({ cls: "ca-journal-attach-missing-text", text: "Unavailable" });
    });
  } else if (target instanceof TFile) {
    const img = frame.createEl("img", { attr: { alt: displayTitle(item) } });
    img.src = deps.app.vault.getResourcePath(target);
    img.loading = "lazy";
  } else {
    frame.addClass("is-missing");
    setIcon(frame.createDiv({ cls: "ca-journal-attach-missing-icon" }), "image-off");
    frame.createDiv({ cls: "ca-journal-attach-missing-text", text: "File not found" });
  }

  frame.addEventListener("click", () => cb.onLightbox(index));

  const caption = tile.createDiv({
    cls: "ca-journal-attach-caption",
    text: displayTitle(item),
  });
  caption.addEventListener("click", () => cb.onCaption(index));
  caption.setAttribute("aria-label", "Click to edit the caption");

  const menuBtn = tile.createEl("button", {
    cls: "ca-journal-attach-menu",
    attr: { type: "button", "aria-label": "Attachment options" },
  });
  setIcon(menuBtn, "more-horizontal");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    attachmentMenu(deps, e, item, index, ctx, cb);
  });
  tile.addEventListener("contextmenu", (e) =>
    attachmentMenu(deps, e, item, index, ctx, cb)
  );

  wireAttachmentDrag(tile, index, cb);
}


export async function removeAttachmentFile(
  deps: PluginNoteRegionHost,
  item: Attachment,
  ctx: MarkdownPostProcessorContext
): Promise<boolean> {
  const file = resolveAttachmentFile(deps, item.target, ctx);
  if (!file) {
    new Notice("That file is already gone — removing the link.");
    return true;
  }
  if (deps.plugin.settings.attachments.confirmDelete) {
    // THE DESTINATION IS NAMED NOW (1.0.13). This said "will be moved to the
    // trash", which is true of two of the three things the vault's *Deleted
    // files* setting can mean and false of the third. `trashClause` is the one
    // place that sentence lives, and it is the whole of what the retired bin
    // folder was for — see `core/trash.ts`.
    const ok = await confirmAction(
      deps.app,
      "Remove attachment?",
      `${file.path} ${trashClause(trashDestination(deps.app))}, and its link is removed from this note. Other notes linking to it will break.`,
      "Remove file",
      true
    );
    if (!ok) return false;
  }
  // ── SHARED AGAIN AS OF 1.0.13, AND BOTH ROUND TRIPS ARE THE RECORD ──
  //
  // This call has been private, then shared in `util.ts`, then private again,
  // and is now shared in `core/trash.ts`. The history is worth keeping because
  // each move had a reason and only one of them was wrong.
  //
  // 4.50 lifted it into `util.ts` for a title row's *Move to bin*, and that
  // caller should never have existed: a journal note went to
  // `00 - Infrastructure/Bin/` by a rename, which `journal-removal.ts` had
  // already decided. 4.50.1 took the caller away and the helper with it, on
  // `recordList`'s 4.13.3 rule — **a component is worth sharing when two
  // surfaces do the same thing, and these two never did.**
  //
  // THEY DO NOW, AND THAT IS THE READER'S OWN DOING: *"This should be the
  // default way for all chronoanvil's deletion processes."* There is one
  // deletion in this plugin, every surface reaches it, and the argument for
  // where it lives is at the top of `core/trash.ts`. The 4.13.3 rule is
  // satisfied rather than bent.
  //
  // AND THE PROBE ITSELF IS GONE. `fileManager.trashFile` is public and
  // `@since 1.6.6`; `manifest.json` asks for 1.7.0. The
  // `typeof fm.trashFile === "function"` guard and its `vault.trash(file, true)`
  // fallback were protecting against a version Obsidian will not run this on —
  // and the fallback forced the system trash, so it silently disagreed with the
  // sentence the confirm above now prints.
  if (!(await trashItem(deps.app, file))) {
    new Notice(`Couldn't remove ${file.path}.`);
    return false;
  }
  return true;
}


export async function attachmentPathFor(
  deps: PluginNoteRegionHost,
  fileName: string,
  host: TFile,
  tokens: Record<string, string>
): Promise<string> {
  const opts = deps.plugin.settings.attachments;
  const taken = (p: string): boolean =>
    deps.app.vault.getAbstractFileByPath(p) != null;

  if (opts.location === "obsidian") {
    // Obsidian's own resolver already honours the vault's Files & Links
    // setting *and* returns a free path. It's only on newer API versions,
    // so fall back to the note's folder if it isn't there.
    const fm = deps.app.fileManager as unknown as {
      getAvailablePathForAttachment?: (
        name: string,
        sourcePath?: string
      ) => Promise<string>;
    };
    if (typeof fm.getAvailablePathForAttachment === "function") {
      const p = await fm.getAvailablePathForAttachment(fileName, host.path);
      return normalizePath(p);
    }
  }

  let folder: string;
  if (opts.location === "chronoanvil") {
    const sub = sanitizeFolderPath(applyTokens(opts.subfolder ?? "", tokens));
    folder = [deps.plugin.settings.paths.attachments, sub]
      .filter((part) => part && part.length > 0)
      .join("/");
  } else {
    folder = host.parent?.path ?? "";
  }

  if (folder) await ensureFolder(deps.app, folder);
  const desired = normalizePath(folder ? `${folder}/${fileName}` : fileName);
  return uniquePath(desired, taken);
}


export async function storeAttachmentFile(
  deps: PluginNoteRegionHost,
  blob: File,
  ctx: MarkdownPostProcessorContext
): Promise<TFile | null> {
  const host = deps.fileOf(ctx);
  if (!host) return null;
  const opts = deps.plugin.settings.attachments;

  // Clipboard images arrive as `image.png` or with no name at all; give them
  // something a human can recognise in the file explorer.
  const original = blob.name ?? "";
  const split = splitExtension(original);
  const fromMime = extensionForMime(blob.type ?? "");
  const ext = split.ext || fromMime;
  const isPaste = !original || original.toLowerCase().startsWith("image.");
  const baseName = isPaste ? "Pasted image" : split.base || "Attachment";

  const now = moment();
  const tokens: Record<string, string> = {
    name: baseName,
    date: now.format("YYYY-MM-DD"),
    time: now.format("HH-mm-ss"),
    yyyy: now.format("YYYY"),
    yy: now.format("YY"),
    mm: now.format("MM"),
    dd: now.format("DD"),
    note: noExt(basename(host.path)),
  };

  const named = sanitizeFileName(applyTokens(opts.namePattern || "{name}", tokens));
  const fileName = ext ? `${named}.${ext}` : named;

  let data: ArrayBuffer;
  try {
    data = await blob.arrayBuffer();
  } catch (e) {
    console.error("[ChronoAnvil] could not read dropped file", e);
    new Notice(`Couldn't read ${original || "that file"}.`);
    return null;
  }

  try {
    const path = await attachmentPathFor(deps, fileName, host, tokens);
    return await deps.app.vault.createBinary(path, data);
  } catch (e) {
    console.error("[ChronoAnvil] could not save attachment", e);
    new Notice(`Couldn't save ${fileName}.`);
    return null;
  }
}


// Write a categories draft into the Resources section of `notePath`. 1.0.49.
//
// WHAT WENT: `addAttachCategory` and `removeAttachCategory`, one write each,
// each re-reading the file and doing its own splice. The categories window is a
// draft — a reader renames two, removes one and adds one, and presses Save once
// — so the two become one read, one plan and one `vault.modify`. Three writes
// would be three undo steps and would land a cancelling pair (remove `books`,
// add `Books`) in whichever order the promises resolved.
//
// THE PLAN IS PURE AND LIVES IN `attach-categories.ts`, which is what makes the
// guards testable: an empty-only removal re-checked against the file at the
// moment of the write, and never the last category. Both are carried out rather
// than thrown, so a save that is refused one removal still lands the renames —
// and this is the half that says so, because a refusal nobody is told about is
// the same as a bug.
async function saveAttachCategories(
  deps: PluginNoteRegionHost,
  notePath: string,
  rows: AttachCategoryRow[]
): Promise<void> {
  const file = deps.app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return;
  const text = await deps.app.vault.read(file);
  const plan = planAttachCategories(text, rows);
  if (!plan) {
    new Notice("Couldn't find an Attachments section in this note.");
    return;
  }

  for (const cat of plan.kept) {
    new Notice(
      `“${cat.label}” isn't empty any more — it has ${cat.items} item${
        cat.items === 1 ? "" : "s"
      } in it, so it was kept.`
    );
  }
  if (plan.floor) {
    new Notice(
      "An Attachments section needs one category — remove the whole section from “Edit sections…” instead."
    );
  }

  const next = applyAttachCategories(text, plan);
  if (next !== text) await deps.app.vault.modify(file, next);
}

// THE CATEGORIES DOOR. One control, one look, both surfaces. 3.18 follow-ups
// §1, then 1.0.49 twice.
//
// A SECTION-LEVEL ACTION IN THE SECTION'S OWN HEAD. It cannot be written as a
// `button:` directive: those resolve to registered CREATE-actions, and this one
// acts on the note's own fence rather than creating a note. So the renderer
// hosts it — it already knows this fence has shelves, it is about to draw them
// — and nothing is written into the reader's note. The larger route (a
// note-local action kind, reusable by every widget that wants one) stays
// available and is still the only thing standing between this and being an
// ordinary directive.
//
// IT WAS *Add category* UNTIL 1.0.49, one of the three edits a list needs and
// the only one the section offered; the other two were a per-shelf ✕ for an
// empty category and nothing at all for a rename. What is behind it now is the
// whole list — see `attach-categories-editor.ts`, which also records why the
// add field moved inside rather than staying beside it as a second door.
//
// ── IT WAS ALSO TWO CONTROLS UNTIL 1.0.49 §3 ────────────────────────────
//
// *"the diary and journal attachment sections should look more similar."* A
// titled `header:` bar hosted a labelled *Categories* pill, and a field head
// hosted a bare cog, because they were added in that order and for two
// different reports. The pill was the thing that made the two sections read as
// unrelated features: `frame.actions` at level 1 is `flex: 1 0 100%`, so the
// journal's section spent **a whole full-width row** on one button that the
// diary's fitted onto its title row with room to spare. The pill is gone, and
// both surfaces now reach this through `headTools`.
//
// ICON ONLY, AND SIZED TO THE CHEVRON. A title row is a line of text with a
// fold at the end of it; a labelled pill there would be the second-largest
// thing in the head. So this is the chevron's twin — `--ca-bar-glyph`, the same
// 1.4em box — and the name it has lost lives in `aria-label` and `title`.
//
// A `<button>` SO IT IS REACHABLE BY KEYBOARD, which means the 30px reset:
// app.css gives every button `height: var(--input-height)` and nothing but
// `height: auto; min-height: 0` escapes it. See `obsidian-button-height` — a
// 30px control in a ~20px head is how this trap announces itself.
//
// IT READS THE NOTE WHEN IT IS PRESSED, not when it is built. The window needs
// each category's item count — that is what decides whether its row can be
// removed — and a count captured at render time would be the count before the
// reader dropped anything. The write re-checks it again anyway, because this
// window can sit open.
export function buildCategoriesGlyph(
  deps: PluginNoteRegionHost,
  ctx: MarkdownPostProcessorContext,
  section: string
): HTMLElement {
  const btn = createEl("button", {
    cls: "ca-journal-field-cats",
    attr: { type: "button", "aria-label": CATEGORIES_LABEL, title: CATEGORIES_HINT },
  });
  setIcon(btn, "settings");
  wireCategories(btn, deps, ctx, section);
  return btn;
}

// THE SECTION'S NAME, WHERE THE NOTE DOES NOT CARRY ONE (1.0.49 §4). A barless
// `attach:` fence gets its head from the renderer rather than from a `header:`
// line, so the word has to live somewhere — and this is the same word
// `journal-sections.ts` gives the `header:` default, because a diary entry's
// Attachments and a journal note's are one section.
export const ATTACH_SECTION_TITLE = "Attachments";

const CATEGORIES_LABEL = "Change this section's categories";
const CATEGORIES_HINT = "Add, rename or remove this section's categories";

// ONE OPENER, KEPT SEPARATE FROM THE CONTROL. There is one control again as of
// 1.0.49 §3, and this stays its own function anyway: what happens when the door
// is pressed is a behaviour three guards and a vault read deep, and a second
// surface wanting it — a command, a context menu — must not have to copy it.
function wireCategories(
  btn: HTMLElement,
  deps: PluginNoteRegionHost,
  ctx: MarkdownPostProcessorContext,
  section: string
): void {
  btn.addEventListener("click", (evt) => {
    // The bar folds on click; this does not. Same separation the title slot
    // makes, and for the same reason — one gesture, one meaning. On the field
    // head it is the fold handler's own skip list that would have covered a
    // `<button>` anyway; the stop is here so neither surface depends on that.
    evt.stopPropagation();
    const file = deps.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;
    void deps.app.vault.read(file).then((text) => {
      const seeds = readAttachCategories(text).map((cat) => ({
        ...cat,
        items: categoryItemCount(text, cat.key),
        // THE TWO NUMBERS THE ROW'S CONTROLS ANSWER TO (1.0.49 §6): what it
        // holds decides whether the ✕ is live, and how much of that is not an
        // image decides whether *Image gallery* is offered.
        others: categoryNonImageCount(text, cat.key),
        format: attachFormatOf(cat.tokens),
      }));
      new AttachCategoriesEditor(
        deps.app,
        deps.plugin,
        section,
        seeds,
        (rows) => saveAttachCategories(deps, ctx.sourcePath, rows)
      ).open();
    });
  });
}

// ── the three pieces `buildAttachments` used to hold inline (5.2) ────────
//
// EXTRACTED, NOT REORGANISED. The function was 332 lines: a label row, an
// in-memory model with its render, a toolbar and two intake listeners, read
// top to bottom as one thing. These three take the parts that talk only to the
// DOM and to a handful of callbacks; the model — `items`, `render`, `handlers`,
// `ingestFiles`, `ingestText` — stays where it is, because it is what the parts
// are about and splitting it would mean threading it through three signatures.
//
// EVERY EXTRACTION KEEPS ITS ORDER. Each is called where its code stood, so the
// DOM is built and the listeners registered in exactly the sequence they were —
// which matters here: `bar` is created before the intake listeners, and the
// zone's `drop` handler must be registered after the tiles' own.

// ── THE SHELF'S ✕ IS GONE (1.0.49) ──────────────────────────────────────
//
// `buildShelfRemove` built it into the field head's actions slot, beside *Add
// file* and *Add link*: a ✕ that removed the category, disabled with a tooltip
// whenever the shelf had anything in it, refreshed from `render` through a
// `count()` getter because `items` is reassigned by a reorder and by the load.
//
// WHAT WAS WRONG WITH IT was not any of that — it is that a category is a
// SECTION-level thing and this was a per-shelf control for it, drawn once per
// shelf (three times on Study's Topic index), offering one of the three edits a
// list needs. 3.18 §1 made exactly this correction for *Add category* and left
// the ✕ where it was. The Categories window is both halves of it now.
//
// THE TWO GUARDS SURVIVED THE MOVE, which is the part worth checking against
// this note: only an empty category can go, re-checked against the file at the
// moment of the write because the window can sit open while a drop lands; and
// the last category stays, because a Resources section with no `attach:` line
// renders an empty header with no way back into it. Both live in
// `attach-categories.ts` now, where they are pure and testable rather than
// buried in a click handler.

// What the shelf's action row offers: a file picker behind a button, and a
// prompt for a link.
//
// `Add category` IS NOT HERE, and 3.18 §1 is why: it sat on this row on every
// shelf — three times on Study's Topic index — and it is a SECTION-level action
// where these two are shelf-level ones. `buildAddCategoryButton` anchors it in
// the Resources header bar instead.
interface AttachToolbarActions {
  ingestFiles: (files: File[]) => Promise<void>;
  add: (a: Attachment) => boolean;
  persist: () => void;
  render: () => void;
}

function buildAttachToolbar(
  deps: PluginNoteRegionHost,
  bar: HTMLElement,
  actions: AttachToolbarActions
): void {
  const picker = bar.createEl("input", {
    type: "file",
    cls: "ca-journal-attach-file-input",
  });
  picker.multiple = true;
  picker.addEventListener("change", () => {
    const chosen = Array.from(picker.files ?? []);
    picker.value = "";
    void actions.ingestFiles(chosen);
  });

  const addFileBtn = bar.createEl("button", {
    cls: "ca-journal-attach-btn",
    attr: { type: "button" },
  });
  setIcon(addFileBtn.createSpan({ cls: "ca-journal-attach-btn-icon" }), "image-plus");
  addFileBtn.createSpan({ text: "Add file" });
  addFileBtn.addEventListener("click", () => picker.click());

  const addLinkBtn = bar.createEl("button", {
    cls: "ca-journal-attach-btn",
    attr: { type: "button" },
  });
  setIcon(addLinkBtn.createSpan({ cls: "ca-journal-attach-btn-icon" }), "link");
  addLinkBtn.createSpan({ text: "Add link" });
  addLinkBtn.addEventListener("click", () => {
    void promptText(deps.app, "Add a link", "https://example.com").then((v) => {
      if (!v) return;
      const url = coerceUrl(v);
      if (!url) {
        new Notice("That doesn't look like a link ChronoAnvil can open.");
        return;
      }
      if (!actions.add(newAttachment(url))) {
        new Notice("That link is already attached.");
        return;
      }
      actions.persist();
      actions.render();
    });
  });

  // THE HINT IS NOT DRAWN HERE, AND WAS DRAWN TWICE UNTIL 5.14. This function
  // ended with one `bar.createSpan` of it and `buildAttachments` made a second
  // into the same row, so every shelf in every vault printed *"…or drop files
  // here, or paste with the field focused."* twice, side by side. Neither copy
  // was newer than the other in any comment; it is what an extraction leaves
  // when the caller keeps the line it moved. One copy survives, on the zone —
  // see the end of `buildAttachments`.
}

// Everything that arrives by drop or by paste.
//
// TWO EVENTS, ONE SET OF RULES: files are ingested, a tile dragged within the
// widget is a reorder, and text is parsed as a link or a vault path or ignored.
// Anything else is left alone rather than stored as junk.
interface AttachIntake {
  handlers: AttachmentHandlers;
  // A GETTER, for `buildShelfLabel`'s reason: `items` is reassigned, so a
  // length captured here would be the length it had when the listener was
  // registered.
  count: () => number;
  ingestFiles: (files: File[]) => Promise<void>;
  ingestText: (text: string) => boolean;
  persist: () => void;
  render: () => void;
}

function attachIntake(zone: HTMLElement, io: AttachIntake): void {
  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    zone.addClass("is-dragover");
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    zone.addClass("is-dragover");
  });
  zone.addEventListener("dragleave", (e) => {
    // Only clear when the pointer actually leaves the zone, not when it
    // crosses between a tile and its caption.
    if (e.relatedTarget instanceof Node && zone.contains(e.relatedTarget)) return;
    zone.removeClass("is-dragover");
  });
  zone.addEventListener("drop", (e) => {
    zone.removeClass("is-dragover");
    const dt = e.dataTransfer;
    if (!dt) return;
    // A tile dragged within this widget is a reorder, handled by the tile's
    // own drop target; landing on empty zone space means "move to the end".
    const moved = dt.getData(ATTACH_DRAG_TYPE);
    if (moved) {
      e.preventDefault();
      io.handlers.onReorder(Number(moved), io.count() - 1);
      return;
    }
    const files = Array.from(dt.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void io.ingestFiles(files);
      return;
    }
    const text = dt.getData("text/plain");
    if (text && io.ingestText(text)) {
      e.preventDefault();
      io.persist();
      io.render();
    }
  });

  zone.addEventListener("paste", (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = Array.from(cd.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void io.ingestFiles(files);
      return;
    }
    const text = cd.getData("text/plain");
    if (text && io.ingestText(text)) {
      e.preventDefault();
      io.persist();
      io.render();
    }
  });
}

// ── A SHELF INSIDE ANOTHER SHELF'S CARD (1.0.49) ─────────────────────────
//
// *"new category got incorrectly inserted as a new section when it should be
// nested."* A Resources section nests its categories under a `header:` bar —
// that is what Study's three shelves do — but the Attachments field of a diary
// entry has no bar and cannot be given one: the entry's shared fence holds
// seven fields, and a `header:` line in it would claim Tasks and everything
// after it. So a second category rendered as a second card at the same level,
// which reads as a second SECTION.
//
// THE FIRST SHELF IS THE SECTION, where no bar owns them. Its head names the
// group, its body holds every category, and `index.ts` passes the following
// shelves that body as `nestInto`.
//
// ── AND A NESTED SHELF IS THE SAME SHELF (1.0.49 §3) ────────────────────
//
// *"the diary and journal attachment sections should look more similar."* This
// function first shipped with a `shelfHead` of its own — a hand-built label row
// with a tools div, no fold and no hairline — on the reasoning that a card
// inside a card would be a box in a box. The reasoning was right and the code
// was unnecessary: `70-section-surface.css` has stood a `.ca-journal-field`
// DOWN to a flat head with a hairline, whenever it sits inside another fold,
// since the field frame was written. A nested shelf asking for an ordinary
// `fieldHead` therefore gets exactly the head a journal shelf wears — which is
// the whole of what the reader asked for — and brings a fold of its own with
// it, keyed per category off the store that was already threaded through here.
// So the only thing the nested case still decides is WHERE `wrap` is created.
//
// ── AND THE SECTION GETS A HEAD OF ITS OWN (1.0.49 §4) ──────────────────
//
// *"I do think it would be better if the diary also had a distinct headerbar
// instead of the first categorie doing double duty."* The first shelf being the
// section was the shape the reader picked in §2 out of three drawn options, and
// seeing it is what settled it: a card named **Attachments** holding a drop zone
// AND a nested shelf is a head doing two jobs, and the journal's equivalent —
// a bar, then equal shelves under it — is the shape that reads.
//
// SO THE RENDERER DRAWS THE BAR. It cannot come from the note: a `header:` line
// in a diary entry's shared fence claims every field after it, which is the
// fact that closed this route in §2 and has not changed. What has changed is
// that it does not need to be in the note — the fence's first `attach:` line is
// enough to know a section is here, and `headTools` now gives that head the
// same slot a `header:` bar has. So `ownsCategories` means one more thing than
// it did: this field draws the SECTION's head around itself, hosts the door on
// it, and then nests itself inside it as the first of its shelves.
//
// WHICH MAKES EVERY SHELF A SHELF. The first one is no longer special in any
// way a reader can see: same head, same fold, same two buttons, same drop zone,
// and the name over all of them is the section's rather than the first
// category's.
//
// THE TITLE IS A CONSTANT AND NOT THE FIRST LABEL, which is the whole point —
// a section whose name is its first category's name is the double duty this
// round removes, and renaming that category would have renamed the section.
// `ATTACH_SECTION_TITLE` is the one word, and it is the same word the journal's
// `header:` default now carries (`journal-sections.ts`), because they are the
// same section.
export function buildAttachments(
  deps: PluginNoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null,
  titled = false,
  barActions: HTMLElement | null = null,
  ownsCategories = false,
  nestInto: HTMLElement | null = null
): HTMLElement {
  // THROUGH `noteKeyOf`, WHICH IS THE ONE PARSE OF A REGION KEY (1.0.42). This
  // read was `rest.split(":")[0]`, which is right up to the moment a `#token`
  // appears on the head — and two of them do now, `#compact` and `#widget`. An
  // unparsed one is a region key of `capture#widget`: a field pointed at a span
  // nothing writes, which renders empty, loses nothing and says nothing either.
  const key = noteKeyOf(rest);
  // ── WHAT SHAPE THIS SHELF DRAWS (1.0.49 §6) ─────────────────────────────
  //
  // OFF THE SAME `#` HEAD THE KEY COMES OFF, through the same `splitArgHead`:
  // the format is a flag on the category's own line, which is the only thing
  // in a diary entry's shared fence that means this category. `noteKeyOf`
  // above is that parse's other half — it has stripped flags since 1.0.42, so
  // a format token cannot be mistaken for part of a region key.
  const format = attachFormatOf(splitArgHead(rest).tokens);
  const store = fieldFoldStore(deps, ctx.sourcePath);
  const shelfCls = `ca-journal-attach ca-journal-attach-shelf ca-journal-attach--${key}`;

  // The element the fence sees. It is this shelf, except where this field draws
  // the section's head — then it is the section, and the shelf is inside it.
  let root: HTMLElement;
  // The section body later shelves nest into, or null where this field is not
  // the one that opened the section.
  let shelves: HTMLElement | null = null;
  if (ownsCategories) {
    root = createDiv({ cls: "ca-journal-attach ca-journal-attach-section" });
    const section = fieldFrame(
      root,
      { title: ATTACH_SECTION_TITLE },
      store,
      // KEYED OFF THE FIRST SHELF AND NOT OFF THE TITLE, so a note holding two
      // barless `attach:` fences folds them separately. `#` cannot appear in a
      // category key — `slugify`'s alphabet is the key grammar — so this cannot
      // collide with the fold of the shelf it is named after, which is the one
      // collision that would make the section's chevron fold a category.
      `${key}#shelves`
    );
    headTools(section.frame.root).appendChild(
      buildCategoriesGlyph(deps, ctx, ATTACH_SECTION_TITLE)
    );
    shelves = section.body;
  } else {
    root = nestInto
      ? nestInto.createDiv({ cls: shelfCls })
      : createDiv({ cls: `ca-journal-attach ca-journal-attach--${key}` });
  }
  const wrap = shelves ? shelves.createDiv({ cls: shelfCls }) : root;

  const nested = nestInto != null || shelves != null;
  const chrome = fieldHead({
    wrap,
    key,
    label,
    // A SHELF NEVER BORROWS A BAR, and both of these say so. `titled` means
    // *the bar over this fence names this field*, and a shelf is nested only
    // where no bar owns the shelves at all (`shelfHeader === -1`) — so passing
    // either through would route it into the branch that WITHHOLDS its head,
    // and a shelf with no head of its own is the one thing the nesting cannot
    // be drawn without. True for the first shelf too as of §4: it is inside the
    // section's own head now, so it is nested like every other one.
    titled: nested ? false : titled,
    barActions: nested ? null : barActions,
    store,
  });
  // WHERE A FOLLOWING SHELF NESTS. `index.ts` groups a barless run of `attach:`
  // fields into the section this one opened (1.0.49), and it needs that body
  // without knowing how it was built — the section's own head as of §4, a
  // field head before that. The class is the contract; nothing styles it.
  //
  // EXACTLY ONE ELEMENT CARRIES IT PER WIDGET. On the field that drew the
  // section the body is the SECTION's, not this shelf's — `index.ts` reads it
  // with a `querySelector`, and two candidates nested one inside the other
  // would be answered by document order rather than by intent.
  (shelves ?? chrome.body).addClass("ca-journal-attach-body");
  if (!isValidNoteKey(key)) {
    chrome.body.createDiv({
      cls: "ca-journal-widget-error",
      text: `Invalid attachments key: "${key}"`,
    });
    return root;
  }

  const zone = chrome.body.createDiv({
    cls: "ca-journal-attach-zone",
    attr: { tabindex: "0" },
  });
  // THE FORMAT'S OWN CLASS, OFF `ATTACH_FORMATS` (1.0.49 §6). The default's is
  // `null` — the shape that writes no token draws no class either, so a note
  // that has never been asked about this renders through exactly the rules it
  // did before. Composed rather than written out here so the stylesheet's
  // selector and this element's class come off one declaration.
  const formatCls = ATTACH_FORMATS.find((f) => f.value === format)?.cls;
  if (formatCls) zone.addClass(formatCls);
  const gallery = zone.createDiv({ cls: "ca-journal-attach-gallery" });
  const chips = zone.createDiv({ cls: "ca-journal-attach-chips" });

  // In-memory model, exactly like buildTasks: the region is the source of
  // truth on load, this array is the model while the widget is mounted.
  let items: Attachment[] = [];
  let busy = 0; // in-flight file writes, for the "Adding…" hint

  const persist = (): void => {
    void deps.writeNoteRegionToFile(ctx, key, serializeAttachments(items));
  };

  const render = (): void => {
    gallery.empty();
    chips.empty();
    // ── THE LIST FORMAT HAS ONE LANE (1.0.49 §6) ─────────────────────────
    //
    // *"images should not have a preview, just the link to them."* So the
    // format is asked BEFORE the kind: in `list` the gallery lane is left
    // empty and every item — image or not — is a numbered chip, which is what
    // makes the numbering mean anything. The other two formats keep the two
    // lanes they have always had, and differ only in how big the tiles are.
    const tiled = format === "list" ? [] : items.filter((a) => a.kind === "image");
    gallery.toggleClass("is-empty", tiled.length === 0);

    items.forEach((item, index) => {
      if (format !== "list" && item.kind === "image")
        renderAttachmentTile(deps, gallery, item, index, ctx, handlers);
      else
        renderAttachmentChip(
          deps,
          chips,
          item,
          index,
          ctx,
          handlers,
          format === "list" ? items.length : null
        );
    });

    if (items.length === 0 && busy === 0) {
      chips.createDiv({
        cls: "ca-journal-attach-empty",
        text: "Drop or paste images, files and links here.",
      });
    }
    if (busy > 0) {
      chips.createDiv({
        cls: "ca-journal-attach-busy",
        text: busy === 1 ? "Adding 1 file…" : `Adding ${busy} files…`,
      });
    }
  };

  // Callbacks the tile/chip renderers fire. Kept in one object so both
  // renderers stay pure view-builders (the buildTasks pattern).
  const handlers: AttachmentHandlers = {
    onCaption: (index) => {
      const item = items[index];
      void promptText(
        deps.app,
        "Caption",
        "Shown under the image / on the chip",
        item.title
      ).then((v) => {
        if (v === null) return;
        item.title = v.trim();
        persist();
        render();
      });
    },
    onToggleEmbed: (index) => {
      const item = items[index];
      item.kind = item.kind === "image" ? "link" : "image";
      persist();
      render();
    },
    onRemove: (index) => {
      items.splice(index, 1);
      persist();
      render();
    },
    onDelete: (index) => {
      const item = items[index];
      void removeAttachmentFile(deps, item, ctx).then((gone) => {
        if (!gone) return;
        const at = items.indexOf(item);
        if (at !== -1) items.splice(at, 1);
        persist();
        render();
      });
    },
    onReorder: (from, to) => {
      items = moveAttachment(items, from, to);
      persist();
      render();
    },
    onLightbox: (index) => {
      openAttachmentLightbox(deps, items, index, ctx);
    },
  };

  // Add one attachment, de-duplicating by target so dropping the same file
  // twice doesn't stack identical tiles.
  const add = (a: Attachment): boolean => {
    if (a.target && hasTarget(items, a.target)) return false;
    items.push(a);
    return true;
  };

  // Take a list of OS/clipboard files: write each into the vault, then link
  // it. Sequential rather than parallel so the unique-name check can't race
  // two identically named files into the same path.
  const ingestFiles = async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    busy += files.length;
    render();
    try {
      for (const f of files) {
        const stored = await storeAttachmentFile(deps, f, ctx);
        busy -= 1;
        if (!stored) continue;
        add(newAttachment(stored.path));
        render();
      }
    } finally {
      busy = 0;
      persist();
      render();
    }
  };

  // Text arriving by paste or drop: a URL, an Obsidian link, or a bare vault
  // path. Anything else is ignored rather than stored as junk.
  const ingestText = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const parsed = parseAttachmentLine(trimmed);
    if (parsed && parsed.kind !== "text") return add(parsed);

    const url = coerceUrl(trimmed);
    if (url) return add(newAttachment(url));

    const vaultFile = resolveAttachmentFile(deps, trimmed, ctx);
    if (vaultFile) return add(newAttachment(vaultFile.path));
    return false;
  };

  // ── THE TOOLS, IN THE HEAD (5.14) ───────────────────────────────────
  //
  // They were a third row INSIDE the dashed zone: a drop target with buttons in
  // it, under a label that belonged to neither. `Add file` and `Add link` are
  // what this field can do, which is what a head's actions slot is for — and
  // with them gone the zone is what it says it is, a place to drop things.
  //
  // ── ON THE TITLE ROW OF IT, AS OF 1.0.49 §3 ──────────────────────────
  //
  // *"the diary and journal attachment sections should look more similar."*
  // `actions()` on a field head is `foldableSection`'s level-1 actions slot,
  // which is `flex: 1 0 100%` — a full-width SECOND row — and a Resources
  // section with three shelves was therefore four rows of chrome holding five
  // buttons over three empty drop zones. Two pills fit beside a title with room
  // to spare, and a shelf is a band a few lines tall: the row they were costing
  // was most of it.
  //
  // `head() ?? actions()` RATHER THAN EITHER. Null is a real answer — a field
  // whose head is withheld because a bar names it, a widget, a nameless field —
  // and there the second-row strip is not a choice but the only slot there is.
  // So the fallback is today's behaviour exactly, and the title row is taken
  // wherever this field drew a title row of its own.
  const tools = chrome.head() ?? chrome.actions();
  buildAttachToolbar(deps, tools, { ingestFiles, add, persist, render });

  // ── WHERE THE CATEGORIES DOOR WENT, AND WHY NOT HERE (1.0.49 §4) ─────
  //
  // IT SAT ON THIS SLOT FOR ONE ROUND. `ownsCategories` marks the first
  // `attach:` field of a fence no titled header owns — the one case the
  // bar-hosted door never reaches — and with the first shelf doing double duty
  // as the section, its own tools row was the only section-level strip there
  // was. The cog went in after the pills, nearest the fold.
  //
  // THE SECTION HAS A HEAD OF ITS OWN NOW, drawn at the top of this function,
  // and the door is on THAT — the end of the section's title row, which is
  // exactly where a bar hosts it. Putting it here as well would be two doors
  // onto one list, and on a SHELF, which is the per-shelf category error the ✕
  // was removed for. One door per section, and it is the section's.

  // ── Where "Add category" used to be ──────────────────────────────────
  //
  // MOVED TO THE SECTION'S OWN HEADER BAR (3.18 follow-ups §1). It sat here,
  // beside *Add file* and *Add link*, on every shelf — three times on Study's
  // Topic index, doing the same thing from each. The comment defending that
  // argued the button belonged on every shelf "because there is no first the
  // reader can see", which is a defence of a position rather than a reason to
  // be in it: the button is not about a shelf at all.
  //
  // *Add file* is a SHELF-level action and belongs on a shelf. Adding a
  // category is a SECTION-level one, and drawing one per shelf stated a
  // relationship that is not there. `buildCategoriesGlyph` is now placed ONCE
  // per section — on its bar's head where a bar names it, on the first shelf's
  // head where none does — and the duplication goes with it. The two controls
  // share a row again as of 1.0.49 §3, and that is a width decision rather than
  // a category one: one is drawn per section and two are drawn per shelf, which
  // is what the sizing says about them.

  // ON THE ZONE, WHICH IS WHAT IT IS ABOUT (5.14). It was the tail of the
  // toolbar row, and the toolbar has moved into the head — read from up there
  // it would be a sentence about a box it is no longer beside.
  zone.createSpan({
    cls: "ca-journal-attach-hint",
    text: "…or drop files here, or paste with the field focused.",
  });

  attachIntake(zone, {
    handlers,
    count: () => items.length,
    ingestFiles,
    ingestText,
    persist,
    render,
  });

  // ── Load ─────────────────────────────────────────────────────────────
  const file = deps.fileOf(ctx);
  if (file) {
    void deps.app.vault.read(file).then((text) => {
      items = parseAttachments(readNoteRegion(text, key));
      render();
      void deps.ensureNoteRegion(file, key);
    });
  } else {
    render();
  }

  return root;
}
