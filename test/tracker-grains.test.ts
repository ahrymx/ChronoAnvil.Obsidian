// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One tracker, many grains (2.57.8).
//
// The failure this replaced: a diary tracker named exactly one class, so a Mood
// on every grain meant five registry entries with the same name, type, range
// and bounds — five things to keep in step by hand, and a rename that silently
// corrected one of them.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readCode, readSrc } from "./sources";
import { DEFAULT_PATHS } from "../src/core/constants";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import {
  seedingPhrase,
  seedingTemplatePhrase,
} from "../src/core/settings-editors";
import type { TrackerClass } from "../src/trackers/trackers";
import {
  describeSurface,
  describeSurfaceLabel,
  diaryClassOf,
  diaryClassesOf,
  diarySurface,
  journalSurface,
  recordsNothing,
  surfaceAdmits,
  surfaceKey,
  CLASS_DEFS,
  TRACKER_CLASSES,
  noteKindOf,
  classifyNote,
} from "../src/trackers/trackers";
import type { TrackerSurface } from "../src/trackers/trackers";
import { scopesFor } from "../src/charts/charts";
import { SCOPE_LABELS } from "../src/charts/chart-ui";

describe("a diary tracker can name several grains", () => {
  it("admits a note on any grain it names", () => {
    const t = diarySurface("daily", "monthly");
    expect(surfaceAdmits(t, diarySurface("daily"))).toBe(true);
    expect(surfaceAdmits(t, diarySurface("monthly"))).toBe(true);
  });

  it("still refuses a grain it does not name", () => {
    const t = diarySurface("monthly");
    expect(surfaceAdmits(t, diarySurface("daily"))).toBe(false);
  });

  it("never admits a journal note", () => {
    expect(surfaceAdmits(diarySurface("daily"), journalSurface("study"))).toBe(
      false
    );
  });
});

describe("journal surfaces stay singular", () => {
  it("keeps naming one type, or all of them", () => {
    // "This tracker is on Study and on Recipes" is a different claim from "this
    // tracker is on every grain of the diary": the grains are one thing at five
    // resolutions, two journal types are two subjects. `typeId: null` already
    // says "every type" for the case that means it.
    expect(surfaceAdmits(journalSurface("study"), journalSurface("study"))).toBe(true);
    expect(surfaceAdmits(journalSurface("study"), journalSurface("recipes"))).toBe(false);
    expect(surfaceAdmits(journalSurface(null), journalSurface("recipes"))).toBe(true);
  });

  it("carries no diary classes", () => {
    expect(diaryClassesOf(journalSurface("study"))).toEqual([]);
  });
});

describe("'the class' of a multi-grain tracker has no answer", () => {
  it("returns null rather than picking the first", () => {
    // Quietly answering with `classes[0]` is how a five-grain tracker ends up
    // filed under Daily everywhere it is grouped or labelled.
    expect(diaryClassOf(diarySurface("daily", "monthly"))).toBeNull();
  });

  it("still answers for a note, whose surface is a set of one", () => {
    expect(diaryClassOf(diarySurface("monthly"))).toBe("monthly");
  });
});

describe("a tracker that records nothing", () => {
  it("is representable, because the editor passes through it", () => {
    expect(recordsNothing(diarySurface())).toBe(true);
  });

  it("is not silently read as every grain", () => {
    // The dangerous reading. An empty set must admit nothing, not everything.
    expect(surfaceAdmits(diarySurface(), diarySurface("daily"))).toBe(false);
  });

  it("says so rather than describing itself as daily", () => {
    expect(describeSurface(diarySurface())).toBe("unrecorded");
    expect(describeSurfaceLabel(diarySurface())).toBe("No grain");
  });

  it("is not what a journal surface is", () => {
    expect(recordsNothing(journalSurface(null))).toBe(false);
  });
});

