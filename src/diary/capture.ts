// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Quick capture — get a thought into today's entry without navigating there.
//
// The problem it solves: a thought at 3pm costs a deliberate detour (open the
// diary, find today, create it if absent, click into a field), so it doesn't
// get written. Capture collapses that to a hotkey, a box and Cmd/Ctrl+Enter.
//
// Captures land in their own `capture` region rather than in `log`. They were
// nearly put in `attachments` for tidiness, which would have been a quiet
// disaster: diary-index.ts treats an attachment region as *counted, not
// searchable*, so every captured thought would have been invisible to the
// search shipped in 2.16. A first-class region is searchable, renders as
// itself, and doesn't overload the meaning of an existing one.
//
// The region is deliberately separate from `log` too. `log` is curated prose
// you write on purpose; captures are raw fragments arriving all day. Mixing
// them makes the log feel cluttered, which is the thing that stops people
// using either.

import { App, Notice, TFile } from "obsidian";
import { EditorModal } from "../ui/editor-modal";
import type AlmanacPlugin from "../main";
import { CAPTURE_NOTE_KEY } from "../core/constants";
import { appendToNoteRegion, ensureNoteRegions } from "../core/notestore";
import { formatScaleNoteTag, type ScaleNote } from "../journals/scale-notes";
import { moment } from "../core/util";

// Format one capture for the region: a single timestamp heading the block,
// with any further lines carried underneath it.
//
// One timestamp per *capture*, not per line. A three-line thought is one
// moment; stamping each line would make it read as three separate ones. The
// continuation lines are indented so the block stays visually attached to its
// time without needing markup that would fight the region's plain-text
// contract.
export function formatCapture(text: string, timestamp: string): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  // Drop leading blank lines so a stray newline before the text doesn't
  // produce a stamp with nothing next to it.
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  if (lines.length === 0) return "";
  const [first, ...rest] = lines;
  const head = `${timestamp} — ${first.trim()}`;
  if (rest.length === 0) return head;
  // Blank continuation lines stay blank rather than becoming stray indents.
  // A line's own leading whitespace is kept on top of the block indent: if
  // someone indented a sub-point, they meant it, and flattening would lose the
  // structure they typed.
  const tail = rest.map((l) => (l.trim() === "" ? "" : `  ${l.trimEnd()}`));
  return [head, ...tail].join("\n");
}

// Append a pre-formatted capture block to a specific entry's capture region,
// inside `vault.process` so it can't interleave with another body write. The
// shared core of every capture path — today's quick capture and a scale note
// on whichever entry the picker sits on both land here, differing only in which
// file and which block.
async function appendCapture(
  plugin: AlmanacPlugin,
  file: TFile,
  block: string
): Promise<void> {
  await plugin.app.vault.process(file, (fileText) => {
    // Ensure the region exists before appending, so a capture into an entry
    // made from an older template (one without the capture field) still lands
    // somewhere real rather than silently doing nothing.
    const seeded = ensureNoteRegions(fileText, [CAPTURE_NOTE_KEY]) ?? fileText;
    return appendToNoteRegion(seeded, CAPTURE_NOTE_KEY, block);
  });
}

// Write a capture into today's entry, creating the entry from the template if
// it doesn't exist yet.
//
// The whole append happens inside `vault.process`, the same serialised path
// every other body write uses, so a capture can't interleave with a `note:`
// field's write and lose either side.
export async function captureToToday(
  plugin: AlmanacPlugin,
  text: string
): Promise<TFile | null> {
  const body = text.replace(/\s+$/, "");
  if (!body) return null;

  // Reuses the diary's own create-or-open path, so a capture-created entry is
  // identical to one made any other way — same template, same folder, same
  // frontmatter. `reveal: false` because capture must not steal focus: the
  // whole point is that you don't leave what you were doing.
  const file = await plugin.diary.openOrCreateDay(moment().format("YYYY-MM-DD"), {
    reveal: false,
  });
  if (!file) return null;

  const block = formatCapture(body, moment().format("HH:mm"));
  if (!block) return null;

  await appendCapture(plugin, file, block);
  return file;
}

