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
import { PICK_JOIN, splitPicks } from "./directive-grammar";
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
  check: "host-period" | "direction" | "target-date" | "selector";
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
  // ── AND THE NAVIGATOR IT WAS COMPOSED WITH (1.0.88) ─────────────────
  //
  // The unit of a `period-nav:` sharing this bridge's fence, or null where the
  // bridge stands alone. The journal-side section composes the two together and
  // `journal-sections.ts` says why in as many words: *"a leaf note has no
  // period of its own and the anchor has to come from somewhere"*. The
  // navigator is that somewhere — but it reaches the bridge through the note's
  // frontmatter, and it writes that property on a CLICK. Until the reader has
  // pressed one, the note declares nothing and the bridge refused while the
  // navigator directly above it was showing a period: one card saying two
  // things. This is the navigator's own answer, asked before the refusal.
  navUnit: PeriodBounds["unit"] | null;
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

// ── the directive line, read and written (1.0.89) ─────────────────────

// A bridge directive, taken apart.
//
// WHY THIS IS HERE AND NOT IN `directive-grammar.ts`. That file's `splitArgHead`
// cuts an argument at its first `:`, which is right for every directive whose
// argument is one value and wrong for this one: `bridge-readings:Mood is:lesson`
// would come back as `Mood` and `lesson`, having eaten the selector's own key.
// The bridge's argument is a target followed by a space-separated filter tail in
// diary-index's grammar, so it needs its own reader — and this is the file that
// already owns what that tail may contain.
//
// IT IS THE SAME PARSE THE RENDERER RUNS, not a second one that agrees by
// inspection. `buildBridge` split the target off itself and `readingsFlags`
// stripped the flag one function away from it; both now call this, so the window
// that WRITES a line and the renderer that READS it cannot drift. That is the
// rule `directive-grammar.ts` was extracted to keep — "the two share a body
// rather than agreeing by inspection, the mistake this file exists to have
// stopped making".
export interface BridgeDirective {
  direction: BridgeDirection;
  // The kind id (notes) or tracker id (readings). Empty where the reader has
  // added a bridge and not yet chosen one — an ordinary first state since 3.8,
  // not a typo, and `planBridge` refuses it by naming the alternatives.
  target: string;
  // `#trend`, readings only. See `writeBridgeArg` for why the direction decides.
  trend: boolean;
  // `#entries`, readings only. Whether the rows are every diary entry in the
  // window rather than only the days that carry a reading. 1.0.94.
  //
  // A SECOND FLAG RATHER THAN A SECOND VALUE OF THE FIRST, because the two are
  // not alternatives: a trend draws the shape of the readings and this lists the
  // days they were logged on, so all four combinations mean something. Neither
  // is today's readings list; `#trend` alone is the chart; this alone widens the
  // list to every entry; both draws the chart over the full entry list.
  entries: boolean;
  // THE REST OF THE CYCLE, readings only: the other trackers this one block can
  // be stepped to, in the order it steps through them. 1.0.95.
  //
  //   "a row above the chart to cycle through enabled trackers"
  //
  // `target` IS THE HEAD OF THIS LIST AND NOT A FIELD BESIDE IT, which is the
  // decision the whole feature rests on. A cycle could have been stored as a
  // set plus a pointer into it, and then two things would say which tracker the
  // block is about — the plugin has `snapshotKeyFor`, `planBridge`, the
  // catalogue, `targetLabel` and the window's own TRACKER answer all reading
  // `target` today, and every one of them would have had to learn which of the
  // two to believe. So the list is stored head-first: `target` keeps meaning
  // exactly what it has meant since 2.57 — the tracker this block draws — and
  // this is what it may be stepped to next.
  //
  // STEPPING IS THEREFORE A ROTATION, not a moving index. `[>]` on
  // `Mood+Energy+Sleep` writes `Energy+Sleep+Mood`: the reader's cycle ORDER
  // survives intact, because a rotation preserves a cycle exactly and only
  // moves where it starts. See `withBridgeCycle`.
  //
  // EMPTY IS THE ORDINARY CASE and is every bridge written before this release:
  // one tracker, no list, no stepper, and `writeBridgeArg` emits the same byte
  // it always has.
  cycle: string[];
  // The raw selector text after the target, untouched.
  filters: string;
  // The reader's own title, after the `|`, or null where the line carries none.
  label: string | null;
}