describe("grouping keys and labels cover the set", () => {
  it("keys a multi-grain tracker distinctly from either grain alone", () => {
    const both = surfaceKey(diarySurface("daily", "monthly"));
    expect(both).not.toBe(surfaceKey(diarySurface("daily")));
    expect(both).not.toBe(surfaceKey(diarySurface("monthly")));
  });

  it("keys the same set the same way whatever order it is given in", () => {
    // Otherwise a Map keyed by surface holds one tracker twice, which is the
    // duplication this change exists to remove, wearing a different hat.
    expect(surfaceKey(diarySurface("daily", "monthly"))).toBe(
      surfaceKey(diarySurface("monthly", "daily"))
    );
  });

  it("names every grain it covers", () => {
    expect(describeSurfaceLabel(diarySurface("daily", "monthly"))).toContain("Daily");
    expect(describeSurfaceLabel(diarySurface("daily", "monthly"))).toContain("Monthly");
  });
});

// ── the editor can express the set (2.57.9) ───────────────────────────

describe("the surface dropdown stopped listing one option per grain", () => {
  const src = () => readSrc("settings-editors");

  it("offers a single diary choice", () => {
    // Five grain options would be five ways to pick ONE grain and no way to
    // pick two — making 2.57.8's model unreachable from the only place it is
    // edited. The dropdown now answers the question that is genuinely
    // exclusive: diary or journal, which no tracker is both of.
    expect(src()).toContain("DIARY_CHOICE_KEY");
    expect(src()).toContain('label: "📅 Diary entries"');
  });

  it("does not key the diary option by its surface", () => {
    // surfaceKey now varies with the set, so a tracker on daily+monthly would
    // match no option and the dropdown would silently show the first instead.
    const at = src().indexOf("const out = [");
    const block = src().slice(at, src().indexOf("];", at));
    expect(block).toContain("key: DIARY_CHOICE_KEY");
    expect(block).not.toContain("surfaceKey(");
  });

  it("ticks the grains with a labelled checkbox each", () => {
    // Was "a toggle each" and passed through 2.58.2 unchanged, because it only
    // asserted the setting's NAME and the loop — neither of which the change
    // touched. A test loose enough to survive the change it exists to describe
    // is not describing it. Now it names the control.
    const src = readSrc("settings-editors");
    expect(src).toContain('.setName("Grains")');
    expect(src).toContain('createEl("input", { type: "checkbox" })');
    expect(src).toContain("TRACKER_CLASS_LABELS[c]");
    expect(src).not.toContain("grains.addToggle");
  });

  it("puts the label inside the hit target", () => {
    // A 13px checkbox alone is a small target on a trackpad and a hostile one
    // on a touch screen, and the manifest ships `isDesktopOnly: false`.
    const src = readSrc("settings-editors");
    // The window starts at the createEl call, not at the class literal, which
    // sits inside the options object AFTER it.
    const at = src.indexOf('grains.controlEl.createEl("label"');
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 400);
    expect(block).toContain('label.createEl("input"');
  });

  it("sits under its description rather than in the control column", () => {
    // `.setting-item` is a two-column flex — text left, control right — which
    // fits one widget and fights five. Against a three-line description the row
    // was squeezed into whatever the right column had left.
    const src = readSrc("settings-editors");
    expect(src).toContain('grains.settingEl.addClass("ca-setting-stacked")');
    const css = readFileSync(
      resolve(__dirname, "..", "styles", "85-tracker-controls.css"),
      "utf8"
    );
    const at = css.indexOf(".ca-setting-stacked {");
    expect(css.slice(at, at + 120)).toContain("display: block");
  });

  it("aligns left, because it reads with the description as one block", () => {
    const css = readFileSync(
      resolve(__dirname, "..", "styles", "85-tracker-controls.css"),
      "utf8"
    );
    const at = css.indexOf(".ca-grain-row {");
    expect(css.slice(at, at + 300)).toContain("justify-content: flex-start");
  });

  it("wraps rather than assuming five", () => {
    // A sixth grain is a table edit away; a layout that only works at five
    // breaks silently the moment the table grows.
    const css = readFileSync(
      resolve(__dirname, "..", "styles", "85-tracker-controls.css"),
      "utf8"
    );
    const at = css.indexOf(".ca-grain-row");
    expect(css.slice(at, at + 300)).toContain("flex-wrap: wrap");
  });

  it("rebuilds the set through diarySurface so the order stays the table's", () => {
    // Otherwise surfaceKey drifts with click order — and a Map keyed by surface
    // holds one tracker twice, which is the duplication 2.57.8 removed.
    expect(src()).toContain("TRACKER_CLASSES.filter((k) => now.has(k))");
  });
});

