// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Special events — the diary's second layer of dated information.
//
// An entry says what a day *was like*; an event says what the day *is*. A
// birthday, a public holiday, a business trip, a week off sick: facts that are
// true of the date whether or not you ever wrote an entry for it. The two are
// deliberately kept apart — see the note on `expandEvents` below and the
// invariant test in test/pure-logic.test.ts — because the moment events start
// creating entries, "days logged" stops meaning anything.
//
// Storage is one list in the frontmatter of a single vault note (paths.events,
// `02 - Diary/Events.md` by default) under the `almanac-events` key. Trackers
// live in data.json because they're configuration — they define what you log.
// An event is content: it's a fact about your life, in the same category as the
// mood score it sits beside on the calendar, and content belongs in the vault
// in plain text where it survives without the plugin. Frontmatter rather than
// an `<!--almanac:-->` body region because Obsidian's metadata cache parses
// frontmatter for us and hands it back *synchronously* — which is what lets the
// calendar grid stay a single synchronous paint (see calendar.ts).
//
// Everything in this file is a pure function over plain data. No App, no vault,
// no moment: dates are "YYYY-MM-DD" strings and the arithmetic is done in UTC
// milliseconds, so the whole module is testable off-platform and can't drift
// with the host's timezone.

// ── Model ─────────────────────────────────────────────────────────────

export type EventKind = "recurring" | "single";

export interface EventDef {
  // Slug derived from the title at creation time and never rewritten after.
  // Opaque ids (`ev-7f3a`) would make the `events:` property written into an
  // entry's frontmatter unreadable — you'd open a note and see a row of hashes.
  // A slug gives a stable reference that is also legible in the raw file.
  id: string;
  title: string;
  kind: EventKind;

  // ── recurring only ──────────────────────────────────────────────────
  // An annual month/day. Deliberately not a rule engine: no nth-weekday, no
  // movable feasts, no intervals. A recurring event falls on the same calendar
  // date every year, which covers birthdays, anniversaries and fixed-date
  // holidays, and anything else can be entered as a single event per year.
  month?: number; // 1-12
  day?: number; // 1-31

  // ── single only ─────────────────────────────────────────────────────
  start?: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD, inclusive. Absent or equal to start = one day.

  // ── decoration ──────────────────────────────────────────────────────
  // A Lucide icon name from EVENT_ICONS and a colour name from EVENT_COLORS.
  // Both are validated on read (see eventIcon/eventColor) so a hand-edited
  // note can't inject an arbitrary icon name or a raw colour value into the
  // rendered DOM.
  icon: string;
  color: string;

  // Free text shown in the day's tooltip under the title.
  note?: string;
  // Absent counts as enabled; only an explicit `false` turns an event off.
  enabled?: boolean;
}

// Where a day sits within a multi-day event, so the grid can draw a continuous
// bar with rounded caps instead of five disconnected blocks. A single-day event
// (and every recurring one) is "solo".
export type SpanPos = "solo" | "start" | "mid" | "end";

export interface EventOccurrence {
  def: EventDef;
  iso: string;
  pos: SpanPos;
  // True when a 29 February event has been shifted onto the 28th because the
  // year isn't a leap year. Surfaced in the tooltip so the shift is visible
  // rather than silently wrong.
  shifted?: boolean;
}

// ── Decorations ───────────────────────────────────────────────────────
// A curated set of Lucide icons, grouped so the picker reads as themes rather
// than an alphabetical wall. Lucide ships thousands of icons; offering all of
// them would mean a search field and a lot of scrolling to decorate a birthday.
// These are the ones a diary actually reaches for.
export interface IconGroup {
  label: string;
  icons: string[];
}

export const EVENT_ICONS: IconGroup[] = [
  {
    label: "Personal",
    icons: ["cake", "gift", "party-popper", "heart", "baby", "glass-water"],
  },
  {
    label: "Travel",
    icons: ["plane", "train-front", "car", "luggage", "tent", "map-pin"],
  },
  {
    label: "Health",
    icons: ["thermometer", "stethoscope", "bed", "pill", "activity"],
  },
  {
    label: "Work",
    icons: ["briefcase", "presentation", "handshake", "building-2", "clock"],
  },
  {
    label: "Holiday",
    icons: ["flag", "tree-pine", "sparkles", "star", "sun", "moon"],
  },
  {
    label: "Other",
    icons: ["bookmark", "bell", "graduation-cap", "home", "music", "circle-dot"],
  },
];

const ICON_SET = new Set(EVENT_ICONS.flatMap((g) => g.icons));
export const DEFAULT_EVENT_ICON = "star";

