// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The note: field — a free-text area that owns a region of the note body.
//
// It is the one body-region widget that keeps live state after mount. A list or
// a task block rebuilds from the file whenever the file changes; a textarea
// cannot, because rebuilding under a cursor loses the cursor. So this field
// writes on a debounce (./note-write-scheduler.ts) and watches for external
// writes it did not make (NoteFieldWatcher, below), which is enough machinery
// to be worth its own file rather than a fourth builder in ./note-regions.ts.

import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  setIcon,
} from "obsidian";
import type { App } from "obsidian";
import type AlmanacPlugin from "../../main";
import type { PluginNoteRegionHost } from "./note-regions";
import type { NoteWriteScheduler } from "./note-write-scheduler";
import {
  appendedSince,
  isValidNoteKey,
  joinRegionBlocks,
  readNoteRegion,
} from "../../core/notestore";
import { CAPTURE_NOTE_KEY } from "../../core/constants";

/**
 * The note-region contract, plus the plugin and the debounce scheduler.
 *
 * `noteWrites` is on the interface rather than constructed here because the
 * timers must outlive any one call to buildNote: a field rebuilt by a re-render
 * has to find its own pending write still queued, not a fresh empty table.
 */
export interface NoteFieldHost extends PluginNoteRegionHost {
  readonly noteWrites: NoteWriteScheduler;
}
// Keeps a `note:` field in step with external writes to its region. A note
// textarea deliberately owns its state after mount (so it never rebuilds under
// the cursor), which means a *second* writer to the same region — a scale
// context note appended to the `capture` log via the quick-capture modal — is
// invisible to it, and the field's next blur would write its stale value back
// over the append. This watches the note file and calls `refresh` on each
// change; the guard against clobbering the user's own editing lives in
// `refresh` itself. Uses MarkdownRenderChild so the vault listener is released
// with the note view.
export class NoteFieldWatcher extends MarkdownRenderChild {
  constructor(
    private app: App,
    hostEl: HTMLElement,
    private sourcePath: string,
    private refresh: () => void
  ) {
    super(hostEl);
  }

  onload(): void {
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (f.path === this.sourcePath) this.refresh();
      })
    );
  }
}


// ── the fold, as three functions rather than three closures (4.28) ────
//
// Extracted from `buildNote` when the capture region stopped being a textarea:
// the card list folds where the field folded, remembers what it remembered, and
// honours the same `captureCollapsedByDefault` setting. Two widgets computing
// one storage key from the same three parts is how the two come to disagree
// about which entry a fold belongs to — and the key is `::note:<key>` for both,
// deliberately, because the fold belongs to the REGION rather than to whichever
// control is currently drawing it. A reader who folded Captured and then
// upgraded keeps it folded.
export function noteFoldKey(sourcePath: string, key: string): string {
  return `${sourcePath}::note:${key}`;
}

// Absent means "not yet touched in this entry", which falls back to the global
// default rather than to a hardcoded one — that is what makes the setting a
// *default* and not just an initial value for new vaults.
export function noteFoldState(
  plugin: AlmanacPlugin,
  sourcePath: string,
  key: string
): boolean {
  const stored =
    plugin.settings.collapsedNoteSections?.[noteFoldKey(sourcePath, key)];
  if (stored != null) return stored;
  return key === CAPTURE_NOTE_KEY
    ? plugin.settings.captureCollapsedByDefault
    : false;
}

// Stored explicitly either way: once a field has been toggled by hand in this
// entry, that choice sticks even if the global default later changes.
export async function setNoteFold(
  plugin: AlmanacPlugin,
  sourcePath: string,
  key: string,
  value: boolean
): Promise<void> {
  if (!plugin.settings.collapsedNoteSections) {
    plugin.settings.collapsedNoteSections = {};
  }
  plugin.settings.collapsedNoteSections[noteFoldKey(sourcePath, key)] = value;
  await plugin.saveSettings();
}