// Write a scale context note into a *specific* entry's capture log (not
// today's — the picker may be on a back-filled past day), as a tagged capture:
//
//   09:14 — [scale:Mood=4] rough afternoon
//
// The tag comes first in the capture body so the pairing marker is at a stable
// position, and formatCapture prepends the timestamp exactly as it does for a
// quick capture — one capture format, one place. Returns false when the note
// has no usable text or the tracker id can't be tagged, so the caller knows
// nothing was written.
export async function captureScaleNote(
  plugin: AlmanacPlugin,
  file: TFile,
  note: ScaleNote
): Promise<boolean> {
  const tag = formatScaleNoteTag(note);
  if (tag == null) return false;
  // A bare tag with no prose is still worth recording — it timestamps that you
  // rated the value and thought about it — but an all-whitespace text should
  // not produce a trailing space. formatScaleNoteTag already trims.
  const block = formatCapture(tag, moment().format("HH:mm"));
  if (!block) return false;
  await appendCapture(plugin, file, block);
  return true;
}

// Options that turn the generic capture box into a specific one. Defaults
// reproduce the quick-capture behaviour exactly, so `new CaptureModal(app,
// plugin)` is unchanged; the scale-note path supplies its own title, hint,
// save handler, and — crucially — opts out of the persistent global draft,
// which belongs to quick capture alone (a half-typed mood note must not
// resurface in an unrelated capture, and vice versa).
export interface CaptureModalOptions {
  title?: string;
  hint?: string;
  placeholder?: string;
  initialValue?: string;
  // Save the text. Returns true on success (modal closes), false to keep it
  // open with the text intact. Defaults to the quick-capture write to today.
  onSave?: (text: string) => Promise<boolean>;
  // Persist an unsaved draft across restarts. Quick capture does; a scale note
  // does not (it's bound to a reading, not a scratch buffer).
  persistDraft?: boolean;
  // A toast on successful save. Quick capture confirms ("Captured to 3 Jun");
  // the scale-note path passes its own, and the modal shows whatever it's
  // given (or nothing).
  successNotice?: () => string;
}

// The capture box.
//
// Multi-line, so Enter is a newline and saving is explicit (Cmd/Ctrl+Enter or
// the button) — a thought is often more than one line, and a box that fires on
// Enter makes that impossible to type.
//
// Escape closes and keeps the draft. The draft is held in settings rather than
// memory so it survives a restart, which is the only version of "keeps the
// draft" worth having. Note the trade: an unsaved draft lives in data.json,
// outside the vault — it won't sync with notes and won't survive a settings
// reset, so the box is a scratch buffer, not somewhere to leave something you
// care about for days. (The scale-note reuse turns this persistence off.)
export class CaptureModal extends EditorModal {
  private value = "";
  private area: HTMLTextAreaElement | null = null;
  // Set when the capture is written, so onClose knows not to keep the draft.
  private saved = false;
  private readonly opts: Required<CaptureModalOptions>;

  constructor(app: App, plugin: AlmanacPlugin, options: CaptureModalOptions = {}) {
    // The hint becomes the frame's subtitle. It was a div of its own with its
    // own class, saying what this window writes and where — which is the job
    // the subtitle already has in every other editor.
    super(
      app,
      plugin,
      options.title ?? "Quick capture",
      options.hint ??
        `Appends to today's entry with the current time. ${moment().format("D MMMM")}`,
      "Capture"
    );
    this.opts = {
      title: options.title ?? "Quick capture",
      hint:
        options.hint ??
        `Appends to today's entry with the current time. ${moment().format("D MMMM")}`,
      placeholder: options.placeholder ?? "What's on your mind?",
      initialValue: options.initialValue ?? "",
      onSave:
        options.onSave ??
        (async (text) => (await captureToToday(this.plugin, text)) != null),
      persistDraft: options.persistDraft ?? true,
      successNotice:
        options.successNotice ??
        (() => `Captured to ${moment().format("D MMM")}`),
    };
  }

