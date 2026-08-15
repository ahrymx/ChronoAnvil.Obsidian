// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── Per-entry trackers ───────────────────────────────────────────────────
//
// Settings → Trackers decides which trackers land on *every new entry* (it
// writes the daily template's managed region). This module is the other half:
// the trackers a *single* note carries, edited in place from the note itself.
//
// The distinction matters because a daily template is a compromise. Mood and
// sleep belong on every entry; "kilometres run", "weight", "migraine" belong
// on the handful of entries where they actually happened. Before this existed
// the only way to log an occasional thing was to put its widget on all 365
// entries a year and leave 350 of them blank — so the template grew until it
// was mostly noise, or the tracker was never created at all.
//
// A note's tracker list is the run of `tracker:<id>` / `sleep` directive lines
// inside its ```almanac fence — the same lines the template sync writes, and
// the same lines the widget renderer reads. There is no per-note state
// anywhere else: what a note shows *is* what its fence says, so a note stays
// meaningful when read as plain text, survives a plugin uninstall as legible
// markdown, and is fixable by hand.
//
// The registry (Settings) still owns every tracker's *definition* — type,
// range, label, options. Adding one to a note only ever adds a reference to a
// definition that already exists; nothing here can invent a tracker.

import { App, Notice, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  FENCE_CLOSE,
  FENCE_OPEN,
  TRACKER_MARK_END,
  TRACKER_MARK_START,
} from "../core/constants";
import type {
  EntryPathConfig,
  JournalRootRef,
  TrackerDef,
  TrackerSurface,
} from "./trackers";
import {
  CLASS_DEFS,
  TRACKER_CLASSES,
  classifyNote,
  describeSurface,
  describeSurfaceLabel,
  surfaceAdmits,
  surfaceFolders,
  surfaceKey,
} from "./trackers";
import {
  journalTypeOfNote,
  kindAllowsTracker,
  recognisedTypeValues,
  registeredJournalTypes,
} from "../journals/journal";
import type { JournalType } from "../journals/journal";
import { filesUnder, frontmatterOf, getFile, normaliseTypeValue } from "../core/util";

// The bare directive standing for the coupled Wake-Up + Bedtime control. It is
// not `tracker:<id>` because it renders *two* properties through one widget —
// see widgets.ts::buildSleep.
export const SLEEP_DIRECTIVE = "sleep";

export const TRACKER_DIRECTIVE_PREFIX = "tracker:";

export function trackerDirective(id: string): string {
  return `${TRACKER_DIRECTIVE_PREFIX}${id}`;
}

// Is this fence line one of the daily-note logging modules? Deliberately not
// "does it start with tracker:" alone — the coupled `sleep` control is one of
// them and has its own bare directive.
export function isTrackerDirective(line: string): boolean {
  const t = line.trim();
  return t === SLEEP_DIRECTIVE || t.startsWith(TRACKER_DIRECTIVE_PREFIX);
}

// The tracker id a `tracker:<id>` directive names, ignoring an inline
// `|Label` override so a note that relabels a widget still matches the
// registry entry behind it. Null for `sleep` and for anything else.
export function directiveTrackerId(line: string): string | null {
  const t = line.trim();
  if (!t.startsWith(TRACKER_DIRECTIVE_PREFIX)) return null;
  const rest = t.slice(TRACKER_DIRECTIVE_PREFIX.length);
  const bar = rest.indexOf("|");
  return (bar === -1 ? rest : rest.slice(0, bar)).trim() || null;
}

// The raw, pre-registry widget directives that edit a frontmatter property
// directly: `slider:<prop>[:min:max:step]`, `select:<prop>:<options>`,
// `time:<prop>` and `date:<prop>`. Each names its property as the first
// segment after the kind.
//
// These matter to the picker for one reason: a note carrying one of them is
// already editing that property, so offering a `tracker:` for the same
// property would put two controls on one value — the same collision the
// already-present check exists to prevent, arriving by a different route.
//
// It is not hypothetical. The Study templates spelled Confidence and Status
// out this way before they became registry trackers, and `scaffold.ts` never
// overwrites a template that already exists — so a vault set up before the
// change keeps writing notes with `slider:confidence` on them, and the picker
// would happily offer Confidence on every one.
const RAW_PROPERTY_KINDS = ["slider", "select", "time", "date"];

export function directiveRawProperty(line: string): string | null {
  const t = line.trim();
  const colon = t.indexOf(":");
  if (colon === -1) return null;
  if (!RAW_PROPERTY_KINDS.includes(t.slice(0, colon))) return null;
  // Strip an inline `|Label` override, then take the first segment — the
  // property — and leave whatever options follow it.
  const bar = t.indexOf("|");
  const rest = (bar === -1 ? t.slice(colon + 1) : t.slice(colon + 1, bar)).trim();
  return rest.split(":")[0].trim() || null;
}

// ── Locating the region ──────────────────────────────────────────────────

interface Fence {
  open: number; // index of the ```almanac line
  close: number; // index of its closing ``` line
}

