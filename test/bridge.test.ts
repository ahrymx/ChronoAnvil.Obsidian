// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Refusals first, results second — the order the 2.57 plan stages them in, and
// the order they matter in. A bridge that returns the wrong rows is a bug; a
// bridge that returns no rows without saying why is the failure mode §2 exists
// to prevent, because it is indistinguishable from a correct empty answer.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readSrc } from "./sources";
import { computeSectionRuns } from "../src/ui/headerbar";
import { OBSIDIAN_DOM } from "../src/core/constants";
import { DEFAULT_BRIDGE_TRACKER } from "../src/journals/journal-sections";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import {
  BRIDGE_SELECTORS,
  bridgeRefusal,
  bridgeWindow,
  otherSurface,
  planBridge,
} from "../src/core/bridge";
import {
  serializeSnapshot,
  serializeSnapshotMeta,
  snapshotKeyFor,
  snapshotMetaKeyFor,
  snapshotState,
} from "../src/core/bridge";
import { snapshotChecksum } from "../src/core/bridge";
import type { SnapshotRow } from "../src/core/bridge";
import { parseSnapshotLine } from "../src/ui/widgets/bridge-widgets";
import { isValidNoteKey } from "../src/core/notestore";
import { DEFAULT_PATHS, ROOT_CHILDREN } from "../src/core/constants";
import type {
  BridgeCatalogue,
  BridgeHostFacts,
  BridgeSpec,
} from "../src/core/bridge";

// A host note as plain data. `fm` is the frontmatter; presence is what counts,
// so a blank value still declares the property.
const host = (
  fm: Record<string, unknown>,
  iso: string | null = null,
  surface: "diary" | "journal" = "diary"
): BridgeHostFacts => ({
  declares: (prop) => prop in fm,
  valueOf: (prop) => fm[prop],
  iso,
  surface,
});

const catalogue: BridgeCatalogue = {
  kinds: [
    { id: "meal", label: "Meal", dated: true },
    { id: "lesson", label: "Lesson", dated: true },
    { id: "recipe", label: "Recipe", dated: false },
  ],
  trackers: [
    { id: "exercise", label: "Exercise" },
    { id: "mood", label: "Mood" },
  ],
};

const spec = (over: Partial<BridgeSpec> = {}): BridgeSpec => ({
  direction: "notes",
  target: "meal",
  filters: "",
  host: host({ "week-start": "2026-07-20" }),
  catalogue,
  ...over,
});

// ── the refusals ──────────────────────────────────────────────────────