// The argument half: everything after the colon and before the label bar.
//
// THE DIRECTION DECIDES WHETHER A `#` IS A FLAG, which is not a parameter smell
// but the grammar: `#trend` is a rendering choice about a series and there is no
// series on the notes side. So `bridge-notes:meal#trend` leaves the `#trend` in
// the target and earns `No note type called "meal#trend"` — the message it earns
// today, kept deliberately. Stripping a flag the directive does not have would
// render a working block for a line that asked for something impossible.
export function readBridgeArg(
  direction: BridgeDirection,
  arg: string
): {
  target: string;
  cycle: string[];
  trend: boolean;
  entries: boolean;
  filters: string;
} {
  const trimmed = arg.trim();
  const cut = trimmed.search(/\s/);
  const head = cut === -1 ? trimmed : trimmed.slice(0, cut);
  const filters = cut === -1 ? "" : trimmed.slice(cut + 1).trim();
  if (direction === "notes") {
    return { target: head, cycle: [], trend: false, entries: false, filters };
  }
  const hash = head.indexOf("#");
  if (hash === -1) {
    return { ...ring(head), trend: false, entries: false, filters };
  }
  // THE SPLIT WAS ALWAYS MULTI-FLAG AND NOW SOMETHING ELSE READS IT. `#trend`
  // was the only token for three releases and this list has been built the same
  // way the whole time, which is what makes a second flag a line here rather
  // than a grammar change.
  const flags = head
    .slice(hash + 1)
    .split("#")
    .map((f) => f.trim().toLowerCase());
  return {
    ...ring(head.slice(0, hash)),
    trend: flags.includes("trend"),
    entries: flags.includes("entries"),
    filters,
  };
}

// The target piece, taken apart into the tracker shown and the rest of its
// cycle. 1.0.95.
//
// READINGS ONLY, AND THE SAME RULE `#` FOLLOWS. A notes bridge's target is a
// note TYPE, so `bridge-notes:meal+dinner` keeps its `+` and earns
// `No note type called "meal+dinner"` — the message a typo deserves. Splitting
// a list the directive does not have would render a working block for a line
// that asked for something impossible, which is the argument `readBridgeArg`
// already makes about `#trend` one paragraph up.
//
// EMPTY PIECES AND DUPLICATES GO, in `splitPicks` rather than here — it is the
// one splitter the control at the other end composes with, and it states why.
//
// AN EMPTY HEAD IS STILL AN ANSWER — a bridge the reader has added and not yet
// configured, the ordinary first state since 3.8 — so this returns `""` rather
// than refusing, exactly as the unsplit read did.
function ring(piece: string): { target: string; cycle: string[] } {
  const parts = splitPicks(piece);
  return { target: parts[0] ?? "", cycle: parts.slice(1) };
}

export function writeBridgeArg(d: {
  direction: BridgeDirection;
  target: string;
  cycle?: string[];
  trend: boolean;
  entries: boolean;
  filters: string;
}): string {
  // TREND FIRST, ENTRIES SECOND, AND THE ORDER IS NOT ARBITRARY. `withToken`
  // APPENDS — the section window writes `#entries` through it onto a line that
  // may already carry `#trend` — so writing them in the other order here would
  // mean the window and this function produce different bytes for the same two
  // answers, and a reader who used both doors would see the line rewritten by
  // whichever they touched last.
  //
  // `readBridgeArg` is order-free, so a hand-written `#entries#trend` renders
  // identically and is normalised to this order the first time either toggle is
  // pressed. That is the one byte this function will change without being asked
  // to, and it is the same normalisation `withToken` would have applied.
  const flags =
    d.direction === "readings"
      ? `${d.trend ? "#trend" : ""}${d.entries ? "#entries" : ""}`
      : "";
  // AND THE CYCLE JOINS THE HEAD, BEFORE THE FLAGS (1.0.95). The flags belong
  // to the BLOCK rather than to any one tracker in it — `#trend` is how the
  // block is drawn and `#entries` is which days it rows — so they sit after the
  // whole list, which is also the only place a reader could put them without
  // `ring` reading `trend` as a tracker id.
  //
  // A ONE-TRACKER BRIDGE WRITES THE BYTE IT ALWAYS WROTE. `cycle` is optional
  // here and empty on every line in every vault before this release, so
  // nothing on disk is rewritten by this release existing — the same
  // omitted-default discipline `serializeChartSpec` keeps for its own tokens.
  // THE DIRECTION DECIDES WHETHER A `+` IS A LIST, the same way it decides
  // whether a `#` is a flag: a notes bridge's cycle is dropped here rather than
  // joined, so this cannot quietly concatenate two note-type ids into one.
  const ids = d.direction === "readings" ? [d.target, ...(d.cycle ?? [])] : [d.target];
  const list = ids
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .join(PICK_JOIN);
  const tail = d.filters.trim();
  return `${list}${flags}${tail ? ` ${tail}` : ""}`;
}