// Every ```almanac fence in a note, in document order. Unterminated fences end
// the scan rather than being guessed at — a half-written block is the user's
// business, not something to splice into.
function almanacFences(lines: string[]): Fence[] {
  const fences: Fence[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === FENCE_OPEN) {
      const close = lines.findIndex((l, j) => j > i && l.trim() === FENCE_CLOSE);
      if (close === -1) break;
      fences.push({ open: i, close });
      i = close + 1;
    } else {
      i++;
    }
  }
  return fences;
}

// Where a note's tracker directives live, and where a new one may be written.
// `bodyStart`/`bodyEnd` bound the writable span (bodyEnd is exclusive), so a
// splice can never touch the markers, the fence, or a `nav` directive sharing
// the block.
export interface TrackerRegion {
  fenceOpen: number;
  fenceClose: number;
  bodyStart: number;
  bodyEnd: number;
  // Whether the span is delimited by the `# almanac:trackers:start/end`
  // comments (as the shipped template writes it) or is just a fence that
  // happens to hold tracker directives (a hand-built note).
  marked: boolean;
}

function fenceBodyHas(lines: string[], f: Fence, test: (l: string) => boolean): boolean {
  return lines.slice(f.open + 1, f.close).some((l) => test(l));
}

// Find the span a note's tracker directives occupy.
//
// Preference order, and why: a marked region is unambiguous and is what the
// template sync itself writes, so it wins. Failing that, a fence already
// holding tracker directives is clearly the tracker block even without
// markers. A `nav`-bearing fence is only accepted when it *already* holds
// trackers (a deliberately hand-merged block) — we never elect one as a fresh
// home, because dropping logging widgets into the navigation strip is exactly
// the mix-up the template sync guards against.
export function locateTrackerRegion(lines: string[]): TrackerRegion | null {
  const fences = almanacFences(lines);

  for (const f of fences) {
    const body = lines.slice(f.open + 1, f.close);
    const s = body.findIndex((l) => l.trim() === TRACKER_MARK_START);
    const e = body.findIndex((l) => l.trim() === TRACKER_MARK_END);
    if (s !== -1 && e !== -1 && e > s) {
      return {
        fenceOpen: f.open,
        fenceClose: f.close,
        bodyStart: f.open + 1 + s + 1,
        bodyEnd: f.open + 1 + e,
        marked: true,
      };
    }
  }

  for (const f of fences) {
    if (!fenceBodyHas(lines, f, isTrackerDirective)) continue;
    return {
      fenceOpen: f.open,
      fenceClose: f.close,
      bodyStart: f.open + 1,
      bodyEnd: f.close,
      marked: false,
    };
  }

  return null;
}

// The tracker directives inside the note's marked region — the span the picker
// splices into. Narrower than noteTrackerDirectives below, and the right
// question only when you are about to *write*.
export function regionTrackerDirectives(lines: string[]): string[] {
  const region = locateTrackerRegion(lines);
  if (!region) return [];
  return lines
    .slice(region.bodyStart, region.bodyEnd)
    .map((l) => l.trim())
    .filter(isTrackerDirective);
}

// Every tracker directive the note actually renders, in document order,
// wherever it sits — inside the marked region, elsewhere in the banner's
// fence, or in a fence of its own further down.
//
// This, not the region, is the answer to "what does this note already show?",
// and the distinction is not academic. A note can legitimately carry a tracker
// outside the region: a template that predates the managed markers, a widget
// hand-placed in a second block, a line pasted from another note. The widget
// renderer draws every one of them — it walks fences, not regions — so a
// picker that only consulted the region would offer a tracker the reader can
// already see, and adding it would put a second control on one property, which
// is the exact collision the exclusion exists to prevent.
//
// Symmetrically, the remove picker lists these rather than the region's, so a
// widget a note displays can always be taken off it again.
export function noteTrackerDirectives(lines: string[]): string[] {
  const out: string[] = [];
  for (const f of almanacFences(lines)) {
    for (const line of lines.slice(f.open + 1, f.close)) {
      const t = line.trim();
      if (isTrackerDirective(t)) out.push(t);
    }
  }
  return out;
}

// Every frontmatter property the note's widgets already edit, whatever form
// the directive takes — a registry `tracker:`, the coupled `sleep` module, or
// one of the raw property widgets. This is what the picker filters against:
// the question is "does this note already have a control for that value?",
// and the answer must not depend on which spelling put it there.
export function noteEditedProperties(
  trackers: TrackerDef[],
  lines: string[]
): string[] {
  const out = new Set<string>();
  for (const f of almanacFences(lines)) {
    for (const line of lines.slice(f.open + 1, f.close)) {
      const t = line.trim();
      if (isTrackerDirective(t)) {
        for (const prop of directiveProperties(trackers, t)) out.add(prop);
        continue;
      }
      const raw = directiveRawProperty(t);
      if (raw) out.add(raw);
    }
  }
  return [...out];
}

