// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The join between the two surfaces: a note on one side asking what the other
// side holds inside its own period.
//
// WHY THIS IS IN core/ AND NOT IN diary/ OR journals/
//
// 2.56.25 grouped src/ by the surface each module serves. This one serves
// neither. A bridge is only interesting when it crosses the line, so filing it
// under either side would name the wrong owner and make the other side's use of
// it read as a reach across the tree. core/ already holds what both halves
// stand on — query, notestore, vocabulary — and is not a no-dependencies base
// layer in practice, so importing diary/diary-index and charts/charts from here
// breaks no rule the tree currently keeps.
//
// WHAT IS HERE AND WHAT IS NOT
//
// The pure half, in the sense diary-index.ts means it: window resolution,
// refusal and selector validation take plain data and no App, so they are
// unit-testable without a vault. Nothing here reads a file, renders a node or
// knows a directive exists. The caller supplies facts about the host note and a
// catalogue of what the vault defines; this decides whether the question can be
// asked and, if so, over which days.
//
// There is no new query grammar. The selector text goes to diary-index's own
// `parseQuery` and the result runs against the existing index — what this adds
// is the *anchor* (the window comes from the host note rather than the
// directive), the *direction* (which surface is being asked), and the refusal
// that has to sit in front of both.

import {
  formatPeriodLabel,
  periodBoundsFor,
  periodPropertyFor,
  periodUnitOf,
  PERIOD_PROPERTIES,
} from "../charts/charts";
import type { PeriodBounds } from "../charts/charts";
import { parseQuery, tokenize } from "../diary/diary-index";
import type { DiaryQuery, IndexSurface } from "../diary/diary-index";
import { isoDate, moment } from "./util";

// ── model ─────────────────────────────────────────────────────────────

// What a bridge reads. Two directives, not one — see the 2.57 plan §4. The
// distinction is not cosmetic: "notes" reads the index, "readings" reads the
// tracker series, and those are different stores with different caching.
export type BridgeDirection = "notes" | "readings";

// The days a bridge covers.
//
// Both bounds are non-null, unlike ChartWindow, and that difference is the
// whole point of §2. A chart with no resolvable period falls back to the last
// 30 days and draws something honest. A bridge cannot: "the last 30 days" is a
// different question from the one the reader asked, answered without saying so.
// So there is no unbounded and no defaulted BridgeWindow — either the host note
// declares a period, or you get a BridgeRefusal instead of this.
export interface BridgeWindow {
  start: string;
  end: string;
  // "day" joins the four chart units here. A daily entry is a period of one
  // day, and it is the single most obvious host for a bridge — the reader who
  // prompted this release wants their Meals journal on today's entry. It is not
  // added to PeriodBounds["unit"] because a chart has no use for it: a one-day
  // trend is one point.
  unit: "day" | PeriodBounds["unit"];
  // How the window says its own name, so a bridge block can state which period
  // it covered. The same argument formatPeriodLabel was extracted for in 2.52:
  // a scoped widget that does not name its scope is indistinguishable from an
  // unscoped one that has quietly lost most of its rows.
  label: string;
}

// Why a bridge cannot be drawn, in the reader's words.
//
// A reason rather than a throw, exactly as `journalChartRefusal` returns one —
// this is its sibling and should read like it. `check` is for the editor, which
// wants to know *which* guard tripped so it can disable the right control; the
// reader only ever sees `message`.
export interface BridgeRefusal {
  check: "host-period" | "target-date" | "selector";
  message: string;
}

export type BridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: BridgeRefusal };

// What the caller knows about the note the directive was written on.
//
// `declares` is a predicate rather than the frontmatter object for the reason
// periodUnitOf takes one: the test has to be "is the key present", not "does it
// have a value". A dashboard that declares `week-start:` and has not navigated
// yet is still a weekly dashboard. Passing an object would tempt a truthiness
// test at the call site and quietly reintroduce the bug resolvePeriodBounds
// documents.
export interface BridgeHostFacts {
  declares: (prop: string) => boolean;
  valueOf: (prop: string) => unknown;
  // The host's own date, when it is a dated entry rather than a dashboard.
  iso: string | null;
  // Which side the host note is on. The bridge targets the other one.
  surface: IndexSurface;
}