// MOVED TO `core/notestore.ts` IN 4.30, unchanged, and re-exported here so
// every existing caller is untouched.
//
// It belongs beside the store it names into: reading a region key off a
// directive is the binding between a widget and its text, and 4.30's export
// asks exactly that question of every directive on a page. A second spelling of
// it there would have been a second answer to "which region is this widget's",
// which is the one thing the two must never disagree about.
export { noteKeyOf } from "../../core/notestore";

export function buildNote(
  deps: NoteFieldHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null
): HTMLElement {
  // `rest` is `key` or `key:placeholder text`. Only the first colon
  // separates them, so a placeholder may itself contain colons. `key` names
  // the body region (`<!--almanac:key-->`) this field reads/writes.
  // `rest` is `key[#variant][:placeholder]`. The optional `#variant` after the
  // key selects a rendering flavour (`line` = single-line input that doesn't
  // grow; default = auto-growing multi-line area). The key still names the
  // body region; the variant is presentation only, and a per-key modifier
  // class lets each field be styled to its purpose in CSS.
  const colon = rest.indexOf(":");
  const head = (colon === -1 ? rest : rest.slice(0, colon)).trim();
  const placeholder = colon === -1 ? "" : rest.slice(colon + 1).trim();
  const hash = head.indexOf("#");
  const key = (hash === -1 ? head : head.slice(0, hash)).trim();
  const variant = hash === -1 ? "" : head.slice(hash + 1).trim();
  const singleLine = variant === "line";
  // `#collapse` makes the field's content foldable behind its label. Used by
  // the capture field, which accumulates all day and would otherwise push the
  // rest of the entry down; the label stays visible so it can still be
  // written into with one click.
  const collapsible = variant === "collapse";

  const wrap = createDiv({
    cls: `journal-note journal-note--${key}${
      singleLine ? " journal-note--line" : ""
    }${collapsible ? " journal-note--collapsible" : ""}`,
  });

  // Per-(note,key) collapsed state, sharing the store header bars use so
  // there's one place a fold is remembered. See `noteFoldState` above.
  const isCollapsed = (): boolean =>
    noteFoldState(deps.plugin, ctx.sourcePath, key);

  if (collapsible && label) {
    const bar = wrap.createDiv({ cls: "journal-note-collapse-bar" });
    const chevron = bar.createDiv({ cls: "journal-note-chevron" });
    setIcon(chevron, "chevron-down");
    bar.createDiv({ cls: "journal-note-label", text: label });

    const apply = (collapsed: boolean): void => {
      wrap.toggleClass("is-collapsed", collapsed);
    };
    apply(isCollapsed());

    bar.addEventListener("click", (evt) => {
      evt.preventDefault();
      const next = !isCollapsed();
      apply(next);
      void setNoteFold(deps.plugin, ctx.sourcePath, key, next);
    });
  } else if (label) {
    wrap.createDiv({ cls: "journal-note-label", text: label });
  }

  const input = wrap.createEl("textarea", { cls: "journal-note-input" });
  input.rows = 1;
  if (placeholder) input.placeholder = placeholder;

  if (!isValidNoteKey(key)) {
    input.disabled = true;
    input.value = `⚠ invalid note key: "${key}"`;
    return wrap;
  }

  // Single-line variant: prevent newlines so it behaves like a text field,
  // committing on Enter rather than inserting a line break.
  if (singleLine) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
  }

  // Auto-grow: keep the textarea exactly tall enough for its content so it
  // reads like a growing note area rather than a fixed scrollbox. The single-
  // line variant keeps a fixed height (CSS), so growing is a no-op there.
  const autoGrow = (): void => {
    if (singleLine) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };

  // Populate from the body region once, after mount. Reads the raw file (the
  // text lives between markers in the body, not in the metadata cache), then
  // ensures the region exists so hand-editing has a stable anchor.
  // The region text this buffer was derived from. Every write carries it so the
  // write can tell an append that landed underneath the buffer from an edit to
  // the buffer itself — see `reconcileRegionWrite`. It advances only when the
  // buffer advances, which is the invariant the whole scheme rests on: a
  // baseline ahead of the buffer would make the next write look like it had
  // already absorbed a capture it has never seen.
  let baseline = "";

  const file = deps.fileOf(ctx);
  if (file) {
    void deps.app.vault.read(file).then((text) => {
      input.value = readNoteRegion(text, key);
      baseline = input.value;
      autoGrow();
      void deps.ensureNoteRegion(file, key);
    });
  }

  // Refresh from disk when the file changes underneath us — but only while
  // the field isn't being edited. A `note:` textarea owns its own state after
  // mount (it must not rebuild under the cursor mid-type), which means an
  // *external* write to the same region — most importantly a scale context
  // note appended to the `capture` log through the quick-capture modal —
  // would otherwise never appear here, and the field's next blur would write
  // its stale value straight back over the append, silently deleting it.
  //
  // The guard is: skip while focused (you're editing — your buffer wins), and
  // skip when there's a pending debounced write (your last keystrokes haven't
  // landed yet, so disk is the stale one). Otherwise adopt the on-disk value.
  // This makes the capture field tolerant of a second writer without fighting
  // the person typing into it.
  //
  // The reverse direction — a field edit lost to the append — is closed by
  // ordering: clicking the pencil blurs the textarea, whose blur handler
  // flushes the pending write synchronously, so the field's value is on disk
  // before the modal (which writes only on save, much later) appends to it,
  // and the append preserves it.
  //
  // ── AND SKIPPING IS NO LONGER THE END OF IT (4.27 §1) ────────────────
  //
  // Both skips used to return and never retry, so the buffer stayed stale and
  // the next blur wrote the whole region back from it — deleting the append.
  // `test/capture.test.ts` asserted that loss and located the fix. Three things
  // changed here:
  //
  // THE BUSY TEST MOVED BELOW THE READ. It was evaluated synchronously and the
  // assignment happened inside the `.then()`, so focusing and typing during the
  // read overwrote the keystrokes and threw the caret to the end — the exact
  // "rebuild under the cursor" this function exists to prevent, in the code
  // preventing it.
  //
  // A BUSY FIELD NOW TAKES AN APPEND ANYWAY, spliced onto the END of its
  // buffer. Appending strictly past the end and restoring the selection moves
  // nothing at or before the caret, so the property is kept in the sense that
  // matters rather than in the sense of never touching `value`. It is also the
  // half that makes the write-time merge sufficient: without the buffer
  // learning, `baseline` would go stale and the SECOND write would lose the
  // capture even though the first merged it correctly.
  //
  // A DIVERGENCE THAT IS NOT AN APPEND IS STILL LEFT ALONE. Two writers rewrote
  // the same prose; the write-time merge declines it too, and declining is what
  // this code did about everything before today.
  if (file) {
    const refresh = (): void => {
      void deps.app.vault.read(file).then((text) => {
        const onDisk = readNoteRegion(text, key);
        if (onDisk === baseline) return;
        const busy =
          document.activeElement === input || deps.noteWrites.isPending(ctx, key);
        if (!busy) {
          input.value = onDisk;
          baseline = onDisk;
          autoGrow();
          return;
        }
        const tail = appendedSince(baseline, onDisk);
        if (tail == null) return;
        const at = input.selectionStart;
        const to = input.selectionEnd;
        input.value = joinRegionBlocks(input.value, tail);
        input.setSelectionRange(
          Math.min(at, input.value.length),
          Math.min(to, input.value.length)
        );
        baseline = onDisk;
        autoGrow();
      });
    };
    // Registered through a render child so the listener is torn down with the
    // note view (MarkdownRenderChild.registerEvent handles the offref), not
    // leaked one-per-render.
    ctx.addChild(new NoteFieldWatcher(deps.app, wrap, ctx.sourcePath, refresh));
  }

  input.addEventListener("input", () => {
    autoGrow();
    deps.noteWrites.schedule(ctx, key, input.value, baseline);
  });
  // Flush immediately on blur so a value is never left only in the debounce
  // timer if the view is torn down (e.g. switching notes) before it fires.
  input.addEventListener("blur", () => {
    void deps.noteWrites.flush(ctx, key, input.value, baseline);
  });
  return wrap;
}