// The directives that open a banner — the card a note's logging grid is welded
// beneath. A diary entry opens one with `entry-header`, a journal note with
// `journal-header`; both render as one fence, one container, one card (see
// .journal-entry-banner / .journal-study-banner in styles.css).
//
// Both are listed because the question every caller here asks is "does this
// note have a banner to put trackers in?", and that is one question asked of
// two surfaces. Matching only `entry-header` is why the first "+ Add tracker"
// on a study note used to write a *new* fence below the banner instead of a
// region inside it: createTrackerRegion fell through to its no-banner path,
// which is correct for a note with no banner and wrong for one whose banner it
// simply didn't recognise.
//
// Matched as whole lines. The `entry-header:home,week,month` argument form
// (links, before they moved to a standalone `links:` block) and the
// `study-header` spelling of the journal banner both went in 2.41 along with
// the rest of the pre-userbase compatibility surface.
const BANNER_DIRECTIVES = ["entry-header", "journal-header"];

function isBannerDirective(line: string): boolean {
  return BANNER_DIRECTIVES.includes(line.trim());
}

// The fence that renders this note's banner, if it has one.
function bannerFence(lines: string[], fences: Fence[]): Fence | null {
  return fences.find((f) => fenceBodyHas(lines, f, isBannerDirective)) ?? null;
}

// Does this note already carry a directive matching `test`?
//
// Scoped to the bodies of its ```almanac fences rather than run over the raw
// text, because a directive named in prose is not a directive — the shipped
// documentation note quotes half the catalogue, and a plain `includes` would
// read every one of those mentions as the widget itself being present.
//
// The question an additive splice has to ask before it splices: appending a
// section a note already has is the one way an append-only operation can still
// be wrong (see promoteToDashboard, and addableSections in section-insert.ts,
// which withholds an already-present section for the same reason).
export function noteHasDirective(
  lines: string[],
  test: (line: string) => boolean
): boolean {
  return almanacFences(lines).some((f) => fenceBodyHas(lines, f, test));
}

// Splice a block of lines in just below the note's banner, or at the top of
// the body when it has none. The insertion point for a section that belongs
// near the top of a dashboard rather than at the end of it — a page index
// under a lesson's own banner, most obviously.
//
// Additive by construction: it inserts and never replaces, which is what
// promoting a note you have already written into has to be. Rewriting a long
// lesson with a dashboard template would be destructive in exactly the case
// that matters, since a long lesson is the one worth splitting.
export function insertBelowBanner(lines: string[], block: string[]): string[] {
  // Nothing to insert is nothing to do, rather than a blank line to insert.
  // A caller composing the block from what a note is missing (see
  // pagesSectionBlock) legitimately arrives here with none of it, and a note
  // that already has the section should come back untouched.
  if (block.length === 0) return lines;
  const fences = almanacFences(lines);
  const banner = bannerFence(lines, fences);
  if (banner) {
    return [
      ...lines.slice(0, banner.close + 1),
      "",
      ...block,
      ...lines.slice(banner.close + 1),
    ];
  }
  // No banner: after the frontmatter, or at the very top.
  const fmEnd = lines[0]?.trim() === "---" ? lines.indexOf("---", 1) : -1;
  const at = fmEnd === -1 ? 0 : fmEnd + 1;
  return [...lines.slice(0, at), "", ...block, ...lines.slice(at)];
}

// Create an empty marked tracker region in a note that has none, so the first
// "Add tracker" on a note predating this feature (or written by hand) has
// somewhere to go instead of failing.
//
// Placed inside the note's banner fence when it has one — an `entry-header` on
// a diary entry, a `journal-header` on a journal note. That used to be forbidden
// — the rule was "never inside an existing fence", because picking one meant
// guessing which of the user's blocks was meant to hold trackers. Since 2.18.4
// the banner *is* that block by construction: the strip and the grid render as
// one card out of one fence, so writing the region anywhere else would put the
// note's trackers outside the banner that exists to hold them. Absent a banner
// the old behaviour stands — a fence of its own after the first block, or
// after the frontmatter on a note with no blocks.
export function createTrackerRegion(lines: string[]): string[] {
  const fences = almanacFences(lines);

  const banner = bannerFence(lines, fences);
  if (banner) {
    // Straight after the last directive in the banner's body, so the region
    // sits below the strip's own line rather than above it.
    return [
      ...lines.slice(0, banner.close),
      TRACKER_MARK_START,
      TRACKER_MARK_END,
      ...lines.slice(banner.close),
    ];
  }

  const block = [FENCE_OPEN, TRACKER_MARK_START, TRACKER_MARK_END, FENCE_CLOSE];

  let at: number;
  if (fences.length > 0) {
    at = fences[0].close + 1;
  } else {
    // Line 0 is `---` only when the note opens with frontmatter; the closing
    // `---` is the next one. Without frontmatter we land at the top.
    const fmEnd = lines[0]?.trim() === "---" ? lines.indexOf("---", 1) : -1;
    at = fmEnd === -1 ? 0 : fmEnd + 1;
  }

  return [...lines.slice(0, at), "", ...block, ...lines.slice(at)];
}