describe("an empty grain set is refused at the door", () => {
  it("fails the save with a notice rather than storing it", () => {
    // Refused on commit rather than prevented in the toggles: un-ticking the
    // last grain is a legitimate step towards ticking a different one, and a
    // toggle that will not turn off is a worse answer than a sentence.
    const src = readSrc("settings-editors");
    expect(src).toContain("recordsNothing(this.draft.surface)");
    expect(src).toContain("Pick at least one grain");
  });
});

// ── the row stopped naming the grain (2.57.10) ────────────────────────

describe("a tracker row does not name its grain", () => {
  const src = () => readSrc("settings");

  it("drops the surface pill for a diary tracker", () => {
    // It read "Daily" — one fact — and the grain stopped being one fact when a
    // tracker gained a set of them. On five grains the row would carry five
    // pills beside the two it has, to say what the editor's toggles already
    // say. A row's pills are for what distinguishes it from its NEIGHBOURS, and
    // the diary list is already all diary.
    expect(src()).toContain("private surfacePill(");
    const at = src().indexOf("private surfacePill(");
    const body = src().slice(at, src().indexOf("\n  }", at));
    expect(body).toContain('if (t.surface.kind === "diary") return [];');
  });

  it("keeps it for a journal tracker, where it names which journal", () => {
    // "Study" against "Cooking" is exactly what distinguishes neighbours, and
    // is not a set. The pill was never "show the surface" — it was "say the
    // thing that is not obvious here".
    const at = src().indexOf("private surfacePill(");
    const body = src().slice(at, src().indexOf("\n  }", at));
    expect(body).toContain("describeSurfaceLabel");
  });

  it("routes every row through the one decision", () => {
    // Three call sites had the pill inline. Three copies of a rule is how one
    // of them keeps the old behaviour through a later edit.
    expect(src().match(/\.\.\.this\.surfacePill\(t\)/g)?.length).toBe(3);
  });
});

// ── five grains (2.57.12) ─────────────────────────────────────────────

describe("the diary has five grains", () => {
  it("orders them shortest period first", () => {
    expect(TRACKER_CLASSES).toEqual([
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
    ]);
  });

  it("gives each one its own folder", () => {
    const folders = TRACKER_CLASSES.map((c) => CLASS_DEFS[c].folderKey);
    expect(new Set(folders).size).toBe(TRACKER_CLASSES.length);
  });

  it("gives each one a distinct journal property", () => {
    // It is the value a note carries and the literal a Diary.base view filters
    // on, so two classes sharing one would merge two grains in every view.
    const props = TRACKER_CLASSES.map((c) => CLASS_DEFS[c].journalProperty);
    expect(new Set(props).size).toBe(TRACKER_CLASSES.length);
  });
});

const defOn = (c: TrackerClass) =>
  ({
    id: "t",
    label: "T",
    type: "number",
    surface: diarySurface(c),
  }) as unknown as Parameters<typeof scopesFor>[0];

describe("every grain is chartable", () => {
  it("offers each grain its own scope", () => {
    // Was "offers no chart scope for the three added grains" — 2.57.12's
    // honest refusal while the collector could only read two folders. 2.58.5
    // taught it the class table, so the refusal inverts rather than being
    // deleted: what it protected against was a scope resolving to a folder
    // nothing walks, and that is now impossible by construction.
    for (const c of TRACKER_CLASSES) {
      expect(scopesFor(defOn(c)), c).toContain(c);
    }
  });

  it("offers the bucketed compound for daily only", () => {
    // A daily series can be bucketed up; a coarser one cannot be unbucketed,
    // because there is no finer data to unbucket.
    expect(scopesFor(defOn("daily"))).toContain("daily-by-month");
    for (const c of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      expect(scopesFor(defOn(c)), c).not.toContain("daily-by-month");
    }
  });

  it("labels every scope it can return", () => {
    // A Record<ChartScope, string> makes a missing label a compile error, but
    // an EMPTY one compiles fine and renders a blank dropdown row.
    for (const c of TRACKER_CLASSES) {
      expect(SCOPE_LABELS[c], c).toBeTruthy();
    }
  });
});

