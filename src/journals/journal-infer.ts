// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import {
  DEFAULT_SUBJECT_EMOJI,
  DEFAULT_TOPIC_EMOJI,
} from "../core/constants";
import {
  JournalKindConfig,
  JournalLevelConfig,
  normaliseLevels,
} from "./custom-journal";
import { PAGE_TEMPLATE } from "./journal";
import { TrackerDef, TrackerType, journalSurface } from "../trackers/trackers";
import { plural, slugify } from "../core/util";
import type { StoredJournalConfig } from "./journal-manifest";

// ── Reading a journal back out of its own folder ──────────────────────────
//
// The recovery path, for a folder that predates the manifest or arrived
// without one. A journal's own generated artefacts describe it exactly:
// buildJournalType() names every template after an id, and the section
// catalogue writes each kind's header bar into the same fence as its create
// button. So a populated journal folder can be read back into the config that
// made it — verified by round-tripping the result through the generator and
// comparing templates byte for byte (see test/journal-import.test.ts).
//
// WHAT IS EXACT AND WHAT IS GUESSED matters more here than anywhere else in
// this feature, because the caller's behaviour depends on it. The levels,
// their order, the kinds, their order, their emoji, their plurals, which kind
// is paged and what each is rated on are all READ. A lost tracker's type and
// range are INDUCED from the readings on disk, and cannot be anything else —
// nothing writes them down. Every induction is named in `guesses`, and as of
// 2.49 a non-empty `guesses` is what stops a folder being adopted without
// being looked at first.
//
// THIS FILE IS PURE. A JournalScan is a plain data structure; the reading of
// actual files happens in journal-import.ts.

// ── Reading a journal folder ──────────────────────────────────────────────
//
// The scan is a plain data structure and the inference over it is a pure
// function, so the whole reconstruction is testable without a vault. Only
// scanJournalFolder() below touches Obsidian.

export interface ScannedDirective {
  // `header:📋 Recipes` → { key: "header", rest: "📋 Recipes" }
  key: string;
  rest: string;
}

export interface ScannedFile {
  // Path segments below the scan root, file last:
  // "Italian/Pasta/Carbonara.md" → ["Italian", "Pasta", "Carbonara.md"].
  segments: string[];
  frontmatter: Record<string, string>;
  // Every `chronoanvil` fence, as its directive lines. Kept fence by fence rather
  // than flattened because the pairing WITHIN a fence is the information: the
  // catalogue writes a kind's header and its create button into one headerBar,
  // so `header:📋 Recipes` beside `button:cooking:new-recipe` is what says
  // that the kind `recipe` is labelled 📋 and pluralises to "Recipes".
  fences: ScannedDirective[][];
}

export interface JournalScan {
  // The journal root's own folder name — the display name, and the fallback
  // for the id when no note names one.
  folderName: string;
  notes: ScannedFile[];
  // Files in the derived templates folder, if it exists. Named by file
  // (`recipe.md`), since buildJournalType names every template after an id.
  templates: { name: string; file: ScannedFile }[];
}

// Frontmatter as a flat string map. Hand-rolled rather than taken from the
// metadata cache because half of what is scanned is TEMPLATES, whose values
// are `{{tokens}}` that a YAML parser reads as flow mappings — and because
// discovery runs at layout-ready, when the cache is warm for notes but was
// never going to hold anything for a dotfile or a token.
export function parseFrontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    if (!key || key.startsWith("#")) continue;
    out[key] = line.slice(at + 1).trim();
  }
  return out;
}

// Every ```chronoanvil fence's directive lines, fence by fence. The charts fence
// (```chronoanvil-journal-charts) counts too — it carries a header of its own.
export function parseFences(text: string): ScannedDirective[][] {
  const out: ScannedDirective[][] = [];
  const lines = text.split(/\r?\n/);
  let current: ScannedDirective[] | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (current === null) {
      if (/^```chronoanvil(-[a-z-]+)?\s*$/.test(trimmed)) current = [];
      continue;
    }
    if (trimmed === "```") {
      out.push(current);
      current = null;
      continue;
    }
    const at = trimmed.indexOf(":");
    if (at === -1) {
      if (trimmed) current.push({ key: trimmed, rest: "" });
      continue;
    }
    current.push({ key: trimmed.slice(0, at), rest: trimmed.slice(at + 1) });
  }
  return out;
}

