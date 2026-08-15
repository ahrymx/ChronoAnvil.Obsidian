// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Quick capture — get a thought into an entry without navigating there.
//
// The problem it solves: a thought at 3pm costs a deliberate detour (open the
// diary, find the entry, create it if absent, click into a field), so it
// doesn't get written. Capture collapses that to a hotkey, a box and
// Cmd/Ctrl+Enter.
//
// The box also asks WHERE, as of 4.27 — see `captureDestinations` below for
// what it offers and why the list is gated the way it is.
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
import {
  appendToNoteRegion,
  ensureNoteRegions,
  hasNoteRegion,
} from "../core/notestore";
import { formatScaleNoteTag, type ScaleNote } from "../journals/scale-notes";
import { frontmatterOf, moment } from "../core/util";
import { CLASS_DEFS, TRACKER_CLASSES } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { sectionsForEntry } from "./entry-sections";
import { currentEntryKey, entryDateKey, labelForGrain } from "./nav";
import { isManagedTemplate } from "../trackers/entry-trackers";

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

// Write a capture into a chosen entry, creating that entry from its template if
// it doesn't exist yet.
//
// RENAMED FROM `captureToToday` IN 4.27, because the old name stopped being
// true the moment the box could be pointed somewhere else, and a function whose
// name says "today" while its argument says otherwise is the kind of thing a
// reader trusts and should not.
//
// The target resolves here rather than when the list was drawn: naming a grain
// in a dropdown must not create five notes for a reader who opens the box,
// reads the options and presses Escape.
//
// The whole append happens inside `vault.process`, the same serialised path
// every other body write uses, so a capture can't interleave with a `note:`
// field's write and lose either side.
export async function captureTo(
  plugin: AlmanacPlugin,
  text: string,
  target: CaptureTarget
): Promise<TFile | null> {
  const body = text.replace(/\s+$/, "");
  if (!body) return null;

  // Reuses the diary's own create-or-open paths, so a capture-created entry is
  // identical to one made any other way — same template, same folder, same
  // frontmatter. None of them reveals: capture must not steal focus, because
  // the whole point is that you don't leave what you were doing.
  const file = await target.resolve();
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

// ── where a capture goes (4.27) ──────────────────────────────────────
//
// Until 4.27 the answer was "today's daily entry", always, and the box could not
// say so. Two consequences a reader met: a `Captured` section added to a weekly
// entry — which the section catalogue offers on every grain — was unreachable,
// and capturing while reading a past entry landed somewhere else silently.
//
// The other capture path had already disagreed for releases. `captureScaleNote`
// writes to the entry the picker sits on, "not today's — the picker may be on a
// back-filled past day". Two writers, one feature, opposite rules, one of them
// undefended.
//
// SO THE BOX ASKS, rather than inferring and hoping the reader reads a subtitle.
// A destination is a control, and the same keystroke means the same thing every
// time.
export interface CaptureTarget {
  // Stable across a rebuild of the list, so the dropdown can round-trip a
  // choice: `grain:weekly`, or `note` for the entry the reader is on.
  id: string;
  label: string;
  // Resolved late, on save. A grain's entry may not exist yet and must not be
  // created just because its name was drawn in a list — a reader who opens the
  // box, reads the options and presses Escape has not asked for five notes.
  resolve: () => Promise<TFile | null>;
}

// Which grains can *show* a capture: the ones whose template writes the field.
//
// THE GATE, AND WHY IT IS THIS ONE. A capture appended to a note that does not
// draw the region is text on disk and nothing on screen — `appendCapture` seeds
// the region so nothing is lost, but a reader would have to search to find it.
// "Nothing dead is drawn", read from the other end: do not offer a destination
// that swallows the thought.
//
// It is also what ties this to the Diary entries settings table: ticking
// `Captured` for weekly there is what adds "This week" here.
export function grainsShowingCapture(plugin: AlmanacPlugin): TrackerClass[] {
  return TRACKER_CLASSES.filter((grain) =>
    sectionsForEntry({
      grain,
      extra: (plugin.settings.entrySections[grain] ?? []).map((c) => c.id),
    }).some((s) => s.id === "capture")
  );
}

// The destinations to offer, in grain order, with the note the reader is on
// last when it is not already one of them.
//
// THE HOST IS OFFERED ONLY WHEN IT IS AN ENTRY THAT ALREADY HAS THE REGION.
// Three refusals, each for its own reason: a dashboard is not an entry and has
// no capture log; a managed template is composed from the catalogue and
// rewritten by "Refresh entry templates", so anything captured into one is
// deleted on the next refresh; and an entry with no region is the "swallows the
// thought" case above.
//
// AND IT IS NOT OFFERED TWICE. When the reader is on this week's weekly entry,
// "This note" and "This week" are the same file — so the host row is added only
// when its own date key differs from its grain's current one. Two rows writing
// to one note is a choice that is not a choice.
export async function captureDestinations(
  plugin: AlmanacPlugin,
  host: TFile | null
): Promise<CaptureTarget[]> {
  const out: CaptureTarget[] = grainsShowingCapture(plugin).map((grain) => {
    const key = currentEntryKey(grain);
    return {
      id: `grain:${grain}`,
      label: `${grain === "daily" ? "Today" : `This ${CLASS_DEFS[grain].periodNoun}`} · ${labelForGrain(grain, key)}`,
      resolve: () => resolveGrainEntry(plugin, grain, key),
    };
  });

  const entry = host ? plugin.sections.entryContextFor(host.path) : null;
  if (host && entry) {
    const key = entryDateKey(frontmatterOf(plugin.app, host), entry.grain);
    // Read last, and only if the cheap answers have not already refused — a
    // vault read per capture-box open is not much, but it is not nothing, and
    // three of the four refusals need no bytes at all.
    const cheap = offersHostEntry({
      isManagedTemplate: isManagedTemplate(plugin, host.path),
      hasCaptureRegion: true,
      hostKey: key,
      currentKey: currentEntryKey(entry.grain),
      grainAlreadyListed: out.some((t) => t.id === `grain:${entry.grain}`),
    });
    if (
      cheap &&
      hasNoteRegion(await plugin.app.vault.cachedRead(host), CAPTURE_NOTE_KEY)
    ) {
      out.push({
        id: "note",
        label: `This note · ${key ? labelForGrain(entry.grain, key) : host.basename}`,
        resolve: async () => host,
      });
    }
  }
  return out;
}

// Whether the note the reader is on earns a row of its own.
//
// PURE, AND SEPARATE FROM THE READ THAT FEEDS IT, because the suite has no DOM
// and no vault: every refusal here is a decision worth pinning, and none of them
// is testable through `captureDestinations`, which needs a plugin, a workspace
// and a file. The caller supplies the four facts; this weighs them.
//
// Note that "is it an entry at all" is not among them. `entryContextFor`
// returns null for a dashboard, a journal note and anything outside the diary,
// so the caller has already refused those by having nothing to pass — and
// re-asking here as a boolean would be a second, weaker copy of a
// classification that module exists to own.
export function offersHostEntry(facts: {
  // Composed from the catalogue and rewritten by "Refresh entry templates", so
  // a capture into one survives until the next refresh and then vanishes.
  isManagedTemplate: boolean;
  // No region means the text lands on disk and draws nowhere.
  hasCaptureRegion: boolean;
  hostKey: string;
  currentKey: string;
  grainAlreadyListed: boolean;
}): boolean {
  if (facts.isManagedTemplate) return false;
  if (!facts.hasCaptureRegion) return false;
  // The reader is on this week's weekly entry and "This week" is already in the
  // list: two rows writing to one file is a choice that is not a choice.
  if (facts.hostKey === facts.currentKey && facts.grainAlreadyListed) return false;
  return true;
}

// A grain's current entry, created from its template if it isn't there yet and
// never revealed — capture exists so you don't leave what you were doing.
//
// Three openers rather than one because the diary has three, split by how a
// grain names its period; this is the only place that needs all of them at once.
async function resolveGrainEntry(
  plugin: AlmanacPlugin,
  grain: TrackerClass,
  key: string
): Promise<TFile | null> {
  const d = plugin.diary;
  if (grain === "daily") return d.openOrCreateDay(key, { reveal: false });
  if (grain === "monthly") return d.openOrCreateMonth(key, { reveal: false });
  const unit = grain === "weekly" ? "week" : grain === "quarterly" ? "quarter" : "year";
  return d.openOrCreatePeriodEntry(unit, key, { reveal: false });
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
  // The destinations to offer, and the one selected when the box opens. Absent
  // means "no picker" — which is the scale-note path, whose destination is the
  // entry its reading is on and is not the reader's to change.
  destinations?: CaptureTarget[];
  onDestination?: (target: CaptureTarget) => void;
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
    //
    // DEFAULTED ONCE, AS OF 4.27. Every default below was written twice — once
    // as a `super()` argument and once into `this.opts` — so the title and hint
    // the frame drew and the ones the modal held were two copies of one string,
    // kept equal by hand. `filled` is computed first and both read it.
    const filled = {
      title: options.title ?? "Quick capture",
      hint: options.hint ?? "Appends to the chosen entry with the current time.",
      placeholder: options.placeholder ?? "What's on your mind?",
      initialValue: options.initialValue ?? "",
      destinations: options.destinations ?? [],
      onDestination: options.onDestination ?? ((): void => undefined),
      onSave: options.onSave ?? (async (): Promise<boolean> => false),
      persistDraft: options.persistDraft ?? true,
      successNotice: options.successNotice ?? ((): string => "Captured"),
    };
    super(app, plugin, filled.title, filled.hint, "Capture");
    this.opts = filled;
  }

  protected renderBody(): void {
    const contentEl = this.body;

    // ── where this goes ────────────────────────────────────────────────
    //
    // ABOVE THE BOX, NOT BESIDE THE BUTTON. The destination is a fact about
    // what you are about to type, so it belongs where you read before typing
    // rather than where you look after. Drawn only when there is a choice to
    // make: one destination is not a decision, and a select with a single
    // option is a control that cannot do its job.
    if (this.opts.destinations.length > 1) {
      const row = contentEl.createDiv({ cls: "almanac-capture-dest" });
      row.createSpan({ cls: "almanac-capture-dest-label", text: "Capture to" });
      const select = row.createEl("select", { cls: "dropdown" });
      for (const target of this.opts.destinations) {
        select.createEl("option", { value: target.id, text: target.label });
      }
      select.value = this.opts.destinations[0].id;
      select.addEventListener("change", () => {
        const picked = this.opts.destinations.find((t) => t.id === select.value);
        if (picked) this.opts.onDestination(picked);
      });
    }

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

// `host` is the note the door was pressed on, when the door knows it. The
// command and the ribbon do not (they ask the workspace); the links pill, the
// launcher tile and the diary card's action strip all already hold the note
// they were drawn in, and that is strictly better than the active file — a pill
// in a hover preview or an unfocused split must resolve against its own note
// rather than against whatever leaf has focus.
//
// Resolved BEFORE the modal opens, because opening one takes focus and a later
// read of the workspace would answer about the modal.
export function openCapture(plugin: AlmanacPlugin, host?: TFile | null): void {
  void captureDestinations(plugin, host ?? null).then((destinations) => {
    // ONE RESOLVED TARGET FEEDS THE SENTENCE, THE WRITE AND THE TOAST, so the
    // box cannot name one entry and write to another.
    let chosen = destinations[0] ?? null;
    new CaptureModal(plugin.app, plugin, {
      destinations,
      hint: chosen
        ? `Appends to ${chosen.label} with the current time.`
        : "No entry here can show a capture — add a Captured section first.",
      onDestination: (target) => {
        chosen = target;
      },
      onSave: async (text) =>
        chosen != null && (await captureTo(plugin, text, chosen)) != null,
      successNotice: () => `Captured to ${chosen?.label ?? "your entry"}`,
    }).open();
  });
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
