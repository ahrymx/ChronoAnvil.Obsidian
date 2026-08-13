// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The event editor, and the calendar's right-click menu.
//
// There is one editor. The settings tab, the `events` widget and a right-click
// on a calendar day are three doors into the same modal, not three
// implementations of the same form — the only difference between them is what
// the modal opens pre-filled with. That matters more than it sounds: an event
// has a kind, two mutually exclusive date shapes, an icon, a colour and a note,
// and keeping three copies of that form in sync by hand is exactly the kind of
// job that quietly stops being done.

import { App, Menu, Notice, Setting, setIcon } from "obsidian";
import { EditorModal } from "../ui/editor-modal";
import type AlmanacPlugin from "../main";
import { confirmAction } from "../ui/modals";
import {
  DEFAULT_EVENT_COLOR,
  DEFAULT_EVENT_ICON,
  EventDef,
  EVENT_COLORS,
  EVENT_ICONS,
  daysInMonth,
  describeEventDate,
  eventColor,
  eventIcon,
  eventsOnDay,
  isValidIso,
} from "./events";
import { deleteEvent, readEvents, saveEvent } from "./eventstore";
import { today } from "../core/util";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A blank event, optionally anchored to a date the user already indicated (by
// right-clicking that day on the calendar).
export function draftEvent(iso?: string): EventDef {
  const base: EventDef = {
    id: "",
    title: "",
    kind: "single",
    icon: DEFAULT_EVENT_ICON,
    color: DEFAULT_EVENT_COLOR,
  };
  if (iso && isValidIso(iso)) base.start = iso;
  return base;
}

class EventEditModal extends EditorModal {
  private draft: EventDef;
  private readonly isNew: boolean;
  private dateHost: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: AlmanacPlugin,
    def: EventDef,
    private onDone: (changed: boolean) => void
  ) {
    super(
      app,
      plugin,
      def.id ? "Edit special event" : "New special event",
      // The one thing the fields cannot say. A special event is not a diary
      // entry: it is a date the calendar marks, and it lives in settings rather
      // than in a note — which is why editing one here changes every day it
      // touches at once.
      "A date the calendar marks — a birthday, a holiday, an anniversary. Stored in settings, so it appears on every year it applies to.",
      "Save"
    );
    this.draft = { ...def };
    this.isNew = !def.id;
  }

  protected renderBody(): void {
    const contentEl = this.body;
    this.contentEl.addClass("almanac-event-modal");

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("Anna's birthday")
        .setValue(this.draft.title)
        .onChange((v) => {
          this.draft.title = v;
        });
      // Enter saves. Handled by the frame for every single-line input in the
      // window, so the title field no longer needs a listener the other text
      // fields never got.
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    new Setting(contentEl)
      .setName("Kind")
      .setDesc(
        "Recurring falls on the same date every year. Single happens once, and can span several days."
      )
      .addDropdown((d) => {
        d.addOption("recurring", "Recurring (yearly)")
          .addOption("single", "Single (one-off)")
          .setValue(this.draft.kind)
          .onChange((v) => {
            this.draft.kind = v === "recurring" ? "recurring" : "single";
            this.renderDateFields();
          });
      });

    this.dateHost = contentEl.createDiv();
    this.renderDateFields();

    this.renderIconPicker(contentEl);
    this.renderColorPicker(contentEl);

    new Setting(contentEl)
      .setName("Note")
      .setDesc("Optional. Shown in the calendar tooltip.")
      .addText((t) =>
        t
          .setPlaceholder("Turning 34")
          .setValue(this.draft.note ?? "")
          .onChange((v) => {
            this.draft.note = v.trim() || undefined;
          })
      );

  }

  protected renderFooter(footer: HTMLElement): void {
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());

    if (!this.isNew) {
      const del = footer.createEl("button", {
        text: "Delete",
        cls: "mod-warning",
      });
      del.addEventListener("click", () => void this.remove());
    }

    // Entering a year of public holidays by hand is twelve of the same action
    // with a different title and date each time. Without this it's also twelve
    // round trips out to a list view and back in through an Add button.
    if (this.isNew) {
      const again = footer.createEl("button", { text: "Save and add another" });
      again.addEventListener("click", () => void this.submit());
    }

    const save = footer.createEl("button", {
      text: this.saveLabel,
      cls: "mod-cta",
    });
    save.addEventListener("click", () => void this.trySubmit());
  }

  // Give the date fields a real value before they're drawn.
  //
  // Without this the controls show a placeholder the draft doesn't actually
  // hold — the month dropdown sits on January while `draft.month` is still
  // undefined — so saving an untouched form fails validation while pointing at
  // a field that visibly has an answer in it. Whatever the control displays,
  // the draft has to already agree with.
  //
  // The seed carries the date across a kind switch in both directions, so
  // right-clicking 12 April and then deciding it's a birthday gives you 12
  // April rather than 1 January.
  private seedDates(): void {
    const fallback = today();
    if (this.draft.kind === "recurring") {
      if (this.draft.month != null && this.draft.day != null) return;
      const source = isValidIso(this.draft.start) ? this.draft.start! : fallback;
      const [, m, d] = source.split("-").map(Number);
      if (this.draft.month == null) this.draft.month = m;
      if (this.draft.day == null) this.draft.day = d;
      return;
    }
    if (isValidIso(this.draft.start)) return;
    // Converting a recurring event to a one-off: keep its month and day, and
    // place them in the current year.
    if (this.draft.month != null && this.draft.day != null) {
      const year = Number(fallback.slice(0, 4));
      const max = daysInMonth(year, this.draft.month);
      const day = Math.min(this.draft.day, max);
      this.draft.start = `${year}-${String(this.draft.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return;
    }
    this.draft.start = fallback;
  }

  // The two date shapes are mutually exclusive, so the fields are swapped
  // wholesale rather than shown greyed out — a disabled end-date field on a
  // recurring event is just a question the form is asking and then refusing to
  // accept an answer to.
  private renderDateFields(): void {
    const host = this.dateHost;
    if (!host) return;
    host.empty();
    this.seedDates();

    if (this.draft.kind === "recurring") {
      const month = this.draft.month ?? 1;
      const maxDay = daysInMonth(2024, month);
      new Setting(host)
        .setName("Date")
        .setDesc("The same day every year.")
        .addDropdown((d) => {
          MONTH_NAMES.forEach((name, i) => d.addOption(String(i + 1), name));
          d.setValue(String(month)).onChange((v) => {
            this.draft.month = Number(v);
            this.clampDay();
          });
        })
        .addText((t) => {
          t.inputEl.type = "number";
          t.inputEl.min = "1";
          t.inputEl.max = String(maxDay);
          t.inputEl.style.width = "5em";
          t.setValue(String(this.draft.day ?? "")).onChange((v) => {
            // An emptied field clears the value rather than writing 0, so
            // validation says "pick a day" instead of complaining about a
            // number the user never typed.
            const n = Number(v.trim());
            this.draft.day =
              v.trim() !== "" && Number.isInteger(n) && n > 0 ? n : undefined;
          });
        });
      // 29 February is legal to enter and handled at render time (shown on the
      // 28th in common years), so it's called out here rather than rejected.
      if (this.draft.month === 2 && this.draft.day === 29) {
        host.createDiv({
          cls: "almanac-event-hint",
          text: "29 February shows on the 28th in non-leap years.",
        });
      }
      return;
    }

    new Setting(host)
      .setName("Starts")
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.draft.start ?? "").onChange((v) => {
          this.draft.start = v;
        });
      });

    new Setting(host)
      .setName("Ends")
      .setDesc("Leave empty for a single day. Inclusive.")
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.draft.end ?? "").onChange((v) => {
          this.draft.end = v || undefined;
        });
      });
  }

  // A day that can't exist in the chosen month is pulled back to the last one,
  // so switching from 31 January to February doesn't leave an unsaveable form.
  private clampDay(): void {
    const month = this.draft.month ?? 1;
    // 2024 is a leap year, so February keeps 29 available here; the render-time
    // shift handles the years where it isn't.
    const max = daysInMonth(2024, month);
    if ((this.draft.day ?? 1) > max) this.draft.day = max;
    this.renderDateFields();
  }

  private renderIconPicker(parent: HTMLElement): void {
    new Setting(parent).setName("Icon").setHeading();
    const wrap = parent.createDiv({ cls: "almanac-icon-picker" });
    for (const group of EVENT_ICONS) {
      wrap.createDiv({ cls: "almanac-icon-group-label", text: group.label });
      const row = wrap.createDiv({ cls: "almanac-icon-row" });
      for (const name of group.icons) {
        const btn = row.createEl("button", {
          cls: "almanac-icon-swatch",
          attr: { type: "button", "aria-label": name, title: name },
        });
        setIcon(btn, name);
        btn.toggleClass("is-active", eventIcon(this.draft) === name);
        btn.addEventListener("click", () => {
          this.draft.icon = name;
          wrap
            .findAll(".almanac-icon-swatch")
            .forEach((el) => el.removeClass("is-active"));
          btn.addClass("is-active");
        });
      }
    }
  }

  private renderColorPicker(parent: HTMLElement): void {
    new Setting(parent).setName("Colour").setHeading();
    const row = parent.createDiv({ cls: "almanac-color-picker" });
    for (const name of EVENT_COLORS) {
      const btn = row.createEl("button", {
        cls: `almanac-color-swatch almanac-color-${name}`,
        attr: { type: "button", "aria-label": name, title: name },
      });
      btn.toggleClass("is-active", eventColor(this.draft) === name);
      btn.addEventListener("click", () => {
        this.draft.color = name;
        row
          .findAll(".almanac-color-swatch")
          .forEach((el) => el.removeClass("is-active"));
        btn.addClass("is-active");
      });
    }
  }

  protected validate(): string | null {
    if (!this.draft.title.trim()) return "Give the event a title.";
    if (this.draft.kind === "recurring") {
      const m = this.draft.month;
      const d = this.draft.day;
      if (!m || m < 1 || m > 12) return "Pick a month.";
      if (!d || d < 1 || d > daysInMonth(2024, m)) {
        return `Pick a day between 1 and ${daysInMonth(2024, m)}.`;
      }
      return null;
    }
    if (!isValidIso(this.draft.start)) return "Pick a start date.";
    if (this.draft.end && !isValidIso(this.draft.end)) {
      return "That end date isn't a real date.";
    }
    return null;
  }

  // Throws rather than reporting, so the frame keeps the window open with the
  // draft intact — a failed write to the events note must not cost the reader
  // the date they just typed.
  protected async commit(): Promise<void> {
    await this.write();
    this.onDone(true);
  }

  private async write(): Promise<void> {
    this.draft.title = this.draft.title.trim();
    const ok = await saveEvent(this.app, this.plugin, this.draft);
    if (!ok) throw new Error("event: saveEvent reported no write");
  }

  protected commitFailureMessage(): string {
    return "Could not write to the events note — nothing was saved.";
  }

  // "Save and add another": the one path the frame does not own, because it
  // commits WITHOUT closing. Everything else about it is the frame's — the same
  // validate(), the same write(), the same error line.
  private async submit(): Promise<void> {
    const problem = this.validate();
    if (problem) {
      this.showError(problem);
      return;
    }
    try {
      await this.write();
    } catch (err) {
      console.error("Almanac: save failed", err);
      this.showError(this.commitFailureMessage());
      return;
    }
    // Keep the decoration and the kind — the next holiday is almost certainly
    // the same shape as this one — and clear what's specific to this event.
    this.draft = {
      id: "",
      title: "",
      kind: this.draft.kind,
      icon: this.draft.icon,
      color: this.draft.color,
    };
    this.onDone(true);
    // `refreshBody`, not empty-and-reopen: the old version rebuilt the head and
    // the footer with the fields, and under the frame would have discarded the
    // shared error element too.
    this.clearError();
    this.refreshBody();
    new Notice("Saved. Next one…");
  }

  private async remove(): Promise<void> {
    const ok = await confirmAction(
      this.app,
      "Delete event",
      `Delete "${this.draft.title}"? Diary entries that already reference it keep their property; the reference is simply ignored.`,
      "Delete",
      true
    );
    if (!ok) return;
    await deleteEvent(this.app, this.plugin, this.draft.id);
    this.onDone(true);
    this.close();
  }

  onClose(): void {
    super.onClose();
  }
}

// Open the editor. `def` with an empty id creates; with an id, edits.
export function openEventEditor(
  app: App,
  plugin: AlmanacPlugin,
  def: EventDef,
  onDone: (changed: boolean) => void = () => {}
): void {
  new EventEditModal(app, plugin, def, onDone).open();
}

// The calendar's right-click menu for one day: add an event anchored to it,
// plus edit/delete for whatever already falls on it.
//
// Note what this menu doesn't offer: anything that would create a diary entry.
// Left-click already does that, deliberately and visibly. A right-click is for
// the events layer, and the two stay separate.
export function openDayEventMenu(
  app: App,
  plugin: AlmanacPlugin,
  iso: string,
  evt: MouseEvent,
  onChanged: () => void = () => {}
): void {
  const menu = new Menu();
  const onDay = eventsOnDay(readEvents(app, plugin), iso);

  menu.addItem((i) =>
    i
      .setTitle("Add event on this day…")
      .setIcon("calendar-plus")
      .onClick(() => openEventEditor(app, plugin, draftEvent(iso), onChanged))
  );

  if (onDay.length) {
    menu.addSeparator();
    for (const def of onDay) {
      menu.addItem((i) =>
        i
          .setTitle(`Edit "${def.title}"`)
          .setIcon(eventIcon(def))
          .onClick(() => openEventEditor(app, plugin, def, onChanged))
      );
    }
  }

  menu.showAtMouseEvent(evt);
}

// A one-line summary of an event, shared by the settings list and the widget
// so the two never describe the same event differently.
export function eventSummary(def: EventDef): string {
  const date = describeEventDate(def);
  return def.note ? `${date} · ${def.note}` : date;
}