describe("a note with no period is refused, not defaulted", () => {
  it("refuses a plain note rather than reaching for the last 30 days", () => {
    const result = bridgeWindow(host({ title: "Some note" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.check).toBe("host-period");
  });

  it("names the properties that would fix it", () => {
    const result = bridgeWindow(host({}));
    if (result.ok) throw new Error("expected a refusal");
    for (const prop of ["week-start", "month-start", "quarter-start", "year-start"]) {
      expect(result.refusal.message).toContain(prop);
    }
  });

  it("never returns an unbounded window", () => {
    // The type says both bounds are strings; this pins the behaviour behind it,
    // because the failure §2 describes is a window that silently substitutes a
    // different question rather than one that fails to compile.
    const result = bridgeWindow(host({ "month-start": "2026-07-01" }));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.start).toBeTruthy();
    expect(result.value.end).toBeTruthy();
  });
});

describe("an undated note type is refused, not guessed", () => {
  it("refuses a Recipe, which has no date", () => {
    const refusal = bridgeRefusal(spec({ target: "recipe" }));
    expect(refusal?.check).toBe("target-date");
  });

  it("says which type, and that undated notes cannot be joined by date", () => {
    const refusal = bridgeRefusal(spec({ target: "recipe" }));
    expect(refusal?.message).toContain("Recipe");
    expect(refusal?.message).toContain("date");
  });

  it("does not fall back to file creation time", () => {
    // §2.4 in one assertion. ctime is when the file was made, which for a
    // synced or imported vault is when it was copied — a bridge joined on it
    // would be confidently wrong, which is worse than refusing.
    const source = readSrc("bridge");
    expect(source).not.toMatch(/\bctime\b(?![^\n]*(?:not|never|decline|refus))/i);
  });

  it("still accepts a dated type on the same catalogue", () => {
    expect(bridgeRefusal(spec({ target: "meal" }))).toBeNull();
  });
});

describe("the host is checked before the target", () => {
  it("reports the missing period, not the undated type", () => {
    // Both are wrong here. Leading with "no Recipe has a date" would name a
    // real problem that is not the one blocking this reader.
    const refusal = bridgeRefusal(
      spec({ target: "recipe", host: host({ title: "Plain" }) })
    );
    expect(refusal?.check).toBe("host-period");
  });
});

describe("a selector that names nothing is refused", () => {
  it("refuses an unknown note type and lists what exists", () => {
    const refusal = bridgeRefusal(spec({ target: "sandwich" }));
    expect(refusal?.check).toBe("selector");
    expect(refusal?.message).toContain("meal");
    expect(refusal?.message).toContain("recipe");
  });

  it("refuses an unknown tracker and lists what exists", () => {
    const refusal = bridgeRefusal(
      spec({ direction: "readings", target: "hydration" })
    );
    expect(refusal?.check).toBe("selector");
    expect(refusal?.message).toContain("exercise");
  });

  it("refuses a filter outside the closed set", () => {
    const refusal = bridgeRefusal(spec({ filters: "sort:asc" }));
    expect(refusal?.check).toBe("selector");
    expect(refusal?.message).toContain("sort");
  });

  it("refuses a misspelled is: instead of searching for it as text", () => {
    // parseQuery's rule is that an unrecognised filter stays a search term,
    // which is right for a search box and wrong here: `is:lessn` would match
    // nothing and render an empty block that looks like a quiet week.
    const refusal = bridgeRefusal(spec({ filters: "is:lessn" }));
    expect(refusal?.check).toBe("selector");
    expect(refusal?.message).toContain("lessn");
  });

  it("refuses has: with something a note cannot have", () => {
    const refusal = bridgeRefusal(spec({ filters: "has:mood" }));
    expect(refusal?.check).toBe("selector");
  });

  it("lets free search text through", () => {
    expect(bridgeRefusal(spec({ filters: "pasta" }))).toBeNull();
  });

  it("needs a target at all", () => {
    const refusal = bridgeRefusal(spec({ target: "" }));
    expect(refusal?.check).toBe("selector");
  });
});

describe("the selector set is closed", () => {
  it("is every filter parseQuery already understands, and no more", () => {
    // The promise in §5.1: no new grammar. If this list grows, it grew because
    // someone argued for a named selector — not because an expression parser
    // arrived one operator at a time.
    expect([...BRIDGE_SELECTORS].sort()).toEqual(
      ["from", "has", "is", "tag", "to"].sort()
    );
  });
});

// ── the results ───────────────────────────────────────────────────────

describe("the window is the host note's own period", () => {
  it("resolves a week to its ISO bounds", () => {
    const result = bridgeWindow(host({ "week-start": "2026-07-22" }));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.unit).toBe("week");
    expect(result.value.start).toBe("2026-07-20");
    expect(result.value.end).toBe("2026-07-26");
  });

  it("resolves a month to its calendar bounds", () => {
    const result = bridgeWindow(host({ "month-start": "2026-02-10" }));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.start).toBe("2026-02-01");
    expect(result.value.end).toBe("2026-02-28");
  });

  it("resolves a quarter through the same helpers the quarter view uses", () => {
    const result = bridgeWindow(host({ "quarter-start": "2026-08-14" }));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.start).toBe("2026-07-01");
    expect(result.value.end).toBe("2026-09-30");
  });

  it("resolves a year", () => {
    const result = bridgeWindow(host({ "year-start": "2026-05-05" }));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.start).toBe("2026-01-01");
    expect(result.value.end).toBe("2026-12-31");
  });

  it("treats a dated entry as a window of one day", () => {
    const result = bridgeWindow(host({}, "2026-07-23"));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.unit).toBe("day");
    expect(result.value.start).toBe("2026-07-23");
    expect(result.value.end).toBe("2026-07-23");
  });

  it("accepts a declared-but-blank period property", () => {
    // The shipped templates ship `week-start:` empty until you navigate. A note
    // that says it is a weekly dashboard is one whether or not it has chosen
    // its week yet — the tolerance resolvePeriodBounds already applies.
    const result = bridgeWindow(host({ "week-start": "" }));
    expect(result.ok).toBe(true);
  });

  it("names the period it covered", () => {
    const result = bridgeWindow(host({ "month-start": "2026-02-10" }));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.label).toBe("February 2026");
  });
});

describe("a bridge reads the surface its host is not on", () => {
  it("sends a diary host to the journals", () => {
    expect(otherSurface("diary")).toBe("journal");
  });

  it("sends a journal host to the diary", () => {
    expect(otherSurface("journal")).toBe("diary");
  });

  it("carries that through to the plan", () => {
    const planned = planBridge(
      spec({ host: host({ "week-start": "2026-07-20" }, null, "journal") })
    );
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.surface).toBe("diary");
  });
});

