// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The journal chart region — `journal-chart` / `journal-breakdown` as a
// managed area of a note rather than as directives written by hand.
//
// This is charts.ts's chart region, copied deliberately. A note owns its
// journal charts inside a single ```chronoanvil-journal-charts fence whose
// `jchart:` lines are the source of truth, and the Add / Edit… / Remove…
// toolbar in that fence's header bar splices them. Everything down to the
// key allocation and the "preserve the header line, rewrite the rest" write
// is the shape the diary's Trends section has had since 2.1.
//
// WHY A SECOND FENCE RATHER THAN THE DIARY'S. The two look alike and are not
// the same thing, and the roadmap's standing constraint is the reason: a
// diary chart goes through the chart system, which means a range, a window
// and a scope resolved from the tracker's class. A journal chart has none of
// those — no range at all, and a scope that comes from the *host note's
// folder*, which is exactly what `isChartable` cannot promise and why
// `scopesFor` returns nothing for a journal tracker. Sharing one fence would
// mean a parser discriminating two spec shapes and one Add button opening two
// different editors, on the strength of a resemblance. Parallel structure is
// cheaper than a union, and it keeps the gate honest.
//
// WHAT A SPEC IS NOT is a second renderer. A `jchart:` line is turned back
// into the ordinary directive it names — `journal-chart:<tracker>|<label>` —
// and handed to the widget processor's own directive path. The region manages
// a *list*; it draws nothing itself. So a chart added here and the same chart
// written by hand are the same object taking the same refusal path, and there
// is no second implementation to drift.

import { App, Notice } from "obsidian";
import { cleanLabel, getFile } from "../core/util";

export type JournalChartShape = "trend" | "breakdown";

export interface JournalChartSpec {
  // Opaque, unique within the note; the argument the Edit…/Remove… buttons
  // carry, exactly as ChartSpec.key is.
  key: string;
  shape: JournalChartShape;
  // TrackerDef.id.
  tracker: string;
  // Optional title override. Absent, not empty — see serializeJournalChartSpec.
  label?: string;
}

export const JOURNAL_CHARTS_FENCE = "```chronoanvil-journal-charts";

// `jchart:<key>:<shape>:<tracker>[|Label]`.
//
// The shape is anchored to its known set, the same trick CHART_TAG uses to
// keep a tracker id containing a colon parseable. Here it also happens to be
// enough on its own: the tracker is the last positional token, so it can run
// greedily to the bar or the end of the line without a second anchor to bound
// it on the right.
const JCHART_TAG = /^jchart:([A-Za-z0-9_-]+):(trend|breakdown):([^|]+?)(?:\|(.*))?$/;

// The directive a spec stands for. THE reason this module renders nothing:
// a spec is a managed way of writing a line that already had a meaning.
export function journalChartDirective(spec: JournalChartSpec): string {
  const kind = spec.shape === "trend" ? "journal-chart" : "journal-breakdown";
  const label = cleanLabel(spec.label ?? "");
  return `${kind}:${spec.tracker}${label ? `|${label}` : ""}`;
}

// The sanitiser, which lives in `core/util.ts` since 4.45 because the diary's
// charts need the same rule and a directive line is not a journal idea. Named
// here so this module's own callers — and the tests that pin its behaviour —
// still read it where the specs are.
export { cleanLabel };

// NO TRAILING BAR when there is no title, and that is correctness rather than
// tidiness — both in the stored `jchart:` line and in the directive it
// becomes. The widget parser reads everything after the first `|` as the
// label, so a trailing bar yields an empty string where an absent bar yields
// null, and the two are read differently downstream: the trend keeps the empty
// string and draws no title at all, while the breakdown renders an empty title
// row and lowercases "" into its empty-state copy. Absent and empty are
// different answers.
export function serializeJournalChartSpec(s: JournalChartSpec): string {
  const label = cleanLabel(s.label ?? "");
  return `jchart:${s.key}:${s.shape}:${s.tracker}${label ? `|${label}` : ""}`;
}