// ── ONE FLAG, WRITTEN ONTO THE LINE THE READER IS LOOKING AT (1.0.94) ────
//
// Pure, and that is what it is for. `setBridgeTrend` held this arithmetic inside
// a `vault.process` callback, which made it reachable only by writing a file —
// and 1.0.94 needs the same write from a second door, `applySections`, where
// the entries flag has to land in the same pass as every other answer the
// bridge window was given. One write on lines serves both: the toggle wraps it
// in `process`, the planner hands it the section's own chunk.
//
// LINES RATHER THAN TEXT, because the second caller has lines and no text — a
// chunk is a slice of the reader's file — and a function that joined and re-split
// around that caller would be the only thing deciding where the newlines went.
//
// SOLE OR NOTHING, which is `setBridgeTrend`'s rule carried over verbatim and
// still the ambiguity rule `soleArgSpanIn` states for every other answer in the
// plugin: a note with two readings bridges on one tracker has two lines this
// could mean, and rewriting the first is an answer nothing may claim to have
// read. The section machinery cannot compose that shape, so this guards a
// hand-written note rather than a case the plugin produces — and it comes back
// `null` rather than throwing.
//
// `null` AND AN UNCHANGED STRING ARE DIFFERENT ANSWERS, which is why the return
// is nullable rather than just "the text, possibly the same". A missing or
// doubled line is something to say out loud; a flag already as asked is a write
// that must not happen. Both callers need them apart: the toggle reports the
// first as an ambiguity and the second not at all, and the window must not
// rewrite a note because a box was already ticked.
//
// THE INDENT IS KEPT. A bridge inside a list item or a callout is indented, and
// `writeBridgeDirective` composes a line from the directive's own parts with no
// idea where it sat.
//
// AND THE LAST THREE PARAGRAPHS NOW DESCRIBE `rewriteSoleBridge` (1.0.95),
// where they moved when the tracker stepper needed the same find-and-splice.
// What is left here is the change itself, which is one field.
export function withBridgeFlag(
  lines: readonly string[],
  direction: BridgeDirection,
  target: string,
  flag: "trend" | "entries",
  on: boolean
): string[] | null {
  return rewriteSoleBridge(lines, direction, target, (d) => ({
    ...d,
    [flag]: on,
  }));
}

