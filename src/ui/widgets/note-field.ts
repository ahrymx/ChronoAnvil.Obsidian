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
} from "obsidian";
import type { App } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import type { NoteRegionHost, PluginNoteRegionHost } from "./note-regions";
import { fieldFrame } from "../section-frame";
import type { FoldStore } from "../section-frame";
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
  plugin: ChronoAnvilPlugin,
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
  plugin: ChronoAnvilPlugin,
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

// The three functions above, as the interface `foldableSection` asks for. 5.14.
//
// AN ADAPTER RATHER THAN A REWRITE, because the store is not the new thing: the
// fold has been remembered per (note, region) in `collapsedNoteSections` since
// 4.28, and `headerbar.ts` keeps its own keys in the same table. What is new is
// that a `list:` and an `attach:` field can be folded at all, and they must land
// in the table that already holds `note:`'s and `tasks:`'s answers rather than
// in a second one beside it.
//
// A HOST WITHOUT A PLUGIN GETS A STORE THAT FORGETS. `NoteRegionHost` is the
// contract the renderers are tested against and it has no settings to write to;
// the fold still works for the life of the render, which is the same bargain
// `buildTasks` struck when it wrote `"plugin" in host` inline. Stating it once
// here is what stops the fourth copy of that conditional.
export function fieldFoldStore(
  host: NoteRegionHost,
  sourcePath: string
): FoldStore {
  if (!("plugin" in host)) {
    const local = new Map<string, boolean>();
    return {
      isCollapsed: (key) => local.get(key) ?? false,
      setCollapsed: (key, value) => {
        local.set(key, value);
      },
    };
  }
  const plugin = (host as PluginNoteRegionHost).plugin;
  return {
    isCollapsed: (key) => noteFoldState(plugin, sourcePath, key),
    setCollapsed: (key, value) => {
      void setNoteFold(plugin, sourcePath, key, value);
    },
  };
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

// ── ONE HEAD FOR EVERY FIELD, AND THE RULE FOR NOT DRAWING ONE (5.14) ──
//
// Five renderers asked this question and answered it five ways. It is asked
// once now, here, and the answers are the three cases below.
//
// TITLED FROM OUTSIDE → NO HEAD. A `header:` bar over the fence, or a
// `frame: section` modifier, already names everything under it and already
// carries a chevron. A field that drew its own head there would be the
// two-heads defect 5.10 spent a release removing — and the stylesheet's answer
// to it last time was to hide the loser, which is how the `tasks:` Compact
// toggle and its progress readout disappeared from every Study note. So the
// head is not drawn AND the controls are not lost: they go into that bar's
// actions slot, or, where the titling thing has no slot to offer, into a bare
// strip of the field's own.
//
// NO LABEL → NO HEAD EITHER. `note:scratch` with nothing after a `|` names
// nothing. An empty bar is a rule ruled across a page for no reason — the same
// judgement `attachBlockHead` makes about a block it cannot name.
//
// OTHERWISE → THE FRAME. Title, chevron on the right, actions slot, fold.
//
// THE ACTIONS SLOT IS A FUNCTION, not an element, so a field with no controls
// costs no empty div and no `:empty` rule to hide one.
export interface FieldHead {
  // Where the field's content goes: the frame's fold body, or the wrap itself
  // where no head was drawn.
  body: HTMLElement;
  // Where its controls go, built on first use.
  actions: () => HTMLElement;
}

export interface FieldHeadOptions {
  // The field's own element, which the head is built into.
  wrap: HTMLElement;
  // Where the fold is remembered. `fieldFoldStore` is the answer for a field
  // drawn on a note; the capture log and the logbook carry their own, because
  // their callers already decide the default (`captureCollapsedByDefault`).
  //
  // REQUIRED, RATHER THAN DERIVED FROM A CONTEXT. This function used to take a
  // `MarkdownPostProcessorContext` to build the default store itself, which
  // meant `buildLogList` — a renderer that deliberately takes no ctx, only an
  // `addChild` — had nothing to hand it.
  store: FoldStore;
  // The body region this field owns. It is the fold's key, not just the store's
  // lookup: two fields over one region are one fold.
  key: string;
  // The title, as the reader wrote it after the `|`. Null draws no head.
  label: string | null;
  // Whether a section bar in this fence already names THIS field. See the
  // dispatcher's `soleField`, which is what decides "this".
  titled?: boolean;
  // That bar's actions slot.
  barActions?: HTMLElement | null;
}

export function fieldHead(opts: FieldHeadOptions): FieldHead {
  const { wrap, key, label } = opts;
  const barActions = opts.barActions ?? null;
  if (opts.titled || !label) {
    let strip: HTMLElement | null = barActions;
    return {
      body: wrap,
      actions: () => {
        if (!strip) {
          strip = wrap.createDiv({ cls: "ca-journal-field-tools" });
          // BEFORE THE BODY, because the body is already in `wrap` by the time
          // a caller asks for this on a field it built content into first.
          wrap.insertBefore(strip, wrap.firstChild);
        }
        return strip;
      },
    };
  }
  const built = fieldFrame(wrap, { title: label }, opts.store, key);
  return { body: built.body, actions: () => built.frame.actions };
}

export function buildNote(
  deps: NoteFieldHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null,
  // Whether something else already titles this fence, and the actions slot it
  // offers. See `fieldHead`.
  titled = false,
  barActions: HTMLElement | null = null
): HTMLElement {
  // `rest` is `key` or `key:placeholder text`. Only the first colon
  // separates them, so a placeholder may itself contain colons. `key` names
  // the body region (`<!--chronoanvil:key-->`) this field reads/writes.
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
  // `#collapse` NO LONGER SELECTS ANYTHING, AND THE DIRECTIVE KEEPS IT (5.14).
  //
  // It used to be what made a field foldable: `note:capture#collapse` folded and
  // `note:log` did not. Every labelled field folds now, so the modifier selects
  // a behaviour that is unconditional — and it stays in the grammar and on disk
  // regardless, because `note:capture#collapse:…|Captured` is written into five
  // template assets and a dozen assertions. Removing it from the parse would
  // turn `capture#collapse` into a region key nobody has, which is a rewrite of
  // every entry in every vault to change nothing a reader can see.
  //
  // WHAT DECIDES CAPTURED'S DEFAULT is `noteFoldState`, and always did: the
  // `captureCollapsedByDefault` setting is read off the KEY, not off this
  // modifier. So the one field that opened folded still opens folded.

  const wrap = createDiv({
    cls: `ca-journal-note ca-journal-note--${key}${
      singleLine ? " ca-journal-note--line" : ""
    }`,
  });

  // ── THE HEAD, WHICH IS THE FRAME'S NOW (5.14) ──────────────────────
  //
  // Three branches used to live here: a collapse bar with the chevron on the
  // left, a plain label, and nothing. Two of them are gone. What is left is the
  // one question this renderer actually gets to answer — is there a title for
  // this field, and is something else already drawing it.
  //
  // NO LABEL, NO HEAD. A hand-written `note:scratch` with no `|` names nothing,
  // and a head over it would be a rule ruled across the page with no word on it.
  // TITLED FROM OUTSIDE, NO HEAD EITHER: a section bar over the fence is the
  // title, its chevron is the fold, and the controls this field has go into that
  // bar rather than under it. See `fieldHead`.
  const chrome = fieldHead({
    wrap,
    key,
    label,
    titled,
    barActions,
    store: fieldFoldStore(deps, ctx.sourcePath),
  });
  const input = chrome.body.createEl("textarea", {
    cls: "ca-journal-note-input",
  });
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
        // If onDisk matches the current buffer or is a prefix of what the user is typing,
        // it is the user's own keystrokes arriving from disk, not an external append.
        const trimmedDisk = onDisk.replace(/\s+$/, "");
        const trimmedInput = input.value.replace(/\s+$/, "");
        if (
          onDisk === input.value ||
          trimmedDisk === trimmedInput ||
          (trimmedDisk.length > 0 && trimmedInput.startsWith(trimmedDisk))
        ) {
          baseline = onDisk;
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
