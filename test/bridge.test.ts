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
import { fnBody, readCode, readCss, readSrc } from "./sources";
import { computeSectionRuns } from "../src/ui/headerbar";
import { OBSIDIAN_DOM } from "../src/core/constants";
import {
  BRIDGE_NAV_GRAIN,
  DEFAULT_BRIDGE_TRACKER,
} from "../src/journals/journal-sections";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { moment } from "../src/core/util";
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
import {
  bridgeFoldKey,
  bridgeFoldState,
  parseSnapshotLine,
} from "../src/ui/widgets/bridge-widgets";
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
  surface: "diary" | "journal" = "diary",
  navUnit: "week" | "month" | "quarter" | "year" | null = null
): BridgeHostFacts => ({
  declares: (prop) => prop in fm,
  valueOf: (prop) => fm[prop],
  iso,
  navUnit,
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

// A readings bridge's host, which is a JOURNAL note and cannot be anything
// else (1.0.89 §5.3). `collectPoints` walks the diary's own entries whatever
// the host, so a readings bridge on a diary entry is a note asking itself a
// question — `planBridge`'s direction check refuses it, and every spec in this
// file that names `readings` has to carry a host the feature actually has.
const readingsSpec = (over: Partial<BridgeSpec> = {}): BridgeSpec =>
  spec({
    direction: "readings",
    target: "exercise",
    host: host({ "month-start": "2026-07-01" }, null, "journal"),
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
    const refusal = bridgeRefusal(readingsSpec({ target: "hydration" }));
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

  it("takes the period its own navigator is showing (1.0.88)", () => {
    // *"from the diary section seems to be broken."* The journal's bridge
    // section composes `period-nav:month` above `bridge-readings:` precisely
    // because a leaf note has no period of its own — and the navigator passes
    // its answer through frontmatter, which it does not write until a pill is
    // pressed. So a freshly composed section drew a navigator saying October
    // 2026 over a refusal saying the note has no period: one card, two answers.
    const nowMonth = moment().startOf("month");
    const result = bridgeWindow(host({}, null, "journal", "month"));
    if (!result.ok) throw new Error("expected a window");
    expect(result.value.unit).toBe("month");
    expect(result.value.start).toBe(nowMonth.format("YYYY-MM-DD"));
    expect(result.value.end).toBe(
      nowMonth.clone().endOf("month").format("YYYY-MM-DD")
    );
    // THE UNIT IS THE NAVIGATOR'S, all four of them — this is not a month-
    // shaped special case for the one section that ships today.
    const week = bridgeWindow(host({}, null, "journal", "week"));
    if (!week.ok) throw new Error("expected a window");
    expect(week.value.unit).toBe("week");
  });

  it("lets a declared period and a dated entry both outrank the navigator", () => {
    // LAST, AFTER BOTH PROPERTIES, which is what keeps this from being the
    // defaulted window §2 refuses to have. A note that declares a period means
    // it, and a dated entry IS one; the chrome is asked only by a note that
    // says neither.
    const declared = bridgeWindow(
      host({ "week-start": "2026-07-22" }, null, "journal", "month")
    );
    if (!declared.ok) throw new Error("expected a window");
    expect(declared.value.unit).toBe("week");
    expect(declared.value.start).toBe("2026-07-20");

    const dated = bridgeWindow(host({}, "2026-07-23", "diary", "month"));
    if (!dated.ok) throw new Error("expected a window");
    expect(dated.value.unit).toBe("day");
    expect(dated.value.start).toBe("2026-07-23");
  });

  it("still refuses a note with no period and no navigator (1.0.88)", () => {
    // The refusal does not become unreachable: a bridge written by hand into a
    // plain note has nothing to anchor to and still says which line to add.
    const result = bridgeWindow(host({}, null, "journal", null));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.refusal.check).toBe("host-period");
    expect(result.refusal.message).toContain("`month-start`");
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
    const planned = planBridge(readingsSpec());
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
    expect(src).toContain(
      "buildBridgeNotesRegion(this.plugin, rest, label, ctx, navUnit)"
    );
    expect(src).toContain(
      "buildBridgeReadingsRegion(this.plugin, rest, label, ctx, navUnit)"
    );
    // `navUnit` IS A FENCE FACT AND NOT WORK EITHER (1.0.88): one pass over the
    // fence's lines, computed where `headerOwning` is, and threaded in. The
    // switch still only routes.
    expect(src).toContain("const navUnit =");
  });

  it("carries the navigator's unit from the fence to the host facts (1.0.88)", () => {
    // THE WHOLE CHAIN, AS A SOURCE SHAPE, because the suite has no DOM and
    // every link in it is wiring: the fence finds the `period-nav:` line, the
    // loop hands it to the builder, the builder hands it to `bridgeHostFacts`,
    // and `bridgeWindow` reads it. A break anywhere along it is a bridge that
    // refuses under a navigator — which is the bug this round is, and it is
    // invisible to every test that calls `bridgeWindow` directly.
    const src = widgets();
    // 1. The fence's own pass, matching the directive by keyword.
    expect(src).toContain('line.split(":")[0].trim() === "period-nav"');
    expect(src).toContain("periodNavUnit(line.slice(line.indexOf(\":\") + 1))");
    // 2. Threaded into the per-line builder, last of the fence facts.
    expect(src).toContain("noteTextNow,\n          navUnit\n        );");
    // 3. And into the host facts, which is what `bridgeWindow` reads.
    expect(bridge()).toContain("bridgeHostFacts(plugin, path, navUnit)");
    expect(fnBody("bridgeHostFacts", "bridge-widgets")).toContain("navUnit,");
  });

  it("plans through one shared entry point, so the guard cannot be on one and not the other", () => {
    // The failure this prevents: a refusal wired into bridge-notes and
    // forgotten on bridge-readings, which would render an unanchored block
    // that looks exactly like an anchored one.
    //
    // TWO CALLS AS OF 1.0.89, AND NEITHER IS IN A BUILDER. One is the shared
    // render entry this test was written for; the other stands before the cog
    // window's write, which is §2.3's double refusal used a third time — at
    // the only place that can PREVENT a refusal rather than report it. The
    // assertion is therefore about WHERE, not how many: a `planBridge` inside
    // `buildBridgeNotesRegion` or `buildBridgeReadingsRegion` is the
    // per-direction guard the paragraph above forbids.
    const src = bridge();
    expect(src.match(/planBridge\(/g)?.length).toBe(2);
    expect(fnBody("buildBridge", "bridge-widgets")).toContain("planBridge({");
    expect(fnBody("bridgeTextRefusal", "bridge-widgets")).toContain("planBridge({");
    for (const builder of [
      "buildBridgeNotesRegion",
      "buildBridgeReadingsRegion",
    ]) {
      expect(fnBody(builder, "bridge-widgets")).not.toContain("planBridge");
    }
  });

  it("refuses in the note rather than throwing or rendering empty", () => {
    const src = bridge();
    expect(src).toContain("ca-journal-widget-error");
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
    // A second walk of the diary folders is the taskCounts/countChronoAnvilTasks
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
    //
    // `foldableSection` SINCE 5.10, which is the same frame plus the fold this
    // block used to write by hand. The promise is unchanged and so is the slot
    // the label goes in.
    const src = readSrc("bridge-widgets");
    expect(src).toContain("foldableSection");
    expect(src).toContain("plan.window.label");
  });

  it("puts it in the frame's note slot, not a second muted span", () => {
    // `note` is "a short muted phrase after the title", which is what a window
    // is. Two muted spans competing beside a title read as two headings.
    //
    // AND SINCE 1.0.91 THE SLOT MAY HOLD THE NAVIGATOR INSTEAD, which is the
    // same rule rather than an exception to it: the period is stated once, and
    // where there is a stepper the stepper is the statement. One slot either
    // way, so this still asserts there is no second span.
    const src = readSrc("bridge-widgets");
    const at = src.indexOf("const section = foldableSection(");
    const call = src.slice(at, src.indexOf("fold.store", at));
    expect(call).toContain("note: stepper ? undefined : (phrase ?? undefined),");
    expect(call).toContain("noteRender: stepper");
    // The phrase itself, computed just above the call — frozen appends when the
    // snapshot was taken, and that is one phrase rather than two spans.
    const lead = src.slice(src.indexOf("const stepper = "), at);
    expect(lead).toContain("plan.window.label");
    expect(lead).toContain("frozen ${snap.takenIso}");
  });

  it("makes a refusal a repaintable state, not a terminal one (1.0.92)", () => {
    // THE SOFT-LOCK'S ROOT, AND IT IS NOT THE MISSING COG. A refusal decided at
    // POSTPROCESS time returned before `liveScopedWidget` existed, so there was
    // no `LiveWidget` to repaint and nothing could ever ask the question a
    // second time. Every refusal here is decided from facts that change under
    // the block — the host's frontmatter, its `type:`, the kinds and trackers
    // the vault defines — and `frontmatterOf` answers `{}` for a file the
    // metadata cache has not parsed yet, which is the fallback its own comment
    // anticipates. One tick early and the answer was "no" until the note was
    // closed and reopened.
    // COMMENT LINES OUT FIRST. The comment above the change quotes the two
    // lines it deleted, `refusalEl` included, so a raw read finds a refusal
    // ahead of the live widget and the assertion passes for the wrong reason in
    // reverse. Same trap `readCode` exists for, applied to one function.
    const body = fnBody("buildBridge", "bridge-widgets")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const live = body.indexOf("liveScopedWidget(");
    expect(live).toBeGreaterThan(0);
    // Every refusal this function draws is INSIDE the build closure.
    const refusals = [...body.matchAll(/refusalEl\(/g)].map((m) => m.index!);
    expect(refusals.length).toBeGreaterThan(0);
    for (const at of refusals) expect(at).toBeGreaterThan(live);
    // AND NONE OF THEM IS RETURNED, which is the half the positions above do
    // not cover: a `return refusalEl(…)` placed INSIDE the closure is still
    // inside the live widget and still throws the bar away — it just repaints
    // the same bare chip. The only thing this function does with a refusal is
    // put it in the body of a frame.
    expect(body).not.toMatch(/return refusalEl\(/);
    expect(body).toContain("body.appendChild(refusalEl(again.refusal.message))");
    // And the resolve that decides it is the per-paint one.
    expect(body.indexOf("const again = resolve();")).toBeGreaterThan(live);
  });

  it("lets a refused bar name itself and say nothing about a period", () => {
    // A refused bridge has resolved no window — half the refusals ARE "this
    // note has no period" — so the note slot falls to the stepper, which on
    // those is the control that fixes it. And the title is the READER's: both
    // catalogues compose one, so the bare word is only ever reached by a
    // hand-typed line, and naming the bar after a target the renderer just
    // declined would be the bar agreeing with the refusal under it.
    const head = fnBody("bridgeHeader", "bridge-widgets");
    expect(head).toContain("plan: BridgePlan | null,");
    // NOTHING, and not a stand-in. A phrase in this slot is a claim about which
    // period the rows below cover, and a refused block has no rows and no
    // period — so the slot is empty and the stepper takes it.
    expect(head).toContain("const phrase = !plan\n    ? null");
    expect(head).toContain('title: `🌉 ${label ?? plan?.targetLabel ?? "Bridge"}`');
  });

  it("gives a frozen block the phrase and never the stepper", () => {
    // A snapshot is a record of ONE period. A stepper on its bar is an
    // invitation to make the header name a period the rows are not of — §8's
    // decay, which `isRescopingNote` refuses freezing for in the first place.
    // So the control stands down where the phrase is load-bearing.
    expect(fnBody("bridgeHeader", "bridge-widgets")).toContain(
      "const stepper = snap.frozen ? null : nav;"
    );
  });

  it("leads the bar with the chevron so the stepper has the other end", () => {
    //   "The chevron should be on the far left."
    //
    // 5.10 moved it to the right "with every other section's", and that is
    // overtaken rather than reversed: this bar is now the one section head in
    // the plugin whose row holds a control a reader drags their eye along, and
    // the fold leading rather than trailing is what stops the two competing for
    // the same corner. It is also the only level-2 foldable section in the
    // tree, so nothing else moves — see `test/section-frame.test.ts` for the
    // auto-margin fix underneath it.
    const src = readSrc("bridge-widgets");
    const at = src.indexOf("const section = foldableSection(");
    expect(src.slice(at, src.indexOf("fold.store", at))).toContain(
      'toggleSide: "left"'
    );
  });

  it("re-resolves the window on every paint, not once per postprocess", () => {
    // THE STALENESS PUTTING THE STEPPER ON THE BAR TURNS INTO A BROKEN CONTROL.
    // `bridgeHostFacts` captures one frontmatter read and `planBridge` turns it
    // into `plan.window` — the period the bar names and `fill` lists. That
    // chain used to run once, OUTSIDE the live widget, while the navigator
    // writes `month-start` into this very note and `liveScopedWidget`'s scope
    // begins `path === ctx.sourcePath`. So pressing next repainted the block
    // from the period it was first drawn with.
    const body = fnBody("buildBridge", "bridge-widgets");
    expect(body).toContain("const resolve = () => {");
    // THE RE-RESOLVE IS INSIDE THE BUILD CLOSURE. Outside it is the same bug
    // with an extra function in it.
    const live = body.indexOf("liveScopedWidget(");
    expect(live).toBeGreaterThan(0);
    expect(body.indexOf("const again = resolve();")).toBeGreaterThan(live);
    expect(body).toContain("const plan = again.value;");
    // AND THE WATCH LIST AND THE KEY ARE STILL COMPUTED ONCE — but off the
    // DIRECTIVE rather than off a first resolve (1.0.92), which is what lets a
    // refused bridge be a live one. `plan.surface` is `otherSurface(
    // host.surface)` by definition and `planBridge` returns the target it was
    // given, so neither needed a plan to begin with.
    expect(body).toContain("liveScopedWidget(plugin, ctx, watch,");
    expect(body).toContain(
      "const watch = scope(otherSurface(hostSurface(plugin, path)));"
    );
    expect(body).toContain("const key = snapshotKeyFor(direction, target);");
    // The outer resolve is gone, not moved. A `planned` left in this function
    // is the gate this round removed — asked of the CODE, because the comment
    // above it quotes the line it deleted and a raw read would find that.
    const code = readCode("bridge-widgets");
    expect(code).not.toContain("const planned = resolve();");
    expect(code).not.toContain("planned.value");

    // THE FRONTMATTER READ IS INSIDE `resolve`, WHICH IS THE WHOLE POINT. A
    // mutant that kept the per-paint call and hoisted `bridgeHostFacts` out of
    // it survived every assertion above: `plan` was fresh, and it was computed
    // from one captured cache object. So this asks where the READ is, not where
    // the call is — `bridgeHostFacts` appears exactly once in this function and
    // it is between `resolve`'s braces.
    const open = body.indexOf("const resolve = () => {");
    const close = body.indexOf("  };", open);
    const inside = body.slice(open, close);
    expect(inside).toContain("bridgeHostFacts(plugin, path, navUnit)");
    expect(inside).toContain("bridgeCatalogue(plugin, otherSurface(host.surface))");
    expect(body.split("bridgeHostFacts(").length - 1).toBe(1);
    expect(body.split("bridgeCatalogue(").length - 1).toBe(1);
  });

  it("sizes the stepper against the bar rather than the entry header", () => {
    // `buildPeriodNav` builds ONE strip for every host and its base
    // measurements are the entry header's: `2em` pills, a trigger at
    // `--ca-text-sm`. Dropped onto a level-2 section bar whose own type is
    // `--ca-bar-text`, that is a 25px control on a 26px row — which makes the
    // bar as tall as the strip instead of the strip as small as the bar. The
    // overview banner solves the same problem the other way round
    // (`--jpn-headline`): there the strip IS the headline.
    //
    // THE TRIGGER NEEDS ITS OWN LINE and that is not redundancy: every other
    // box in the strip is sized in `em` and inherits, and the trigger is the
    // one element that declares a font-size of its own.
    const css = readFileSync(
      resolve(__dirname, "..", "styles", "76-bridges.css"),
      "utf8"
    );
    const rule = (sel: string): string => {
      const at = css.indexOf(`\n${sel} {`);
      expect(at, sel).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    expect(
      rule(".ca-bridge .ca-journal-header-note-live .ca-jeh-nav.ca-jeh-seg")
    ).toContain("font-size: var(--ca-bar-text)");

    // ONE DECLARATION OF THE TOKEN PER CHAIN, which is the bar's half of the
    // blank box `test/appearance.test.ts` measures. `--ca-bar-text` is
    // `--ca-text-2xs`, which is `0.7em` — a RELATIVE value, so declaring it on
    // the strip AND on a descendant of the strip MULTIPLIES it. The trigger came
    // out at 0.7 × 0.7 = 7.8px and its `height: 2em` at 15px against the pills'
    // 22px. It only has to stop declaring the `--ca-text-sm` its base gives it.
    const trigger = rule(
      ".ca-bridge .ca-journal-header-note-live .ca-jeh-datenav-trigger"
    );
    expect(trigger).toContain("font-size: inherit");
    expect(trigger).not.toContain("var(--ca-bar-text)");
    expect(trigger).not.toContain("\n  height:");
    // AND IT IS A ROW. `.ca-journal-period-nav-stack` is a column because it
    // was built to carry the standalone *This Month* button underneath — a
    // button `buildNowButton` puts in an overview card's footer and that no
    // bridge has.
    const at = css.indexOf(
      "\n.ca-bridge .ca-journal-header-note-live .ca-journal-period-nav-stack {"
    );
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toContain("flex-direction: row");
  });

  it("owns the navigator, so the fence draws no second one", () => {
    //   "date picker is being rendered outside the surface"
    //
    // It was, and it was outside BECAUSE it is a block of its own: the journal
    // catalogue composes `period-nav:month` and `bridge-readings:` into one
    // fence, and two directives in one fence are two blocks on the note's own
    // background unless something adopts one. The `header:` case has adopted
    // the navigator into a bar for years — "they read as the header's own
    // controls" — and a bridge has a bar; it just draws it itself, which is why
    // that arm was never reached.
    const src = readSrc("widgets");
    expect(src).toContain('if (kind === "period-nav" && selfFramed) continue;');
    // READ THROUGH THE SET 1.0.90 NAMED FOR THIS QUESTION, rather than a second
    // list of the two keywords.
    expect(src).toContain("SELF_FRAMED_KEYWORDS.has(");
    // ONE PASS UP FRONT, because the two lines answer each other and either may
    // come first — `navUnit` above it is computed the same way for the same
    // reason.
    expect(src).toContain("const selfFramed = lines.some((line) =>");
    // AND THE LINE ITSELF IS UNTOUCHED: it is what `navUnit` is read from and
    // what the window's *Over* question writes.
    expect(src).toContain("const navUnit =");
  });

  it("builds the stepper rather than being handed one", () => {
    // `periodnav.ts`' own scar, read from the other side: "a button parented
    // here and re-parented into the bar would be recreated on every rebuild and
    // appended to a bar that is never cleared. One per metadata change,
    // stacking forever." `redrawHeader` replaces this frame on every view
    // toggle, so the strip has to be built by whoever builds the bar.
    const head = fnBody("bridgeHeader", "bridge-widgets");
    expect(head).toContain("nav: (() => HTMLElement) | null");
    expect(fnBody("buildBridge", "bridge-widgets")).toContain(
      "navUnit ? () => buildPeriodNav(plugin, ctx, navUnit) : null"
    );
  });

  it("declares no header styling of its own", () => {
    // The title bar, count pill, muted phrase and overflow are all the frame's.
    // Anything this stylesheet still said about them would be a second opinion.
    const css = readFileSync(
      resolve(__dirname, "..", "styles", "76-bridges.css"),
      "utf8"
    );
    for (const cls of ["ca-bridge-header", "ca-bridge-window", "ca-bridge-more"]) {
      expect(css).not.toContain(`.${cls}`);
    }
    expect(css).toContain(".ca-bridge-row");
    // AND THE FOLD IS THE FRAME'S TOO, AS OF 5.10. `.ca-bridge-chevron` was
    // asserted here — a private chevron on the left, its own rotation, and
    // `.ca-bridge.is-collapsed > .ca-bridge-body` to hide the rows. Those are
    // four opinions `foldableSection` had already formed, and the first of them
    // put this section's control on the opposite side from every other section
    // on the page. What a bridge still says for itself is the margin a
    // collapsed bar no longer needs.
    expect(css).not.toContain(".ca-bridge-chevron");
    expect(css).not.toContain(".ca-bridge.is-collapsed");

    // ── AND THE CARD IS THE FRAME'S TOO, AS OF 1.0.90 ──────────────────
    //
    // *"its rendered as a widget? this section should never be a widget"*.
    // `.ca-bridge` painted a background, a border, a radius, 10/12 of padding
    // and a bottom margin, and withheld them only inside `.ca-journal-sec-block`
    // or `.ca-journal-sec-fold` — neither of which is where it sits. Its own
    // frame is one element DOWN, so the two cancel rules never fired and every
    // bridge in every vault drew a card inside a card.
    //
    // ASSERTED AS AN ABSENCE OF DECLARATIONS rather than of a selector, because
    // `.ca-bridge` still exists: it is the flex column the rows live in.
    const block = css.slice(css.indexOf("\n.ca-bridge {"));
    const rule = block.slice(0, block.indexOf("}"));
    for (const decl of ["background:", "border:", "border-radius:", "padding:", "margin:"]) {
      expect(rule, decl).not.toContain(decl);
    }
    // The two cancel rules went with it — there is nothing left to cancel.
    expect(css).not.toContain(".ca-journal-sec-block .ca-bridge");
    expect(css).not.toContain(".ca-journal-sec-fold .ca-bridge");
    expect(css).not.toContain(".ca-bridge:focus-within");
    // AND THE BAR IS THE FRAME'S SHAPE. `.ca-bridge .ca-journal-sec` set
    // `padding: 2px 0`, which beat the frame's own `8px var(--ca-sec-pad-x)` on
    // file order — so a bridge's title sat on the card's left border and its
    // rows sat 12px inside it.
    expect(css).not.toContain(".ca-bridge .ca-journal-sec {");
    // The private undo of that private rule goes with it: a collapsed bar takes
    // 70-section-surface.css's own rule, which zeroes the margin and drops the
    // hairline together.
    expect(css).not.toContain(
      ".ca-bridge .ca-journal-sec-fold.is-collapsed > .ca-journal-sec"
    );
  });

  it("persists and reads collapse state", () => {
    const key = bridgeFoldKey("diary/2026-08-29.md", "notes:lesson");
    expect(key).toBe("diary/2026-08-29.md::bridge:notes:lesson");
    const fakePlugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        collapsedNoteSections: {
          [key]: true,
        },
      },
    } as any;
    expect(bridgeFoldState(fakePlugin, "diary/2026-08-29.md", "notes:lesson")).toBe(true);
    expect(bridgeFoldState(fakePlugin, "diary/2026-08-29.md", "notes:other")).toBe(false);
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
    // THE FOUR-VALUE DEFAULT IS ONE FUNCTION AS OF 1.0.88, because a bridge in
    // the same fence now asks the same line which period it is showing — and
    // two copies of this default is exactly how `period-nav:quarter` built a
    // week navigator for five releases.
    expect(code).toContain("periodNavUnit(arg)");
    const nav = readSrc("periodnav")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(nav).toContain('a === "month" || a === "quarter" || a === "year" ? a : "week"');
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

  // The catalogue row, as source.
  //
  // ANCHORED ON THE ID CONSTANT, NOT ON A SPELLING OF IT (1.0.89). The row
  // declared `id: "bridge"` until `wantFromJournalNote` had to name the same id
  // to carry this section's answers through a save — two modules sharing a
  // string is what `BRIDGE_SECTION_ID` exists for, and a test matching the
  // literal would make naming it a failure.
  const decl = () => {
    const src = sections();
    const at = src.indexOf("id: BRIDGE_SECTION_ID");
    expect(at).toBeGreaterThan(0);
    return src.slice(at, src.indexOf("\n  {", at + 10));
  };

  it("emits the navigator and the directive in one section", () => {
    // A journal note has no period of its own — the four `*-start` properties
    // live only on diary dashboards — so a `bridge-readings:` on a leaf could
    // ONLY ever refuse until something let the note say which period it meant.
    // Shipping the two separately would put that discovery on the reader.
    const body = decl();
    // THE UNIT IS AN ANSWER NOW AND `month` IS ITS DEFAULT (1.0.89), so the
    // composition names the constant and the constant is the word. Matching
    // `period-nav:month` here would have passed for one release and then
    // failed the first time a reader could choose a week.
    expect(body).toContain("`period-nav:${grain}`");
    expect(BRIDGE_NAV_GRAIN).toBe("month");
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
    expect(decl()).toContain('applies: (ctx) => ctx.noteKind !== "page"');
  });

  it("is off by default", () => {
    expect(decl()).toContain("default: never");
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
    // §3.2, narrowed by `serializeSnapshot`'s own retraction in 1.0.89: these
    // lines go inside `<!--chronoanvil:…-->`, so the uninstall half of the
    // claim is withdrawn and the bracket form is deferred. What is asserted is
    // the half that stands — the rows themselves are links and values a reader
    // can open and edit, not the plugin's markup.
    const out = serializeSnapshot([
      { path: "Study/Algebra/Lesson 1.md", label: "Lesson 1", detail: "2026-07-21" },
      { path: null, label: "2026-07-22", detail: "7" },
    ]);
    expect(out).toContain("[[Study/Algebra/Lesson 1.md|Lesson 1]]");
    expect(out).toContain("- 2026-07-22 — 7");
    expect(out).not.toContain("<!--");
  });

  it("carries a reading's own entry link, and round-trips it (1.0.93)", () => {
    // THE READINGS HALF WAS A LIST OF VALUES. `rowsFor` passed `path: null` for
    // every row, so this branch of the serializer, `renderFrozen`'s anchor and
    // `parseSnapshotLine`'s wikilink form were all unreachable for readings —
    // and a frozen readings bridge failed even the narrow promise above while a
    // frozen notes bridge kept it. The `path: null` row stays asserted directly
    // beneath, because a day whose entry has been removed still takes it.
    const rows: SnapshotRow[] = [
      { path: "Diary/2026/10/2026-10-12.md", label: "2026-10-12", detail: "2" },
      { path: null, label: "2026-10-13", detail: "5" },
    ];
    const out = serializeSnapshot(rows);
    expect(out).toContain("- [[Diary/2026/10/2026-10-12.md|2026-10-12]] — 2");
    expect(out).toContain("- 2026-10-13 — 5");
    // And the reader gets both shapes back, which is the property that makes a
    // thaw-and-refreeze idempotent rather than lossy.
    const back = out
      .split("\n")
      .map((line) => parseSnapshotLine(line))
      .filter((r): r is SnapshotRow => r != null);
    expect(back).toEqual(rows);
  });

  it("resolves a reading's day rather than carrying it on the point", () => {
    // The lookup is `locateEntry`, whose cost `habitWeekReadings` has already
    // measured at seven of these per paint; the alternative was a field on
    // `ChartPoint`, which `bucketByMonth` and a coarse `pointDate` would have
    // had to drop. Asserted so a later round does not quietly add it.
    const bridge = readCode("bridge-widgets");
    expect(bridge).toContain(
      'locateEntry(plugin.app, plugin.settings.paths, "daily", iso)?.path ?? null'
    );
    expect(bridge).toContain("path: dayOf(iso),");
    expect(bridge).not.toContain("path: null, label: pt.date");
    const point = readCode("charts");
    expect(point).toContain(
      "export interface ChartPoint {\n  date: string;\n  value: number;\n}"
    );
  });

  it("gives a readings row the same link the notes side has", () => {
    // One block, one bar, and until 1.0.93 one side clickable: the notes region
    // built `internal-link` for every row it drew and this one built two spans.
    const bridge = readCode("bridge-widgets");
    expect(bridge).toContain('cls: "internal-link ca-bridge-date",');
    // The orphan path keeps the span, so a reading outliving its entry stays a
    // row rather than becoming a link to nothing.
    expect(bridge).toContain('row.createSpan({ cls: "ca-bridge-date", text: iso });');
  });

  it("lists every entry in the period when the flag is on", () => {
    //   "It should show all known entries for the bridges period."
    //
    // One row per READING misreads the same way 1.0.93's axis did: a week
    // logged on two days drew two rows under a bar saying **Week 42**. The
    // spine is `datesInWindow`, the SAME function the trend's axis uses, so the
    // list and the chart above it cannot disagree about where the period ends.
    const bridge = readCode("bridge-widgets");
    // COUNTED, NOT FOUND, AND A SWEEP IS WHY. The live rows and the frozen
    // rows are built by the same three expressions — one so the snapshot is
    // "the block as it stood" — so a `toContain` is satisfied by either site
    // and four mutants that deleted one of them measured zero. Two of each, or
    // one of the two halves has quietly stopped widening.
    const twice = (what: string) =>
      expect(bridge.split(what).length - 1, what).toBe(2);
    twice("const days = entries");
    twice("? datesInWindow(plan.window.start, plan.window.end).filter(");
    // AN ENTRY IS A NOTE THAT EXISTS, so the rows are the days the reader
    // journalled rather than every date in the period — and `dayOf` is the one
    // lookup the dates, the trend's clicks and the frozen rows all share.
    twice("(iso) => dayOf(iso) !== null");
    // AND THE NARROW FORM IS UNCHANGED, which is the other half of the opt-in.
    twice(": points.map((p) => p.date);");
  });

  it("moves the empty state behind the rows, not in front of them", () => {
    // `points.length === 0` returned before the rows were built, so a period
    // with entries and no readings would have drawn the readings empty state
    // over a list the flag had just asked for.
    const bridge = readCode("bridge-widgets");
    expect(bridge).toContain("if (days.length === 0) {");
    expect(bridge).not.toContain("if (points.length === 0) {");
    // TWO SENTENCES, BECAUSE THE TWO ABSENCES ARE DIFFERENT. "No readings" is
    // wrong for a period with no entries at all.
    expect(bridge).toContain("`No diary entries inside ${plan.window.label}. `");
  });

  it("draws a dash for a day that carries no reading", () => {
    // The row exists to make an empty day visible, and a blank cell where every
    // other row has a number reads as a rendering fault. `is-blank` is a state
    // on the same class, so the cell keeps the list's tabular alignment.
    const bridge = readCode("bridge-widgets");
    expect(bridge).toContain('cls: value === undefined ? "ca-bridge-value is-blank" : "ca-bridge-value",');
    expect(bridge).toContain('text: value === undefined ? "—" : String(value),');
    expect(readCss()).toContain(".ca-bridge-value.is-blank");
  });

  it("keeps the list under the trend when both flags are on", () => {
    // Four combinations, four things to ask for: neither is the plain readings
    // list, `#trend` alone is the chart instead of it, `#entries` alone widens
    // it, and both is the chart above the full list.
    const bridge = readCode("bridge-widgets");
    expect(bridge).toContain("if (!entries) return;");
  });

  it("freezes what the block was drawing, rows and all", () => {
    // The snapshot callback's whole contract is "the block as it stood — not a
    // second query that could answer differently", so a widened block freezes
    // widened. Same spine, same `dayOf`, same order.
    const bridge = readCode("bridge-widgets");
    expect(bridge).toContain('detail: valueOf.has(iso) ? String(valueOf.get(iso)) : "",');
    // THE SAME SPINE AS THE LIVE ROWS, counted in the test above so that
    // neither half can stop widening while the other still does.
    expect(bridge).toContain("return days.map((iso) => ({");
    // NO DETAIL RATHER THAN A DASH. `serializeSnapshot` writes the link alone
    // for a row with no detail and `parseSnapshotLine` reads it back; `— —`
    // would put a separator in the reader's note with nothing after it.
    expect(bridge).not.toContain('detail: "—"');
  });

  it("says why it is not the charts section, in the docs and at the source", () => {
    // 1.0.93 was asked to decide the overlap with retiring `#trend` on the
    // table, and decided there is none. The decision is only durable if it is
    // written where the next reader of either file will find it — and only
    // true while the four enforcement points it rests on still hold, which is
    // what the rest of this test pins.
    const docs = readFileSync(
      resolve(__dirname, "../assets/documentation.md"),
      "utf8"
    );
    expect(docs).toContain("**Why this and not a chart?**");
    const bridge = readSrc("bridge-widgets");
    expect(bridge).toContain("AND IT IS NOT THE CHARTS SECTION");

    // The claim: no catalogue composes a charts section on a journal leaf or a
    // diary entry. Asserted off the catalogues rather than off a written list.
    // Comment-stripped: `journal-sections.ts` DISCUSSES the charts fence (why
    // it could never share a block with a `chronoanvil` one) without composing
    // it, and the raw file cannot tell the two apart.
    for (const mod of ["journals/journal-sections", "diary/entry-sections"]) {
      expect(readCode(mod)).not.toContain("chronoanvil-charts");
    }
    // And a chart could not read a diary tracker there if it were offered, nor
    // be scoped to a period the note does not declare.
    const charts = readCode("charts");
    expect(charts).toContain("its readings live in the diary, not under this folder");
    expect(charts).toContain("function rangesAvailable");
  });

  it("opens the same day from a point on the trend", () => {
    const bridge = readCode("bridge-widgets");
    expect(bridge).toContain("onPointClick: (iso) => {");
    expect(bridge).toContain("const at = dayOf(iso);");
    const render = readCode("chart-render");
    // The index Chart.js reports indexes `dates`, which is the array the
    // tooltip already titles itself from — so a click and a hover cannot name
    // different days.
    // THE POINT INDEX, NOT THE DATASET'S. A mutant reading `datasetIndex` here
    // survived every other assertion in this test and would have opened the
    // first day of the window on every click, because dataset 0 is the only
    // dataset a single-series trend has.
    expect(render).toContain("const at = elements[0]?.index;");
    expect(render).toContain("const iso = dates[at];");
    // And the column is the target, not the 3px dot — set only where there is
    // something to click.
    expect(render).toContain('{ interaction: { mode: "index" as const, intersect: false } }');
    expect(render).toContain("args.onPointClick");
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

  it("uses the shared opener rather than a bespoke one", () => {
    // ONE BUTTON SINCE 1.0.91, and it is `settingsButton` — which is
    // `overflowButton` with 4.20's glyph on it, so the menu is still built ON
    // CLICK and still reached by the same long-press. What changed is that the
    // bar stopped carrying two openers onto one subject.
    expect(readSrc("bridge-widgets")).toContain(
      'settingsButton(frame.actions, "ca-bridge-cog", buildMenu)'
    );
    expect(readSrc("bridge-widgets")).not.toContain('"journal-widget-more"');
    expect(readSrc("bridge-widgets")).not.toContain("overflowButton");
  });

  it("stays a desktop-only plugin nowhere in the manifest", () => {
    // The assertion above only matters because of this one. If ChronoAnvil ever
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
    expect(src()).toContain("isRescopingNote");
    expect(src()).toContain("Freeze — needs a week or quarter entry");
  });

  it("names all four of them, and asks about the note before it looks", () => {
    const at = src().indexOf("export function isRescopingNote");
    const body = src().slice(at, src().indexOf("\n}", at));
    for (const target of [
      "weeklyOverviewPath",
      "monthlyOverviewPath",
      "quarterOverviewPath",
      "yearOverviewPath",
    ]) {
      expect(body).toContain(target);
    }
    // AND THE FIFTH IS NOT A PATH (1.0.89 §5.4). `setPeriod` writes the period
    // property into whatever note hosts the navigator, and the journal
    // catalogue's bridge section composes `period-nav:` right above its own
    // directive — so a journal leaf re-scopes in place exactly like the four
    // overviews do, and freeze on it decays the same way. The guard is a
    // question about the note rather than a list of paths, which is why it was
    // renamed; the navigator answers first, because a note carrying one
    // re-scopes wherever it lives.
    expect(body).toContain("navUnit");
    expect(body.indexOf("navUnit")).toBeLessThan(body.indexOf("weeklyOverviewPath"));
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