// ── ONE TRACKER FORWARD OR BACK, ON THE SAME LINE (1.0.95) ──────────────
//
//   "a row above the chart to cycle through enabled trackers"
//
// A ROTATION, WHICH IS WHAT KEEPS THE ANSWER ONE FIELD. `target` is the head of
// the cycle and the rest follows it, so stepping forward moves the head to the
// back: `Mood+Energy+Sleep` becomes `Energy+Sleep+Mood`. The reader's cycle is
// preserved exactly — a rotation changes where a cycle starts and nothing else
// — and the tracker the block is about stays the one thing on the line that
// says so. See `BridgeDirective.cycle` for why it is not a set plus a pointer.
//
// AND THE STEP IS WRITTEN, which is the reader's own call: *"Reopen the note
// later: still Energy."* A view mode held in the render closure would be
// forgotten on the next paint, and `setBridgeTrend` already states the rule
// this follows — a control that is part of the note writes to the note, or the
// next render undoes it.
//
// A ONE-TRACKER BRIDGE COMES BACK `null` AND THAT IS NOT AN ERROR. There is
// nothing to step to, so there is no write to make; the stepper is not drawn in
// that case at all, and this is the second guard rather than the first. It
// shares `null` with the sole-or-nothing refusal deliberately: both mean "no
// single unambiguous rotation to perform", and neither caller distinguishes
// them because neither has anything different to say.
//
// ANY INTEGER STEPS. `+1` and `-1` are the two the row draws, and the modulo
// below is written so that `-1` on a three-tracker cycle lands on the last
// rather than off the front — the arithmetic JavaScript's `%` gets wrong for
// negative operands, which is the one thing in this function worth a test.
export function withBridgeCycle(
  lines: readonly string[],
  direction: BridgeDirection,
  target: string,
  step: number
): string[] | null {
  return rewriteSoleBridge(lines, direction, target, (d) => {
    const ring = [d.target, ...d.cycle];
    if (ring.length < 2) return null;
    const n = ring.length;
    const k = ((step % n) + n) % n;
    // AN INDEX MAP AND NOT TWO SLICES, WHICH IS A MUTANT'S DOING. The slice
    // form — `[...ring.slice(k), ...ring.slice(0, k)]` — gives the right answer
    // for a NEGATIVE `k` as well, because a negative slice index counts from the
    // end: `slice(-1)` is the last element and `slice(0, -1)` is the rest, which
    // is exactly the backward rotation. So the `+ n` above was unreachable, and
    // a sweep could not tell its presence from its absence. Measured, not
    // assumed.
    //
    // Written this way the normalisation is load-bearing: `ring[(j + k) % n]`
    // with a negative `k` indexes off the front of the array and comes back
    // `undefined`, so the arithmetic that keeps `k` non-negative is the thing
    // the backward step is now testing.
    const next = ring.map((_, j) => ring[(j + k) % n]);
    return { ...d, target: next[0], cycle: next.slice(1) };
  });
}

// The sole-or-nothing lookup and the splice, shared by both writers above.
//
// EXTRACTED RATHER THAN COPIED (1.0.95), because the rule it carries is one
// rule: a note with two readings bridges on one tracker has two lines a write
// could mean, and rewriting the first is an answer nothing may claim to have
// read. Two copies of that would be two chances to fix it in one place.
//
// THE CHANGE IS A FUNCTION AND MAY DECLINE. `withBridgeCycle` has a second
// reason to write nothing — a cycle of one — which is a fact about the
// DIRECTIVE rather than about the lines, so it is answered where the directive
// is in hand instead of being probed for twice.
function rewriteSoleBridge(
  lines: readonly string[],
  direction: BridgeDirection,
  target: string,
  change: (d: BridgeDirective) => BridgeDirective | null
): string[] | null {
  const at: number[] = [];
  lines.forEach((line, i) => {
    const d = readBridgeDirective(line);
    if (d && d.direction === direction && d.target === target) at.push(i);
  });
  if (at.length !== 1) return null;
  const i = at[0];
  const indent = /^\s*/.exec(lines[i])![0];
  const next = change(readBridgeDirective(lines[i])!);
  if (next === null) return null;
  const out = [...lines];
  out[i] = indent + writeBridgeDirective(next);
  return out;
}

const DIRECTIVE_RE = /^bridge-(notes|readings):([^|]*)(?:\|(.*))?$/;

// One whole directive line, or null where this is not one.
export function readBridgeDirective(line: string): BridgeDirective | null {
  const m = DIRECTIVE_RE.exec(line.trim());
  if (!m) return null;
  const direction = m[1] as BridgeDirection;
  const label = m[3] == null ? null : m[3].trim();
  return { direction, label, ...readBridgeArg(direction, m[2]) };
}