// ── Migration: fold a note's tracker fence into its entry banner ─────────
//
// Entries written before 2.18.4 carry two consecutive ```almanac fences — the
// `entry-header` strip, then the trackers. Obsidian renders each as its own
// block, so the banner cannot enclose the grid no matter how they are styled.
// This folds the second fence's body into the first, which is the whole of the
// change: the directives, their order and the markers are all preserved, and
// what moves is one pair of fence lines.
//
// Deliberately narrow. It fires only when the tracker fence is the *next* fence
// after the banner with nothing but blank lines between them — the shape the
// shipped template wrote. A note whose trackers sit further down, or that has
// prose between the two, is left alone: the reordering that would be needed
// there is a judgement about the note's layout, not a migration.
//
// Returns null when there is nothing to do, so a caller can skip the write.
export function mergeEntryFences(text: string): string | null {
  const lines = text.split("\n");
  const fences = almanacFences(lines);

  const banner = bannerFence(lines, fences);
  if (!banner) return null;
  // Already merged.
  if (fenceBodyHas(lines, banner, (l) => l.trim() === TRACKER_MARK_START)) return null;
  if (fenceBodyHas(lines, banner, isTrackerDirective)) return null;

  const next = fences.find((f) => f.open > banner.close);
  if (!next) return null;
  // Only blank lines may separate them.
  for (let i = banner.close + 1; i < next.open; i++) {
    if (lines[i].trim() !== "") return null;
  }

  const nextBody = lines.slice(next.open + 1, next.close);
  const isTrackerFence =
    nextBody.some((l) => l.trim() === TRACKER_MARK_START) ||
    nextBody.some(isTrackerDirective);
  if (!isTrackerFence) return null;

  const merged = [
    ...lines.slice(0, banner.close),
    ...nextBody,
    ...lines.slice(banner.close, banner.close + 1), // the banner's closing fence
    ...lines.slice(next.close + 1),
  ];

  const out = merged.join("\n");
  return out === text ? null : out;
}

// Split the tracker fence out of the entry banner across existing entries (4.20 / 4.23).
//
// In 4.20, the tracker grid became its own section and fence so that the banner
// is only the note's name, navigation and cog, and the tracker grid is its own card.
// Notes where the banner and trackers were merged into a single fence (from pre-4.20
// or the old mergeEntryFences migration) are split back into two fences.
//
// Returns null when already separated or when no combined banner+trackers fence exists.
export function splitEntryFences(text: string): string | null {
  const lines = text.split("\n");
  const fences = almanacFences(lines);

  const banner = bannerFence(lines, fences);
  if (!banner) return null;

  // If there's no tracker marker or tracker directive in the banner fence, it's already split.
  let trackerStartLine = -1;
  for (let i = banner.open + 1; i < banner.close; i++) {
    const l = lines[i].trim();
    if (l === TRACKER_MARK_START || isTrackerDirective(lines[i])) {
      trackerStartLine = i;
      break;
    }
  }

  if (trackerStartLine === -1) return null;

  // Split into banner fence (open .. trackerStartLine-1) and tracker fence (trackerStartLine .. close)
  const bannerBody = lines.slice(banner.open + 1, trackerStartLine);
  while (bannerBody.length > 0 && bannerBody[bannerBody.length - 1].trim() === "") {
    bannerBody.pop();
  }

  const trackerBody = lines.slice(trackerStartLine, banner.close);
  while (trackerBody.length > 0 && trackerBody[0].trim() === "") {
    trackerBody.shift();
  }

  const split = [
    ...lines.slice(0, banner.open + 1),
    ...bannerBody,
    "```",
    "",
    "```almanac",
    ...trackerBody,
    ...lines.slice(banner.close),
  ];

  const out = split.join("\n");
  return out === text ? null : out;
}

// Add a directive to a note's tracker region, after the last directive already
// there so the new module lands at the end of the grid rather than the middle.
// Returns null when the directive is already present (nothing to do) — the
// caller distinguishes that from a genuine failure.
export function insertTrackerDirective(
  lines: string[],
  directive: string
): string[] | null {
  const withRegion = locateTrackerRegion(lines) ? lines : createTrackerRegion(lines);
  const region = locateTrackerRegion(withRegion);
  if (!region) return null;

  // Dedupe against the whole note, not just the region: a directive already
  // rendering from another fence is already writing that property, and a
  // second copy would be two controls fighting over one value.
  if (noteTrackerDirectives(withRegion).includes(directive.trim())) return null;

  let at = region.bodyEnd;
  for (let i = region.bodyEnd - 1; i >= region.bodyStart; i--) {
    if (isTrackerDirective(withRegion[i])) {
      at = i + 1;
      break;
    }
  }
  return [...withRegion.slice(0, at), directive, ...withRegion.slice(at)];
}

// Drop a directive from a note. The marked region is tried first, then any
// other almanac fence — because the × is drawn on whatever the note renders,
// and the renderer walks fences rather than regions, so a widget outside the
// region must still be removable by the control sitting on it.
//
// Only ever inside a fence, and only the first match: an identical line in the
// note's prose (a quoted example, say) is never touched. Returns null when
// there was nothing to remove.
export function removeTrackerDirective(
  lines: string[],
  directive: string
): string[] | null {
  const target = directive.trim();
  const drop = (i: number): string[] => [
    ...lines.slice(0, i),
    ...lines.slice(i + 1),
  ];

  const region = locateTrackerRegion(lines);
  if (region) {
    for (let i = region.bodyStart; i < region.bodyEnd; i++) {
      if (lines[i].trim() === target) return drop(i);
    }
  }
  for (const f of almanacFences(lines)) {
    for (let i = f.open + 1; i < f.close; i++) {
      if (lines[i].trim() === target) return drop(i);
    }
  }
  return null;
}