describe("the anchor cannot be escaped", () => {
  it("clamps a from: that reaches back past the host's period", () => {
    const planned = planBridge(spec({ filters: "from:2020-01-01" }));
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.query.from).toBe("2026-07-20");
  });

  it("clamps a to: that reaches forward past it", () => {
    const planned = planBridge(spec({ filters: "to:2030-01-01" }));
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.query.to).toBe("2026-07-26");
  });

  it("lets a narrower from: stand", () => {
    const planned = planBridge(spec({ filters: "from:2026-07-23" }));
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.query.from).toBe("2026-07-23");
  });

  it("bounds an unfiltered bridge to the window on both sides", () => {
    const planned = planBridge(spec());
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.query.from).toBe("2026-07-20");
    expect(planned.value.query.to).toBe("2026-07-26");
  });
});

describe("the query goes through diary-index's own parser", () => {
  it("keeps free text as search terms", () => {
    const planned = planBridge(spec({ filters: "pasta" }));
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.query.terms).toContain("pasta");
  });

  it("passes a tag filter through unchanged", () => {
    const planned = planBridge(spec({ filters: "tag:dinner" }));
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.query.tag).toBe("#dinner");
  });

  it("resolves is: against the catalogue's kinds", () => {
    const planned = planBridge(spec({ filters: "is:lesson" }));
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.query.kind).toBe("lesson");
  });

  it("names the target's label for the block to show", () => {
    const planned = planBridge(spec({ target: "meal" }));
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.targetLabel).toBe("Meal");
  });

  it("plans a readings bridge against a tracker", () => {
    const planned = planBridge(
      spec({ direction: "readings", target: "exercise" })
    );
    if (!planned.ok) throw new Error("expected a plan");
    expect(planned.value.targetLabel).toBe("Exercise");
    expect(planned.value.direction).toBe("readings");
  });
});

// ── the arguments, pinned ─────────────────────────────────────────────

describe("the module keeps its promises", () => {
  it("adds no query grammar of its own", () => {
    // §5.1. A regex literal matching filter syntax here would be a second
    // parser; the one that exists is for *validating* tokens before handing
    // the string to parseQuery, and it recognises `key:value` and nothing else.
    const source = readSrc("bridge");
    expect(source).toContain("parseQuery");
    expect(source).not.toContain("new RegExp");
  });

  it("resolves periods through the chart stack rather than its own copy", () => {
    // §8's argument one level down: two derivations of "which days are in this
    // week" drift, and a bridge disagreeing with the chart beside it about the
    // same period is exactly that failure.
    const source = readSrc("bridge");
    expect(source).toContain("periodBoundsFor");
  });

  it("has no vault in it", () => {
    const source = readSrc("bridge");
    expect(source).not.toMatch(/from "obsidian"/);
  });
});

// ── patch 2: the two call sites ───────────────────────────────────────