// Parse `jchart:` lines (the body of a ```chronoanvil-journal-charts fence) into
// specs. Shared with the widget processor, which hands it the raw fence source.
// Anything else in the fence — the `header:` title line, blank lines, a
// comment — is skipped rather than rejected, so the fence stays a place the
// reader may keep things.
//
// KEYS ARE MADE UNIQUE HERE. `nextJournalChartKey` guarantees uniqueness for
// anything the toolbar writes, but a `jchart:` line is documented as
// hand-writable and the obvious way to get a second chart is to copy the first
// — which copies its key. Two specs sharing one made the key useless as an
// address: Edit… resolved to whichever came first and Remove… deleted *both*,
// since the manager filters by key. Renaming the later duplicate is the
// smallest repair that keeps every chart addressable, and it costs nothing on
// a region the plugin wrote.
export function parseJournalChartDirectives(lines: string[]): JournalChartSpec[] {
  const specs: JournalChartSpec[] = [];
  const used = new Set<string>();
  for (const line of lines) {
    const m = line.trim().match(JCHART_TAG);
    if (!m) continue;
    const label = m[4] != null ? cleanLabel(m[4]) : "";
    let key = m[1];
    if (used.has(key)) {
      let n = 2;
      while (used.has(`${key}-${n}`)) n++;
      key = `${key}-${n}`;
    }
    used.add(key);
    specs.push({
      key,
      shape: m[2] as JournalChartShape,
      tracker: m[3].trim(),
      ...(label ? { label } : {}),
    });
  }
  return specs;
}

// Locate the note's single journal-charts fence (open/close line indices).
// Scanning for the tag rather than requiring a position keeps it tolerant of
// wherever in the note the reader has put the section.
export function findJournalChartsFence(
  lines: string[]
): { open: number; close: number } | null {
  const open = lines.findIndex((l) => l.trim() === JOURNAL_CHARTS_FENCE);
  if (open === -1) return null;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === "```") return { open, close: i };
  }
  return null;
}

export function parseJournalChartRegion(lines: string[]): JournalChartSpec[] {
  const fence = findJournalChartsFence(lines);
  if (!fence) return [];
  return parseJournalChartDirectives(lines.slice(fence.open + 1, fence.close));
}

// Smallest unused `j<N>` key. `j`, not `c`, so a key is legible about which
// region it belongs to when it turns up as a button argument.
export function nextJournalChartKey(existing: JournalChartSpec[]): string {
  const used = new Set(existing.map((s) => s.key));
  let n = 1;
  while (used.has(`j${n}`)) n++;
  return `j${n}`;
}

// Rewrite one note's journal-charts fence from the given specs.
//
// Only the fence's `jchart:` lines are the plugin's. EVERYTHING ELSE IS KEPT,
// in the order it was written. The `header:` line that makes the section
// self-titled is the obvious case — the reader may have retitled it, and a
// rewrite that helpfully restored "📊 Charts" every time would be the plugin
// arguing with them — but it was also, until 2.43, the *only* case: a filter
// for `header:` meant Add chart silently deleted a comment or a blank line
// somebody had put in the fence. The parser's own contract says the fence
// "stays a place the reader may keep things", and a writer that drops those
// things makes that sentence false.
//
// New specs land after whatever was preserved, which is where the old ones
// were. Pure line-splicing, so nothing outside the fence is touched.
export function spliceJournalChartRegion(
  lines: string[],
  specs: JournalChartSpec[]
): string[] | null {
  const fence = findJournalChartsFence(lines);
  if (!fence) return null;
  const preserved = lines
    .slice(fence.open + 1, fence.close)
    .filter((l) => !JCHART_TAG.test(l.trim()));
  return [
    ...lines.slice(0, fence.open),
    JOURNAL_CHARTS_FENCE,
    ...preserved,
    ...specs.map(serializeJournalChartSpec),
    "```",
    ...lines.slice(fence.close + 1),
  ];
}

export async function writeJournalChartRegion(
  app: App,
  notePath: string,
  specs: JournalChartSpec[]
): Promise<void> {
  const file = getFile(app, notePath);
  if (!file) return;
  const original = await app.vault.read(file);
  const updated = spliceJournalChartRegion(original.split("\n"), specs);
  if (updated == null) {
    new Notice("No charts section on this note.");
    return;
  }
  const text = updated.join("\n");
  if (text !== original) await app.vault.modify(file, text);
}