// ── Which surface this note presents ─────────────────────────────────────

// Every registered journal type's id and root folder. The roots are settings
// values resolved through each type's `root(plugin)`, so this is where the
// live registry meets the pure classifier.
export function journalRootRefs(plugin: AlmanacPlugin): JournalRootRef[] {
  return registeredJournalTypes(plugin).map((t) => ({
    typeId: t.id,
    root: t.root,
    types: [...recognisedTypeValues(t)],
  }));
}

// plugin.settings.paths plus the journal roots — the config classifyNote and
// surfaceFolders both want. Built fresh per call rather than cached: a journal
// type can be added, renamed or re-rooted from Settings at any time, and a
// stale root would silently misclassify every note under it.
export function surfacePathConfig(plugin: AlmanacPlugin): EntryPathConfig {
  return { ...plugin.settings.paths, journalRoots: journalRootRefs(plugin) };
}

// The surface of the note at `notePath`, or null when it is neither a diary
// entry nor inside a journal type. Thin: the decision itself is pure
// (trackers.ts::classifyNote) so it is testable and so every caller reaches
// the same answer; this only fetches the inputs it needs from Obsidian.
//
// The frontmatter is read through the metadata cache rather than by parsing
// the file, which matters for the widget renderer — it asks this on every
// repaint and must not do file I/O to answer.
export function noteSurfaceOf(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string
): TrackerSurface | null {
  const file = getFile(app, notePath);
  const fm = file ? frontmatterOf(app, file) : {};
  return classifyNote(
    surfacePathConfig(plugin),
    notePath,
    fm["journal"],
    fm["type"]
  );
}

// The note's journal type and its `type` frontmatter value, for the picker's
// kind gate. Null for a note outside every journal root, which leaves the
// picker at its type-level answer — the permissive one.
export function noteKindOf(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string
): { type: JournalType; kindId: string | null } | null {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return null;
  const type = journalTypeOfNote(plugin, notePath);
  if (!type) return null;
  const raw = app.metadataCache.getFileCache(file)?.frontmatter?.["type"];
  // Normalised, like every other reader of this property. Passing the raw
  // string through meant `type: Lesson` resolved the journal type (which does
  // normalise) but not the kind, so kindAllowsTracker found nothing, fell
  // through to permissive, and the per-kind picker filter quietly stopped
  // applying.
  return { type, kindId: normaliseTypeValue(raw) };
}

// Resolve a journal type id to its display name, for the prose in a mismatch
// message or a reclassification prompt.
export function journalTypeNamer(
  plugin: AlmanacPlugin
): (typeId: string) => string | undefined {
  const types = registeredJournalTypes(plugin);
  return (id) => types.find((t) => t.id === id)?.name;
}

// ── Which trackers a note may still gain ─────────────────────────────────

// One choice in the "Add tracker" picker.
export interface TrackerOption {
  directive: string;
  label: string;
  // Secondary text: enough to tell two similarly-labelled trackers apart, and
  // to show which frontmatter property a choice will write.
  detail: string;
}

const TYPE_NOUN: Record<string, string> = {
  number: "number",
  time: "time",
  date: "date",
  select: "choice",
};