describe("a period entry is a real diary note", () => {
  const src = () => readSrc("diary");

  it("seeds from the class template rather than bare frontmatter", () => {
    // The first version wrote three lines and argued there was "nothing worth
    // templating". The note came out empty — so the button that exists to give
    // a bridge somewhere to live made a note with nowhere to put one — and with
    // no `journal:` property it classified as NOTHING: no entry header, no
    // tracker surface, absent from Diary.base.
    expect(src()).toContain("CLASS_DEFS[spec.cls].templateFile");
    expect(src()).toContain("readTemplate");
  });

  it("still writes the journal property if the template is missing", () => {
    // The fallback has to classify too, or a vault mid-repair creates orphans.
    expect(src()).toContain("CLASS_DEFS[spec.cls].journalProperty");
  });

  it("stamps the period the entry is for", () => {
    expect(src()).toContain("${spec.prop}: ${startIso}");
  });
});

// ── 2.58.0: the table describes what already happens ──────────────────
//
// Patch 1 adds fields and reads none of them. Its whole claim is that it
// changes no behaviour, so these assertions check the new data against the
// hardcoded literals still in force — if the table disagrees with them, every
// patch that later reads it inherits the disagreement.

describe("every grain declares how it reads and how it is named", () => {
  it("fills all five new fields", () => {
    for (const c of TRACKER_CLASSES) {
      const d = CLASS_DEFS[c];
      expect(d.periodNoun, c).toBeTruthy();
      expect(d.unit, c).toBeTruthy();
      expect(d.filePrefix, c).toBeTruthy();
      expect(d.fileFormat, c).toBeTruthy();
      expect(d.titleFormat.from, c).toBeTruthy();
    }
  });

  it("gives each grain a distinct file prefix", () => {
    // Two grains sharing one would make an entry of either match the other's
    // walk — the collector reading a week as a day, silently.
    const p = TRACKER_CLASSES.map((c) => CLASS_DEFS[c].filePrefix);
    expect(new Set(p).size).toBe(p.length);
  });

  it("marks the range grain by the presence of `to`, not a flag", () => {
    // A week is a range — "27 Jul – 2 Aug 2026" — where a day and a month are
    // points. Absence is the signal, so there is no separate `isRange` that
    // could disagree with the formats beside it.
    expect(CLASS_DEFS.weekly.titleFormat.to).toBeTruthy();
    for (const c of ["daily", "monthly", "quarterly", "yearly"] as const) {
      expect(CLASS_DEFS[c].titleFormat.to, c).toBeUndefined();
    }
  });

  it("keeps periodNoun distinct from the tracker adjective", () => {
    // `noun` is "daily" and goes in "no daily trackers are defined yet".
    // `periodNoun` is "day" and goes in "Jump to day" / "Earliest day".
    expect(CLASS_DEFS.daily.periodNoun).toBe("day");
    expect(CLASS_DEFS.daily.noun).toBe("daily");
  });
});

describe("the table agrees with the literals still in force", () => {
  it("no longer hardcodes any filename pattern in the collector", () => {
    // Was: "matches the two filename patterns the chart collector hardcodes" —
    // patch 1's evidence that the table described what already happened. Patch
    // 4 removed the literals, so the check becomes their absence. DAY_FILE and
    // MONTH_FILE gone is the whole of "one walk, five grains".
    // Through readCode, not readSrc: the comment above the replacement names
    // both constants to explain their removal, and a substring check cannot
    // tell that from the constants still being there.
    expect(readCode("chart-render")).not.toContain("DAY_FILE");
    expect(readCode("chart-render")).not.toContain("MONTH_FILE");
    expect(readSrc("chart-render")).toContain("CLASS_DEFS[grain].filePrefix");
  });

  it("matches the names the entry creator writes for the three new grains", () => {
    const src = readSrc("diary");
    for (const c of ["weekly", "quarterly", "yearly"] as const) {
      expect(src, c).toContain(`\`${CLASS_DEFS[c].filePrefix}`);
    }
  });

  it("declares a moment unit each grain can actually step by", () => {
    const units = TRACKER_CLASSES.map((c) => CLASS_DEFS[c].unit);
    expect(units).toEqual(["day", "isoWeek", "month", "quarter", "year"]);
  });

  it("is read by the header and the picker as of 2.58.1", () => {
    // The inverse of patch 1's guard, which asserted NOTHING read these fields.
    // That guard existed so a green suite could be evidence for "changes no
    // behaviour"; patch 2 is the change, so the guard inverts rather than being
    // deleted — the fields being unread was a fact worth stating, and so is
    // their being read.
    const uses = [readSrc("entryheader"), readSrc("nav")].join("\n");
    expect(uses).toContain("periodNoun");
    expect(uses).toContain("dateProperty");
    expect(uses).toContain("titleFormat");
  });
});