// The inverse, and the only thing that composes one.
//
// The window never assembles a directive string itself: it hands a
// `BridgeDirective` to this, and `planBridge` is run over the result before it
// is written. That is §2.3's "refused twice" used a third time, at the one place
// that can PREVENT a refusal rather than report it.
export function writeBridgeDirective(d: BridgeDirective): string {
  const arg = writeBridgeArg(d);
  const label = d.label?.trim();
  return `bridge-${d.direction}:${arg}${label ? `|${label}` : ""}`;
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

  // ── OR THE PERIOD THE NAVIGATOR BESIDE IT IS SHOWING (1.0.88) ──────
  //
  // LAST, AFTER BOTH PROPERTIES, which is what keeps this from being the
  // fallback §2 refuses to have. A note that declares a period means it; a
  // dated entry IS one; only a note that says neither asks its own chrome. And
  // what the chrome says is not a guess — `periodAnchor` resolves a navigator
  // with no property to the CURRENT period and prints it on the strip, so this
  // is the window the reader is already looking at, read the same way.
  //
  // IT ANCHORS TO TODAY RATHER THAN READING THE PROPERTY, because there is no
  // property to read: the first branch takes every note that has one. The first
  // press of a navigator pill writes it and the first branch answers from then
  // on, with the same unit and the period the reader chose.
  if (host.navUnit) {
    const bounds = periodBoundsFor(host.navUnit, moment());
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

  // Check 2: whether this direction has anything to read (1.0.89).
  //
  // READINGS LIVE ON THE DIARY, AND ONLY THERE. `collectPoints` takes no
  // surface and walks `entriesOfGrain` — the diary's own entries — whatever
  // note the directive was written on. So `bridge-readings` on a diary entry
  // is a note asking itself a question and getting its own answer back, which
  // is worse than a refusal because it draws rows and looks right.
  //
  // IT WAS REACHABLE AND WRONG RATHER THAN UNREACHABLE. No catalogue composes
  // it — the diary side offers `bridge-notes` alone, which turns out to have
  // been right for a reason nobody had written down — but a hand-typed line
  // got this far, because `bridgeCatalogue` handed back the journal surface's
  // trackers and this function had no opinion about the pairing. 1.0.89 drops
  // those trackers AND states the rule here, because the catalogue is what the
  // editor offers and this is what a vault that outlived it still asks.
  //
  // AHEAD OF THE TARGET, BEHIND THE PERIOD, for the reason the order already
  // has: a note with no period cannot bridge in either direction, and a
  // direction with no store to read is not a question about which tracker.
  if (direction === "readings" && host.surface === "diary") {
    return {
      ok: false,
      refusal: {
        check: "direction",
        message:
          "`bridge-readings` reads the diary's own readings, so a diary entry " +
          "asking for them would be reading itself. Use `bridge-notes:` to pull " +
          "journal notes into this entry, or put a readings bridge on a journal note.",
      },
    };
  }

  // Check 3: the target, and whether it can be joined by date at all.
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

  // Check 4: the selectors.
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
// list of links the reader can open and edit (see `serializeSnapshot` for how
// far that reaches), and a malformed wikilink is exactly the case where even
// the narrow version of the claim fails.
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
// Wikilinks rather than the plugin's own markup, so what a reader opens and
// edits is a list of links: the reader asked to revisit these, and a block
// written in the plugin's own markup is not something anyone can revisit.
//
// ── AND IT DOES NOT YET SURVIVE AN UNINSTALL, WHICH THIS USED TO CLAIM ──
//
// The claim here was "a list of links in a note whether or not ChronoAnvil is
// installed", and `plain-markdown.ts` cites this function as the precedent for
// that whole doctrine. It is not true of the result: `writeNoteRegion` puts
// these lines INSIDE `<!--chronoanvil:…-->`, so with the plugin gone they are
// inside a comment and render as nothing, and the exporter's own
// `<!--chronoanvil:[\s\S]*?-->` deletes them outright.
//
// 5.6 already built the answer and named it — a BRACKET form, whose markers go
// and whose contents stay, "because that content is a field's value and the
// field is going; a bracket's markers are around the reader's own document".
// A frozen bridge is the second thing in the tree with that shape. Moving it
// there is a storage change plus a migration for every snapshot already
// written, so it is its own round rather than a line here; what is not
// deferrable is the sentence, because a comment asserting a promise the code
// does not keep is worse than the gap it describes. 1.0.89.
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
