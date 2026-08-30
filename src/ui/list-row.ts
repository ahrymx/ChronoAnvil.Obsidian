// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The one list row.
//
// WHY IT MOVED HERE
//
// It lived in settings-editors.ts, which is two thousand lines of modals, and
// was used by that file and settings.ts. The template editor wanted it too and
// could not have it: settings-editors.ts imports the template editor, so the
// template editor importing back would have been a cycle. So a component used
// by three files sat inside one of them, and the third grew its own.
//
// That is the whole reason a plugin looks inconsistent. Nobody decides that a
// list should look different one click away; a row is written where it is needed
// because reaching the shared one is awkward, and the awkwardness is structural
// rather than anyone's fault.
//
// WHAT THE SHAPE IS
//
//   [lead] [token] [ title / subtitle / pills ] [actions]
//
// `lead` is new, and it is what the template editor needed: a slot BEFORE the
// token, for controls that act on the row's position rather than on the thing
// the row describes. Reorder arrows belong there and nowhere else — putting
// them in `actions` would place "move this up" beside "delete this", which is a
// pairing one slip away from being expensive.
//
// Both `lead` and `actions` are returned rather than configured, because what
// goes in them is buttons with handlers and a component that took a
// specification for those would be a worse way to write a button.

export interface ListRowOptions {
  token: string;
  title: string;
  // Fills the title slot instead of setting text on it, for a row whose title
  // is a link to the note it describes. Same shape and same reason as
  // `sectionFrame`'s: the slot stays the component's, so the type, the weight
  // and the truncation are shared and only the contents are the caller's.
  titleRender?: (slot: HTMLElement) => void;
  subtitle?: string;
  pills?: { text: string; tone?: "on" | "off" | "muted" | "accent" | "section" }[];
  locked?: boolean;
  // Extra classes for row state — added, removed, disabled. The caller's own
  // stylesheet targets these; the component only has to not fight them.
  cls?: string[];
  // A row on a NOTE rather than in Settings.
  //
  // The component was written for a settings list: generous padding, a hover
  // background, a token slot that is usually filled. A note surface wants the
  // same structure at a density that can put a dozen of them under a section
  // header without the section becoming the page. Only spacing and the token's
  // reserved width change — not the shape, which is the whole point of it
  // being one component.
  dense?: boolean;
  // Put the actions on a line of their own, under the row's text. 4.15 §2.
  //
  // WHAT THE DEFAULT SLOT IS AND WHY IT RAN OUT. `actions` is `flex: 0 0 auto`
  // beside a `min-width: 0` main region, which is exactly right for two or three
  // icon buttons and wrong the moment a caller puts a FIELD in it — the field
  // and the title are then dividing one line between them, and the title loses
  // because it is the one that may shrink.
  //
  // The section editor put four things there: a dropdown or a text field, a
  // group button, a Remove button, and on a narrow pane a second sentence. Three
  // separate workarounds were written for the consequences rather than for the
  // cause — a 12em ceiling on the dropdown, a matching one on the title box, and
  // a placeholder cut down to "Choose…" with the real question moved to
  // `aria-label` "where it is read rather than measured". All three are
  // compensation for a slot that is one line too short.
  //
  // AND THE ROW ALREADY EXISTED, at one width. The narrow-viewport rule at the
  // foot of `85-tracker-controls.css` has dropped the actions to their own
  // full-width line below 620px since it was written, for this reason stated in
  // those words: the pills and the buttons "no longer fit beside the text". What
  // this flag does is let a caller ask for that layout at every width.
  //
  // OPT-IN, NOT THE NEW DEFAULT. Every other caller — the settings lists, the
  // template editor, the dense note rows — puts icon buttons there and is
  // correct as it stands; a second line under each of those would be a page of
  // half-empty rows. One component, two arrangements, chosen by the caller who
  // knows what it is putting in the slot.
  actionsRow?: boolean;
  // Column tracks for the wide layout, as a CSS grid template.
  //
  // A table of records IS a list of rows; what a wide viewport adds is that
  // the rows line up. Given this, the row lays its main region out on a grid
  // so dates and ratings sit in columns; below the collapse breakpoint the
  // grid drops to one track and the same DOM stacks. One render, no resize
  // listener, no second copy of the data — and no `<table>`, which is what
  // could not have collapsed.
  columns?: string;
}

export interface ListRow {
  row: HTMLElement;
  // Before the token. Empty by default and collapsed by CSS, so a row that
  // wants nothing there is laid out exactly as it was before this slot existed.
  lead: HTMLElement;
  actions: HTMLElement;
  // For a caller that repaints one region rather than the row — the section
  // launcher rail replaces its pills when a template read finishes.
  pills: HTMLElement;
}

export function createListRow(
  host: HTMLElement,
  opts: ListRowOptions
): ListRow {
  const row = host.createDiv({ cls: "ca-list-row" });
  if (opts.locked) row.addClass("is-locked");
  if (opts.dense) row.addClass("is-dense");
  for (const c of opts.cls ?? []) if (c) row.addClass(c);

  const lead = row.createDiv({ cls: "ca-list-lead" });

  row.createDiv({ cls: "ca-list-token", text: opts.token });

  const main = row.createDiv({ cls: "ca-list-main" });
  if (opts.columns) {
    main.addClass("is-columned");
    main.style.setProperty("--ca-row-cols", opts.columns);
  }
  const titleSlot = main.createDiv({ cls: "ca-list-title" });
  if (opts.titleRender) opts.titleRender(titleSlot);
  else titleSlot.setText(opts.title);
  if (opts.subtitle) {
    main.createDiv({ cls: "ca-list-subtitle", text: opts.subtitle });
  }
  // Always created, even when empty: a caller that fills it in later — after an
  // async read — should not have to know whether it exists. The rail used to
  // query for it and silently do nothing when the row had started with no
  // pills.
  const pills = main.createDiv({ cls: "ca-list-pills" });
  for (const p of opts.pills ?? []) {
    const el = pills.createSpan({ cls: "ca-list-pill", text: p.text });
    if (p.tone) el.addClass(`is-${p.tone}`);
  }

  // A CLASS ON THE ROW, NOT A DIFFERENT TREE. The actions keep their own class,
  // their place in the DOM and their handlers; what changes is where the row
  // lays them out, which is one `flex-wrap` and two orders in the stylesheet.
  // Building a wrapper instead would give the editor's rows a structure no other
  // caller has, and every selector that reaches `.ca-list-actions` today
  // would have to learn about it.
  if (opts.actionsRow) row.addClass("has-actions-row");
  const actions = row.createDiv({ cls: "ca-list-actions" });
  return { row, lead, actions, pills };
}
