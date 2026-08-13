// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The button: widget — the control that DOES something rather than stores
// something.
//
// Every other control extracted from the Widgets class reads a value and writes
// it back. A button runs an action: it opens a note, creates the next entry,
// files the current one, or runs a journal action defined in settings. That is
// why the cluster is six functions and a label table rather than one builder —
// a button has to work out what it is (journalButtonSpec, logButtonSpec,
// BUTTON_LABELS), where it is (hostContainerName), and then do the thing
// (runAction, runJournalAction).
//
// It takes EntryControlHost, the same contract the tracker cells take, because
// it wants the same four things: read a value, write a value, reach the plugin,
// and know which note it was rendered into. Buttons and tracker cells asking
// for an identical contract is not a coincidence — both are controls bound to
// one entry, which is what that interface is named for.

import { MarkdownPostProcessorContext, setIcon, normalizePath, Notice } from "obsidian";
import type { EntryControlHost } from "./controls";
import { JournalType, getJournalType } from "../../journals/journal";
import { getTracker } from "../../trackers/trackers";
import { notify } from "../../core/notify";
export interface ButtonSpec {
  label: string;
  // Lucide icon id (obsidian's bundled set) for generic UI chrome — same
  // icon language the ribbon menu already uses. Mutually exclusive with
  // `emoji`.
  icon?: string;
  // A journal type/kind's own identity glyph (e.g. a custom journal's
  // configured emoji) — user-personalized, not chrome, so it stays a
  // literal emoji rather than becoming a Lucide icon. Mutually exclusive
  // with `icon`.
  emoji?: string;
  primary?: boolean;
  // Outlined, muted-text treatment for "jump to the current period"
  // actions (This Week/This Month) — shares its look with the calendar's
  // own Today/This Year button rather than competing with genuine
  // primary actions (Add chart, New Lesson) for accent-color attention.
  subtle?: boolean;
  // Icon-only, borderless — for repeated directional actions (prev/next)
  // so they look identical to the calendar's own arrow buttons instead of
  // being a full text pill in one widget and a bare glyph in another.
  ghost?: boolean;
  // Hover/aria text when the label alone understates what the button does.
  // The chart toolbar's "Edit…" is the case it exists for: since 2.47 that
  // one button covers removal too (the editor's footer holds Delete), and a
  // reader looking for the Remove button that used to sit beside it needs the
  // hover to say where it went.
  tooltip?: string;
}