// Eight named swatches, each backed by a CSS variable (--am-ev-<name>) that
// styles.css defines once per theme. The stored value is the *name*, never a
// colour literal: a hex picker would let a user choose something unreadable in
// one of the two themes, and would put user-controlled text directly into a
// style attribute.
export const EVENT_COLORS = [
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "grey",
] as const;
export type EventColor = (typeof EVENT_COLORS)[number];
const COLOR_SET = new Set<string>(EVENT_COLORS);
export const DEFAULT_EVENT_COLOR: EventColor = "blue";

export function eventIcon(def: EventDef): string {
  return ICON_SET.has(def.icon) ? def.icon : DEFAULT_EVENT_ICON;
}

export function eventColor(def: EventDef): string {
  return COLOR_SET.has(def.color) ? def.color : DEFAULT_EVENT_COLOR;
}

// ── Date helpers ──────────────────────────────────────────────────────
// Plain UTC arithmetic over "YYYY-MM-DD". Using UTC throughout means a day
// never shifts under a DST boundary, which a local-time Date would do twice a
// year — and always in the small hours, so it would look like a random bug.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIso(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}`;
}

const DAY_MS = 86_400_000;

export function addDays(iso: string, n: number): string {
  return fromMs(toMs(iso) + n * DAY_MS);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toMs(toIso) - toMs(fromIso)) / DAY_MS);
}

// ── Parsing ───────────────────────────────────────────────────────────
// Deliberately lenient. This reads a file a user can hand-edit, and one bad
// row must not cost them the other forty: anything unusable is dropped and the
// rest is kept. Nothing here throws.

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(asString(v));
  return Number.isInteger(n) ? n : null;
}

export function normalizeEvent(raw: unknown): EventDef | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title = asString(r.title);
  if (!title) return null;

  const icon = asString(r.icon);
  const color = asString(r.color);
  const note = asString(r.note);
  const enabled = r.enabled === false ? false : true;
  const id = asString(r.id) || slugifyEventId(title, []);

  const base = {
    id,
    title,
    icon: ICON_SET.has(icon) ? icon : DEFAULT_EVENT_ICON,
    color: COLOR_SET.has(color) ? color : DEFAULT_EVENT_COLOR,
    ...(note ? { note } : {}),
    ...(enabled ? {} : { enabled: false }),
  };

  // The kind field is advisory: what actually decides is which date fields are
  // present and usable. A row claiming to be recurring with only a `start` is
  // more likely a mislabelled single event than a typo worth discarding.
  const month = asInt(r.month);
  const day = asInt(r.day);
  const hasRecurring =
    month != null && day != null && month >= 1 && month <= 12 && day >= 1 && day <= 31;

  const start = asString(r.start);
  const hasSingle = isValidIso(start);

  const kind = asString(r.kind);
  if (kind === "recurring" && hasRecurring) {
    return { ...base, kind: "recurring", month: month!, day: day! };
  }
  if (kind === "single" && hasSingle) {
    return { ...base, kind: "single", ...spanFields(start, asString(r.end)) };
  }
  if (hasRecurring) return { ...base, kind: "recurring", month: month!, day: day! };
  if (hasSingle) {
    return { ...base, kind: "single", ...spanFields(start, asString(r.end)) };
  }
  return null;
}

// Normalise a start/end pair: an invalid or absent end collapses to a one-day
// event, and a reversed range is swapped rather than rejected (someone typed
// the dates in the order they thought of them).
function spanFields(start: string, end: string): { start: string; end?: string } {
  if (!isValidIso(end) || end === start) return { start };
  return end < start ? { start: end, end: start } : { start, end };
}

export function parseEvents(raw: unknown): EventDef[] {
  if (!Array.isArray(raw)) return [];
  const out: EventDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const def = normalizeEvent(item);
    if (!def) continue;
    // Duplicate ids would make edit-by-id ambiguous; the later one is
    // re-slugged rather than dropped, so no event silently disappears.
    if (seen.has(def.id)) def.id = uniqueId(def.id, seen);
    seen.add(def.id);
    out.push(def);
  }
  return out;
}

// Frontmatter-ready plain objects: optional fields are omitted rather than
// written as null, so the note stays readable and a round-trip is stable.
export function serializeEvents(defs: EventDef[]): Record<string, unknown>[] {
  return defs.map((d) => {
    const out: Record<string, unknown> = {
      id: d.id,
      title: d.title,
      kind: d.kind,
    };
    if (d.kind === "recurring") {
      out.month = d.month;
      out.day = d.day;
    } else {
      out.start = d.start;
      if (d.end && d.end !== d.start) out.end = d.end;
    }
    out.icon = eventIcon(d);
    out.color = eventColor(d);
    if (d.note) out.note = d.note;
    if (d.enabled === false) out.enabled = false;
    return out;
  });
}

