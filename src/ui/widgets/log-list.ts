// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A stamped region, drawn as one card per item.
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
// ── ONE LIST, TWO CALLERS (4.52) ────────────────────────────────────
//
// This was `buildCaptureLog` and it is now the body under two builders: the
// capture region on a diary entry, and a LOGBOOK — a standing note holding what
// belongs to the diary and to no single day. They are the same region grammar
// (`diary/log-items.ts`) drawn the same way, and the differences between them
// are four options rather than four hundred lines:
//
//   • WHOSE FILE. A capture list writes the note it is drawn on; a logbook
//     writes the logbook's note, wherever the widget happens to sit.
//   • WHETHER THE STAMP CARRIES A DATE. A capture's note already knows the day.
//   • WHETHER THERE IS AN ADD BOX. Captures arrive from the capture box; a
//     logbook's only surface is this widget, so it must be able to take one.
//   • WHAT THE EMPTY STATE SAYS, which is the one thing a reader reads when
//     there is nothing else to read.
//
// MODELLED ON `buildTasks` (note-regions.ts), WITH TWO DIFFERENCES that are
// both forced rather than chosen:
//
//   AN ITEM IS MULTI-LINE. `tasks:`, `recall` and `attach:` all collapse an
//   item to one line, and `formatLogItem` deliberately does not — "a three-line
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
// none and writes straight through; this one cannot, or an item arriving
// between a render and a click would be lost to the click.

import { MarkdownRenderChild, setIcon } from "obsidian";
import type { App, TFile } from "obsidian";
import type { NoteRegionHost } from "./note-regions";
import { readNoteRegion } from "../../core/notestore";
import { readMinutes } from "../../events/events";
import {
  parseLogItems,
  serializeLogItems,
  type LogItem,
} from "../../diary/log-items";
import { today } from "../../core/util";

// Re-reads the region when the file changes underneath the list. Same shape as
// `NoteFieldWatcher`, and named separately because the two guard different
// things: that one protects a cursor in a textarea, this one protects a card
// that is open for editing.
class LogListWatcher extends MarkdownRenderChild {
  constructor(
    private app: App,
    hostEl: HTMLElement,
    private watchPath: string,
    private refresh: () => void
  ) {
    super(hostEl);
  }

  onload(): void {
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (f.path === this.watchPath) this.refresh();
      })
    );
  }
}

export interface LogListOptions {
  /** The region key. `capture` for a capture log, `logbook` for a logbook. */
  key: string;
  /**
   * The note whose region this is, or null when there is not one yet.
   *
   * NULL IS A REAL STATE AND NOT A FAILURE: a logbook's note is written on the
   * first item, never on a render, so a widget pointed at one that does not
   * exist draws its empty state and waits. See `onAdd`.
   */
  file: TFile | null;
  /** Extra modifier class on the wrapper, so the two callers can be told apart. */
  modifier: string;
  /** The fold bar's text, or null for a list with no bar. */
  label: string | null;
  collapsible: boolean;
  startCollapsed: () => boolean;
  onFold: (v: boolean) => void;
  /** What to say when there is nothing here. */
  emptyText: string;
  /**
   * The add box, or null for a list nothing is typed into directly.
   *
   * `stamp` is asked at the moment of the add rather than at render, because a
   * page left open past midnight would otherwise file tomorrow's item under
   * today — the same reason `captureTo` resolves its target on save.
   */
  add: {
    placeholder: string;
    stamp: () => Pick<LogItem, "date" | "time" | "mins">;
  } | null;
  /**
   * Whether an item here carries a day of its own.
   *
   * A CAPTURE'S DAY IS ITS NOTE'S, so its cards show no date and its *when*
   * control offers none — a date field on a capture would let a reader file an
   * item into a day the note it lives in is not. A logbook spans months and
   * every item states its own.
   *
   * STATED RATHER THAN INFERRED FROM `stamp().date`. The two callers know the
   * answer and it does not change; reading it off a function that is
   * deliberately called at the moment of the add would ask a live question to
   * settle a fixed one.
   */
  dated: boolean;
  /**
   * Makes the note when there is none, or null where there always is one.
   *
   * THE CALLER OWNS THIS BECAUSE THE CALLER KNOWS THE PATH. A capture region
   * lives in an entry that exists by definition — you are looking at it — and
   * passes null. A logbook's note is written by its first item, from the def's
   * own `path`, which is a fact about the registry and not about a list.
   */
  createNote: (() => Promise<TFile | null>) | null;
  /**
   * Registers the file watcher's lifetime with the block that drew this. The
   * ctx's own `addChild`, taken as a function so this module needs nothing from
   * the postprocessor but the one method it uses.
   */
  addChild: (child: MarkdownRenderChild) => void;
}