export const BUTTON_LABELS: Record<string, ButtonSpec> = {
  // "Subject", not "Study Subject" and not "New Subject": the button lives in
  // the Study header bar, which already says Study, and the plus already says
  // new. See journalSubActionSpec below for both halves of that.
  "new-journal": { label: "Subject", icon: "plus", primary: true },
  "new-topic": { label: "Topic", icon: "plus" },
  // One rebuild for the whole Journals container. Every journal type used to
  // carry its own Refresh in its level-2 bar, but rebuildJournalHome() has
  // always rewritten *all* types in one pass — so those buttons were N
  // identical controls doing one job, and the repetition read as though each
  // refreshed only its own section. 2.13.8 hoists the single one into the
  // Journals bar; `refresh` is kept as an alias so a hand-edited homepage
  // that still names it keeps working. Nothing generated emits either one as
  // of 2.13.9 — the Journals section is a single `journals` directive whose
  // hero carries its own Refresh — but both stay routable for notes that
  // still carry the directive by hand.
  "refresh-all": { label: "Refresh all", icon: "refresh-cw" },
  refresh: { label: "Refresh all", icon: "refresh-cw" },
  "new-lesson": { label: "New Lesson", icon: "book-open", primary: true },
  // `primary` because every other create button in this table is: new-journal,
  // new-lesson, chart-add, journal-chart-add, new-page, and the generic kind
  // path in journalButtonSpec. This one was the only create action drawn grey,
  // which put "New Lesson" and "New Practice" — the same verb in two adjacent
  // sections of one note — at two different weights for no reason anyone chose.
  // §1.2 of the 2.56 plan: at most ONE tinted button per section, and a create
  // action is the one.
  "new-practice": { label: "New Practice", icon: "wrench", primary: true },
  "week-prev": { label: "Previous week", icon: "chevron-left", ghost: true },
  "week-this": { label: "This Week", subtle: true },
  "week-next": { label: "Next week", icon: "chevron-right", ghost: true },
  "month-prev": { label: "Previous month", icon: "chevron-left", ghost: true },
  "month-this": { label: "This Month", subtle: true },
  "month-next": { label: "Next month", icon: "chevron-right", ghost: true },
  today: { label: "Open Today", icon: "calendar-check", primary: true },
  "this-month": { label: "This Month", icon: "calendar-days" },
  "new-diary": { label: "New Entry", icon: "square-pen" },
  // "New Review" until 3.3.1 — the last reader-facing survivor of the word
  // 2.57.6 retired. The DIRECTIVE keeps its name: it is written into notes and
  // renaming it would break every one that carries it, which is the trade
  // `new-month` was added rather than made by rename.
  "new-monthly": { label: "New Monthly Entry", icon: "calendar-plus" },
  // Labelled for what the note IS rather than for the act of making one. The
  // reader on a weekly dashboard is not filing paperwork; they have decided
  // this week is worth keeping, and the button says so.
  "new-week": { label: "Keep This Week", icon: "calendar-plus" },
  // 3.3: the fourth of four. `new-monthly` above is NOT this and is not being
  // renamed into it — it prompts for any month and is what the command palette
  // and any note that already carries it invoke. This one keeps the month the
  // dashboard is looking at, which is the question the other three answer. One
  // directive, one meaning; a single kind that read its host and changed both
  // its label and its behaviour is the shape this codebase keeps declining.
  "new-month": { label: "Keep This Month", icon: "calendar-plus" },
  "new-quarter": { label: "Keep This Quarter", icon: "calendar-plus" },
  "new-year": { label: "Keep This Year", icon: "calendar-plus" },
  // Routable equivalents of the grid's own "+ Add tracker" tile and per-cell
  // ×, for a dashboard that wants the control as an ordinary button rather
  // than as part of a logging grid.
  "tracker-add": { label: "Add tracker", icon: "plus" },
  "tracker-remove": { label: "Remove tracker…", icon: "trash-2" },
  "chart-add": { label: "Add chart", icon: "plus", primary: true },
  "chart-edit": {
    label: "Edit…",
    icon: "pencil",
    tooltip: "Edit or remove a chart",
  },
  "chart-remove": { label: "Remove…", icon: "trash-2" },
  // The same three for a journal note's own charts region. Separate actions
  // rather than a shared one with a mode: they drive a different manager over
  // a different fence, and a button whose meaning depended on which fence it
  // happened to be rendered in is the sort of thing that is fine until the
  // day someone writes one by hand on the wrong note.
  "journal-chart-add": { label: "Add chart", icon: "plus", primary: true },
  "journal-chart-edit": {
    label: "Edit…",
    icon: "pencil",
    tooltip: "Edit or remove a chart",
  },
  "journal-chart-remove": { label: "Remove…", icon: "trash-2" },
};


