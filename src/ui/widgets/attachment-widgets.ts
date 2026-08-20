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
import { isValidNoteKey, readNoteRegion } from "../../core/notestore";
import { slugify } from "../../core/util";
import { confirmAction, promptText } from "../modals";
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


// MIME type used by the attachments widget's own drag-to-reorder, so its drop
// handler can tell an internal tile move apart from a file arriving from
// outside. Lowercase: the DataTransfer type list is normalised to lowercase.
const ATTACH_DRAG_TYPE = "application/x-almanac-attachment";

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
      new Notice("That link uses a scheme Almanac won't open.");
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
  el.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData(ATTACH_DRAG_TYPE, String(index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    el.addClass("is-dragging");
  });
  el.addEventListener("dragend", () => el.removeClass("is-dragging"));
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
        .setTitle("Remove and delete file…")
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
    cls: "journal-attach-lightbox",
    attr: { tabindex: "-1" },
  });
  const stage = overlay.createDiv({ cls: "journal-attach-lightbox-stage" });
  const img = stage.createEl("img");
  const caption = stage.createDiv({ cls: "journal-attach-lightbox-caption" });

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
      cls: "journal-attach-lightbox-nav is-prev",
      attr: { type: "button", "aria-label": "Previous" },
    });
    setIcon(prev, "chevron-left");
    prev.addEventListener("click", (e) => {
      e.stopPropagation();
      step(-1);
    });
    const next = overlay.createEl("button", {
      cls: "journal-attach-lightbox-nav is-next",
      attr: { type: "button", "aria-label": "Next" },
    });
    setIcon(next, "chevron-right");
    next.addEventListener("click", (e) => {
      e.stopPropagation();
      step(1);
    });
  }

  const closeBtn = overlay.createEl("button", {
    cls: "journal-attach-lightbox-close",
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
  cb: AttachmentHandlers
): void {
  const chip = chips.createDiv({
    cls: `journal-attach-chip journal-attach-chip--${item.kind}`,
  });
  chip.draggable = true;

  const icon = chip.createSpan({ cls: "journal-attach-chip-icon" });
  if (item.kind === "link") setIcon(icon, "external-link");
  else if (item.kind === "text") setIcon(icon, "text-cursor-input");
  else setIcon(icon, attachmentFileIcon(item.target));

  const body = chip.createDiv({ cls: "journal-attach-chip-body" });
  body.createSpan({ cls: "journal-attach-chip-title", text: displayTitle(item) });
  if (item.kind === "link" && item.title.trim()) {
    body.createSpan({
      cls: "journal-attach-chip-sub",
      text: hostLabel(item.target),
    });
  }

  if (item.kind !== "text") {
    chip.addClass("is-openable");
    chip.addEventListener("click", () => openAttachment(deps, item, ctx));
  } else {
    chip.addEventListener("click", () => cb.onCaption(index));
  }

  const menuBtn = chip.createEl("button", {
    cls: "journal-attach-menu",
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
  const tile = gallery.createDiv({ cls: "journal-attach-tile" });
  tile.draggable = true;

  const frame = tile.createDiv({ cls: "journal-attach-thumb" });
  const external = isExternalUrl(item.target);
  const target = external ? item.target : resolveAttachmentFile(deps, item.target, ctx);

  if (external && isSafeUrl(item.target)) {
    const img = frame.createEl("img", { attr: { alt: displayTitle(item) } });
    img.src = item.target;
    img.loading = "lazy";
    img.addEventListener("error", () => {
      frame.empty();
      frame.addClass("is-missing");
      setIcon(frame.createDiv({ cls: "journal-attach-missing-icon" }), "unlink");
      frame.createDiv({ cls: "journal-attach-missing-text", text: "Unavailable" });
    });
  } else if (target instanceof TFile) {
    const img = frame.createEl("img", { attr: { alt: displayTitle(item) } });
    img.src = deps.app.vault.getResourcePath(target);
    img.loading = "lazy";
  } else {
    frame.addClass("is-missing");
    setIcon(frame.createDiv({ cls: "journal-attach-missing-icon" }), "image-off");
    frame.createDiv({ cls: "journal-attach-missing-text", text: "File not found" });
  }

  frame.addEventListener("click", () => cb.onLightbox(index));

  const caption = tile.createDiv({
    cls: "journal-attach-caption",
    text: displayTitle(item),
  });
  caption.addEventListener("click", () => cb.onCaption(index));
  caption.setAttribute("aria-label", "Click to edit the caption");

  const menuBtn = tile.createEl("button", {
    cls: "journal-attach-menu",
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


export async function deleteAttachmentFile(
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
    const ok = await confirmAction(
      deps.app,
      "Delete attachment?",
      `${file.path} will be moved to the trash and its link removed from this note. Other notes linking to it will break.`,
      "Delete file",
      true
    );
    if (!ok) return false;
  }
  // ── PRIVATE AGAIN AS OF 4.50.1, AND THE ROUND TRIP IS WORTH RECORDING ──
  //
  // 4.50 lifted this probe into `util.ts` because a title row's *Move to bin*
  // had become a second caller. It should never have been one: a journal note
  // goes to `00 - Infrastructure/Bin/` by a rename, which is Almanac's own bin
  // and the thing `journal-removal.ts` had already decided. With that caller
  // gone this is a shared helper with one user, which is `recordList`'s round
  // trip in 4.13.3 for the same reason — **a component is worth sharing when two
  // surfaces do the same thing, and these two never did.**
  //
  // AN ATTACHMENT IS THE CASE WHERE OBSIDIAN'S TRASH IS RIGHT. It is a binary
  // the reader added to a note rather than a note they wrote, the vault's
  // *Deleted files* setting is the answer they already gave for files like it,
  // and the confirmation above says "moved to the trash" in those words.
  //
  // `fileManager.trashFile` IS THE ONE THAT ASKS THAT SETTING — system trash,
  // `.trash/`, or permanent — and it is only on newer API versions, so it is
  // probed with `vault.trash(file, true)` behind it.
  try {
    const fm = deps.app.fileManager as unknown as {
      trashFile?: (f: TFile) => Promise<void>;
    };
    if (typeof fm.trashFile === "function") await fm.trashFile(file);
    else await deps.app.vault.trash(file, true);
  } catch (e) {
    console.error("[Almanac] could not trash attachment", e);
    new Notice(`Couldn't delete ${file.path}.`);
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
  if (opts.location === "almanac") {
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
    console.error("[Almanac] could not read dropped file", e);
    new Notice(`Couldn't read ${original || "that file"}.`);
    return null;
  }

  try {
    const path = await attachmentPathFor(deps, fileName, host, tokens);
    return await deps.app.vault.createBinary(path, data);
  } catch (e) {
    console.error("[Almanac] could not save attachment", e);
    new Notice(`Couldn't save ${fileName}.`);
    return null;
  }
}


// Append a shelf to the Resources section of `notePath`. 3.18 §4.2.
//
// TWO WRITES THAT MUST BOTH LAND: an `attach:<key>|<Label>` line inside the
// fence, and a `<!--almanac:key -->` region below it for the shelf's contents.
// A line with no region is a widget with nowhere to store what is dropped on
// it, so they are written in one `modify` rather than two.
//
// THE KEY IS SLUGIFIED AND DE-DUPLICATED, the same repair every other id in
// this plugin gets. Two shelves named "Books" is two shelves — a reader who
// does that wants two, not an error — so a collision suffixes rather than
// refuses.
async function addAttachCategory(
  deps: PluginNoteRegionHost,
  notePath: string,
  label: string
): Promise<void> {
  const file = deps.app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return;
  const text = await deps.app.vault.read(file);
  const lines = text.split("\n");

  // The last `attach:` line, and the fence it lives in.
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*attach:/.test(lines[i])) last = i;
  }
  if (last === -1) {
    new Notice("Couldn't find a Resources section in this note.");
    return;
  }
  let close = -1;
  for (let i = last; i < lines.length; i++) {
    if (lines[i].trim() === "```") {
      close = i;
      break;
    }
  }
  if (close === -1) {
    new Notice("Couldn't find a Resources section in this note.");
    return;
  }

  const taken = new Set(
    lines
      .filter((l) => /^\s*attach:/.test(l))
      .map((l) => l.replace(/^\s*attach:/, "").split("|")[0].trim())
  );
  const stem = slugify(label) || "resources";
  let key = stem;
  let n = 2;
  while (taken.has(key)) key = `${stem}-${n++}`;
  if (!isValidNoteKey(key)) {
    new Notice("That name can't be used as a category.");
    return;
  }

  const out = [...lines];
  // The region goes after the fence close, ahead of anything else that follows
  // it, so the shelves and their regions stay in the same order.
  out.splice(close + 1, 0, "", `<!--almanac:${key}`, "-->");
  out.splice(last + 1, 0, `attach:${key}|${label}`);
  await deps.app.vault.modify(file, out.join("\n"));
}

// Remove a category from this note's Resources section. 3.19.2.
//
// ONLY WHEN IT IS EMPTY, enforced by the caller and again here.
//
// A shelf owns two things in the file: its `attach:<key>|<label>` line inside
// the fence, and its `<!--almanac:<key> ... -->` region below it. The region is
// where the reader's files and links live. Deleting a shelf that had any would
// be deleting their attachments — and unlike removing a note kind, which leaves
// the reader's markdown alone and merely stops recognising it, there is nothing
// left behind here to recover from. So the control is offered only on a shelf
// with nothing in it, where "remove" costs exactly the empty box it names.
//
// THE RE-CHECK IS NOT BELT-AND-BRACES. The button's enabled state is computed
// from the widget's in-memory model at render time, and the write happens after
// a confirmation the reader may have sat on. A drop that landed in between —
// this widget accepts them — would make an empty shelf a full one while the
// dialog was open. The file is read here and the region is checked as written.
async function removeAttachCategory(
  deps: PluginNoteRegionHost,
  notePath: string,
  key: string
): Promise<void> {
  const file = deps.app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return;
  const lines = (await deps.app.vault.read(file)).split("\n");

  const open = lines.findIndex((l) => l.trim() === `<!--almanac:${key}`);
  const close =
    open === -1
      ? -1
      : lines.findIndex((l, i) => i > open && l.trim() === "-->");
  if (open !== -1 && close !== -1) {
    const body = lines.slice(open + 1, close).join("").trim();
    if (body) {
      new Notice(
        "That category isn't empty any more — remove what's in it first."
      );
      return;
    }
  }

  const directive = lines.findIndex(
    (l) => l.replace(/^\s*attach:/, "") !== l && l.split("|")[0].replace(/^\s*attach:/, "").trim() === key
  );
  if (directive === -1) {
    new Notice("Couldn't find that category in this note.");
    return;
  }

  // THE LAST SHELF STAYS. A Resources section with no `attach:` line renders an
  // empty header and gives the reader no way back — "Add category" appends
  // after the last one, and there would be none. Removing the section itself is
  // the section editor's job, and it says so.
  const shelves = lines.filter((l) => /^\s*attach:/.test(l)).length;
  if (shelves <= 1) {
    new Notice(
      "This is the only category left. Remove the whole Resources section from “Edit sections…” instead."
    );
    return;
  }

  const out = [...lines];
  // The region first, so removing it does not shift the directive's index.
  if (open !== -1 && close !== -1) {
    let from = open;
    // The blank line `addAttachCategory` inserted with it, so adding and
    // removing a category leaves the file as it found it.
    if (from > 0 && out[from - 1].trim() === "") from--;
    out.splice(from, close - from + 1);
  }
  out.splice(directive, 1);
  await deps.app.vault.modify(file, out.join("\n"));
}

// "Add category", as the Resources section's own action. 3.18 follow-ups §1.
//
// A SECTION-LEVEL ACTION IN THE SECTION'S OWN STRIP. The header bar is where
// this belongs and the mechanism was already there — `header:` opens a bar and
// what follows anchors into it — but only for `button:<type>:<action>`
// directives, which resolve to registered CREATE-actions. "Add a category here"
// is not one of those: it acts on this note's own fence rather than creating a
// note, so it has no create-action to name and cannot be written as a directive
// without inventing a note-local action kind first.
//
// So this is the smaller of the two routes the follow-up set out: the bar grows
// an action slot the renderer hosts, rather than the directive vocabulary
// growing a new kind. The renderer already knows this fence has shelves — it is
// about to draw them — so it can host the section's action without anything
// being written into the reader's note. The larger route (a note-local action
// kind, reusable by every widget that wants one) stays available and is now the
// only thing standing between this and being an ordinary `button:` directive.
//
// STYLED AS A HEADER BUTTON, NOT AS AN ATTACH BUTTON. It has moved into a row
// whose other members are `journal-btn`s, and keeping `.journal-attach-btn`
// here would have carried the toolbar's look into a strip it no longer belongs
// to — the visual half of the same category error the move corrects.
export function buildAddCategoryButton(
  deps: PluginNoteRegionHost,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const wrap = createSpan({ cls: "journal-widget journal-button" });
  const btn = wrap.createEl("button", { cls: "journal-btn journal-btn-subtle" });
  setIcon(btn.createSpan({ cls: "journal-btn-icon" }), "folder-plus");
  btn.createSpan({ cls: "journal-btn-label", text: "Add category" });
  btn.setAttr("aria-label", "Add a category to this section");
  btn.setAttr("title", "Add a category to this section");
  btn.addEventListener("click", (evt) => {
    // The bar folds on click; this does not. Same separation the title slot
    // makes, and for the same reason — one gesture, one meaning.
    evt.stopPropagation();
    void promptText(deps.app, "Name this category", "e.g. Tutorials").then(
      (name) => {
        const label = name?.trim();
        if (!label) return;
        void addAttachCategory(deps, ctx.sourcePath, label);
      }
    );
  });
  return wrap;
}

export function buildAttachments(
  deps: PluginNoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null
): HTMLElement {
  const key = rest.split(":")[0].trim();
  const wrap = createDiv({ cls: `journal-attach journal-attach--${key}` });
  // The shelf's own subtitle row, and its remove control (3.19.2). Built here
  // rather than in `render` so the button is not torn down and rebuilt on every
  // model change; `refreshRemove` below updates only what changes, which is
  // whether it is offered at all.
  let refreshRemove = (): void => {};
  if (label) {
    const head = wrap.createDiv({ cls: "journal-attach-label" });
    head.createSpan({ cls: "journal-attach-label-text", text: label });
    const drop = head.createEl("button", {
      cls: "journal-attach-remove",
      attr: { type: "button" },
    });
    setIcon(drop, "x");
    drop.addEventListener("click", async (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const ok = await confirmAction(
        deps.app,
        `Remove the “${label}” category?`,
        "It has nothing in it, so nothing is lost. You can add it again from “Add category” on the section's title bar.",
        "Remove it",
        true
      );
      if (!ok) return;
      await removeAttachCategory(deps, ctx.sourcePath, key);
    });
    refreshRemove = (): void => {
      // EMPTY IS THE WHOLE CONDITION. Disabled rather than hidden, on
      // `buildScopeCycle`'s reasoning: a control that vanishes on some shelves
      // and not others is harder to read than a quiet one, and the tooltip is
      // where the reason belongs.
      const empty = items.length === 0;
      drop.disabled = !empty;
      drop.toggleClass("is-static", !empty);
      const why = empty
        ? `Remove the “${label}” category`
        : `“${label}” still has ${items.length} item${items.length === 1 ? "" : "s"} — remove them first`;
      drop.setAttr("aria-label", why);
      drop.setAttr("title", why);
    };
  }

  if (!isValidNoteKey(key)) {
    wrap.createDiv({
      cls: "journal-widget-error",
      text: `Invalid attachments key: "${key}"`,
    });
    return wrap;
  }

  const zone = wrap.createDiv({
    cls: "journal-attach-zone",
    attr: { tabindex: "0" },
  });
  const gallery = zone.createDiv({ cls: "journal-attach-gallery" });
  const chips = zone.createDiv({ cls: "journal-attach-chips" });
  const bar = zone.createDiv({ cls: "journal-attach-actions" });

  // In-memory model, exactly like buildTasks: the region is the source of
  // truth on load, this array is the model while the widget is mounted.
  let items: Attachment[] = [];
  let busy = 0; // in-flight file writes, for the "Adding…" hint

  const persist = (): void => {
    void deps.writeNoteRegionToFile(ctx, key, serializeAttachments(items));
  };

  const render = (): void => {
    refreshRemove();
    gallery.empty();
    chips.empty();
    const images = items.filter((a) => a.kind === "image");
    gallery.toggleClass("is-empty", images.length === 0);

    items.forEach((item, index) => {
      if (item.kind === "image") renderAttachmentTile(deps, gallery, item, index, ctx, handlers);
      else renderAttachmentChip(deps, chips, item, index, ctx, handlers);
    });

    if (items.length === 0 && busy === 0) {
      chips.createDiv({
        cls: "journal-attach-empty",
        text: "Drop or paste images, files and links here.",
      });
    }
    if (busy > 0) {
      chips.createDiv({
        cls: "journal-attach-busy",
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
      void deleteAttachmentFile(deps, item, ctx).then((deleted) => {
        if (!deleted) return;
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

  // ── Toolbar ──────────────────────────────────────────────────────────
  const picker = bar.createEl("input", {
    type: "file",
    cls: "journal-attach-file-input",
  });
  picker.multiple = true;
  picker.addEventListener("change", () => {
    const chosen = Array.from(picker.files ?? []);
    picker.value = "";
    void ingestFiles(chosen);
  });

  const addFileBtn = bar.createEl("button", {
    cls: "journal-attach-btn",
    attr: { type: "button" },
  });
  setIcon(addFileBtn.createSpan({ cls: "journal-attach-btn-icon" }), "image-plus");
  addFileBtn.createSpan({ text: "Add file" });
  addFileBtn.addEventListener("click", () => picker.click());

  const addLinkBtn = bar.createEl("button", {
    cls: "journal-attach-btn",
    attr: { type: "button" },
  });
  setIcon(addLinkBtn.createSpan({ cls: "journal-attach-btn-icon" }), "link");
  addLinkBtn.createSpan({ text: "Add link" });
  addLinkBtn.addEventListener("click", () => {
    void promptText(deps.app, "Add a link", "https://example.com").then((v) => {
      if (!v) return;
      const url = coerceUrl(v);
      if (!url) {
        new Notice("That doesn't look like a link Almanac can open.");
        return;
      }
      if (!add(newAttachment(url))) {
        new Notice("That link is already attached.");
        return;
      }
      persist();
      render();
    });
  });

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
  // category is a SECTION-level one, and putting the two on one row stated a
  // relationship that is not there. `buildAddCategoryButton` now anchors it in
  // the Resources header bar, which is the section's own strip — one bar, one
  // button, and the duplication goes with it.

  bar.createSpan({
    cls: "journal-attach-hint",
    text: "…or drop files here, or paste with the field focused.",
  });

  // ── Drop / paste ─────────────────────────────────────────────────────
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
      handlers.onReorder(Number(moved), items.length - 1);
      return;
    }
    const files = Array.from(dt.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files);
      return;
    }
    const text = dt.getData("text/plain");
    if (text && ingestText(text)) {
      e.preventDefault();
      persist();
      render();
    }
  });

  zone.addEventListener("paste", (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = Array.from(cd.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void ingestFiles(files);
      return;
    }
    const text = cd.getData("text/plain");
    if (text && ingestText(text)) {
      e.preventDefault();
      persist();
      render();
    }
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

  return wrap;
}
