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
import type ChronoAnvilPlugin from "../main";
import { CAPTURE_NOTE_KEY, LOGBOOK_NOTE_KEY, type LogbookDef } from "../core/constants";
import {
  appendToNoteRegion,
  ensureNoteRegions,
  hasNoteRegion,
} from "../core/notestore";
import { formatScaleNoteTag, type ScaleNote } from "../journals/scale-notes";
import { frontmatterOf, getFile, isoDate, moment, today } from "../core/util";
import { CLASS_DEFS, TRACKER_CLASSES, noteKindOf } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { sectionsForEntry } from "./entry-sections";
import { currentEntryKey, entryDateKey, labelForGrain } from "./nav";
import { isManagedTemplate, surfacePathConfig } from "../trackers/entry-trackers";
import { serializeLogItem } from "./log-items";
import { whenEditor, type WhenValue } from "../ui/when-editor";

// Append a pre-formatted capture block to a specific entry's capture region,
// inside `vault.process` so it can't interleave with another body write. The
// shared core of every capture path — today's quick capture and a scale note
// on whichever entry the picker sits on both land here, differing only in which
// file and which block.
// THE REGION IS AN ARGUMENT AS OF 4.62, and it is the whole of what makes a
// logbook a destination. A capture and a logbook item are the same line of the
// same grammar — `serializeLogItem` writes both — differing only in which
// region they are appended to and whether the stamp carries a day.
async function appendCapture(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  block: string,
  regionKey: string = CAPTURE_NOTE_KEY
): Promise<void> {
  await plugin.app.vault.process(file, (fileText) => {
    // Ensure the region exists before appending, so a capture into an entry
    // made from an older template (one without the capture field) still lands
    // somewhere real rather than silently doing nothing.
    const seeded = ensureNoteRegions(fileText, [regionKey]) ?? fileText;
    return appendToNoteRegion(seeded, regionKey, block);
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
  plugin: ChronoAnvilPlugin,
  text: string,
  target: CaptureTarget,
  when?: WhenValue
): Promise<TFile | null> {
  const body = text.replace(/\s+$/, "");
  if (!body) return null;

  // Reuses the diary's own create-or-open paths, so a capture-created entry is
  // identical to one made any other way — same template, same folder, same
  // frontmatter. None of them reveals: capture must not steal focus, because
  // the whole point is that you don't leave what you were doing.
  const file = await target.resolve();
  if (!file) return null;

  // THE DATE IS THE DESTINATION'S DECISION, NOT THE CLOCK'S. A capture lands in
  // a dated entry, so the day is the note's and repeating it on every line
  // would be the entry's own name, forty times over. A logbook note spans
  // months, so an item in one that did not say which day it belonged to could
  // not be placed at all — which is why `LogItem.date` exists (4.52).
  //
  // THROUGH `serializeLogItem` RATHER THAN `formatLogItem`, as of 4.62. The two
  // wrote the same bytes while a capture had only a time; a capture that can
  // say how long it took has a `[mins:: …]` to write, and there is exactly one
  // function in this plugin that decides where that goes.
  const block = serializeLogItem({
    date: target.dated ? (when?.date ?? today()) : null,
    time: when?.time ?? moment().format("HH:mm"),
    text: body,
    done: null,
    mins: when?.mins ?? null,
  });
  if (!block) return null;

  await appendCapture(plugin, file, block, target.regionKey);
  return file;
}

// Write a scale context note into a *specific* entry's capture log (not
// today's — the picker may be on a back-filled past day), as a tagged capture:
//
//   09:14 — [scale:Mood=4] rough afternoon
//
// The tag comes first in the capture body so the pairing marker is at a stable
// position, and formatLogItem prepends the timestamp exactly as it does for a
// quick capture — one capture format, one place. Returns false when the note
// has no usable text or the tracker id can't be tagged, so the caller knows
// nothing was written.
export async function captureScaleNote(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  note: ScaleNote
): Promise<boolean> {
  const tag = formatScaleNoteTag(note);
  if (tag == null) return false;
  // A bare tag with no prose is still worth recording — it timestamps that you
  // rated the value and thought about it — but an all-whitespace text should
  // not produce a trailing space. formatScaleNoteTag already trims.
  const block = serializeLogItem({
    date: null,
    time: moment().format("HH:mm"),
    text: tag,
    done: null,
    mins: null,
  });
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
  // choice: `grain:weekly`, `note` for the entry the reader is on, or
  // `logbook:<id>`.
  id: string;
  label: string;
  // Which region the block is appended to. An entry keeps its captures in
  // `capture`; a logbook's items are its own region's contents (4.62).
  regionKey: string;
  // Whether the stamp carries a day. FALSE FOR AN ENTRY, whose note IS the day;
  // true for a logbook, whose note spans months. This is the one difference
  // between the two destinations that a reader can see.
  dated: boolean;
  // The swatch this destination's items wear on the time grid, where it has
  // one. Only a logbook does; an entry's captures take the capture colour.
  color?: string;
  // Resolved late, on save. A grain's entry may not exist yet and must not be
  // created just because its name was drawn in a list — a reader who opens the
  // box, reads the options and presses Escape has not asked for five notes.
  resolve: () => Promise<TFile | null>;
}

// Everything about a destination except how to reach the file, which is the
// only part that needs a vault. Split so the list a reader is offered can be
// decided in a test.
export type CaptureTargetSpec = Omit<CaptureTarget, "resolve">;

// ── logbooks as destinations (4.62) ──────────────────────────────────
//
// THE THOUGHT AND THE LOG ENTRY ARE THE SAME KEYSTROKE. A reader with a work
// log had two ways to write a line into it: open the note and use the widget's
// add row, or capture into today's entry and move it later by hand. The box
// already asked WHERE; it simply could not name the notes that most wanted the
// answer.
//
// REGION-BACKED BOOKS ONLY. An `events`-backed book (Meetings) is a VIEW of the
// events note — its items are `EventDef`s with a title, a date and an hour, and
// there is no line to append. Offering it would take a thought and drop it into
// a file that draws none of it.
export function logbookTargets(books: LogbookDef[]): CaptureTargetSpec[] {
  return books
    .filter((book) => book.source === "region" && !!book.path)
    .map((book) => ({
      id: `logbook:${book.id}`,
      label: `Logbook · ${book.name}`,
      regionKey: LOGBOOK_NOTE_KEY,
      // A LOGBOOK ITEM IS ALWAYS DATED. Its note is not a day, so an item with
      // no date has nowhere to sit in the list and nothing to draw on the grid.
      dated: true,
      color: book.color,
    }));
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
export function grainsShowingCapture(plugin: ChronoAnvilPlugin): TrackerClass[] {
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
  plugin: ChronoAnvilPlugin,
  host: TFile | null
): Promise<CaptureTarget[]> {
  const out: CaptureTarget[] = grainsShowingCapture(plugin).map((grain) => {
    const key = currentEntryKey(grain);
    return {
      id: `grain:${grain}`,
      label: `${grain === "daily" ? "Today" : `This ${CLASS_DEFS[grain].periodNoun}`} · ${labelForGrain(grain, key)}`,
      regionKey: CAPTURE_NOTE_KEY,
      dated: false,
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
        regionKey: CAPTURE_NOTE_KEY,
        dated: false,
        resolve: async () => host,
      });
    }
  }

  // LAST, AND DELIBERATELY. The entries are where a thought goes by default and
  // the first row is what the box opens on; a logbook is a place you choose on
  // purpose, and moving "Today" out of that slot to make room would change what
  // the hotkey does for every reader who has never opened this list.
  for (const spec of logbookTargets(plugin.settings.logbooks)) {
    const path = plugin.settings.logbooks.find(
      (b: LogbookDef) => `logbook:${b.id}` === spec.id
    )?.path;
    out.push({
      ...spec,
      // Resolved late like every other row: a logbook's note may have been
      // renamed or deleted since the settings row was written, and finding that
      // out must not cost a read every time the box opens.
      resolve: async () => (path ? getFile(plugin.app, path) : null),
    });
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
  plugin: ChronoAnvilPlugin,
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
  // Whether the box may say WHEN this happened (4.62). Quick capture may; the
  // scale-note path may not — its capture timestamps the moment the reading was
  // thought about, which is now by definition.
  askWhen?: boolean;
  // Save the text, and the stamp the box was showing when it was saved.
  // Returns true on success (modal closes), false to keep it open with the text
  // intact. Defaults to the quick-capture write to today.
  onSave?: (text: string, when: WhenValue) => Promise<boolean>;
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
  // The stamp this capture will carry. Seeded with now, which is what every
  // capture before 4.62 got and still what most of them want.
  private when: WhenValue = {
    date: today(),
    time: moment().format("HH:mm"),
    mins: null,
  };
  // Redrawn when the destination changes, because whether the stamp shows a
  // day is a fact about where it is going.
  private whenHost: HTMLElement | null = null;
  private chosen: CaptureTarget | null = null;
  // Set when the capture is written, so onClose knows not to keep the draft.
  private saved = false;
  private readonly opts: Required<CaptureModalOptions>;

  constructor(app: App, plugin: ChronoAnvilPlugin, options: CaptureModalOptions = {}) {
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
      askWhen: options.askWhen ?? false,
      onSave: options.onSave ?? (async (): Promise<boolean> => false),
      persistDraft: options.persistDraft ?? true,
      successNotice: options.successNotice ?? ((): string => "Captured"),
    };
    super(app, plugin, filled.title, filled.hint, "Capture");
    this.opts = filled;
  }

  override onOpen(): void {
    super.onOpen();
    this.contentEl.addClass("ca-capture-modal");
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
      const row = contentEl.createDiv({ cls: "ca-capture-dest" });
      row.createSpan({ cls: "ca-capture-dest-label", text: "Capture to" });
      const select = row.createEl("select", { cls: "dropdown" });
      for (const target of this.opts.destinations) {
        select.createEl("option", { value: target.id, text: target.label });
      }
      select.value = this.opts.destinations[0].id;
      select.addEventListener("change", () => {
        const picked = this.opts.destinations.find((t) => t.id === select.value);
        if (!picked) return;
        this.chosen = picked;
        this.opts.onDestination(picked);
        // A logbook's stamp carries a day and an entry's does not, so the
        // control has to change when the destination does — otherwise a reader
        // who picked a day and then a destination would silently lose it.
        this.drawWhen();
      });
    }
    this.chosen = this.opts.destinations[0] ?? null;

    if (this.opts.askWhen) {
      this.whenHost = contentEl.createDiv({ cls: "ca-capture-when" });
      this.drawWhen();
    }

    // A persisted draft only applies to the quick-capture instance; a scale
    // note starts from whatever text it was given (an existing note, or blank).
    this.value = this.opts.persistDraft
      ? this.plugin.settings.captureDraft ?? ""
      : this.opts.initialValue;

    const area = contentEl.createEl("textarea", {
      cls: "ca-capture-input",
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

  // The stamp, as a line you can press.
  //
  // A BUTTON THAT SAYS THE ANSWER, NOT THREE FIELDS THAT ASK THE QUESTION. The
  // overwhelming majority of captures happen at the minute they are typed, and
  // a box that opened with an empty time field would make every one of them a
  // form to fill in. The default is right and visible; pressing it opens the
  // same three fields the log card has had since 4.55.
  private drawWhen(): void {
    const host = this.whenHost;
    if (!host) return;
    host.empty();
    const dated = this.chosen?.dated ?? false;
    if (!dated) this.when.date = null;
    else if (!this.when.date) this.when.date = today();

    const row = host.createDiv({ cls: "ca-capture-when-row" });
    row.createSpan({ cls: "ca-capture-dest-label", text: "When" });
    const stamp = [this.when.date, this.when.time].filter((p) => !!p).join(" ");
    const btn = row.createEl("button", {
      cls: "ca-journal-capture-time",
      text: stamp || "no time",
      attr: { type: "button", "aria-label": "Change when this happened" },
    });
    if (this.when.mins) {
      row.createSpan({
        cls: "ca-journal-capture-mins",
        text: `${this.when.mins} min`,
      });
    }
    btn.addEventListener("click", () => {
      if (host.querySelector(".ca-journal-capture-when")) {
        // Pressing it again closes the fields and keeps what they said — the
        // stamp on the button is the record of that, so nothing is lost by
        // folding them away.
        this.drawWhen();
        return;
      }
      whenEditor(host, this.when, dated, (value) => {
        this.when = value;
      });
    });
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
    const ok = await this.opts.onSave(this.text(), { ...this.when });
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
export function openCapture(plugin: ChronoAnvilPlugin, host?: TFile | null): void {
  void captureDestinations(plugin, host ?? null).then((destinations) => {
    // ONE RESOLVED TARGET FEEDS THE SENTENCE, THE WRITE AND THE TOAST, so the
    // box cannot name one entry and write to another.
    let chosen = destinations[0] ?? null;
    new CaptureModal(plugin.app, plugin, {
      destinations,
      hint: chosen
        ? `Appends to ${chosen.label} with the time on the stamp.`
        : "No entry here can show a capture — add a Captured section first.",
      askWhen: true,
      onDestination: (target) => {
        chosen = target;
      },
      onSave: async (text, when) =>
        chosen != null && (await captureTo(plugin, text, chosen, when)) != null,
      successNotice: () => `Captured to ${chosen?.label ?? "your entry"}`,
    }).open();
  });
}

// How the scale-note capture window describes where the context note will land.
//
// A diary entry holds its own `capture` region, so the note lands in "this
// entry's Captured log". A journal note has no capture region (journals are not
// supposed to have capture logs), but sends the capture over to the diary
// subsystem — targeting the daily entry for the journal note's date (or today).
export function scaleNoteCaptureHint(
  isJournal: boolean,
  targetDate: string,
  label: string,
  value: number,
  todayStr: string = today()
): string {
  const dest = isJournal
    ? targetDate === todayStr
      ? "today's"
      : `${targetDate}'s`
    : "this entry's";
  return `Adds a timestamped note to ${dest} Captured log, tagged to ${label} = ${value}.`;
}

// Open the capture overlay to attach a context note to one scale reading. Same
// box as quick capture, but bound to a specific reading: it writes a tagged
// capture into the entry's log (for a diary entry) or routes the capture to the
// diary subsystem (for a journal note, since journals do not have capture logs),
// doesn't touch the global quick-capture draft, and seeds itself with the
// reading's label + value so the box says what it's for.
export function openScaleNoteCapture(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  note: { trackerId: string; value: number; label: string; initialText?: string }
): void {
  const paths = surfacePathConfig(plugin);
  const fm = frontmatterOf(plugin.app, file);
  const kind = noteKindOf(paths, file.path, fm["journal"], fm["type"]);
  const isJournal = kind?.surface === "journal";
  const targetDate = isoDate(fm["date"]) ?? isoDate(fm["journal-date"]) ?? today();
  const hint = scaleNoteCaptureHint(isJournal, targetDate, note.label, note.value);

  new CaptureModal(plugin.app, plugin, {
    title: `Note on ${note.label}`,
    hint,
    placeholder: "Why? (optional)",
    initialValue: note.initialText ?? "",
    persistDraft: false,
    onSave: async (text) => {
      let targetFile: TFile | null = file;
      if (isJournal) {
        targetFile = await plugin.diary.openOrCreateDay(targetDate, { reveal: false });
        if (!targetFile) return false;
      }
      return captureScaleNote(plugin, targetFile, {
        trackerId: note.trackerId,
        value: note.value,
        text,
      });
    },
    successNotice: () => `Noted on ${note.label}`,
  }).open();
}