// Derive a button label for a journal type's sub-action from the type's own
// definition, so a Custom Journal's buttons are labelled from its nouns/kinds
// without any per-type entries in BUTTON_LABELS.
export function journalSubActionSpec(
  type: JournalType,
  sub: string
): ButtonSpec {
  // The two container levels are labelled with the bare noun — `+ Subject`,
  // `+ Topic` — because the plus is the verb. Everything below keeps "New",
  // because those buttons lead with the kind's own identity emoji instead of a
  // plus, and "📖 Lesson" is a noun with a picture next to it rather than
  // something you can press.
  //
  // The type name is left off for a separate and older reason: the button sits
  // in that type's own header bar with the name six pixels to its left, so
  // repeating it produced labels like "New Custom Journal 1 Section" — an accent
  // pill running half the bar's width to say what the bar already said. The
  // command-palette entries, which have no bar to sit in, still carry the type
  // name (see main.ts).
  if (sub === "new-journal" || sub === "new-top") {
    return { label: type.levels[0].noun, icon: "plus", primary: true };
  }
  if (sub === "new-topic" || sub === "new-container") {
    const child = type.levels[1];
    // `plus`, not `folder-plus`. The distinction it drew — this one makes a
    // folder, that one makes a folder — is true of both levels and interesting
    // about neither, and it made a level and the level below it look like two
    // unrelated controls.
    return { label: child ? child.noun : "Item", icon: "plus" };
  }
  // Only reachable from a hand-edited homepage that still names
  // `button:<type>:refresh`; nothing emits it as of 2.13.8. Labelled "Refresh
  // all" to match the button that replaced it, because it does the same thing
  // — rebuildJournalHome rewrites every type, not just this one — and the bare
  // "Refresh" beside a type name was exactly the false per-type scope the
  // consolidation removed. runJournalAction still routes it.
  if (sub === "refresh") return { label: "Refresh all", icon: "refresh-cw" };
  if (sub === "new-page") {
    // Labelled from whichever kind of this type carries pages, so a journal
    // that calls them Sections says so.
    const label = type.kinds.find((k) => k.pages)?.pages?.label ?? "Page";
    return { label: `New ${label}`, icon: "file-plus", primary: true };
  }
  if (sub.startsWith("new-")) {
    const kindId = sub.slice("new-".length);
    const kind = type.kinds.find((k) => k.id === kindId);
    if (kind) {
      // The kind's emoji is the type's own configured identity glyph (set
      // in Settings → Custom Journals) — that's personalization, not
      // chrome, so it stays a literal emoji rather than a Lucide icon.
      // `primary` for every kind, not just the type's first.
      //
      // It WAS `kind.id === type.kinds[0]?.id`, and that was right when it was
      // written: several create buttons shared one toolbar under the note
      // title, and exactly one of them being tinted is what a toolbar wants.
      // Since 2.56 each sits alone in its own section header — Lessons draws
      // one, Practice draws one — and the rule tinted a section's action and
      // not its neighbour's, for a reason (which kind happens to be listed
      // first in Settings) that is invisible on the page. It read as two
      // sections of the same shape disagreeing about how important they are.
      //
      // §1.2 is "at most ONE tinted button per section", and one button per
      // section satisfies it whichever way this goes. A hand-written note that
      // puts two create buttons in one bar now gets two tinted peers, which is
      // what two create actions of equal standing should look like.
      // THE ONE PLACE A BUTTON CARRIES AN EMOJI, and the rule behind it:
      // a button whose glyph names a THING the reader configured keeps their
      // glyph; a button whose glyph names an ACTION takes a Lucide icon.
      //
      // `kind.emoji` is the reader's own choice for this note kind, set in
      // Settings and shown wherever that kind appears. Swapping it for
      // `file-plus` would discard a decision they made — the same argument
      // 2.55.4 used when it declined to convert `JournalSection.icon`, and the
      // same line §5.3 draws between the plugin's chrome and the reader's data.
      //
      // Everything in BUTTON_LABELS is an action — add, edit, remove, refresh,
      // navigate — so every one of them carries `icon`. The split already held
      // before it was written down; test/appearance.test.ts keeps it holding.
      return {
        label: `New ${kind.label}`,
        emoji: kind.emoji,
        primary: true,
      };
    }
  }
  return { label: sub };
}


export function journalButtonSpec(
  deps: EntryControlHost,action: string, arg: string): ButtonSpec | null {
  const type = getJournalType(deps.plugin, action);
  if (!type) return null;
  const [sub] = arg.split(":");
  return journalSubActionSpec(type, sub);
}


export function logButtonSpec(
  deps: EntryControlHost,arg: string): ButtonSpec {
  const [id, deltaStr] = arg.split(":");
  const def = getTracker(deps.plugin, id);
  const delta = Number(deltaStr);
  if (!def || Number.isNaN(delta)) {
    return { label: `log:${arg}`, icon: "alert-triangle" };
  }
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const magnitude = Math.abs(delta);
  const unit = def.unit ? ` ${def.unit}` : "";
  return { label: `${sign}${magnitude}${unit}` };
}