// One note type a bridge could pull, as the vault currently defines it.
//
// `dated` is the field this release turns on: it is false for a Recipe and true
// for a Meal, and §2.4 is the argument for refusing the first rather than
// guessing a date for it.
export interface BridgeKind {
  id: string;
  label: string;
  dated: boolean;
}

export interface BridgeTracker {
  id: string;
  label: string;
}

// Everything a bridge is allowed to name, so validation can say what *is*
// available rather than only that the thing asked for is not. A refusal that
// lists the alternatives is the difference between a typo taking ten seconds
// and taking a trip to the docs.
export interface BridgeCatalogue {
  kinds: readonly BridgeKind[];
  trackers: readonly BridgeTracker[];
}

export interface BridgeSpec {
  direction: BridgeDirection;
  // The kind id (notes) or tracker id (readings) being pulled.
  target: string;
  // The raw selector text after the target, in diary-index's query grammar.
  filters: string;
  host: BridgeHostFacts;
  catalogue: BridgeCatalogue;
}

// A bridge that has passed every guard: what to read, from where, over which
// days, filtered how. The impure half takes one of these and nothing else.
export interface BridgePlan {
  direction: BridgeDirection;
  target: string;
  targetLabel: string;
  // The surface being read — always the opposite of the host's.
  surface: IndexSurface;
  window: BridgeWindow;
  query: DiaryQuery;
}

// The join, in one line: a bridge reads the surface its host is not on.
export function otherSurface(s: IndexSurface): IndexSurface {
  return s === "diary" ? "journal" : "diary";
}

// ── §1: the window ────────────────────────────────────────────────────

// The host note's own period, or a refusal. Never a fallback.
//
// Two ways a note can answer. It declares a period property, in which case the
// window is that period exactly — resolved through charts.ts::periodBoundsFor,
// which is also what every chart on the same note resolves through, so a bridge
// and a chart sitting side by side cannot disagree about which days "this week"
// means. Or it is a dated entry, in which case the window is that one day.
//
// A note that is neither is refused. That is the §2 rule and it is the reason
// this returns a result type rather than `BridgeWindow | null`: null at this
// boundary is what invites a `?? lastThirtyDays` at the call site, and the
// whole argument of §2 is that the fallback must not exist to be reached for.
export function bridgeWindow(host: BridgeHostFacts): BridgeResult<BridgeWindow> {
  const unit = periodUnitOf(host.declares);
  if (unit != null) {
    const prop = periodPropertyFor(unit);
    const raw = host.valueOf(prop);
    const iso = isoDate(raw);
    // Declared-but-blank is a real state — the shipped templates ship
    // `week-start:` empty until you navigate — and it is NOT a refusal, because
    // the note has said what it is. It anchors to today, the same tolerance
    // periodAnchor already applies for the same reason.
    const anchor = iso ? moment(iso) : moment();
    const bounds = periodBoundsFor(unit, anchor.isValid() ? anchor : moment());
    return {
      ok: true,
      value: {
        start: bounds.start,
        end: bounds.end,
        unit: bounds.unit,
        label: formatPeriodLabel(bounds.unit, bounds.start),
      },
    };
  }

  if (host.iso) {
    return {
      ok: true,
      value: {
        start: host.iso,
        end: host.iso,
        unit: "day",
        label: moment(host.iso).format("D MMM YYYY"),
      },
    };
  }

  // Name the properties rather than the concept. "This note declares no period"
  // is true and useless; the reader needs to know which line to add, and there
  // are only four candidates, so listing them costs nothing.
  const props = PERIOD_PROPERTIES.map((p) => `\`${p.prop}\``).join(", ");
  return {
    ok: false,
    refusal: {
      check: "host-period",
      message:
        `This note has no period to anchor to, so there is no window to read. ` +
        `Add one of ${props} to its properties, or put the bridge on a dated entry.`,
    },
  };
}

// ── §5.1: the selectors, closed ───────────────────────────────────────

// What a bridge accepts after its target.
//
// CLOSED, and closed the way INLINE_KINDS is closed rather than the way a
// feature flag is: the set is the promise. ChronoAnvil's identity is that it
// *removed* Dataview, and `bridge:` growing an expression grammar would put it
// back one operator at a time without anyone deciding to. A bridge that cannot
// express something is a request for a named selector, argued for once and
// added here.
//
// Every entry is a filter diary-index's `parseQuery` already understands, which
// is the other half of the promise: no new grammar, so a reader who knows the
// search box knows this. `is:` is spelled `is:` and not `kind:` for exactly
// that reason — a second spelling of an existing filter is a second thing to
// learn for no new capability.
export const BRIDGE_SELECTORS = ["is", "tag", "has", "from", "to"] as const;