// The registry entries a note doesn't already show, as picker options.
//
// `surface` is the surface of the note being added to — the rule the whole
// surface system exists for lands here. A daily tracker is not offered on a
// monthly review, and a Study tracker is not offered on a Cooking note,
// because the value it would collect there is not the measurement the tracker
// names: a Mood logged against July is not a Mood logged against the 14th, and
// averaging the two is arithmetic on unlike quantities. Refusing at the picker
// is the honest place to do it — the alternative is accepting the widget and
// discovering the problem later, in a chart, as a number that looks fine and
// isn't.
//
// A null `surface` means the note is neither a recognised diary entry nor
// inside a journal type (a hand-built page, a dashboard, a scratch file).
// Nothing is filtered in that case. The surface rule is about keeping notes
// from borrowing each other's modules; it is not a licence to police tracker
// grids wherever else someone has put one, and a note we can't classify is not
// a note we know enough about to refuse.
//
// Four cases are deliberately absent from the list:
//   • trackers of another surface — the rule above;
//   • the derived Sleep value — it is computed, never entered, and appears on
//     its own once the pair below is present;
//   • Wake-Up and Bedtime individually — they are offered as the single
//     coupled `sleep` module instead, matching how the template writes them,
//     and only while the Sleep superset is enabled in Settings;
//   • anything already in the note — adding a second widget for one property
//     gives two controls fighting over one value.
//
// Note this ignores `showInTemplate` entirely. That flag is about what *new*
// entries are seeded with; a tracker switched off there is precisely the
// occasional one this picker exists to reach. The surface is a boundary, the
// seed flag is a default — only the first is enforced here.
export function trackerOptions(
  trackers: TrackerDef[],
  sleepEnabled: boolean,
  present: string[],
  surface: TrackerSurface | null,
  // Properties the note already edits by some other means — a raw `slider:` or
  // `select:` widget from a template written before these became registry
  // trackers. Optional so the pure tests can pass directives alone; the live
  // caller passes noteEditedProperties.
  editedProperties: string[] = [],
  // The note's own journal type and `type` value, when it has them. Optional
  // so the pure tests (and every diary caller) can leave them out and get the
  // pre-2.36 answer unchanged.
  kindOf: { type: JournalType; kindId: string | null } | null = null
): TrackerOption[] {
  const has = new Set(present.map((d) => d.trim()));
  const hasId = new Set([
    ...present
      .map((d) => directiveTrackerId(d))
      .filter((id): id is string => id != null),
    ...editedProperties,
  ]);

  // Two gates, and they are different questions on purpose. The surface says
  // whether this note *may* carry the tracker at all — a correctness rule,
  // and the one `directiveAllowedOn` enforces with a visible refusal. The kind
  // says whether it is worth offering *here*, which is a statement about
  // likelihood and nothing more: a note may still hold anything its surface
  // admits, so narrowing the picker can never strand a value or manufacture a
  // refusal. 2.34 shipped to delete two wrong refusals; this is the shape that
  // cannot add a third.
  const allowed = (t: TrackerDef): boolean => {
    if (surface != null && !surfaceAdmits(t.surface, surface)) return false;
    if (kindOf && !kindAllowsTracker(kindOf.type, kindOf.kindId, t.id)) {
      return false;
    }
    return true;
  };

  const wake = trackers.find((t) => t.builtin === "wake");
  const bed = trackers.find((t) => t.builtin === "bed");
  const sleepShown =
    has.has(SLEEP_DIRECTIVE) ||
    (wake != null && hasId.has(wake.id)) ||
    (bed != null && hasId.has(bed.id));

  const options: TrackerOption[] = [];

  // The coupled module is offered only where both halves belong. They are both
  // daily built-ins, so in practice this is "on a daily entry and nowhere
  // else" — but it is written as a test on the pair rather than a literal
  // surface comparison, so it keeps agreeing with the built-in table if the
  // two ever move.
  if (
    sleepEnabled &&
    wake &&
    bed &&
    allowed(wake) &&
    allowed(bed) &&
    !sleepShown
  ) {
    options.push({
      directive: SLEEP_DIRECTIVE,
      label: `${bed.label} + ${wake.label}`,
      detail: `coupled control · writes ${bed.id}, ${wake.id} and derives Sleep`,
    });
  }

  for (const t of trackers) {
    if (t.derived) continue;
    if (t.builtin === "wake" || t.builtin === "bed") continue;
    if (!allowed(t)) continue;
    if (hasId.has(t.id)) continue;
    const noun = TYPE_NOUN[t.type] ?? t.type;
    const unit = t.type === "number" && t.unit ? ` (${t.unit})` : "";
    options.push({
      directive: trackerDirective(t.id),
      label: t.label || t.id,
      detail: `${noun}${unit} · property ${t.id}`,
    });
  }

  return options;
}

// Whether a directive already written into a note belongs on a note of this
// surface. Used by the renderer to mark a misplaced widget rather than draw it
// — a note can carry a `tracker:` line the picker would never have offered,
// because it was hand-written, pasted from another entry, or left behind when
// a tracker was moved to another surface in Settings.
//
// Unclassified notes and unknown trackers both pass: the first because we
// don't know enough to refuse, the second because "unknown tracker" is a
// different and better error than "wrong surface", and buildTracker reports it
// first.
export function directiveAllowedOn(
  trackers: TrackerDef[],
  directive: string,
  surface: TrackerSurface | null
): boolean {
  if (surface == null) return true;
  const d = directive.trim();
  if (d === SLEEP_DIRECTIVE) {
    // The coupled module stands for wake + bed, so it belongs wherever they
    // both do.
    return (["wake", "bed"] as const).every((kind) => {
      const t = trackers.find((x) => x.builtin === kind);
      return t == null || surfaceAdmits(t.surface, surface);
    });
  }
  const id = directiveTrackerId(d);
  if (!id) return true;
  const def = trackers.find((t) => t.id === id);
  return def == null || surfaceAdmits(def.surface, surface);
}

// Why a misplaced widget is refused, in the note itself. Names both surfaces,
// because "wrong surface" without saying which is a puzzle rather than a
// message — and names the fix, since the widget is inert but its logged value
// is not gone.
//
// `typeName` resolves a journal type id to its display name, so the message
// reads "this is a Study tracker; this note is in Cooking" rather than
// repeating two slugs at the reader.
export function describeSurfaceMismatch(
  trackers: TrackerDef[],
  directive: string,
  surface: TrackerSurface,
  typeName?: (typeId: string) => string | undefined
): string {
  const name = describeDirective(trackers, directive);
  const id = directiveTrackerId(directive.trim());
  const def = id ? trackers.find((t) => t.id === id) : undefined;
  const own = def ? describeSurface(def.surface, typeName) : "daily";
  const here = describeSurface(surface, typeName);
  const noun = surface.kind === "diary" ? `${here} entry` : `${here} note`;
  return `${name} is a ${own} tracker — it can't be logged on a ${noun}. Remove it with the ×, or change its surface in Settings → Trackers.`;
}