export function hostContainerName(
  deps: EntryControlHost,
  type: JournalType,
  ctx: MarkdownPostProcessorContext
): string {
  const file = deps.fileOf(ctx);
  const parent = file?.parent;
  if (!file || !parent) return "";
  if (file.basename !== parent.name) return "";
  const root = normalizePath(type.root);
  if (normalizePath(parent.parent?.path ?? "") !== root) return "";
  return parent.name;
}


export async function runJournalAction(
  deps: EntryControlHost,
  type: JournalType,
  sub: string,
  arg: string,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  const { journals } = deps.plugin;
  if (sub === "new-journal" || sub === "new-top") {
    return void journals.newTopLevel(type);
  }
  if (sub === "new-topic" || sub === "new-container") {
    const folder = arg || hostContainerName(deps, type, ctx);
    return void journals.newContainer(type, 1, folder || undefined);
  }
  if (sub === "refresh") {
    const ok = await journals.rebuildJournalHome();
    if (ok) notify.ok("Journals refreshed!");
    return;
  }
  // `new-page` before the generic `new-<kind>` branch: a page is
  // deliberately not one of the type's kinds (see JournalPages), so falling
  // through would look up a kind that cannot exist and report it as unknown.
  if (sub === "new-page") {
    return void journals.newPage(type, arg || ctx.sourcePath);
  }
  if (sub.startsWith("new-")) {
    const kindId = sub.slice("new-".length);
    return void journals.newNote(type, kindId, arg || undefined);
  }
  new Notice(`Unknown ${type.name} action: ${sub}`);
}


export async function runAction(
  deps: EntryControlHost,
  action: string,
  arg: string,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  const { diary } = deps.plugin;

  // Type-scoped journal buttons: `button:<typeId>:<sub>[:folderArg]`.
  // `action` is the type id, `arg` is "<sub>[:folderArg]".
  const journalType = getJournalType(deps.plugin, action);
  if (journalType) {
    const colon = arg.indexOf(":");
    const sub = colon === -1 ? arg : arg.slice(0, colon);
    const subArg = colon === -1 ? "" : arg.slice(colon + 1);
    return runJournalAction(deps, journalType, sub, subArg, ctx);
  }

  switch (action) {
    // The Journals container's one rebuild. Not type-scoped: it rewrites
    // every registered type's sub-section in a single pass, which is what
    // rebuildJournalHome has always done — the per-type Refresh buttons it
    // replaces were all calling exactly this.
    case "refresh-all":
    case "refresh": {
      const ok = await deps.plugin.journals.rebuildJournalHome();
      if (ok) notify.ok("Journals refreshed!");
      return;
    }
    case "today":
      return void diary.openToday();
    case "this-month":
      return void diary.openThisMonth();
    case "new-diary":
      return void diary.newDiaryEntry();
    case "new-monthly":
      return void diary.newMonthlyEntry();
    // 2.57: a real note about ONE week or quarter, as opposed to the single
    // dashboard of the same name that re-scopes in place. The dashboards are
    // where these buttons live, because that is where a reader is looking at a
    // period and decides it is worth keeping.
    case "new-week":
      return void diary.newWeekEntry(ctx.sourcePath);
    case "new-month":
      return void diary.newMonthEntry(ctx.sourcePath);
    case "new-quarter":
      return void diary.newQuarterEntry(ctx.sourcePath);
    case "new-year":
      return void diary.newYearEntry(ctx.sourcePath);
    case "week-prev":
      return diary.shiftPeriod(ctx.sourcePath, "week-start", "isoWeek", -1, false);
    case "week-this":
      return diary.shiftPeriod(ctx.sourcePath, "week-start", "isoWeek", 0, true);
    case "week-next":
      return diary.shiftPeriod(ctx.sourcePath, "week-start", "isoWeek", 1, false);
    case "month-prev":
      return diary.shiftPeriod(ctx.sourcePath, "month-start", "month", -1, false);
    case "month-this":
      return diary.shiftPeriod(ctx.sourcePath, "month-start", "month", 0, true);
    case "month-next":
      return diary.shiftPeriod(ctx.sourcePath, "month-start", "month", 1, false);
    case "tracker-add":
      return void deps.plugin.entryTrackers.addTracker(
        ctx.sourcePath,
        arg || undefined
      );
    case "tracker-remove":
      return void deps.plugin.entryTrackers.removeTracker(
        ctx.sourcePath,
        arg || undefined
      );
    case "chart-add":
      return void deps.plugin.charts.addChart(ctx.sourcePath);
    case "chart-edit":
      return void deps.plugin.charts.editChart(ctx.sourcePath, arg || undefined);
    case "chart-remove":
      return void deps.plugin.charts.removeChart(ctx.sourcePath, arg || undefined);
    case "journal-chart-add":
      return void deps.plugin.journalCharts.addChart(ctx.sourcePath);
    case "journal-chart-edit":
      return void deps.plugin.journalCharts.editChart(
        ctx.sourcePath,
        arg || undefined
      );
    case "journal-chart-remove":
      return void deps.plugin.journalCharts.removeChart(
        ctx.sourcePath,
        arg || undefined
      );
    default:
      new Notice(`Unknown Almanac action: ${action}`);
  }
}