describe("both directives are routed and neither skips the guard", () => {
  const widgets = () => readSrc("widgets");
  const bridge = () => readSrc("bridge-widgets");

  it("dispatches both spellings from the switch", () => {
    const src = widgets();
    expect(src).toContain('case "bridge-notes":');
    expect(src).toContain('case "bridge-readings":');
  });

  it("routes them without putting the work in the switch", () => {
    // 2.56.25's rule: the switch keeps the routing and not the work. Both
    // cases are a single delegating call.
    const src = widgets();
    expect(src).toContain("buildBridgeNotesRegion(this.plugin, rest, label, ctx)");
    expect(src).toContain("buildBridgeReadingsRegion(this.plugin, rest, label, ctx)");
  });

  it("plans through one shared entry point, so the guard cannot be on one and not the other", () => {
    // The failure this prevents: a refusal wired into bridge-notes and
    // forgotten on bridge-readings, which would render an unanchored block
    // that looks exactly like an anchored one.
    const src = bridge();
    expect(src.match(/planBridge\(/g)?.length).toBe(1);
  });

  it("refuses in the note rather than throwing or rendering empty", () => {
    const src = bridge();
    expect(src).toContain("journal-widget-error");
    expect(src).toContain("planned.refusal.message");
  });
});

describe("two directives, two stores", () => {
  it("reads the index for notes and the tracker series for readings", () => {
    // §4's whole argument. If these ever collapse to one read path, the second
    // directive has stopped earning its existence.
    const src = readSrc("bridge-widgets");
    expect(src).toContain("searchEntries");
    expect(src).toContain("collectPoints");
  });

  it("takes the series from the chart stack rather than walking the folders again", () => {
    // A second walk of the diary folders is the taskCounts/countAlmanacTasks
    // split one more time: two answers to "what did this tracker read that
    // day", agreeing right up until one of them learns a value coercion.
    const src = readSrc("bridge-widgets");
    expect(src).toContain("collectPoints(plugin.app, plugin, def)");
    expect(src).not.toContain("filesUnder");
  });

  it("never writes to the surface it read", () => {
    // §5.2. A bridge renders the other side's data; it does not transfer it,
    // so there is still exactly one copy and the owner still owns it.
    //
    // NARROWED IN PATCH 4, which added a legitimate write: freezing stores the
    // snapshot in the HOST note's own body region. The first version of this
    // banned `writeNoteRegion` outright, which was the right instinct at the
    // wrong granularity — it would have banned the snapshot too. The invariant
    // was never "no writes"; it is "no writes to a file this bridge read".
    //
    // So: every file this module resolves is the host note. A write reaching a
    // hit's path, or a diary entry a reading came from, would fail here.
    const src = readSrc("bridge-widgets");
    const resolved = [...src.matchAll(/getAbstractFileByPath\(([^)]*)\)/g)].map(
      (m) => m[1].trim()
    );
    expect(resolved.length).toBeGreaterThan(0);
    for (const arg of resolved) {
      expect(["path", "ctx.sourcePath"], `resolves ${arg}`).toContain(arg);
    }
    // And nothing reaches for a row's own path on the way to a write.
    expect(src).not.toMatch(/vault\.process\([^)]*entry\.path/);
    expect(src).not.toMatch(/vault\.modify/);
  });
});

describe("every bridge names the period it covered", () => {
  it("draws the window label in the header", () => {
    // The reader did not choose this window, the host note did — so a bridge
    // that does not say which period it read is indistinguishable from one
    // that has quietly lost most of its rows.
    // Asserted on the INVARIANT, not the markup. 2.57.7 replaced the bespoke
    // header with the shared section frame, and the first version of this test
    // named a class rather than the promise — so it failed on a change that
    // kept the promise exactly.
    const src = readSrc("bridge-widgets");
    expect(src).toContain("sectionFrame");
    expect(src).toContain("plan.window.label");
  });

  it("puts it in the frame's note slot, not a second muted span", () => {
    // `note` is "a short muted phrase after the title", which is what a window
    // is. Two muted spans competing beside a title read as two headings.
    const src = readSrc("bridge-widgets");
    const at = src.indexOf("const frame = sectionFrame(");
    const call = src.slice(at, src.indexOf("});", at));
    expect(call).toContain("note:");
    expect(call).toContain("plan.window.label");
  });

  it("declares no header styling of its own", () => {
    // The title bar, count pill, muted phrase and overflow are all the frame's.
    // Anything this stylesheet still said about them would be a second opinion.
    const css = readFileSync(
      resolve(__dirname, "..", "styles", "76-bridges.css"),
      "utf8"
    );
    for (const cls of ["am-bridge-header", "am-bridge-window", "am-bridge-more"]) {
      expect(css).not.toContain(`.${cls}`);
    }
    expect(css).toContain(".am-bridge-row");
  });
});

// ── patch 3: refused at creation, and anchored ────────────────────────

describe("period-nav routes all four units", () => {
  it("no longer collapses quarter and year to a week", () => {
    // It read `rest.trim() === "month" ? "month" : "week"` — a two-branch
    // conditional over a four-value set — so `period-nav:quarter` built a WEEK
    // navigator and wrote `week-start` onto a quarter dashboard. periodnav.ts's
    // header documented the quarter spelling the whole time and its META table
    // had all four; only the routing was narrow.
    // Asserted against CODE, not commentary. The first version of this failed
    // on the comment directly above the fix, which quotes the old expression to
    // explain it — a negative source assertion that cannot tell a line of code
    // from a line describing one is a guard that punishes writing the reason
    // down.
    const code = readSrc("widgets")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain('rest.trim() === "month" ? "month" : "week"');
    expect(code).toContain('arg === "month" || arg === "quarter" || arg === "year"');
  });

  it("has a period property for every unit it routes", () => {
    // The routing and the property table have to agree, or a unit resolves to
    // a navigator that writes nothing.
    const nav = readSrc("periodnav");
    for (const prop of ["week-start", "month-start", "quarter-start", "year-start"]) {
      expect(nav).toContain(prop);
    }
  });
});