export function scanFile(segments: string[], text: string): ScannedFile {
  return {
    segments,
    frontmatter: parseFrontmatter(text),
    fences: parseFences(text),
  };
}

// ── Inference ─────────────────────────────────────────────────────────────

export interface InferredJournal {
  config: StoredJournalConfig;
  // Journal-scoped trackers the notes use that the vault doesn't define.
  // Already scoped to config.id.
  trackers: TrackerDef[];
  // What had to be guessed rather than read, in the reader's words. Surfaced
  // in the adoption notice: a recovered journal whose tracker range was
  // inferred should say so, not present a guess as a fact.
  guesses: string[];
}

// A note that IS its folder's dashboard — `Italian/Italian.md`. The same test
// the rest of the plugin uses for a folder note, and here it is what separates
// a container level from a leaf kind.
//
// Exported because the scanner needs it too: index notes are the ones that
// settle the level order, so they are read in full while leaf notes are
// sampled, and that decision has to be made against the same rule.
export function isIndexFile(segments: string[]): boolean {
  if (segments.length < 2) return false;
  const stem = segments[segments.length - 1].replace(/\.md$/i, "");
  return stem === segments[segments.length - 2];
}

// Container depth of an index note below the journal root:
// ["Italian","Italian.md"] → 0, ["Italian","Pasta","Pasta.md"] → 1.
function indexDepth(segments: string[]): number {
  return segments.length - 2;
}