export function buildButton(
  deps: EntryControlHost,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const colon = rest.indexOf(":");
  const action = colon === -1 ? rest : rest.slice(0, colon);
  const arg = colon === -1 ? "" : rest.slice(colon + 1);

  const spec =
    action === "log"
      ? logButtonSpec(deps, arg)
      : journalButtonSpec(deps, action, arg) ??
        BUTTON_LABELS[action] ?? { label: action };
  const wrap = createSpan({ cls: "journal-widget journal-button" });
  const btn = wrap.createEl("button");
  btn.addClass("journal-btn");
  if (spec.primary) btn.addClass("mod-cta");
  if (spec.subtle) btn.addClass("journal-btn-subtle");
  if (spec.ghost) btn.addClass("journal-btn-ghost");

  if (spec.icon) {
    const iconEl = btn.createSpan({ cls: "journal-btn-icon" });
    setIcon(iconEl, spec.icon);
  } else if (spec.emoji) {
    btn.createSpan({ cls: "journal-btn-emoji", text: spec.emoji });
  }
  // Ghost buttons are icon-only (matches the calendar's own prev/next
  // arrows) — the label still becomes the tooltip/aria text below.
  if (!spec.ghost) btn.createSpan({ cls: "journal-btn-label", text: spec.label });
  const hover = spec.tooltip ?? spec.label;
  if (hover) {
    btn.setAttr("aria-label", hover);
    btn.setAttr("title", hover);
  }

  if (action === "log") {
    // Local optimistic state, same reasoning as the stepper: reading
    // metadataCache back right after a write can return the pre-write
    // value, so a second quick tap would undercount. Track the last
    // value this button itself set instead of re-reading the cache.
    const [id, deltaStr] = arg.split(":");
    const def = getTracker(deps.plugin, id);
    const delta = Number(deltaStr);
    let known: number | null = (() => {
      const cur = deps.currentValue(ctx, id);
      const n = cur == null || cur === "" ? NaN : Number(cur);
      return Number.isFinite(n) ? n : null;
    })();

    btn.addEventListener("click", () => {
      if (!def || Number.isNaN(delta)) {
        new Notice(`Unknown tracker or delta: log:${arg}`);
        return;
      }
      let next = (known ?? def.min ?? 0) + delta;
      if (def.min != null) next = Math.max(def.min, next);
      if (def.max != null) next = Math.min(def.max, next);
      next = Math.round(next * 1e6) / 1e6;
      known = next;
      void deps.write(ctx, id, next);
      const unit = def.unit ? ` ${def.unit}` : "";
      new Notice(`${def.label}: ${next}${unit}`);
    });
    return wrap;
  }

  btn.addEventListener("click", () => {
    void runAction(deps, action, arg, ctx);
  });
  return wrap;
}