describe("the anchor ships with the bridge", () => {
  const sections = () => readSrc("journal-sections");

  it("emits the navigator and the directive in one section", () => {
    // A journal note has no period of its own — the four `*-start` properties
    // live only on diary dashboards — so a `bridge-readings:` on a leaf could
    // ONLY ever refuse until something let the note say which period it meant.
    // Shipping the two separately would put that discovery on the reader.
    const src = sections();
    const at = src.indexOf('id: "bridge"');
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n  {", at + 10));
    expect(body).toContain("period-nav:month");
    expect(body).toContain("bridge-readings:");
  });

  it("names a tracker rather than emitting a directive that refuses", () => {
    // §2.3: a section is offered because it works. `bridge-readings:` with no
    // target refuses the moment it renders.
    const src = sections();
    expect(src).toContain("DEFAULT_BRIDGE_TRACKER");
    expect(src).not.toContain('"bridge-readings:|');
  });

  it("defaults to a tracker a fresh vault actually has", () => {
    // The catalogue holds a JournalType and no plugin, so it cannot read the
    // registry. A default that drifts from DEFAULT_SETTINGS emits a directive
    // that refuses on every note it is written into.
    expect(DEFAULT_BRIDGE_TRACKER).toBe(DEFAULT_SETTINGS.moodTrackerId);
  });

  it("is not offered on a page", () => {
    // A page names its parent instead of a date and has no frontmatter worth
    // anchoring, so a period property on one would be a window nothing else on
    // the page agrees with. Refused by not being offered — §2.3's first half.
    const src = sections();
    const at = src.indexOf('id: "bridge"');
    const body = src.slice(at, src.indexOf("\n  {", at + 10));
    expect(body).toContain('applies: (ctx) => ctx.noteKind !== "page"');
  });

  it("is off by default", () => {
    const src = sections();
    const at = src.indexOf('id: "bridge"');
    const body = src.slice(at, src.indexOf("\n  {", at + 10));
    expect(body).toContain("default: never");
  });
});

describe("the period property stays scoped to the bridge", () => {
  it("ships no period-scoped diary widget on a leaf section", () => {
    // The property a bridge section writes is the same `month-start` a diary
    // dashboard carries, so anything period-scoped WOULD read it. Nothing
    // period-scoped is offered on a leaf, and that is the scoping — pinned
    // here, because widening it later has to be a decision made out loud
    // rather than something a widget quietly starts counting differently.
    const src = readSrc("journal-sections");
    expect(src).not.toContain("tasks-table:,period");
    expect(src).not.toContain(",period");
  });
});

// ── patch 4: the snapshot ─────────────────────────────────────────────

describe("a snapshot is plain markdown", () => {
  it("writes wikilinks and values, not the plugin's markup", () => {
    // §3.2. The snapshot has to survive the plugin being uninstalled and stay
    // editable as text — which is the point, since the reader asked to edit and
    // revisit it. A block that renders as raw HTML comments once Almanac is
    // gone is not something anyone can revisit.
    const out = serializeSnapshot([
      { path: "Study/Algebra/Lesson 1.md", label: "Lesson 1", detail: "2026-07-21" },
      { path: null, label: "2026-07-22", detail: "7" },
    ]);
    expect(out).toContain("[[Study/Algebra/Lesson 1.md|Lesson 1]]");
    expect(out).toContain("- 2026-07-22 — 7");
    expect(out).not.toContain("<!--");
  });

  it("derives its region key rather than making the reader type one", () => {
    // Unlike `note:<key>`, freezing is an afterthought on a block that already
    // exists. Demanding a key at write time would mean rewriting the reader's
    // directive behind them.
    expect(snapshotKeyFor("notes", "meal")).toBe("bridge-notes-meal");
    expect(snapshotKeyFor("readings", "Mood")).toBe("bridge-readings-Mood");
  });

  it("produces a key the note store will accept", () => {
    // A tracker id is reader-supplied, so anything outside [A-Za-z0-9_-] has to
    // collapse rather than produce a key rejected at write time.
    for (const target of ["a b", "café/au", "🎯 mood", ""]) {
      expect(isValidNoteKey(snapshotKeyFor("notes", target))).toBe(true);
    }
  });

  it("keeps the timestamp out of the content region", () => {
    // A `taken:` line at the top of the content would be metadata sitting in
    // the middle of the thing the reader was invited to edit — and the first
    // person to delete it would silently turn a frozen block into an undated
    // one.
    expect(snapshotMetaKeyFor("bridge-notes-meal")).toBe("bridge-notes-meal-taken");
  });
});

describe("live by default, frozen on purpose", () => {
  it("reports a bridge with no region as live", () => {
    const state = snapshotState("", "");
    expect(state.frozen).toBe(false);
    expect(state.takenIso).toBeNull();
  });

  it("reports a written snapshot as frozen, with its date", () => {
    const content = serializeSnapshot([
      { path: null, label: "2026-07-22", detail: "7" },
    ]);
    const state = snapshotState(content, serializeSnapshotMeta("2026-08-01", content));
    expect(state.frozen).toBe(true);
    expect(state.takenIso).toBe("2026-08-01");
    expect(state.edited).toBe(false);
  });

  it("notices when the reader has edited the region", () => {
    // §3.2's one way to lose work. A snapshot someone has annotated is no
    // longer a snapshot, and refresh must say so before replacing it.
    const content = serializeSnapshot([
      { path: null, label: "2026-07-22", detail: "7" },
    ]);
    const meta = serializeSnapshotMeta("2026-08-01", content);
    const state = snapshotState(`${content}\n- my own note here`, meta);
    expect(state.edited).toBe(true);
  });

  it("treats an unrecorded checksum as edited rather than as clean", () => {
    // "Cannot tell" has to resolve to "warn". The alternative silently
    // overwrites a region whose provenance is unknown.
    const state = snapshotState("- something", "taken: 2026-08-01");
    expect(state.edited).toBe(true);
  });
});

describe("freezing is never automatic, never silent", () => {
  const src = () => readSrc("bridge-widgets");

  it("labels a frozen block and says when", () => {
    // §8's guard rail, as a reader sees it. A vault filling with frozen blocks
    // nobody remembers freezing is how "reference" becomes "copy" by attrition;
    // a block that cannot be frozen without wearing the fact cannot take part.
    expect(src()).toContain("frozen ${snap.takenIso}");
  });

  it("says nothing on a live one, because live is the default", () => {
    expect(src()).toContain("if (snap.frozen) {");
  });

  it("confirms before replacing an edited snapshot", () => {
    expect(src()).toContain("confirmAction");
    expect(src()).toContain("state.frozen && state.edited");
  });

  it("offers no freeze-for-speed anywhere", () => {
    // If freezing ever becomes the way to make a slow dashboard fast, this
    // release has failed — §3.3 and §8. Nothing in the UI may suggest it.
    for (const word of ["faster", "speed", "performance", "slow"]) {
      expect(src().toLowerCase()).not.toContain(`freeze to ${word}`);
    }
  });
});

// ── the snapshot round trip ───────────────────────────────────────────
//
// The writer and the reader of a format are ONE UNIT. These were tested
// separately through patch 4 and never against each other, which is exactly how
// a note titled "Lesson [draft]" came to serialise into a malformed wikilink:
// each half was self-consistent, and self-consistency with nothing is what a
// half-tested format buys.

describe("what freezing writes is what unfreezing reads", () => {
  const trip = (rows: SnapshotRow[]): (SnapshotRow | null)[] =>
    serializeSnapshot(rows).split("\n").map(parseSnapshotLine);

  it("round-trips a linked note row", () => {
    const rows: SnapshotRow[] = [
      { path: "Study/Algebra/Lesson 1.md", label: "Lesson 1", detail: "2026-07-21" },
    ];
    expect(trip(rows)).toEqual(rows);
  });

  it("round-trips a reading row", () => {
    const rows: SnapshotRow[] = [
      { path: null, label: "2026-07-22", detail: "7" },
    ];
    expect(trip(rows)).toEqual(rows);
  });

  it("round-trips several rows without losing any", () => {
    // Pins the loop, too: an early `return` where a `continue` belongs drops
    // every row after the first linked one, and a single-row test never sees it.
    const rows: SnapshotRow[] = [
      { path: "A.md", label: "First", detail: "2026-07-21" },
      { path: "B.md", label: "Second", detail: "2026-07-22" },
      { path: "C.md", label: "Third", detail: "2026-07-23" },
    ];
    expect(trip(rows)).toEqual(rows);
    expect(trip(rows).length).toBe(3);
  });

  it("survives a title with brackets in it", () => {
    // The shipped bug. `[[path|Lesson [draft]]]` is not merely something this
    // parser could not read back — it is a broken link in Obsidian, which is
    // the case §3.2's "survives the plugin being uninstalled" claim depends on.
    const out = serializeSnapshot([
      { path: "Study/L.md", label: "Lesson [draft]", detail: "2026-07-23" },
    ]);
    expect(out).toBe("- [[Study/L.md|Lesson (draft)]] — 2026-07-23");
    expect(parseSnapshotLine(out)?.path).toBe("Study/L.md");
  });

  it("survives a title with a pipe in it", () => {
    // A pipe starts a second alias, so the link would keep only what precedes
    // it — silently renaming the note in the snapshot.
    const out = serializeSnapshot([
      { path: "Study/M.md", label: "A | B", detail: "" },
    ]);
    expect(out).toBe("- [[Study/M.md|A / B]]");
    expect(parseSnapshotLine(out)?.label).toBe("A / B");
  });

  it("degrades a row whose PATH cannot be linked, rather than emitting a broken link", () => {
    // The path is not sanitized: it has to resolve. A path holding one of these
    // is a file Obsidian could not link to either, so the row becomes a plain
    // line instead of a link that goes nowhere.
    const out = serializeSnapshot([
      { path: "Odd/[x].md", label: "Odd", detail: "2026-07-24" },
    ]);
    expect(out).not.toContain("[[");
    expect(parseSnapshotLine(out)?.label).toBe("Odd");
  });

  it("round-trips a row with no detail", () => {
    const rows: SnapshotRow[] = [{ path: "A.md", label: "First", detail: "" }];
    expect(trip(rows)).toEqual(rows);
  });

  it("keeps the checksum stable across a round trip", () => {
    // Edited-detection compares a checksum of the region against what was
    // written. If serialisation were not stable, every refresh would report the
    // reader had edited a region they had not touched.
    const rows: SnapshotRow[] = [
      { path: "A.md", label: "First", detail: "2026-07-21" },
    ];
    expect(snapshotChecksum(serializeSnapshot(rows))).toBe(
      snapshotChecksum(serializeSnapshot(rows))
    );
  });
});

describe("the freeze control is reachable on every supported platform", () => {
  const css = () =>
    readFileSync(resolve(__dirname, "..", "styles", "76-bridges.css"), "utf8");

  it("reaches the menu the way the rest of the plugin does", () => {
    // The invariant is "invokable on a touch screen". 2.57.4 answered it with a
    // `(hover: hover)` media query of its own; 2.57.7 answers it the way
    // calendar.ts, tracker-controls.ts and attachment-widgets.ts already did —
    // `contextmenu`, which Obsidian mobile fires on long-press. One mechanism,
    // and it is the one that was already here.
    expect(readSrc("bridge-widgets")).toContain('addEventListener("contextmenu"');
    expect(css()).not.toContain("@media (hover: hover)");
  });

  it("uses the shared overflow slot rather than a bespoke one", () => {
    expect(readSrc("bridge-widgets")).toContain('"journal-widget-more"');
  });

  it("stays a desktop-only plugin nowhere in the manifest", () => {
    // The assertion above only matters because of this one. If Almanac ever
    // became desktop-only, the hover gate would be dead weight rather than a
    // fix — so the two are pinned together.
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, "..", "manifest.json"), "utf8")
    );
    expect(manifest.isDesktopOnly).toBe(false);
  });
});