// Label a directive already in a note, for the remove picker and for tooltips.
// Falls back to the raw directive so a tracker deleted from Settings can still
// be identified and removed from the notes that reference it.
export function describeDirective(
  trackers: TrackerDef[],
  directive: string
): string {
  const d = directive.trim();
  if (d === SLEEP_DIRECTIVE) {
    const bed = trackers.find((t) => t.builtin === "bed");
    const wake = trackers.find((t) => t.builtin === "wake");
    return bed && wake ? `${bed.label} + ${wake.label}` : "Bedtime + Wake-Up";
  }
  const id = directiveTrackerId(d);
  if (!id) return d;
  const def = trackers.find((t) => t.id === id);
  return def ? def.label || def.id : `⚠️ ${id}`;
}

// The frontmatter properties a directive is responsible for. `sleep` owns
// three: the two times it edits and the hours-asleep value derived from them.
export function directiveProperties(
  trackers: TrackerDef[],
  directive: string
): string[] {
  const d = directive.trim();
  if (d === SLEEP_DIRECTIVE) {
    return (["bed", "wake", "sleep"] as const)
      .map((kind) => trackers.find((t) => t.builtin === kind)?.id)
      .filter((id): id is string => id != null);
  }
  const id = directiveTrackerId(d);
  return id ? [id] : [];
}

