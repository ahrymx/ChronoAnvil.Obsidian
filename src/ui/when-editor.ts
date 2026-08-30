// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// When something happened, as three fields. 4.62.
//
// LIFTED OUT OF `log-list.ts` UNCHANGED, and the header below is the one it
// arrived with. It was already "one control, two places" — the add row and the
// item card — and 4.62 gives it a third: the capture box, which until now
// stamped every thought with the minute it was typed and had nowhere to say
// otherwise. Three callers is where a control stops being part of a widget.
//
// NO PLUGIN, NO VAULT, NO `moment`. It builds three inputs and hands back what
// they say; deciding what a missing field means belongs to the grammar
// (`readMinutes`) and deciding what to do with the answer belongs to the
// caller.

import { readMinutes } from "../events/events";

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

export function whenEditor(
  parent: HTMLElement,
  initial: WhenValue,
  dated: boolean,
  onChange: (value: WhenValue) => void
): HTMLElement {
  const row = parent.createDiv({ cls: "ca-journal-capture-when" });
  const value: WhenValue = { ...initial };
  const emit = (): void => onChange({ ...value });

  if (dated) {
    const date = row.createEl("input", {
      cls: "ca-journal-capture-when-date",
      attr: { type: "date", "aria-label": "The day this happened" },
    });
    date.value = value.date ?? "";
    date.addEventListener("change", () => {
      value.date = date.value || null;
      emit();
    });
  }

  const time = row.createEl("input", {
    cls: "ca-journal-capture-when-time",
    attr: { type: "time", "aria-label": "The time this happened" },
  });
  time.value = value.time ?? "";
  time.addEventListener("change", () => {
    value.time = time.value || null;
    emit();
  });

  const mins = row.createEl("input", {
    cls: "ca-journal-capture-when-mins",
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