function titleCase(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function commonest(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function typeOf(file: ScannedFile): string | null {
  const raw = file.frontmatter["type"];
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  // A template's `type: {{type}}` (the page template) names nothing.
  if (!value || value.includes("{{")) return null;
  return value;
}

function directives(file: ScannedFile): ScannedDirective[] {
  return file.fences.flat();
}

interface ButtonRef {
  typeId: string;
  action: string;
}

function buttonsIn(file: ScannedFile): ButtonRef[] {
  const out: ButtonRef[] = [];
  for (const d of directives(file)) {
    if (d.key !== "button") continue;
    const parts = d.rest.split(":");
    if (parts.length < 2) continue;
    const typeId = parts[0].trim();
    const action = parts.slice(1).join(":").trim();
    if (typeId && action) out.push({ typeId, action });
  }
  return out;
}

function trackersIn(file: ScannedFile): string[] {
  const out: string[] = [];
  for (const d of directives(file)) {
    if (d.key !== "tracker") continue;
    // `tracker:<id>` or `tracker:<id>|Label`.
    const id = d.rest.split("|")[0].trim();
    if (id) out.push(id);
  }
  return out;
}

// A kind's emoji and plural, read from the fence that creates it.
//
// The catalogue writes `header:${kind.emoji} ${kindPlural(kind)}` and
// `button:${type.id}:new-${kind.id}` adjacent, so the two lines sitting
// together is a statement about the same kind. That makes the emoji and any
// declared plural recoverable exactly rather than defaulted — which matters
// more than it sounds: a journal that comes back with every kind labelled 📝
// reads as a failed recovery even when the structure is perfect.
//
// PAIRED BY POSITION, NOT BY FENCE. This took the first `header` and the first
// `button` in a fence, which was right only while each kind had a fence of its
// own. Since 2.54 the deepest index writes every kind into ONE fence —
// header/button/kind-table, three lines per kind — so first-of-each recovered
// the first kind and silently defaulted every other one to 📝. The header a
// button belongs to is the nearest one ABOVE it, which is what the block
// processor itself does when it renders them (each `header:` opens a new bar
// and the widgets after it anchor into that bar), and it reads the old
// one-fence-per-kind layout identically.
function kindLabelsFromFences(files: ScannedFile[]): Map<
  string,
  { emoji?: string; plural?: string }
> {
  const out = new Map<string, { emoji?: string; plural?: string }>();
  for (const file of files) {
    for (const fence of file.fences) {
      let header: ScannedDirective | null = null;
      for (const d of fence) {
        if (d.key === "header") {
          header = d;
          continue;
        }
        if (d.key !== "button" || !header) continue;
        const action = d.rest.split(":").slice(1).join(":").trim();
        if (!action.startsWith("new-")) continue;
        const kindId = action.slice("new-".length);
        if (!kindId || kindId === "container" || kindId === "page") continue;
        // "📋 Recipes" → emoji, then the rest.
        const text = header.rest.trim();
        const space = text.indexOf(" ");
        if (space === -1) continue;
        out.set(kindId, {
          emoji: text.slice(0, space).trim() || undefined,
          plural: text.slice(space + 1).trim() || undefined,
        });
      }
    }
  }
  return out;
}

// Does anything about this kind create pages?
function kindHasPages(files: ScannedFile[]): boolean {
  return files.some((f) =>
    buttonsIn(f).some((b) => b.action === "new-page")
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{1,2}:\d{2}$/;

// A tracker the vault uses but no longer defines, rebuilt from the values its
// notes carry.
//
// THE GUESSY PART, and the only one. Everything else here is read back from a
// generated name or a paired directive; a tracker's type and range are not
// written down anywhere, so they are induced from the readings on disk. The
// result is always correctable in Settings → Trackers, and the caller names it
// in the notice rather than letting it pass as recovered fact.
export function inferTracker(
  id: string,
  values: string[],
  typeId: string
): { tracker: TrackerDef; guess: string } {
  const nonEmpty = values.filter((v) => v !== "" && !v.includes("{{"));
  const base = {
    id,
    label: titleCase(id),
    surface: journalSurface(typeId),
    // Both forced false for a journal surface anyway (normalizeTrackers), and
    // stated here so the shape is complete rather than relying on that.
    showInTemplate: false,
    showInBase: false,
  };

  const numbers = nonEmpty
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (nonEmpty.length > 0 && numbers.length === nonEmpty.length) {
    // The template seeds the bottom of the scale (`difficulty: 1`), so the
    // observed floor is usually the real one. The ceiling is only as high as
    // the highest reading, which is where this can genuinely be wrong: a 1-10
    // scale nobody has yet scored above 6 comes back as 1-6.
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const integral = numbers.every((n) => Number.isInteger(n));
    return {
      tracker: {
        ...base,
        type: "number" as TrackerType,
        min,
        max,
        step: integral ? 1 : undefined,
      },
      guess: `${id} as a number from ${min} to ${max}`,
    };
  }

  if (nonEmpty.length > 0 && nonEmpty.every((v) => ISO_DATE.test(v))) {
    return {
      tracker: { ...base, type: "date" as TrackerType },
      guess: `${id} as a date`,
    };
  }

  if (nonEmpty.length > 0 && nonEmpty.every((v) => CLOCK.test(v))) {
    return {
      tracker: { ...base, type: "time" as TrackerType },
      guess: `${id} as a time`,
    };
  }

  // A `,` or `=` in a value would be read as option grammar, not as text:
  // options are stored as one comma-separated `value=Label` string
  // (widgets.ts::buildSelect), so a reading of "Pasta, fresh" would silently
  // become two options and "a=b" would relabel itself. Rather than escape a
  // grammar that has no escape, a set containing one isn't offered as a
  // dropdown at all and falls through to the number default below.
  const distinct = [...new Set(nonEmpty)];
  const safe = distinct.filter((v) => !v.includes(",") && !v.includes("="));
  if (safe.length === distinct.length && distinct.length > 0 && distinct.length <= 12) {
    return {
      tracker: {
        ...base,
        type: "select" as TrackerType,
        options: distinct.map((v) => `${v}=${titleCase(slugify(v))}`).join(","),
      },
      guess: `${id} as a dropdown of ${distinct.length} option${
        distinct.length === 1 ? "" : "s"
      }`,
    };
  }

  // Nothing to go on — a tracker mentioned by a template whose notes have no
  // readings yet. A number is the commonest journal tracker by far and the
  // cheapest wrong answer to correct.
  return {
    tracker: { ...base, type: "number" as TrackerType, min: 1, max: 5, step: 1 },
    guess: `${id} as a 1-5 number (no readings found to go on)`,
  };
}

// Reconstruct a journal's config from what its folder contains.
//
// Returns null when the folder shows no sign of being a ChronoAnvil journal —
// which is most of the reason this is careful rather than eager. Everything
// under the journals root is a candidate, so "a folder of ordinary markdown"
// must come back null rather than become a journal type with one level called
// Section.
export function inferJournalFromScan(
  scan: JournalScan,
  known: {
    // Tracker ids the vault already defines. A tracker in this set is left
    // alone — `status` is a journal built-in and must not be re-created as an
    // inferred select.
    trackerIds: Set<string>;
    // The vault's name→emoji pool, for the journal's own heading emoji.
    folderEmojis: Record<string, string>;
  }
): InferredJournal | null {
  const templateFiles = scan.templates.map((t) => t.file);
  const allFiles = [...scan.notes, ...templateFiles];
  if (allFiles.length === 0) return null;

  const guesses: string[] = [];

  // ── id ──────────────────────────────────────────────────────────────────
  // Every create button in the journal names its type. That is the id the
  // notes on disk already expect, so it beats anything derived from the folder
  // name — renaming the folder must not silently re-id the type.
  const buttonIds = allFiles.flatMap((f) => buttonsIn(f).map((b) => b.typeId));
  const id = commonest(buttonIds) ?? slugify(scan.folderName);
  if (!id) return null;
  if (buttonIds.length === 0) {
    guesses.push(`its id (${id}) from the folder name`);
  }

  // ── levels ──────────────────────────────────────────────────────────────
  // An index note's depth below the root IS the level's depth, and its `type`
  // is the level's id. This is the authoritative ordering: the templates name
  // the levels but a directory listing cannot say which is above which.
  const byDepth = new Map<number, string[]>();
  for (const note of scan.notes) {
    if (!isIndexFile(note.segments)) continue;
    const t = typeOf(note);
    if (!t) continue;
    const depth = indexDepth(note.segments);
    if (depth < 0) continue;
    const list = byDepth.get(depth) ?? [];
    list.push(t);
    byDepth.set(depth, list);
  }

  let levelIds: string[] = [];
  const maxDepth = Math.max(-1, ...byDepth.keys());
  for (let d = 0; d <= maxDepth; d++) {
    const at = commonest(byDepth.get(d) ?? []);
    // A gap means the tree is not what it looks like — stop rather than
    // invent a level to fill it.
    if (!at) break;
    levelIds.push(at);
  }

  // No index notes (an empty journal, or one imported without them): fall back
  // to the index templates, ordered by the positional tokens the leaf template
  // fills in. `{{subject}}` is depth 0 and `{{topic}}` depth 1 — see
  // custom-journal.ts::LEVEL_TOKENS — so a leaf template reading
  // `cuisine: {{subject}}` places cuisine above `dish: {{topic}}`.
  if (levelIds.length === 0) {
    const fromTemplates = scan.templates
      .map((t) => /^(.+)-index\.md$/i.exec(t.name)?.[1])
      .filter((n): n is string => !!n);
    const tokenOrder = new Map<string, number>();
    for (const file of allFiles) {
      for (const [key, value] of Object.entries(file.frontmatter)) {
        if (value === "{{subject}}") tokenOrder.set(key.toLowerCase(), 0);
        if (value === "{{topic}}") tokenOrder.set(key.toLowerCase(), 1);
      }
    }
    levelIds = fromTemplates.sort(
      (a, b) => (tokenOrder.get(a) ?? 99) - (tokenOrder.get(b) ?? 99)
    );
    if (levelIds.length > 0) {
      guesses.push("its folder depth from the templates (no index notes yet)");
    }
  }

  if (levelIds.length === 0) return null;

  // ── kinds ───────────────────────────────────────────────────────────────
  // A leaf note's `type` is its kind. Templates fill in the kinds that have no
  // notes yet: buildJournalType names each `<kindId>.md`, so anything in the
  // templates folder that isn't an index or the page template is a kind.
  const levelSet = new Set(levelIds);
  const kindIds: string[] = [];
  const pushKind = (k: string | null): void => {
    if (!k) return;
    if (k === "page" || levelSet.has(k)) return;
    if (!kindIds.includes(k)) kindIds.push(k);
  };
  // Templates first, so the order is the stable generated one rather than
  // whatever order the notes happened to be walked in.
  for (const t of scan.templates) {
    if (/-index\.md$/i.test(t.name)) continue;
    if (t.name.toLowerCase() === PAGE_TEMPLATE) continue;
    pushKind(t.name.replace(/\.md$/i, "").toLowerCase());
  }
  for (const note of scan.notes) {
    if (isIndexFile(note.segments)) continue;
    pushKind(typeOf(note));
  }
  if (kindIds.length === 0) return null;

  // Put the kinds back in DECLARATION order.
  //
  // The two sources above are both alphabetical by accident — a directory
  // listing is, and the note walk follows one — so Cooking came back
  // "attempt, recipe" when it was declared "recipe, attempt". That order is
  // not cosmetic: it is the order of the create buttons, of the tables in
  // every index template, and of the views in the type's .base file.
  //
  // The deepest index template writes one headerBar per kind by mapping over
  // `type.kinds` in order (journal-sections.ts), so the sequence of
  // `new-<kind>` buttons down that file IS the declaration order. Anything not
  // mentioned there keeps its existing relative position at the end.
  const declared: string[] = [];
  const noteIndexes = scan.notes.filter((n) => isIndexFile(n.segments));
  for (const file of [...templateFiles, ...noteIndexes]) {
    for (const button of buttonsIn(file)) {
      if (!button.action.startsWith("new-")) continue;
      const kindId = button.action.slice("new-".length);
      if (kindIds.includes(kindId) && !declared.includes(kindId)) {
        declared.push(kindId);
      }
    }
  }
  kindIds.sort((a, b) => {
    const ai = declared.indexOf(a);
    const bi = declared.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Notes and templates belonging to each kind, for its pages flag and its
  // rating. A kind's template is the richer source (it always carries the full
  // arrangement); its notes are the fallback when templates weren't copied.
  const filesOfKind = new Map<string, ScannedFile[]>();
  for (const k of kindIds) filesOfKind.set(k, []);
  for (const t of scan.templates) {
    const k = t.name.replace(/\.md$/i, "").toLowerCase();
    filesOfKind.get(k)?.push(t.file);
  }
  for (const note of scan.notes) {
    if (isIndexFile(note.segments)) continue;
    const k = typeOf(note);
    if (k) filesOfKind.get(k)?.push(note);
  }

  const labels = kindLabelsFromFences(allFiles);

  // A kind's rating: the numeric tracker its notes log. `status` and the other
  // built-ins are already defined vault-wide and are not what a kind is scored
  // on, so a tracker the vault already knows is skipped here.
  const ratingOf = (files: ScannedFile[]): string | undefined => {
    for (const file of files) {
      for (const trackerId of trackersIn(file)) {
        if (known.trackerIds.has(trackerId)) continue;
        const sample = files
          .map((f) => f.frontmatter[trackerId])
          .filter((v): v is string => v != null && v !== "" && !v.includes("{{"));
        if (sample.length === 0) continue;
        if (sample.every((v) => Number.isFinite(Number(v)))) return trackerId;
      }
    }
    return undefined;
  };

  const kinds: JournalKindConfig[] = kindIds.map((kindId) => {
    const files = filesOfKind.get(kindId) ?? [];
    // Not named `known` — that is the parameter holding the vault's tracker
    // ids, and shadowing it here would silently change what ratingOf() sees.
    const fromFence = labels.get(kindId);
    const label = titleCase(kindId);
    const declaredPlural = fromFence?.plural;
    return {
      id: kindId,
      emoji: fromFence?.emoji ?? "📝",
      label,
      // Only when the crude pluraliser would get it wrong — which is exactly
      // the condition the field exists for, and stating it otherwise would
      // pin a plural the type never declared.
      ...(declaredPlural && declaredPlural !== plural(label)
        ? { plural: declaredPlural }
        : {}),
      ...(kindHasPages(files) ? { pages: true } : {}),
      ...(ratingOf(files) ? { rating: ratingOf(files) } : {}),
    };
  });

  // ── trackers ────────────────────────────────────────────────────────────
  const wanted = new Set<string>();
  for (const file of allFiles) {
    for (const t of trackersIn(file)) {
      if (!known.trackerIds.has(t)) wanted.add(t);
    }
  }
  const trackers: TrackerDef[] = [];
  for (const trackerId of wanted) {
    const values = allFiles
      .map((f) => f.frontmatter[trackerId])
      .filter((v): v is string => v != null);
    const { tracker, guess } = inferTracker(trackerId, values, id);
    trackers.push(tracker);
    guesses.push(guess);
  }

  const levels: JournalLevelConfig[] = levelIds.map((levelId, depth) => ({
    id: levelId,
    noun: titleCase(levelId),
    fallbackEmoji: depth === 0 ? DEFAULT_SUBJECT_EMOJI : DEFAULT_TOPIC_EMOJI,
  }));

  const name = scan.folderName;
  return {
    config: {
      id,
      name,
      emoji: known.folderEmojis[name] ?? "📔",
      levels: normaliseLevels(levels, { preserveIds: true }),
      kinds,
    },
    trackers,
    guesses,
  };
}