export type BridgeSelector = (typeof BRIDGE_SELECTORS)[number];

const SELECTOR_RE = /^([A-Za-z]+):(.+)$/;

// Whether a token is a filter at all, versus free search text. Free text is
// allowed through untouched — a bridge is a query and a query may have terms.
function selectorOf(token: string): { key: string; value: string } | null {
  const m = SELECTOR_RE.exec(token);
  return m ? { key: m[1].toLowerCase(), value: m[2].trim() } : null;
}

const list = (xs: readonly string[]): string =>
  xs.length === 0 ? "none" : xs.map((x) => `\`${x}\``).join(", ");

// ── §2: the guard rail ────────────────────────────────────────────────

// Every check §2.2 names, in the order they can be answered, returning the
// first failure or null.
//
// The order is not arbitrary: the host is checked before the target because a
// note with no period cannot bridge to anything, so leading with "no Recipe has
// a date" would name a real problem that is not the one blocking this reader.
//
// This is the whole of §2.3's "refused twice". The editor calls it to refuse at
// creation — a bridge that cannot work is never offered, the same move
// `chartable`/`typesFor` make for chart types — and the renderer calls it again
// because a hand-written directive, or one whose target lost its date property
// after it was written, has to say why instead of going quiet. A vault outlives
// the session that configured it.
export function bridgeRefusal(spec: BridgeSpec): BridgeRefusal | null {
  const planned = planBridge(spec);
  return planned.ok ? null : planned.refusal;
}

export function planBridge(spec: BridgeSpec): BridgeResult<BridgePlan> {
  const { direction, catalogue, host } = spec;
  const target = spec.target.trim();

  // Check 1: the host's period.
  const win = bridgeWindow(host);
  if (!win.ok) return win;

  // Check 2: the target, and whether it can be joined by date at all.
  if (!target) {
    // NAMES WHAT THIS VAULT HAS, not just the grammar. The message used to be
    // an example — "e.g. `bridge-notes:meal`" — which was right while the only
    // way to get an empty target was to type one. 3.8 gives the section editor
    // a way to add a bridge before its target has been chosen, so an
    // unconfigured block is now an ordinary first state rather than a typo, and
    // the reader looking at it wants the list they can pick from rather than a
    // reminder of the syntax. Same list the unknown-target branch prints, for
    // the same reason it prints one: refuse by offering the alternatives.
    const options =
      direction === "notes"
        ? catalogue.kinds.map((k) => k.id)
        : catalogue.trackers.map((t) => t.id);
    const noun = direction === "notes" ? "note type" : "tracker";
    return {
      ok: false,
      refusal: {
        check: "selector",
        message: options.length
          ? `\`bridge-${direction}\` needs a ${noun}. Available: ${list(options)}.`
          : direction === "notes"
            ? "`bridge-notes` needs a note type — e.g. `bridge-notes:meal`."
            : "`bridge-readings` needs a tracker — e.g. `bridge-readings:exercise`.",
      },
    };
  }

  let targetLabel: string;
  if (direction === "notes") {
    const kind = catalogue.kinds.find((k) => k.id === target);
    if (!kind) {
      return {
        ok: false,
        refusal: {
          check: "selector",
          message: `No note type called "${target}". Available: ${list(
            catalogue.kinds.map((k) => k.id)
          )}.`,
        },
      };
    }
    if (!kind.dated) {
      // §2.4. The temptation here is ctime, and it has to be declined: file
      // creation time is when the file was *made*, which for an imported or
      // synced vault is when it was copied. A bridge joined on it would be
      // confidently wrong, which is worse than refusing.
      return {
        ok: false,
        refusal: {
          check: "target-date",
          message:
            `${kind.label} notes carry no \`date\`, so they cannot be joined to ` +
            `${win.value.label} by date. Give the note type a date property, or ` +
            `bridge to one that has one.`,
        },
      };
    }
    targetLabel = kind.label;
  } else {
    const tracker = catalogue.trackers.find((t) => t.id === target);
    if (!tracker) {
      return {
        ok: false,
        refusal: {
          check: "selector",
          message: `No tracker called "${target}". Available: ${list(
            catalogue.trackers.map((t) => t.id)
          )}.`,
        },
      };
    }
    targetLabel = tracker.label;
  }

  // Check 3: the selectors.
  //
  // Validated against the RAW tokens, before parseQuery sees them, and that
  // ordering is load-bearing. parseQuery's rule is that an unrecognised filter
  // stays a search *term* — correct for a search box, where rejecting a query
  // over a stray colon is worse than searching for it. Wrong here: `is:lessn`
  // in a bridge would silently become a full-text search for the string
  // "is:lessn", match nothing, and render an empty block that looks exactly
  // like a week with no lessons in it.
  const knownKinds = catalogue.kinds.map((k) => k.id);
  for (const token of tokenize(spec.filters)) {
    const sel = selectorOf(token);
    if (!sel) continue;
    if (!(BRIDGE_SELECTORS as readonly string[]).includes(sel.key)) {
      return {
        ok: false,
        refusal: {
          check: "selector",
          message: `\`${sel.key}:\` is not a bridge filter. Available: ${list(
            BRIDGE_SELECTORS
          )}.`,
        },
      };
    }
    if (
      sel.key === "is" &&
      !knownKinds.some((k) => k.toLowerCase() === sel.value.toLowerCase())
    ) {
      return {
        ok: false,
        refusal: {
          check: "selector",
          message: `No note type called "${sel.value}". Available: ${list(
            knownKinds
          )}.`,
        },
      };
    }
    if (
      sel.key === "has" &&
      !["attachment", "task", "event"].includes(sel.value.toLowerCase())
    ) {
      return {
        ok: false,
        refusal: {
          check: "selector",
          message: `\`has:${sel.value}\` is not something a note can have. Available: ${list(
            ["attachment", "task", "event"]
          )}.`,
        },
      };
    }
  }

  // No new grammar: the surviving text goes through diary-index's own parser,
  // with the target's own kinds as the `is:` vocabulary.
  const query = parseQuery(spec.filters, knownKinds);

  // The window is the host's, always. A `from:`/`to:` inside a bridge narrows
  // within it and can never widen past it — anchoring is the feature, and a
  // selector that could escape the anchor would make the block's stated period
  // a lie.
  if (query.from == null || query.from < win.value.start) {
    query.from = win.value.start;
  }
  if (query.to == null || query.to > win.value.end) {
    query.to = win.value.end;
  }

  return {
    ok: true,
    value: {
      direction,
      target,
      targetLabel,
      surface: otherSurface(host.surface),
      window: win.value,
      query,
    },
  };
}