export function buildLogList(
  host: NoteRegionHost,
  opts: LogListOptions
): HTMLElement {
  const { key } = opts;
  // `journal-note--collapsible` is borrowed rather than reimplemented: the
  // fold bar, its chevron and its collapsed state are the same three rules the
  // `note:` field uses, and a second set would drift the first time either
  // moved. The list joins that rule's hidden-children selector.
  const wrap = createDiv({
    cls: `journal-capture-log journal-note ${opts.modifier}${
      opts.collapsible ? " journal-note--collapsible" : ""
    }`,
  });

  // The fold bar, kept identical to the `note:#collapse` one it replaces — the
  // section folds where it always folded, remembers what it always remembered,
  // and the `captureCollapsedByDefault` setting still means what it says.
  if (opts.collapsible && opts.label) {
    const bar = wrap.createDiv({ cls: "journal-note-collapse-bar" });
    setIcon(bar.createDiv({ cls: "journal-note-chevron" }), "chevron-down");
    bar.createDiv({ cls: "journal-note-label", text: opts.label });
    const apply = (v: boolean): void => wrap.toggleClass("is-collapsed", v);
    apply(opts.startCollapsed());
    bar.addEventListener("click", (evt) => {
      evt.preventDefault();
      const next = !wrap.hasClass("is-collapsed");
      apply(next);
      opts.onFold(next);
    });
  } else if (opts.label) {
    wrap.createDiv({ cls: "journal-note-label", text: opts.label });
  }

  const list = wrap.createDiv({ cls: "journal-capture-list" });

  let file = opts.file;
  let items: LogItem[] = [];
  // The region text this list was parsed from — see `writeRegionOf`.
  let baseline = "";
  // Which card is open for editing, by index. Nothing is re-rendered under an
  // open editor, and an arriving item waits rather than closing it.
  let editing: number | null = null;

  const persist = (): void => {
    if (!file) return;
    const next = serializeLogItems(items);
    void host.writeRegionOf(file, key, next, baseline);
    // The write may merge an append on top of `next`, so the baseline is only
    // safely advanced by the re-read the modify event brings. Advancing it to
    // `next` here would claim we had absorbed something we have not seen.
  };

  const render = (): void => {
    list.empty();
    if (items.length === 0) {
      list.createDiv({ cls: "journal-capture-empty", text: opts.emptyText });
      return;
    }
    items.forEach((item, index) => {
      renderLogItemCard(list, item, index === editing, opts.dated, {
        onWhen: (value) => {
          // WRITTEN ON EVERY FIELD CHANGE, not on a Save button. Every other
          // control on this card commits as it is used — the checkbox, the
          // delete — and a stamp editor that needed confirming would be the one
          // thing here a reader could lose work in by clicking away.
          item.date = opts.dated ? value.date : null;
          item.time = value.time;
          item.mins = value.mins;
          persist();
        },
        onWhenCancel: () => render(),
        onToggle: () => {
          // A date rather than a flag, so a crossed-off item says when.
          item.done = item.done ? null : today();
          persist();
          render();
        },
        onEdit: () => {
          editing = index;
          render();
        },
        onCommit: (text) => {
          editing = null;
          if (text.trim() !== item.text.trim()) {
            item.text = text;
            persist();
          }
          render();
        },
        onDelete: () => {
          // NO CONFIRMATION, which is the task widget's call and not obviously
          // right for a typed thought. It is the same call because an undo the
          // reader has is better than a dialog they learn to click through:
          // Obsidian's own file history holds the note, and an item deleted by
          // accident is one Ctrl+Z away in source view.
          items.splice(index, 1);
          editing = null;
          persist();
          render();
        },
      });
    });
  };

  const load = (text: string): void => {
    baseline = readNoteRegion(text, key);
    items = parseLogItems(baseline);
    render();
  };

  const watch = (target: TFile): void => {
    host.app.vault.read(target).then(
      (text) => {
        load(text);
        void host.ensureNoteRegion(target, key);
      },
      () => render()
    );
  };

  if (opts.add) {
    const add = opts.add;
    const row = wrap.createDiv({ cls: "journal-capture-add" });
    const line = row.createDiv({ cls: "journal-capture-add-line" });
    const input = line.createEl("textarea", {
      cls: "journal-capture-add-input",
      attr: { placeholder: add.placeholder, rows: "1" },
    });

    // ── SAYING WHEN, WITHOUT BEING ASKED EVERY TIME ────────────────────
    //
    // `null` means "whatever `add.stamp()` says at the moment I press Enter",
    // which is what this list has always done and is right for almost every
    // item: you write it down when it happens. The control is FOLDED until the
    // reader opens it, and the moment they touch a field this stops being null
    // and their answer wins.
    //
    // AND IT RESETS AFTER EVERY ADD. A reader who back-dated one item has not
    // asked for every item after it to be back-dated too, and an add row that
    // silently kept yesterday's date would file a week of work under it.
    let chosen: WhenValue | null = null;
    let when: HTMLElement | null = null;

    const reveal = line.createEl("button", {
      cls: "journal-capture-when-btn",
      attr: { type: "button", "aria-label": "Say when this happened" },
    });
    setIcon(reveal, "clock");
    reveal.addEventListener("click", () => {
      if (when) {
        when.remove();
        when = null;
        chosen = null;
        reveal.removeClass("is-active");
        return;
      }
      const now = add.stamp();
      chosen = { date: now.date, time: now.time, mins: now.mins };
      when = whenEditor(row, chosen, opts.dated, (v) => {
        chosen = v;
      });
      reveal.addClass("is-active");
    });

    const resetWhen = (): void => {
      if (!when) return;
      when.remove();
      when = null;
      chosen = null;
      reveal.removeClass("is-active");
    };

    const commit = (): void => {
      const text = input.value;
      if (!text.trim()) return;
      input.value = "";
      const stamp = chosen ?? add.stamp();
      // APPENDED TO THE LIST IN HAND AND WRITTEN THROUGH `persist`, so the one
      // write path — and the one merge — is the one every other control here
      // uses. A direct `appendToNoteRegion` would be a second writer racing the
      // first, which is the shape of the bug 4.27 closed.
      items.push({
        date: stamp.date,
        time: stamp.time,
        text,
        done: null,
        mins: stamp.mins ?? null,
      });
      resetWhen();
      if (file) {
        persist();
        render();
        return;
      }
      // NO NOTE YET. This is the one place a logbook's note is created, and it
      // is the first item that creates it — never a render, on the rule
      // `captureDestinations` states in its own words: "a reader who opens the
      // box, reads the options and presses Escape has not asked for five
      // notes."
      const make = opts.createNote;
      if (!make) return;
      void make().then((made) => {
        if (!made) return;
        file = made;
        persist();
        render();
        watch(made);
      });
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && !evt.shiftKey) {
        evt.preventDefault();
        commit();
      }
    });
    input.addEventListener("blur", commit);
  }

  if (file) {
    watch(file);
    const watchPath = file.path;
    opts.addChild(
      new LogListWatcher(host.app, wrap, watchPath, () => {
        // Mid-edit, the reader's card wins — the same rule the textarea used,
        // for the same reason. The next commit re-renders from disk anyway, and
        // the write carries a baseline so the arriving item is not lost.
        if (editing != null) return;
        const target = file;
        if (!target) return;
        void host.app.vault.read(target).then((text) => {
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

// One item.
// When an item happened, as three fields.
//
// ONE CONTROL, TWO PLACES. The add row uses it to say when a new item happened
// and the card uses it to correct one that was logged late, and they are the
// same question — a second spelling would be two answers to "what may a stamp
// hold", in the two places most likely to disagree.
//
// NATIVE INPUTS, on `event-ui.ts`' own choice for the hour it added in 4.52:
// `type="date"` and `type="time"` bring the platform's picker, its keyboard
// handling and its locale, and a hand-rolled one would bring none of them.
//
// EVERY FIELD MAY BE EMPTIED. A stamp with no time is what a reader typing into
// a work log by hand writes, and the grammar has read one since 4.52 — the
// control must be able to produce what the parser accepts, or the two would
// disagree about what an item is.
export interface WhenValue {
  date: string | null;
  time: string | null;
  mins: number | null;
}

function whenEditor(
  parent: HTMLElement,
  initial: WhenValue,
  dated: boolean,
  onChange: (value: WhenValue) => void
): HTMLElement {
  const row = parent.createDiv({ cls: "journal-capture-when" });
  const value: WhenValue = { ...initial };
  const emit = (): void => onChange({ ...value });

  if (dated) {
    const date = row.createEl("input", {
      cls: "journal-capture-when-date",
      attr: { type: "date", "aria-label": "The day this happened" },
    });
    date.value = value.date ?? "";
    date.addEventListener("change", () => {
      value.date = date.value || null;
      emit();
    });
  }

  const time = row.createEl("input", {
    cls: "journal-capture-when-time",
    attr: { type: "time", "aria-label": "The time this happened" },
  });
  time.value = value.time ?? "";
  time.addEventListener("change", () => {
    value.time = time.value || null;
    emit();
  });

  const mins = row.createEl("input", {
    cls: "journal-capture-when-mins",
    attr: {
      type: "number",
      min: "0",
      step: "5",
      placeholder: "mins",
      "aria-label": "How long it took, in minutes",
    },
  });
  mins.value = value.mins == null ? "" : String(value.mins);
  mins.addEventListener("change", () => {
    // THE GRAMMAR'S OWN READER DECIDES, not this box. `readMinutes` is what
    // `[mins:: …]` is parsed with, so a `0` typed here and a `0` typed into the
    // raw line mean the same thing — no duration — rather than the box
    // inventing a second rule about what a number means.
    value.mins = readMinutes(mins.value);
    if (value.mins == null) mins.value = "";
    emit();
  });

  return row;
}

function renderLogItemCard(
  list: HTMLElement,
  item: LogItem,
  isEditing: boolean,
  dated: boolean,
  cb: {
    onToggle: () => void;
    onEdit: () => void;
    onCommit: (text: string) => void;
    onDelete: () => void;
    onWhen: (value: WhenValue) => void;
    onWhenCancel: () => void;
  }
): void {
  const card = list.createDiv({
    cls: `journal-capture-card${item.done ? " is-done" : ""}`,
  });

  const head = card.createDiv({ cls: "journal-capture-head" });
  // An item with no stamp is one somebody typed into the region by hand. It is
  // still theirs and still gets a card; it just has nothing to say about when.
  // Drawing an empty slot keeps the bodies aligned down the column.
  //
  // THE DATE IS READ OFF THE ITEM, NOT PASSED IN. A capture has none because
  // its note is a day; a logbook item has one because its note is not. Asking
  // the item is what lets one card draw both without being told which it is.
  const stamp = [item.date, item.time].filter((part) => !!part).join(" ");
  // THE STAMP IS A BUTTON NOW (4.55), where it was dead text for three
  // releases. It is the only way to correct an item logged late — and the only
  // way to give a length to the months of items a work log already holds, which
  // is what the time grid needs to draw them as anything but a moment.
  const clock = head.createEl("button", {
    cls: `journal-capture-time${stamp ? "" : " is-empty"}`,
    text: stamp || "no time",
    attr: {
      type: "button",
      "aria-label": "Change when this happened",
      ...(item.done ? { title: `Crossed off ${item.done}` } : {}),
    },
  });
  if (item.mins) {
    head.createSpan({
      cls: "journal-capture-mins",
      text: `${item.mins} min`,
    });
  }
  clock.addEventListener("click", () => {
    if (head.querySelector(".journal-capture-when")) {
      cb.onWhenCancel();
      return;
    }
    whenEditor(
      card,
      { date: item.date, time: item.time, mins: item.mins },
      dated,
      cb.onWhen
    );
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
    item.done ? "rotate-ccw" : "check",
    item.done ? "Bring this back" : "Cross this off",
    cb.onToggle
  );
  if (!isEditing) button("pencil", "Edit this item", cb.onEdit);
  button("x", "Delete this item", cb.onDelete);

  if (!isEditing) {
    // Text, not markdown. The region is plain text by contract — see the
    // `note:` field this replaces — and rendering it would make an item
    // beginning with `#` into a heading inside a card.
    card.createDiv({ cls: "journal-capture-text", text: item.text });
    return;
  }

  const area = card.createEl("textarea", { cls: "journal-capture-edit" });
  area.value = item.text;
  area.rows = Math.max(1, item.text.split("\n").length);
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
      cb.onCommit(item.text);
    }
  });
  area.addEventListener("blur", () => cb.onCommit(area.value));
  window.setTimeout(() => {
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, 0);
}