// ── Ids ───────────────────────────────────────────────────────────────

export function slugifyEventId(title: string, existing: Iterable<string>): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      // Strip combining marks, so "München" slugs as "munchen" rather than
      // losing the vowel entirely.
      .replace(/[\u0300-\u036f]/g, "")
      // Apostrophes are deleted rather than treated as separators: a
      // possessive is one word, and "anna-s-birthday" is precisely the kind of
      // unreadable id this slug exists to avoid.
      .replace(/['\u2019]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "event";
  return uniqueId(base, new Set(existing));
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ── Occurrences ───────────────────────────────────────────────────────

function isEnabled(def: EventDef): boolean {
  return def.enabled !== false;
}

// The ISO date a recurring event falls on in a given year.
//
// Two guards, both for dates that can't exist in every year: 29 February in a
// common year shifts back to the 28th (flagged, so the tooltip can say so), and
// a day beyond the month's length — only reachable by hand-editing the note —
// clamps to the last day rather than rolling into the next month, which is what
// naive date arithmetic would do.
export function recurringIso(
  def: EventDef,
  year: number
): { iso: string; shifted: boolean } | null {
  if (def.month == null || def.day == null) return null;
  const max = daysInMonth(year, def.month);
  const day = Math.min(def.day, max);
  return {
    iso: `${year}-${pad(def.month)}-${pad(day)}`,
    shifted: day !== def.day,
  };
}

// The inclusive [start, end] span of a single event, or null if unusable.
export function eventSpan(def: EventDef): { start: string; end: string } | null {
  if (def.kind !== "single" || !def.start || !isValidIso(def.start)) return null;
  const end = def.end && isValidIso(def.end) ? def.end : def.start;
  return end < def.start ? { start: end, end: def.start } : { start: def.start, end };
}

export function isMultiDay(def: EventDef): boolean {
  const span = eventSpan(def);
  return span != null && span.start !== span.end;
}

// Every occurrence falling inside [fromIso, toIso], keyed by day.
//
// This is the only function the calendar grid calls, and it is the whole reason
// events can never conjure a diary entry into existence: it reads a list of
// definitions and returns dates. It has no App, no vault access and no way to
// create anything. The grid merges what comes back here with a separately-built
// map of real entries, at paint time, in the cell — so a marked day with no
// entry stays visibly a day with no entry.
export function expandEvents(
  defs: EventDef[],
  fromIso: string,
  toIso: string
): Map<string, EventOccurrence[]> {
  const byDay = new Map<string, EventOccurrence[]>();
  if (!isValidIso(fromIso) || !isValidIso(toIso) || toIso < fromIso) return byDay;

  const push = (iso: string, occ: EventOccurrence) => {
    const list = byDay.get(iso);
    if (list) list.push(occ);
    else byDay.set(iso, [occ]);
  };

  const fromYear = Number(fromIso.slice(0, 4));
  const toYear = Number(toIso.slice(0, 4));

  for (const def of defs) {
    if (!isEnabled(def)) continue;

    if (def.kind === "recurring") {
      for (let year = fromYear; year <= toYear; year++) {
        const hit = recurringIso(def, year);
        if (!hit || hit.iso < fromIso || hit.iso > toIso) continue;
        push(hit.iso, {
          def,
          iso: hit.iso,
          pos: "solo",
          ...(hit.shifted ? { shifted: true } : {}),
        });
      }
      continue;
    }

    const span = eventSpan(def);
    if (!span || span.end < fromIso || span.start > toIso) continue;

    // Clip to the window, but derive `pos` from the *true* span: a trip that
    // began last month should render as a continuous bar running off the left
    // edge of the grid, not as one that starts on the 1st.
    const first = span.start < fromIso ? fromIso : span.start;
    const last = span.end > toIso ? toIso : span.end;
    const solo = span.start === span.end;

    for (let iso = first; iso <= last; iso = addDays(iso, 1)) {
      const pos: SpanPos = solo
        ? "solo"
        : iso === span.start
          ? "start"
          : iso === span.end
            ? "end"
            : "mid";
      push(iso, { def, iso, pos });
    }
  }

  // Bars behind badges: multi-day spans sort first so the grid can lay them
  // down as background before stamping single-day icons on top. Ties break on
  // title so a day's tooltip lists the same order on every render.
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const am = a.pos === "solo" ? 1 : 0;
      const bm = b.pos === "solo" ? 1 : 0;
      if (am !== bm) return am - bm;
      return a.def.title.localeCompare(b.def.title);
    });
  }
  return byDay;
}