// ── the re-scoping dashboards ─────────────────────────────────────────

describe("a snapshot needs a note whose period is its identity", () => {
  const src = () => readSrc("bridge-widgets");

  it("refuses to freeze on the notes that re-scope in place", () => {
    // The weekly, quarterly and yearly "overviews" are ONE note each, re-scoped
    // by rewriting a blank `*-start`. A snapshot frozen into one stays put when
    // the reader presses next — the block then renders the old period's rows
    // under a header naming the new one. §8's decay, on day one, and the reason
    // per-week and per-quarter entries exist at all.
    expect(src()).toContain("isRescopingDashboard");
    expect(src()).toContain("Freeze — needs a week or quarter entry");
  });

  it("names all four of them", () => {
    const at = src().indexOf("export function isRescopingDashboard");
    const body = src().slice(at, src().indexOf("\n}", at));
    for (const target of [
      "weeklyOverviewPath",
      "monthlyOverviewPath",
      "quarterOverviewPath",
      "yearOverviewPath",
    ]) {
      expect(body).toContain(target);
    }
  });
});

describe("weekly and quarterly entries exist to be frozen into", () => {
  it("has a folder of its own for each", () => {
    // Option 1 of two: sibling folders mirroring diaryMonthly, rather than
    // filename patterns inside the existing ones. Costs two settings and cannot
    // fail quietly — a `DAY_FILE` regex quietly not matching `2026-W30.md` is
    // exactly the silent-miss class that has bitten this release twice.
    expect(DEFAULT_PATHS.diaryWeekly).toBeTruthy();
    expect(DEFAULT_PATHS.diaryQuarterly).toBeTruthy();
  });

  it("does not collide with the daily folder, which is already called Weekly", () => {
    // `diaryDaily` is `…/Weekly` — the daily-entries folder is named for the
    // unit you read them back in. A second path resolving to the same folder
    // name would only show up when someone renamed one of them.
    expect(DEFAULT_PATHS.diaryWeekly).not.toBe(DEFAULT_PATHS.diaryDaily);
    expect(DEFAULT_PATHS.diaryQuarterly).not.toBe(DEFAULT_PATHS.diaryMonthly);
    expect(DEFAULT_PATHS.diaryDaily).toContain("Daily");
    const all = Object.values(DEFAULT_PATHS);
    expect(new Set(all).size).toBe(all.length);
  });

  it("is carried by the diary root, so renaming it takes them along", () => {
    expect(ROOT_CHILDREN.diaryRoot).toContain("diaryWeekly");
    expect(ROOT_CHILDREN.diaryRoot).toContain("diaryQuarterly");
    expect(ROOT_CHILDREN.diaryRoot).toContain("diaryYearly");
  });

  it("creates the entry with its period already set", () => {
    // The entire point: the property is what makes the note ABOUT that period
    // rather than a second dashboard that happens to sit in a folder.
    const src = readSrc("diary");
    expect(src).toContain("openOrCreatePeriodEntry");
    expect(src).toContain("${spec.prop}: ${startIso}");
  });

  it("uses the period the button was pressed on, not the current one", () => {
    // Pressing "keep this week" while looking at a week in March has to make
    // March's entry. Reading moment() would create the wrong note and open it,
    // which looks exactly like success.
    const src = readSrc("diary");
    expect(src).toContain("periodStartOf");
  });
});