// ── §3: the snapshot ──────────────────────────────────────────────────
//
// Live by default, frozen on purpose, and never quietly either.
//
// A weekly overview is written once and revisited. What it says about that week
// should not change in March because a note was retagged in February — some
// overviews are a record, not a view. So a bridge can be frozen, and everything
// below exists to make sure that freezing is a decision rather than a drift.
//
// §8 names the way this feature fails, and it is not a bug: live bridges feel
// slow on a big vault, freezing feels like the fix, and a year later the vault
// is full of frozen blocks nobody remembers freezing, disagreeing with the notes
// they were taken from. Hence: never automatic, never silent, never a
// performance suggestion, and always labelled with when.

// The body region a frozen bridge lives in.
//
// Derived rather than typed by the reader, unlike `note:<key>` and its
// siblings. Those keys are part of the directive because the reader chose to
// store something; freezing is an afterthought taken on a block that already
// existed, and demanding a key at write time would mean either editing the
// directive on freeze — rewriting the reader's markdown behind them — or making
// every bridge carry a key it will probably never use.
//
// Stable across renders and unique per directive on a note, which is exactly
// the uniqueness required: two bridges on one note differ by direction or
// target, and two with the same direction AND target are the same question
// asked twice.
export function snapshotKeyFor(
  direction: BridgeDirection,
  target: string
): string {
  // isValidNoteKey admits [A-Za-z0-9_-] only, and a tracker id or note type is
  // reader-supplied, so anything else collapses to a dash rather than
  // producing a key the store will reject at write time.
  const safe = target.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `bridge-${direction}-${safe || "any"}`;
}