// The events falling on one specific day. Used when an entry is created, to
// stamp the day's event ids into its frontmatter.
export function eventsOnDay(defs: EventDef[], iso: string): EventDef[] {
  const day = expandEvents(defs, iso, iso).get(iso) ?? [];
  return day.map((o) => o.def);
}

export interface UpcomingEvent {
  def: EventDef;
  iso: string; // the date it falls on (a span's start, even if that's past)
  daysAway: number; // negative for an in-progress span
  ongoing: boolean; // a multi-day span that has started but not finished
}

// The next `count` events on or after `fromIso`.
//
// Computed per definition rather than by expanding a fixed horizon, so an event
// three years out still shows up once the nearer ones run out — a fixed 365-day
// window would silently hide it. An in-progress span is included and sorts by
// its start date, which puts "you are on this trip right now" at the top where
// it belongs.
export function upcomingEvents(
  defs: EventDef[],
  fromIso: string,
  count: number
): UpcomingEvent[] {
  if (!isValidIso(fromIso) || count <= 0) return [];
  const year = Number(fromIso.slice(0, 4));
  const out: UpcomingEvent[] = [];

  for (const def of defs) {
    if (!isEnabled(def)) continue;

    if (def.kind === "recurring") {
      // This year's date if it hasn't passed, otherwise next year's.
      const thisYear = recurringIso(def, year);
      const hit =
        thisYear && thisYear.iso >= fromIso ? thisYear : recurringIso(def, year + 1);
      if (!hit) continue;
      out.push({
        def,
        iso: hit.iso,
        daysAway: daysBetween(fromIso, hit.iso),
        ongoing: false,
      });
      continue;
    }

    const span = eventSpan(def);
    if (!span || span.end < fromIso) continue;
    out.push({
      def,
      iso: span.start,
      daysAway: daysBetween(fromIso, span.start),
      ongoing: span.start < fromIso,
    });
  }

  out.sort((a, b) =>
    a.iso === b.iso ? a.def.title.localeCompare(b.def.title) : a.iso < b.iso ? -1 : 1
  );
  return out.slice(0, count);
}

// ── Display ───────────────────────────────────────────────────────────

// "12 April" / "9–13 March 2026" — the date as an event describes it, which is
// not the same as the date a diary entry carries. A recurring event has no
// year to show; a span reads as a range.
export function describeEventDate(def: EventDef): string {
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (def.kind === "recurring") {
    if (def.month == null || def.day == null) return "";
    return `${def.day} ${MONTHS[def.month - 1]}, every year`;
  }
  const span = eventSpan(def);
  if (!span) return "";
  const [sy, sm, sd] = span.start.split("-").map(Number);
  if (span.start === span.end) return `${sd} ${MONTHS[sm - 1]} ${sy}`;
  const [ey, em, ed] = span.end.split("-").map(Number);
  const days = daysBetween(span.start, span.end) + 1;
  const range =
    sy === ey && sm === em
      ? `${sd}–${ed} ${MONTHS[sm - 1]} ${sy}`
      : sy === ey
        ? `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${sy}`
        : `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  return `${range} (${days} days)`;
}

// "in 3 days" / "today" / "day 2 of 5" — the relative phrasing the upcoming
// list uses. Kept here beside the date maths rather than in the widget so it
// can be tested without a DOM.
export function describeRelative(item: UpcomingEvent): string {
  if (item.ongoing) {
    const span = eventSpan(item.def);
    if (span) {
      const total = daysBetween(span.start, span.end) + 1;
      const nth = -item.daysAway + 1;
      return `day ${nth} of ${total}`;
    }
    return "in progress";
  }
  if (item.daysAway === 0) return "today";
  if (item.daysAway === 1) return "tomorrow";
  if (item.daysAway < 7) return `in ${item.daysAway} days`;
  if (item.daysAway < 14) return "next week";
  if (item.daysAway < 60) return `in ${Math.round(item.daysAway / 7)} weeks`;
  return `in ${Math.round(item.daysAway / 30)} months`;
}

// The tooltip text for one day's worth of occurrences: one line per event,
// with its note and any leap-day shift appended.
export function describeDay(occurrences: EventOccurrence[]): string {
  return occurrences
    .map((o) => {
      let line = o.def.title;
      if (o.pos !== "solo") {
        const span = eventSpan(o.def);
        if (span) {
          const total = daysBetween(span.start, span.end) + 1;
          const nth = daysBetween(span.start, o.iso) + 1;
          line += ` (day ${nth} of ${total})`;
        }
      }
      if (o.shifted) line += " — 29 Feb, shown on the 28th";
      if (o.def.note) line += `\n    ${o.def.note}`;
      return line;
    })
    .join("\n");
}