// ── the grey band under an empty note (2.57.11) ───────────────────────

describe("section shading never reaches Obsidian's own chrome", () => {
  const src = () => readSrc("headerbar");

  it("skips the view footer when marking section blocks", () => {
    // `.mod-footer.mod-ui` holds the embedded-backlinks container and belongs
    // to the LEAF, not the document — Obsidian reuses it across file switches.
    // A class put on it outlived the note that caused it and drew a section's
    // background as an empty grey band under an unrelated note.
    // Through OBSIDIAN_DOM since 3.13 §5; the spelling is pinned by the table's
    // own test, and what matters here is that the footer is tested at all.
    expect(src()).toContain("block.hasClass(OBSIDIAN_DOM.viewFooter)");
    expect(src()).toContain("block.hasClass(OBSIDIAN_DOM.viewUi)");
    expect(OBSIDIAN_DOM.viewFooter).toBe("mod-footer");
    expect(OBSIDIAN_DOM.viewUi).toBe("mod-ui");
  });

  it("closes the open run at the footer rather than only skipping it", () => {
    // The footer sits after everything the note contains, so a section still
    // open when we reach it ends there.
    //
    // Since 3.13 §3 the footer says so as DATA — `closes: true` — and
    // `computeSectionRuns` acts on it. The rule is unchanged and is now
    // assertable without reading a loop: see "ends a run at a closer and never
    // makes it a member" in headerbar.test.ts.
    const at = src().indexOf("block.hasClass(OBSIDIAN_DOM.viewFooter)");
    const block = src().slice(at, at + 200);
    expect(block).toContain("closes: true");
    expect(block).not.toContain("opens: true");
  });

  it("never lets the footer become a member of a run", () => {
    // The cleanup cannot fix this after the fact: a note with no header bar
    // registers no HeaderBar and never runs the pass at all, so a class put on
    // the reused footer is never cleared. It has to never be set.
    //
    // Previously asserted as "the guard appears before the addClass" — a claim
    // about source ORDER, which is what a single loop made checkable. The
    // stronger claim is now available directly: a closer is not a member,
    // whatever order anything appears in.
    const at = src().indexOf("block.hasClass(OBSIDIAN_DOM.viewFooter)");
    expect(at).toBeGreaterThan(0);
    const block = src().slice(at, at + 240);
    for (const field of [
      "opens: false",
      "closes: true",
      "hidden: false",
      "renders: false",
    ]) {
      expect(block, field).toContain(field);
    }
    expect(
      computeSectionRuns([
        {
          opens: true,
          closes: false,
          hidden: false,
          renders: true,
          ends: false,
        },
        {
          opens: false,
          closes: true,
          hidden: false,
          renders: false,
          ends: false,
        },
      ])[1].member
    ).toBe(false);
  });
});
