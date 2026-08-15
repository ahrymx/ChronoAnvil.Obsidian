// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Captured region, drawn as one card per capture.
//
// WHAT IT REPLACES, AND WHY
//
// A textarea holding the whole region. Captures arrive stamped and separated —
// they have been items since the feature shipped — but the only view of them
// was the raw text, so there was no way to cross one off, delete one, or fix a
// typo in one without editing all of them at once. People treat a capture log
// as a to-do list whether or not it is one, and a list you cannot tick is a
// list you stop using.
//
// MODELLED ON `buildTasks` (note-regions.ts), WITH TWO DIFFERENCES that are
// both forced rather than chosen:
//
//   AN ITEM IS MULTI-LINE. `tasks:`, `recall` and `attach:` all collapse an
//   item to one line, and `formatCapture` deliberately does not — "a three-line
//   thought is one moment". So the card body is a textarea rather than an
//   input, and edit is a mode on the card rather than a permanently live field.
//
//   IT WATCHES THE FILE. `buildTasks` reads its region once and owns the array
//   thereafter, which is right for a list only its own controls write to. The
//   capture region has a second writer by design — the capture box, and the
//   mood pencil — and the whole point of 4.27 was that an arriving capture must
//   appear rather than be overwritten. So this re-reads on change, and the
//   guard against clobbering an open editor is the same one the textarea used:
//   skip while something here is being edited.
//
// THE BASELINE IS CARRIED for the same reason. `buildTasks`'s `persist` passes
// none and writes straight through; this one cannot, or a capture arriving
// between a render and a click would be lost to the click.