// ── the seeding question, for a tracker on several grains (2.58.4) ────

describe("a multi-grain tracker is not mistaken for a journal one", () => {
  it("asks the surface, not the class", () => {
    // The guard read `cls == null` and meant "journal tracker" — true until
    // 2.57.8, after which diaryClassOf also returns null for a diary tracker on
    // SEVERAL grains. Ticking a second grain therefore told a diary tracker it
    // was not seeded onto templates, which is flatly wrong.
    const src = readSrc("settings-editors");
    expect(src).toContain('if (t.surface.kind === "journal") {');
  });

  it("names one grain when there is one, and does not list five", () => {
    expect(seedingPhrase(diarySurface("daily"))).toBe("daily entry");
    expect(seedingPhrase(diarySurface("monthly"))).toBe("monthly entry");
  });

  it("falls back to a phrase rather than an adjective for several", () => {
    // Listing five adjectives in a setting name is a sentence, not a label.
    const many = seedingPhrase(diarySurface("daily", "weekly"));
    expect(many).not.toContain("daily");
    expect(many).toContain("logged on");
  });

  it("returns the whole noun phrase, so callers do not append 'entry'", () => {
    // The first draft returned "entry it can be logged on" and the caller
    // suffixed " entry", rendering "on every new entry it can be logged on
    // entry".
    for (const s of [diarySurface("daily"), diarySurface("daily", "weekly")]) {
      expect(seedingPhrase(s).split("entry").length - 1).toBeLessThanOrEqual(1);
    }
  });

  it("pluralises the template phrase with the grain count", () => {
    expect(seedingTemplatePhrase(diarySurface("daily"))).toBe(
      "the daily template"
    );
    expect(seedingTemplatePhrase(diarySurface("daily", "weekly"))).toContain(
      "each template"
    );
  });

  it("stopped naming a hardcoded pair of grains in the negative", () => {
    // "Not on the diary's daily or monthly entries" went stale the moment
    // 2.57.12 added three more, and naming five in a negative sentence is worse
    // than naming none.
    const src = readSrc("settings-editors");
    expect(src).not.toContain("daily or monthly entries");
  });
});

// ── the period dashboards agree (2.58.6) ──────────────────────────────

describe("every period dashboard scopes its task rollup the same way", () => {
  // Composed since 2.59.3, not read from disk.
  const asset = (name: string): string =>
    ({
      "weekly-overview.md": composeDiaryDashboard("weekly"),
      "monthly-overview.md": composeDiaryDashboard("monthly"),
      "quarter.md": composeDiaryDashboard("quarterly"),
      "year.md": composeDiaryDashboard("yearly"),
    })[name] ?? "";

  it("scopes by period, not by folder", () => {
    // A REGRESSION FROM 2.57.6, not a style difference. Bare `tasks-table`
    // scopes to the host note's own folder, and the weekly overview used to be
    // the folder note of the DAILY folder — so bare meant "this week's daily
    // entries", which was right. The restructure moved it into `Weekly/`, which
    // holds weekly entries, and the same directive silently began reading a
    // different set of notes.
    for (const f of ["weekly-overview.md", "monthly-overview.md", "quarter.md"]) {
      expect(asset(f), f).toContain("tasks-table:,period");
    }
  });

  it("leaves no bare tasks-table on a period dashboard", () => {
    // The bare form is still correct where the folder IS the scope — Staging
    // names its folder explicitly — but on a note whose meaning comes from a
    // `*-start` property, the period is the scope.
    for (const f of ["weekly-overview.md", "monthly-overview.md", "quarter.md"]) {
      expect(asset(f).match(/^tasks-table$/m), f).toBeNull();
    }
  });

  it("keeps the year dashboard without one, deliberately", () => {
    // Not an oversight and not consistency for its own sake: a year of open
    // tasks grouped by source note is a page-long list nobody reads, which is
    // the same argument the empty-state rule makes about a widget that is
    // technically correct and practically noise. If it ever gains one it should
    // be because someone wanted it, not because the other three have one.
    expect(asset("year.md")).not.toContain("tasks-table");
  });
});