  protected renderBody(): void {
    const contentEl = this.body;

    // A persisted draft only applies to the quick-capture instance; a scale
    // note starts from whatever text it was given (an existing note, or blank).
    this.value = this.opts.persistDraft
      ? this.plugin.settings.captureDraft ?? ""
      : this.opts.initialValue;

    const area = contentEl.createEl("textarea", {
      cls: "almanac-capture-input",
      attr: { placeholder: this.opts.placeholder, rows: "5" },
    });
    area.value = this.value;
    area.addEventListener("input", () => {
      this.value = area.value;
    });
    // Cmd/Ctrl+Enter saves; plain Enter is a newline. The frame's own Enter
    // binding is deliberately narrow to single-line inputs, so it never fires
    // in here and this is the only handler for the key.
    area.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
        evt.preventDefault();
        void this.trySubmit();
      }
    });
    this.area = area;

    // Focus at the end of any restored draft, so resuming means continuing
    // rather than repositioning the cursor first.
    window.setTimeout(() => {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }, 0);
  }

  private text(): string {
    return (this.area?.value ?? this.value).replace(/\s+$/, "");
  }

  // An empty capture was a Notice; it is the window's own error line now. A
  // toast about the field you are looking at is a message delivered somewhere
  // other than where the problem is.
  protected validate(): string | null {
    return this.text() ? null : "Nothing to capture.";
  }

  // Throws on failure rather than reporting it, because the frame keeps the
  // window open and shows `commitFailureMessage()` when it does — and a failed
  // write must never be the reason someone loses what they just typed.
  protected async commit(): Promise<void> {
    const ok = await this.opts.onSave(this.text());
    if (!ok) throw new Error("capture: onSave reported no write");
    this.saved = true;
    // Clear the draft only once the write has actually succeeded.
    if (this.opts.persistDraft && this.plugin.settings.captureDraft) {
      this.plugin.settings.captureDraft = "";
      await this.plugin.saveSettings();
    }
    const toast = this.opts.successNotice();
    if (toast) new Notice(toast);
  }

  protected commitFailureMessage(): string {
    return "Capture failed — your text is still here.";
  }

  onClose(): void {
    // Persist whatever is left, unless it was just saved — quick capture only.
    // Read BEFORE the frame empties contentEl, since `this.area` points into it.
    if (this.opts.persistDraft) {
      const draft = this.saved
        ? ""
        : (this.area?.value ?? this.value).replace(/\s+$/, "");
      if ((this.plugin.settings.captureDraft ?? "") !== draft) {
        this.plugin.settings.captureDraft = draft;
        void this.plugin.saveSettings();
      }
    }
    this.contentEl.empty();
  }
}

export function openCapture(plugin: AlmanacPlugin): void {
  new CaptureModal(plugin.app, plugin).open();
}

// Open the capture overlay to attach a context note to one scale reading. Same
// box as quick capture, but bound to a specific reading: it writes a tagged
// capture into `file`'s log (the entry the picker is on, which may be a
// back-filled past day), doesn't touch the global quick-capture draft, and
// seeds itself with the reading's label + value so the box says what it's for.
export function openScaleNoteCapture(
  plugin: AlmanacPlugin,
  file: TFile,
  note: { trackerId: string; value: number; label: string; initialText?: string }
): void {
  new CaptureModal(plugin.app, plugin, {
    title: `Note on ${note.label}`,
    hint: `Adds a timestamped note to this entry's Captured log, tagged to ${note.label} = ${note.value}.`,
    placeholder: "Why? (optional)",
    initialValue: note.initialText ?? "",
    persistDraft: false,
    onSave: (text) =>
      captureScaleNote(plugin, file, {
        trackerId: note.trackerId,
        value: note.value,
        text,
      }),
    successNotice: () => `Noted on ${note.label}`,
  }).open();
}