import { MarkdownPostProcessorContext, MarkdownRenderChild, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { NoteRegionHost } from "./note-regions";
import { isValidNoteKey, readNoteRegion } from "../../core/notestore";
import {
  parseCaptures,
  serializeCaptures,
  type CaptureNote,
} from "../../diary/capture-log";
import { today } from "../../core/util";

// Re-reads the region when the file changes underneath the list. Same shape as
// `NoteFieldWatcher`, and named separately because the two guard different
// things: that one protects a cursor in a textarea, this one protects a card
// that is open for editing.
class CaptureLogWatcher extends MarkdownRenderChild {
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

export function buildCaptureLog(
  host: NoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null,
  opts: { collapsible: boolean; startCollapsed: () => boolean; onFold: (v: boolean) => void }
): HTMLElement {
  const key = rest.split(":")[0].split("#")[0].trim();
  // `journal-note--collapsible` is borrowed rather than reimplemented: the
  // fold bar, its chevron and its collapsed state are the same three rules the
  // `note:` field uses, and a second set would drift the first time either
  // moved. The list joins that rule's hidden-children selector.
  const wrap = createDiv({
    cls: `journal-capture-log journal-note journal-note--capture${
      opts.collapsible ? " journal-note--collapsible" : ""
    }`,
  });

  if (!isValidNoteKey(key)) {
    wrap.createDiv({
      cls: "journal-widget-error",
      text: `Invalid capture key: "${key}"`,
    });
    return wrap;
  }

  // The fold bar, kept identical to the `note:#collapse` one it replaces — the
  // section folds where it always folded, remembers what it always remembered,
  // and the `captureCollapsedByDefault` setting still means what it says.
  if (opts.collapsible && label) {
    const bar = wrap.createDiv({ cls: "journal-note-collapse-bar" });
    setIcon(bar.createDiv({ cls: "journal-note-chevron" }), "chevron-down");
    bar.createDiv({ cls: "journal-note-label", text: label });
    const apply = (v: boolean): void => wrap.toggleClass("is-collapsed", v);
    apply(opts.startCollapsed());
    bar.addEventListener("click", (evt) => {
      evt.preventDefault();
      const next = !wrap.hasClass("is-collapsed");
      apply(next);
      opts.onFold(next);
    });
  } else if (label) {
    wrap.createDiv({ cls: "journal-note-label", text: label });
  }

  const list = wrap.createDiv({ cls: "journal-capture-list" });

  let notes: CaptureNote[] = [];
  // The region text this list was parsed from — see `writeNoteRegionToFile`.
  let baseline = "";
  // Which card is open for editing, by index. Nothing is re-rendered under an
  // open editor, and an arriving capture waits rather than closing it.
  let editing: number | null = null;

  const persist = (): void => {
    const next = serializeCaptures(notes);
    void host.writeNoteRegionToFile(ctx, key, next, baseline);
    // The write may merge an append on top of `next`, so the baseline is only
    // safely advanced by the re-read the modify event brings. Advancing it to
    // `next` here would claim we had absorbed something we have not seen.
  };

  const render = (): void => {
    list.empty();
    if (notes.length === 0) {
      list.createDiv({
        cls: "journal-capture-empty",
        text: "Nothing captured yet — the capture box drops thoughts here.",
      });
      return;
    }
    notes.forEach((note, index) => {
      renderCaptureCard(list, note, index === editing, {
        onToggle: () => {
          // A date rather than a flag, so a crossed-off capture says when.
          note.done = note.done ? null : today();
          persist();
          render();
        },
        onEdit: () => {
          editing = index;
          render();
        },
        onCommit: (text) => {
          editing = null;
          if (text.trim() !== note.text.trim()) {
            note.text = text;
            persist();
          }
          render();
        },
        onDelete: () => {
          // NO CONFIRMATION, which is the task widget's call and not obviously
          // right for a typed thought. It is the same call because an undo the
          // reader has is better than a dialog they learn to click through:
          // Obsidian's own file history holds the note, and a capture deleted
          // by accident is one Ctrl+Z away in source view.
          notes.splice(index, 1);
          editing = null;
          persist();
          render();
        },
      });
    });
  };

  const file = host.fileOf(ctx);
  if (file) {
    const load = (text: string): void => {
      baseline = readNoteRegion(text, key);
      notes = parseCaptures(baseline);
      render();
    };
    void host.app.vault.read(file).then((text) => {
      load(text);
      void host.ensureNoteRegion(file, key);
    });
    ctx.addChild(
      new CaptureLogWatcher(host.app, wrap, ctx.sourcePath, () => {
        // Mid-edit, the reader's card wins — the same rule the textarea used,
        // for the same reason. The next commit re-renders from disk anyway, and
        // the write carries a baseline so the arriving capture is not lost.
        if (editing != null) return;
        void host.app.vault.read(file).then((text) => {
          const onDisk = readNoteRegion(text, key);
          if (onDisk === baseline) return;
          load(text);
        });
      })
    );
  } else {
    render();
  }

  return wrap;
}

// One capture.
function renderCaptureCard(
  list: HTMLElement,
  note: CaptureNote,
  isEditing: boolean,
  cb: {
    onToggle: () => void;
    onEdit: () => void;
    onCommit: (text: string) => void;
    onDelete: () => void;
  }
): void {
  const card = list.createDiv({
    cls: `journal-capture-card${note.done ? " is-done" : ""}`,
  });

  const head = card.createDiv({ cls: "journal-capture-head" });
  // A capture with no stamp is one somebody typed into the region by hand. It
  // is still theirs and still gets a card; it just has nothing to say about
  // when. Drawing an empty slot keeps the bodies aligned down the column.
  head.createSpan({
    cls: `journal-capture-time${note.time ? "" : " is-empty"}`,
    text: note.time ?? "",
    attr: note.done ? { title: `Crossed off ${note.done}` } : {},
  });

  const actions = head.createDiv({ cls: "journal-capture-actions" });
  const button = (icon: string, aria: string, on: () => void): void => {
    const b = actions.createEl("button", {
      cls: "journal-capture-btn",
      attr: { "aria-label": aria, type: "button" },
    });
    setIcon(b, icon);
    b.addEventListener("click", on);
  };
  button(
    note.done ? "rotate-ccw" : "check",
    note.done ? "Bring this back" : "Cross this off",
    cb.onToggle
  );
  if (!isEditing) button("pencil", "Edit this capture", cb.onEdit);
  button("x", "Delete this capture", cb.onDelete);

  if (!isEditing) {
    // Text, not markdown. The region is plain text by contract — see the
    // `note:` field this replaces — and rendering it would make a capture
    // beginning with `#` into a heading inside a card.
    card.createDiv({ cls: "journal-capture-text", text: note.text });
    return;
  }

  const area = card.createEl("textarea", { cls: "journal-capture-edit" });
  area.value = note.text;
  area.rows = Math.max(1, note.text.split("\n").length);
  // Cmd/Ctrl+Enter commits and plain Enter is a newline, which is the capture
  // box's own binding — a capture is written in one place and edited in
  // another, and the two must not disagree about what Enter does. Escape
  // abandons the edit.
  area.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
      evt.preventDefault();
      cb.onCommit(area.value);
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      cb.onCommit(note.text);
    }
  });
  area.addEventListener("blur", () => cb.onCommit(area.value));
  window.setTimeout(() => {
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, 0);
}
