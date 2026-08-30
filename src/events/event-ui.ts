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
import type ChronoAnvilPlugin from "../main";
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
  WEEKDAY_NAMES,
  isValidIso,
  readMinutes,
  weekdayOf,
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
  // The duration field's own slot, so the hour field can redraw it alone
  // when a time is typed or cleared.
  private durationHost: HTMLElement | null = null;
  private previewHost: HTMLElement | null = null;
  private activeCategory: string = "all";

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
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
    this.contentEl.addClass("ca-event-modal");

    // ── Live Preview Card ──
    this.previewHost = contentEl.createDiv({ cls: "ca-event-preview" });
    this.updatePreview();

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder("Anna's birthday")
        .setValue(this.draft.title)
        .onChange((v) => {
          this.draft.title = v;
          this.updatePreview();
        });
      // Enter saves. Handled by the frame for every single-line input in the
      // window, so the title field no longer needs a listener the other text
      // fields never got.
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    // THREE KINDS AND ONE FIELD, styled as a modern segmented button bar.
    const kindSetting = new Setting(contentEl)
      .setName("Recurrence")
      .setDesc(this.kindDescription());
    const kindBar = kindSetting.controlEl.createDiv({ cls: "ca-event-kind-bar" });
    const kinds: Array<{ id: string; label: string }> = [
      { id: "single", label: "Single (one-off)" },
      { id: "recurring", label: "Yearly (annual)" },
      { id: "weekly", label: "Weekly" },
    ];
    for (const k of kinds) {
      const isCur = this.kindChoice() === k.id;
      const btn = kindBar.createEl("button", {
        cls: `ca-event-kind-btn${isCur ? " is-active" : ""}`,
        text: k.label,
        attr: { type: "button", "aria-pressed": isCur ? "true" : "false" },
      });
      btn.addEventListener("click", () => {
        this.setKindChoice(k.id);
        kindBar.findAll(".ca-event-kind-btn").forEach((el) => {
          el.removeClass("is-active");
          el.setAttribute("aria-pressed", "false");
        });
        btn.addClass("is-active");
        btn.setAttribute("aria-pressed", "true");
        kindSetting.setDesc(this.kindDescription());
        this.renderDateFields();
        this.updatePreview();
      });
    }

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

  // The description of the current recurrence kind.
  private kindDescription(): string {
    const k = this.kindChoice();
    if (k === "weekly") return "Repeats on the same weekday every week, at a scheduled time.";
    if (k === "recurring") return "Repeats on the same date every year (e.g. birthday, holiday, anniversary).";
    return "Happens on one date or spans a consecutive range of days.";
  }

  // Live preview card showing the event's badge, title, date, and day-cell appearance.
  private updatePreview(): void {
    if (!this.previewHost) return;
    this.previewHost.empty();

    const left = this.previewHost.createDiv({ cls: "ca-event-preview-left" });
    const col = eventColor(this.draft);
    const ico = eventIcon(this.draft);

    const badge = left.createDiv({ cls: `ca-event-preview-badge ca-cal-badge-${col}` });
    setIcon(badge, ico);

    const info = left.createDiv({ cls: "ca-event-preview-info" });
    info.createDiv({
      cls: "ca-event-preview-title",
      text: this.draft.title.trim() || "Untitled event",
    });

    const desc = describeEventDate(this.draft) + (this.draft.time ? ` at ${this.draft.time}` : "");
    info.createDiv({ cls: "ca-event-preview-date", text: desc });

    // Mini day cell mockup
    const mockup = this.previewHost.createDiv({ cls: "ca-event-preview-mockup" });
    let dayStr = "23";
    if (this.draft.kind === "recurring" && this.draft.day) {
      dayStr = String(this.draft.day);
    } else if (this.draft.start && isValidIso(this.draft.start)) {
      dayStr = String(Number(this.draft.start.slice(8, 10)));
    }
    mockup.createSpan({ text: dayStr });
    const cellBadge = mockup.createSpan({ cls: `ca-cal-badge ca-cal-badge-${col}` });
    setIcon(cellBadge, ico);
  }

  // The dropdown's answer, read off the draft.
  private kindChoice(): string {
    if (this.draft.kind !== "recurring") return "single";
    return this.draft.every === "week" ? "weekly" : "recurring";
  }

  // And written back to it. `every` is cleared on every other branch, so a
  // reader who tries weekly and changes their mind does not leave a stray
  // `every: week` on an annual event for `normalizeEvent` to prefer.
  private setKindChoice(value: string): void {
    if (value === "weekly") {
      this.draft.kind = "recurring";
      this.draft.every = "week";
      return;
    }
    this.draft.kind = value === "recurring" ? "recurring" : "single";
    this.draft.every = undefined;
    this.draft.weekday = undefined;
    this.draft.from = undefined;
    this.draft.until = undefined;
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
    if (this.draft.every === "week") {
      // THE WEEKDAY OF THE DAY THEY CAME FROM. Right-clicking a Wednesday and
      // choosing weekly means every Wednesday; with no date in hand it means
      // the weekday it is today, which is the one a reader is most likely to be
      // scheduling from.
      if (this.draft.weekday == null) {
        const source = isValidIso(this.draft.start) ? this.draft.start! : fallback;
        this.draft.weekday = weekdayOf(source);
      }
      return;
    }
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

    if (this.draft.every === "week") {
      new Setting(host)
        .setName("Day")
        .setDesc("The same weekday, every week.")
        .addDropdown((d) => {
          WEEKDAY_NAMES.forEach((name, i) => d.addOption(String(i), name));
          d.setValue(String(this.draft.weekday ?? 1)).onChange((v) => {
            this.draft.weekday = Number(v);
            this.updatePreview();
          });
        });

      // BOUNDS, BOTH OPTIONAL, AND SAID AS "LEAVE EMPTY". A standing meeting
      // has neither; a course that runs a term has both. An empty pair is the
      // ordinary answer, so the description has to say so or every reader will
      // feel obliged to pick two dates.
      new Setting(host)
        .setName("First week")
        .setDesc("Optional. Leave empty and it has always been happening.")
        .addText((t) => {
          t.inputEl.type = "date";
          t.setValue(this.draft.from ?? "").onChange((v) => {
            this.draft.from = v || undefined;
            this.updatePreview();
          });
        });

      new Setting(host)
        .setName("Last week")
        .setDesc("Optional. Leave empty and it carries on.")
        .addText((t) => {
          t.inputEl.type = "date";
          t.setValue(this.draft.until ?? "").onChange((v) => {
            this.draft.until = v || undefined;
            this.updatePreview();
          });
        });

      // THE TIME IS REQUIRED HERE AND OPTIONAL EVERYWHERE ELSE — see the field
      // block in `events.ts`. A weekly event with no hour would draw a bar
      // across every Wednesday of every calendar for ever.
      this.renderTimeField(host, { required: true });
      return;
    }

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
            this.updatePreview();
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
            this.updatePreview();
          });
        });
      // 29 February is legal to enter and handled at render time (shown on the
      // 28th in common years), so it's called out here rather than rejected.
      if (this.draft.month === 2 && this.draft.day === 29) {
        host.createDiv({
          cls: "ca-event-hint",
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
          this.updatePreview();
        });
      });

    new Setting(host)
      .setName("Ends")
      .setDesc("Leave empty for a single day. Inclusive.")
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.draft.end ?? "").onChange((v) => {
          this.draft.end = v || undefined;
          this.updatePreview();
        });
      });

    this.renderTimeField(host);
  }

  // The hour, and what having one MEANS (4.52).
  //
  // AN EMPTY FIELD IS THE ORDINARY CASE and the description says why rather than
  // apologising for it: a birthday, a holiday and a trip are facts about a day,
  // and only an appointment happens at a time. That is not a nicety — the
  // Meetings logbook lists exactly the events that carry one, so this field is
  // the difference between an event and a meeting, said in one box.
  //
  // ON THE SINGLE-EVENT FIELDS AND NOT THE RECURRING ONES, because this
  // recurrence is annual by construction and an annual 09:00 is a stranger thing
  // than the field is worth. Nothing in the model refuses it; a hand-edited
  // `Events.md` with a time on a recurring event keeps it and shows it.
  private renderTimeField(
    host: HTMLElement,
    opts: { required?: boolean } = {}
  ): void {
    this.durationHost = null;
    new Setting(host)
      .setName("Time")
      .setDesc(
        opts.required
          ? "Required. A weekly event is a standing appointment, and it shows in the Meetings logbook."
          : "Leave empty for something that is true of the whole day. An event with a time is a meeting, and shows in the Meetings logbook."
      )
      .addText((t) => {
        t.inputEl.type = "time";
        t.setValue(this.draft.time ?? "").onChange((v) => {
          this.draft.time = v || undefined;
          // A LENGTH WITH NO START IS A LENGTH OF NOTHING, and `normalizeEvent`
          // drops one on read. Cleared here as well so the form cannot show a
          // duration that the next save will silently discard.
          if (!this.draft.time) this.draft.duration = undefined;
          this.renderDurationField();
          this.updatePreview();
        });
      });
    this.durationHost = host.createDiv({ cls: "ca-ev-duration" });
    this.renderDurationField();
  }

  // How long it runs (4.55). Drawn only once there is an hour to run FROM,
  // which is the same rule the model enforces — a field that could be filled in
  // and then thrown away on save would be the form lying to the reader.
  private renderDurationField(): void {
    this.durationHost?.empty();
    if (!this.durationHost || !this.draft.time) return;
    new Setting(this.durationHost)
      .setName("How long")
      .setDesc(
        "Minutes. Leave empty for a moment — the time grid marks it at the hour rather than drawing a block over one."
      )
      .addText((t) => {
        t.inputEl.type = "number";
        t.inputEl.min = "0";
        t.inputEl.step = "5";
        t.setPlaceholder("60");
        t.setValue(this.draft.duration == null ? "" : String(this.draft.duration))
          .onChange((v) => {
            // THROUGH THE MODEL'S OWN READER, so a `0` typed here means what a
            // `0` in the note means — no duration — rather than the box
            // inventing a second rule.
            this.draft.duration = readMinutes(v) ?? undefined;
            this.updatePreview();
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
    const setting = new Setting(parent).setName("Icon");
    const iconDesc = setting.descEl;
    iconDesc.setText(eventIcon(this.draft));

    const wrap = parent.createDiv({ cls: "ca-icon-picker" });

    // Category Tabs
    const catBar = wrap.createDiv({ cls: "ca-icon-cat-bar" });
    const allGroups = [
      { key: "all", label: "All" },
      ...EVENT_ICONS.map((g) => ({ key: g.label.toLowerCase(), label: g.label })),
    ];

    const grid = wrap.createDiv({ cls: "ca-icon-grid" });

    const renderGrid = (catKey: string) => {
      grid.empty();
      const groupsToRender =
        catKey === "all"
          ? EVENT_ICONS
          : EVENT_ICONS.filter((g) => g.label.toLowerCase() === catKey);

      for (const group of groupsToRender) {
        for (const name of group.icons) {
          const btn = grid.createEl("button", {
            cls: `ca-icon-swatch${eventIcon(this.draft) === name ? " is-active" : ""}`,
            attr: { type: "button", "aria-label": name, title: `${name} (${group.label})` },
          });
          setIcon(btn, name);
          btn.addEventListener("click", () => {
            this.draft.icon = name;
            iconDesc.setText(name);
            grid
              .findAll(".ca-icon-swatch")
              .forEach((el) => el.removeClass("is-active"));
            btn.addClass("is-active");
            this.updatePreview();
          });
        }
      }
    };

    for (const cat of allGroups) {
      const isCur = this.activeCategory === cat.key;
      const catBtn = catBar.createEl("button", {
        cls: `ca-icon-cat-btn${isCur ? " is-active" : ""}`,
        text: cat.label,
        attr: { type: "button" },
      });
      catBtn.addEventListener("click", () => {
        this.activeCategory = cat.key;
        catBar.findAll(".ca-icon-cat-btn").forEach((el) => el.removeClass("is-active"));
        catBtn.addClass("is-active");
        renderGrid(cat.key);
      });
    }

    renderGrid(this.activeCategory);
  }

  private renderColorPicker(parent: HTMLElement): void {
    new Setting(parent).setName("Colour").setHeading();
    const row = parent.createDiv({ cls: "ca-color-picker" });
    for (const name of EVENT_COLORS) {
      const btn = row.createEl("button", {
        cls: `ca-color-swatch ca-color-${name}${eventColor(this.draft) === name ? " is-active" : ""}`,
        attr: { type: "button", "aria-label": name, title: name },
      });
      btn.style.setProperty("background-color", `var(--ca-ev-${name})`);
      btn.addEventListener("click", () => {
        this.draft.color = name;
        row
          .findAll(".ca-color-swatch")
          .forEach((el) => el.removeClass("is-active"));
        btn.addClass("is-active");
        this.updatePreview();
      });
    }
  }

  protected validate(): string | null {
    if (!this.draft.title.trim()) return "Give the event a title.";
    if (this.draft.every === "week") {
      const w = this.draft.weekday;
      if (w == null || w < 0 || w > 6) return "Pick a weekday.";
      if (!this.draft.time) return "A weekly event needs a time.";
      if (this.draft.from && !isValidIso(this.draft.from)) {
        return "That first week isn't a real date.";
      }
      if (this.draft.until && !isValidIso(this.draft.until)) {
        return "That last week isn't a real date.";
      }
      // A series that ends before it starts has no occurrences at all, and it
      // is worth saying so here rather than saving an event that draws nowhere.
      if (this.draft.from && this.draft.until && this.draft.until < this.draft.from) {
        return "The last week is before the first one.";
      }
      return null;
    }
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
      console.error("ChronoAnvil: save failed", err);
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
      // The rhythm is part of "the same shape as this one": entering a term's
      // worth of weekly classes is exactly the case this button is for, and
      // dropping back to a yearly event between each would undo it.
      ...(this.draft.every === "week"
        ? {
            every: "week" as const,
            weekday: this.draft.weekday,
            time: this.draft.time,
            ...(this.draft.from ? { from: this.draft.from } : {}),
            ...(this.draft.until ? { until: this.draft.until } : {}),
          }
        : {}),
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
  plugin: ChronoAnvilPlugin,
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
  plugin: ChronoAnvilPlugin,
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