// ── 2.59.1: one answer to "what note is this" ─────────────────────────

describe("one resolver, both surfaces", () => {
  const paths = {
    ...DEFAULT_PATHS,
    journalRoots: [{ typeId: "study", root: "03 - Journals/Study", types: ["lesson"] }],
  };

  it("answers a diary note with a grain, not a tracker surface", () => {
    // A tracker's surface can name SEVERAL grains; a note is exactly one thing.
    // They shared a shape and were not the same idea.
    const k = noteKindOf(paths, "02 - Diary/Weekly/Week-2026-W30.md");
    expect(k).toEqual({ surface: "diary", grain: "weekly" });
  });

  it("answers a journal note with its type", () => {
    const k = noteKindOf(
      paths,
      "03 - Journals/Study/Algebra/Roots.md",
      undefined,
      "lesson"
    );
    expect(k).toEqual({ surface: "journal", typeId: "study" });
  });

  it("lets a note that says what it is outrank where it sits", () => {
    // A daily entry filed somewhere odd is still a daily entry.
    const k = noteKindOf(paths, "somewhere/else.md", "Daily Notes");
    expect(k).toEqual({ surface: "diary", grain: "daily" });
  });

  it("returns null for a note it does not understand", () => {
    // Unclassified is PERMISSIVE. The surface rule exists to stop entries
    // borrowing each other's modules, not to police unknown notes.
    expect(noteKindOf(paths, "Inbox/Scratch.md")).toBeNull();
  });

  it("keeps classifyNote agreeing with it, since it is now the same code", () => {
    // The adapter is the evidence that patch 2 changed no behaviour: every
    // classifyNote answer is a re-wrapping of this one.
    for (const p of [
      "02 - Diary/Daily/Day-2026-07-21.md",
      "02 - Diary/Quarterly/Quarter-2026-Q3.md",
      "Inbox/Scratch.md",
    ]) {
      const k = noteKindOf(paths, p);
      const s = classifyNote(paths, p);
      if (k == null) expect(s).toBeNull();
      else expect(diaryClassesOf(s as TrackerSurface)).toContain(k.grain);
    }
  });

  it("is what entryContext asks now", () => {
    // It used to ask for a surface, substitute a journal surface for null so
    // the call type-checked, unwrap back to a class, then default — four steps
    // to learn one fact, one of them a lie told to the type system.
    const src = readCode("nav");
    expect(src).toContain("noteKindOf(");
    expect(src).not.toContain("journalSurface(null)");
  });
});

describe("the journal arm stays singular, on purpose", () => {
  it("records the decision where the type is", () => {
    // 2.59's §4 was never "make journal surfaces a set" — it was "decide in
    // writing before 3.0's UI hardens around one shape". The thing that would
    // justify a set does not exist: a tracker wanted on two journals but not
    // all of them, which `typeId: null` already covers.
    const src = readSrc("trackers");
    expect(src).toContain("REVISITED IN 2.59.5 AND DELIBERATELY LEFT ALONE");
    expect(src).toContain("THE FIELD THAT CHANGES");
  });

  it("still has exactly one journal type per surface", () => {
    expect(journalSurface("study")).toEqual({ kind: "journal", typeId: "study" });
    expect(journalSurface(null)).toEqual({ kind: "journal", typeId: null });
  });
});