// Where the "when" lives.
//
// A SECOND REGION rather than a header line inside the first, and the reason is
// §3.2's "links and values, not markup": the snapshot has to survive the plugin
// being uninstalled and stay editable as plain text. A `taken: …` line at the
// top of the content would be metadata the reader is invited to edit, sitting
// in the middle of the thing they were invited to edit — and the first person
// to delete it would silently turn a frozen block into an undated one.
export function snapshotMetaKeyFor(key: string): string {
  return `${key}-taken`;
}

// One row of a frozen bridge, as it goes to disk.
export interface SnapshotRow {
  // A vault path, when the row points at a note. Null for a reading.
  path: string | null;
  label: string;
  // The date or value beside it.
  detail: string;
}

// The three characters a wikilink alias cannot carry.
//
// `]` closes the link early, `[` opens a nested one, and `|` starts a second
// alias — so a note titled "Lesson [draft]" serialised to
// `[[path|Lesson [draft]]]`, which is a BROKEN LINK IN OBSIDIAN, not merely one
// this plugin failed to parse back. That matters more than a rendering bug:
// §3.2's whole claim for storing plain markdown is that a frozen bridge is a
// list of links whether or not ChronoAnvil is installed, and a malformed wikilink
// is exactly the case where that claim fails.
//
// Substituted rather than escaped because a wikilink alias has no escape: there
// is no spelling of `]` that survives inside one. The replacements are visually
// close and lossless in the only sense that matters here — the LINK is exact,
// because it is the path that resolves, and the alias is a display label.
//
// Applied to the detail as well. A date or a number cannot contain these today,
// which is the argument for not bothering and the reason to bother anyway: a
// tracker whose value is a `select` string is one release away, and the failure
// is silent when it comes.
function linkSafe(text: string): string {
  return text.replace(/\[/g, "(").replace(/\]/g, ")").replace(/\|/g, "/");
}

// Plain markdown, deliberately.
//
// Wikilinks rather than the plugin's own markup, so a frozen bridge is a list
// of links in a note whether or not ChronoAnvil is installed — which is the point:
// the reader asked to edit and revisit these, and a block that renders as raw
// HTML comments once the plugin is gone is not something anyone can revisit.
export function serializeSnapshot(rows: readonly SnapshotRow[]): string {
  return rows
    .map((r) => {
      const label = linkSafe(r.label);
      const detail = r.detail ? ` — ${linkSafe(r.detail)}` : "";
      // The path is NOT sanitized: it has to resolve, and a path containing
      // one of these is a file Obsidian could not link to either. Such a row
      // degrades to a plain line rather than a broken link.
      return /[[\]|]/.test(r.path ?? "")
        ? `- ${label}${detail}`
        : r.path
          ? `- [[${r.path}|${label}]]${detail}`
          : `- ${label}${detail}`;
    })
    .join("\n");
}

// A cheap, stable checksum of what was written.
//
// Not cryptographic and not trying to be. Its only job is to answer "has a human
// touched this since we wrote it", and the cost of a collision is a warning that
// fails to appear on one edit — against the cost of a dependency, or of storing
// a second copy of the content to diff against, which would make the snapshot
// twice the size for a question asked once per refresh.
export function snapshotChecksum(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function serializeSnapshotMeta(takenIso: string, content: string): string {
  return `taken: ${takenIso}\nsum: ${snapshotChecksum(content)}`;
}

export interface SnapshotState {
  frozen: boolean;
  takenIso: string | null;
  // The reader has changed the region since it was written. A snapshot someone
  // has annotated is no longer a snapshot, and overwriting it silently is the
  // one way this feature can lose work — §3.2.
  edited: boolean;
}

export function snapshotState(
  regionText: string,
  metaText: string
): SnapshotState {
  // Absent region, not empty content: a frozen bridge that legitimately found
  // nothing still froze. The caller distinguishes the two, because
  // readNoteRegion returns "" for both — see hasSnapshotRegion.
  if (!metaText.trim() && !regionText.trim()) {
    return { frozen: false, takenIso: null, edited: false };
  }
  const taken = /^taken:\s*(\S+)/m.exec(metaText)?.[1] ?? null;
  const sum = /^sum:\s*(\S+)/m.exec(metaText)?.[1] ?? null;
  return {
    frozen: true,
    takenIso: taken,
    // No recorded sum means we cannot tell, and "cannot tell" has to resolve to
    // "warn". The alternative silently overwrites a region whose provenance is
    // unknown, which is the exact loss §3.2 forbids.
    edited: sum == null || sum !== snapshotChecksum(regionText),
  };
}