// A property is "empty" when nothing was ever logged into it, which is what
// makes it safe to drop along with its widget. Anything else — including a
// zero, which is a real reading — is data, and removing a widget must never
// destroy data.
export function isEmptyValue(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

// The resurfacing decision, separated from the vault scan and the modal so it
// can be tested and so the handler in settings.ts reads as intent rather than
// string-building. Given the two surfaces and how many readings sit in the old
// one, it returns either "no confirm needed" (null) or the exact prompt to
// show.
//
// No confirm when the surface didn't really change, or when the old surface
// holds nothing — the common cases (a fresh tracker, or fixing a surface
// before any data exists) stay one click. A confirm otherwise, worded around
// three true facts: the readings stay put, this tracker stops seeing them, and
// setting the surface back recovers them.
//
// Two moves, two arguments. Within the diary it never offers to migrate the
// readings, because a daily series can't become a monthly one without a
// reduction the data doesn't carry — the incoherence the class system exists
// to prevent. Between the diary and a journal the readings aren't unlike so
// much as *elsewhere*: they sit in notes the new surface doesn't cover, in a
// folder it never reads. Same outcome, different reason, so the sentence that
// explains it differs rather than being stretched to cover both.
export interface ResurfacePrompt {
  title: string;
  message: string;
  confirmLabel: string;
}

export function resurfacePrompt(
  label: string,
  from: TrackerSurface,
  to: TrackerSurface,
  staleCount: number,
  typeName?: (typeId: string) => string | undefined
): ResurfacePrompt | null {
  if (surfaceKey(from) === surfaceKey(to) || staleCount <= 0) return null;
  const f = describeSurface(from, typeName);
  const t = describeSurface(to, typeName);
  const fLabel = describeSurfaceLabel(from, typeName);
  const tLabel = describeSurfaceLabel(to, typeName);
  const readings = `${staleCount} reading${staleCount === 1 ? "" : "s"}`;
  const held = from.kind === "diary" ? `your ${f} entries` : `your ${f} notes`;
  const crossesKinds = from.kind !== to.kind;
  const why = crossesKinds
    ? `Those stay where they are — nothing on disk is edited — but ${tLabel} notes are somewhere else entirely, so this tracker won't see them again.`
    : `Those stay where they are — nothing on disk is edited — but this tracker will read ${t} entries from now on and won't see them.`;
  return {
    title: `Move "${label}" to ${tLabel}?`,
    message:
      `It has ${readings} in ${held}. ` +
      `${why} ` +
      `Set it back to ${fLabel} to pick them up again. ` +
      `To keep tracking both, cancel and add a separate ${t} tracker instead.`,
    confirmLabel: `Move it to ${tLabel}`,
  };
}

// How many notes on a given surface hold a real reading for this tracker.
//
// "Real" excludes empties (see isEmptyValue) but counts a logged zero, because
// a zero is a measurement — the same rule that governs whether removing a
// widget is safe. This drives the resurfacing confirm, which needs to say *how
// many* readings the move would leave dormant, and telling the user "3
// readings" when one of them is a blank the template seeded would be a lie in
// the direction that matters.
//
// Scans the surface's own folders rather than reading frontmatter, because it
// is asked at settings time about a whole surface, not about one open note —
// the folder is the cheaper and more direct index for "every note of this
// kind". `filesUnder` already recurses, which is what a journal root needs: a
// diary class owns one flat folder, a journal type owns a tree. A note dragged
// out of its folder is missed, which is acceptable here: an undercount makes
// the confirm *less* alarming, and the readings are recoverable regardless.
export function countReadingsOnSurface(
  app: App,
  paths: EntryPathConfig,
  trackerId: string,
  surface: TrackerSurface
): number {
  let n = 0;
  const seen = new Set<string>();
  for (const folder of surfaceFolders(paths, surface)) {
    for (const f of filesUnder(app, folder)) {
      // A `typeId: null` built-in spans every journal root, and one root can
      // nest inside another (Study's is the journals root itself), so the same
      // file can be reached twice. Count it once.
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      if (!isEmptyValue(frontmatterOf(app, f)[trackerId])) n += 1;
    }
  }
  return n;
}

async function readLines(app: App, notePath: string): Promise<string[] | null> {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return null;
  return (await app.vault.read(file)).split("\n");
}

// What the note currently shows — the set the picker filters against and the
// remove picker lists. See noteTrackerDirectives for why this is the whole
// note rather than the marked region.
export async function readEntryTrackers(
  app: App,
  notePath: string
): Promise<string[]> {
  const lines = await readLines(app, notePath);
  return lines ? noteTrackerDirectives(lines) : [];
}

// The directives a note shows *and* the properties it already edits, read in
// one pass. Two answers from one file read, because the picker needs both and
// reading the note twice invites them to disagree.
export async function readEntryState(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string
): Promise<{ present: string[]; editedProperties: string[] }> {
  const lines = await readLines(app, notePath);
  if (!lines) return { present: [], editedProperties: [] };
  return {
    present: noteTrackerDirectives(lines),
    editedProperties: noteEditedProperties(plugin.settings.trackers, lines),
  };
}

// Apply a pure line transform to a note. Returns false when the file is
// missing or the transform declined (returned null), so callers can report
// "nothing changed" rather than claiming a write that never happened.
async function editNote(
  app: App,
  notePath: string,
  transform: (lines: string[]) => string[] | null
): Promise<boolean> {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return false;
  const original = await app.vault.read(file);
  const updated = transform(original.split("\n"));
  if (!updated) return false;
  const text = updated.join("\n");
  if (text === original) return false;
  await app.vault.modify(file, text);
  return true;
}

// Seed blank frontmatter keys for a directive's properties, so the entry
// declares them the way the template does — visible in the properties panel,
// and picked up by Bases — before anything has been logged. Never overwrites
// an existing value.
async function seedProperties(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string,
  directive: string
): Promise<void> {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return;
  const props = directiveProperties(plugin.settings.trackers, directive);
  if (props.length === 0) return;
  await app.fileManager.processFrontMatter(file, (fm) => {
    for (const key of props) {
      if (!(key in fm)) fm[key] = null;
    }
  });
}

// Drop a removed directive's frontmatter keys — but only the ones still empty.
// Returns the keys that were kept because they held a logged value, which the
// caller surfaces so the user knows the data is still there.
async function pruneProperties(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string,
  directive: string
): Promise<string[]> {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return [];
  const props = directiveProperties(plugin.settings.trackers, directive);
  if (props.length === 0) return [];
  const kept: string[] = [];
  await app.fileManager.processFrontMatter(file, (fm) => {
    for (const key of props) {
      if (!(key in fm)) continue;
      if (isEmptyValue(fm[key])) delete fm[key];
      else kept.push(key);
    }
  });
  return kept;
}

// Add a tracker module to one note. Body first, then frontmatter: both reads
// go to disk, so sequencing the awaits keeps them from racing each other.
export async function addDirectiveToNote(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string,
  directive: string
): Promise<boolean> {
  const ok = await editNote(app, notePath, (lines) =>
    insertTrackerDirective(lines, directive)
  );
  if (!ok) return false;
  await seedProperties(app, plugin, notePath, directive);
  return true;
}

export async function removeDirectiveFromNote(
  app: App,
  plugin: AlmanacPlugin,
  notePath: string,
  directive: string
): Promise<{ removed: boolean; keptProperties: string[] }> {
  const removed = await editNote(app, notePath, (lines) =>
    removeTrackerDirective(lines, directive)
  );
  if (!removed) return { removed: false, keptProperties: [] };
  const keptProperties = await pruneProperties(app, plugin, notePath, directive);
  return { removed: true, keptProperties };
}

// A class template's tracker region is generated from Settings on every sync,
// so a hand-added directive there would silently vanish on the next settings
// change. Editing it per-note is therefore refused rather than half-supported
// — the message points at the control that does persist.
//
// Every class's template counts, not just the daily one. The monthly review
// template has had a managed region since 2.18.5 and was never covered here,
// so "+ Add tracker" on it wrote a directive the next sync quietly deleted.
export function isManagedTemplate(
  plugin: AlmanacPlugin,
  notePath: string
): boolean {
  const dir = plugin.settings.paths.templatesDiary;
  return TRACKER_CLASSES.some(
    (cls) => notePath === `${dir}/${CLASS_DEFS[cls].templateFile}`
  );
}

export function warnManagedTemplate(): void {
  new Notice(
    "This is an entry template — its tracker list is generated from Settings → Trackers."
  );
}
