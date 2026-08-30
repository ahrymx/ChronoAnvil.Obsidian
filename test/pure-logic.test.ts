// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { composeEntryTemplate } from "../src/diary/entry-sections";
import { describe, it, expect, beforeEach } from "vitest";
import { composeCss } from "../tools/build-css.mjs";
import { studyFile, studyTemplate } from "./study-template";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { TFile, TFolder } from "./obsidian-stub";
import type { App } from "obsidian";
import { ensureJournalsBlock } from "../src/journals/journal";
import { composeHomeNote } from "../src/diary/home-sections";
import {
  pruneCollapsedSections,
  remapConfiguredPaths,
} from "../src/core/pathwatch";
import {
  folderNotePath,
  isFolderNote,
  weeklyOverviewPath,
  monthlyOverviewPath,
  quarterOverviewPath,
  yearOverviewPath,
  legacyOverviewPath,
  resolveOverviewPath,
  isoDate,
  fillTemplate,
  parseHeaderDirective,
  headerAtFence,
  locateSection,
  noExt,
  basename,
  moodBucket,
  parseClock,
  sleepMinutes,
  sleepHours,
  awakeHours,
  formatDuration,
  formatSleepRatio,
  meanClock,
  daysSinceWeekStart,
  aggregateActivity,
  activityWeight,
  activityBucket,
  monthActivityStats,
  activityMonthBounds,
  quarterOfMonth,
  quarterMonths,
  shiftQuarter,
  activityQuarterBounds,
  quarterActivityStats,
  yearStripBounds,
  yearStripCells,
  yearStripMonthLabels,
  yearStripStats,
  moment,
  periodCoverage,
  fillDailyTemplate,
  fillMonthlyTemplate,
} from "../src/core/util";
import type { ActivityCount } from "../src/core/util";
import {
  buildJournalType,
  customTemplateFiles,
  freshCustomJournal,
  slugify,
} from "../src/journals/custom-journal";
import type {
  JournalKindConfig,
  JournalLevelConfig,
} from "../src/journals/custom-journal";
import {
  STUDY_JOURNAL,
  journalAncestors,
  journalChildFolders,
  registeredJournalTypes,
} from "../src/journals/journal";
import { isCompletedStatus } from "../src/ui/tables";
import { bucketByMonth, formatPeriodLabel } from "../src/charts/charts";
import { relativeActivity } from "../src/core/query";
import { TRACKER_CLASSES, journalTypeOfPath } from "../src/trackers/trackers";
import { deriveJournalFolders } from "../src/journals/custom-journal";
import {
  DEFAULT_EVENT_COLOR,
  DEFAULT_EVENT_ICON,
  addDays,
  daysBetween,
  describeDay,
  describeEventDate,
  describeRelative,
  eventsOnDay,
  expandEvents,
  isMultiDay,
  isValidIso,
  parseEvents,
  recurringIso,
  serializeEvents,
  describeEventWhen,
  slugifyEventId,
  upcomingEvents,
} from "../src/events/events";
import type { EventDef } from "../src/events/events";
import {
  parseChartRegion,
  parseChartDirectives,
  serializeChartSpec,
  nextChartKey,
  mergeTrendsSection,
  ensureTrendsHeader,
  retitleTrends,
  resolveChartWindow,
  hourAxisBounds,
  pointInWindow,
  pointsInWindow,
  summarize,
  rollingMean,
  rollingWindowFor,
  journalTrendShowsAverage,
  ROLLING_WINDOW_MIN,
  pairPoints,
  streakStats,
  SPAN_CELLS,
  isChartSpan,
  rangeDays,
  defaultSpan,
  spanOf,
  periodUnitOf,
  periodPropertyFor,
  PERIOD_PROPERTIES,
  ALL_TIME_DAYS,
} from "../src/charts/charts";
import type { ChartSpec, ChartPoint } from "../src/charts/charts";
import type { ChartScope, ChartSpan } from "../src/trackers/trackers";
import { toValue } from "../src/charts/chart-render";
import {
  formatScaleNoteTag,
  parseScaleNoteLine,
  parseScaleNotes,
  hasScaleNoteFor,
  normalizeNoteText,
  canAnnotate,
} from "../src/journals/scale-notes";
import type { ScaleNote } from "../src/journals/scale-notes";
import {
  JOURNAL_BUILTINS,
  classifyNote,
  diarySurface,
  parseSelectOptions,
  journalSurface,
  normalizeTrackers,
  surfaceFolders,
  viewAcceptsClass,
} from "../src/trackers/trackers";
import { rangesFor, scopesFor, typesFor } from "../src/charts/chart-ui";
import { isChartable } from "../src/charts/charts";
import type { TrackerDef } from "../src/trackers/trackers";
import {
  createTrackerRegion,
  describeDirective,
  describeSurfaceMismatch,
  directiveAllowedOn,
  directiveProperties,
  noteEditedProperties,
  noteTrackerDirectives,
  regionTrackerDirectives,
  resurfacePrompt,
  insertTrackerDirective,
  isEmptyValue,
  locateTrackerRegion,
  mergeEntryFences,
  splitEntryFences,
  removeTrackerDirective,
  trackerOptions,
} from "../src/trackers/entry-trackers";
import {
  isValidNoteKey,
  readNoteRegion,
  writeNoteRegion,
  ensureNoteRegions,
  allNoteRegions,
} from "../src/core/notestore";
import {
  parseTaskLine,
  serializeTaskLine,
  parseTasks,
  serializeTasks,
  newTask,
  moveTask,
  isValidPriority,
} from "../src/ui/tasks";
import type { ChronoAnvilTask } from "../src/ui/tasks";
import {
  resolveToggleTarget,
  mapWithLimit,
  openTasksInFile,
  dueLabel,
  countChronoAnvilTasks,
  sumChronoAnvilTasks,
  countBodyTasks,
  sumBodyTasks,
  inPeriod,
  __clearTaskCache,
} from "../src/ui/tables";
import {
  applyTokens,
  coerceUrl,
  displayTitle,
  extensionForMime,
  extensionOf,
  hasTarget,
  isExternalUrl,
  isImageTarget,
  isSafeUrl,
  moveAttachment,
  newAttachment,
  parseAttachmentLine,
  parseAttachments,
  sanitizeFileName,
  sanitizeFolderPath,
  serializeAttachmentLine,
  serializeAttachments,
  splitExtension,
  uniquePath,
} from "../src/ui/attachments";
import { remapPath } from "../src/core/pathwatch";
import {
  parseEntries,
  serializeEntries,
  normalizeEntry,
  applyEntryCommit,
  applyEntryEnter,
  applyEntryBackspace,
} from "../src/diary/entries";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_PATHS, ROOT_CHILDREN, DEFAULT_TRACKERS } from "../src/core/constants";

import { fnBody, readCode, readCss, readSrc, repoFile } from "./sources";
import { presetAsNewJournal } from "../src/journals/custom-journal";
import { STUDY_PRESET } from "../src/journals/journal";
// ── util.ts: fillTemplate ────────────────────────────────────────────────
describe("fillTemplate", () => {
  it("substitutes known tokens", () => {
    expect(fillTemplate("Hello {{name}}!", { name: "Ada" })).toBe("Hello Ada!");
  });
  it("tolerates internal whitespace in the token", () => {
    expect(fillTemplate("{{ name }}", { name: "Ada" })).toBe("Ada");
  });
  it("leaves unknown tokens in place so a gap is visible", () => {
    expect(fillTemplate("{{a}}-{{b}}", { a: "x" })).toBe("x-{{b}}");
  });
  it("substitutes every occurrence", () => {
    expect(fillTemplate("{{x}}{{x}}", { x: "z" })).toBe("zz");
  });
  it("supports hyphenated token names", () => {
    expect(fillTemplate("{{full-name}}", { "full-name": "A B" })).toBe("A B");
  });
});

// ── util.ts: isoDate ─────────────────────────────────────────────────────
describe("isoDate", () => {
  it("returns null for empty/nullish", () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate(undefined)).toBeNull();
    expect(isoDate("")).toBeNull();
  });
  it("truncates a string to the first 10 chars", () => {
    expect(isoDate("2025-07-20T13:45:00")).toBe("2025-07-20");
    expect(isoDate("2025-07-20")).toBe("2025-07-20");
  });
  it("formats a Date object", () => {
    expect(isoDate(new Date(2025, 6, 20))).toBe("2025-07-20");
  });
  it("uses toISODate() when present (Luxon-like)", () => {
    expect(isoDate({ toISODate: () => "2030-01-02" })).toBe("2030-01-02");
  });
  it("uses format() when present (moment-like)", () => {
    expect(isoDate({ format: (_f: string) => "1999-12-31" })).toBe("1999-12-31");
  });
});

// ── util.ts: parseHeaderDirective ────────────────────────────────────────
describe("parseHeaderDirective", () => {
  it("bare title is level 1", () => {
    expect(parseHeaderDirective("📚 Journals")).toEqual({
      level: 1,
      title: "📚 Journals",
    });
  });
  it("explicit level prefix is parsed and stripped", () => {
    expect(parseHeaderDirective("2:Study")).toEqual({ level: 2, title: "Study" });
    expect(parseHeaderDirective("1:Top")).toEqual({ level: 1, title: "Top" });
  });
  it("trims the title", () => {
    expect(parseHeaderDirective("  Spaced  ")).toEqual({
      level: 1,
      title: "Spaced",
    });
  });
  it("clamps a level the grammar doesn't have, rather than mis-titling", () => {
    // Was: `3:Sources` fell through the `^([12]):` match and rendered a
    // level-1 bar literally titled "3:Sources". A number the grammar doesn't
    // have should not become part of the text.
    expect(parseHeaderDirective("3:Nope")).toEqual({ level: 2, title: "Nope" });
    expect(parseHeaderDirective("9:Deep")).toEqual({ level: 2, title: "Deep" });
    expect(parseHeaderDirective("0:Top")).toEqual({ level: 1, title: "Top" });
  });

  it("leaves a title that merely contains a colon alone", () => {
    // Only a leading run of DIGITS is a level, so ordinary prose survives.
    expect(parseHeaderDirective("Note: read this")).toEqual({
      level: 1,
      title: "Note: read this",
    });
  });
});

// ── util.ts: headerAtFence ───────────────────────────────────────────────
describe("headerAtFence", () => {
  const fence = ["```chronoanvil", "header:📚 Journals", "```"];
  it("recognises a header fence", () => {
    expect(headerAtFence(fence, 0)).toEqual({ level: 1, title: "📚 Journals" });
  });
  it("returns null when the line is not a fence open", () => {
    expect(headerAtFence(fence, 1)).toBeNull();
  });
  it("returns null for a fence whose first directive is not a header", () => {
    expect(headerAtFence(["```chronoanvil", "links:home", "```"], 0)).toBeNull();
  });
});

// ── util.ts: locateSection (header-bar AND legacy heading forms) ──────────
describe("locateSection", () => {
  const TITLE = "📚 Journals";
  const HEADING = "## 📚 Journals";

  // ── a title may be spelled more than one way (4.26) ──────────────────
  //
  // The capability that made `TRENDS_HEADING` renameable. Before this the match
  // was exact, so a section whose display name changed became unfindable in
  // every note written before the change — and indistinguishable, to the
  // caller, from a section that was never there: both are null.
  describe("historical spellings", () => {
    const NOW = "📚 Journals";
    const WAS = "📚 JOURNALS";

    it("finds a header bar written under an older spelling", () => {
      const old = ["```chronoanvil", `header:${WAS}`, "```", "body"];
      // Exactly the pre-4.26 behaviour, restated so the fix has something to
      // be a fix OF: the current name alone does not find the old note.
      expect(locateSection(old, NOW, HEADING)).toBeNull();
      const loc = locateSection(old, [NOW, WAS], HEADING);
      expect(loc).not.toBeNull();
      expect(loc!.viaHeaderBar).toBe(true);
      expect(loc!.titleStart).toBe(0);
    });

    it("finds a legacy markdown heading under an older spelling too", () => {
      const old = ["## 📚 JOURNALS", "body", "## Next"];
      expect(locateSection(old, NOW, HEADING)).toBeNull();
      const loc = locateSection(old, NOW, [HEADING, "## 📚 JOURNALS"]);
      expect(loc).not.toBeNull();
      expect(loc!.viaHeaderBar).toBe(false);
      expect(loc!.end).toBe(2);
    });

    it("still refuses a spelling that is on neither list", () => {
      // The list is a history, not a fuzzy match. A title ChronoAnvil never wrote
      // is a reader's own and must stay unfound, or a migration would rewrite
      // it.
      const mine = ["```chronoanvil", "header:📈 My numbers", "```"];
      expect(locateSection(mine, [NOW, WAS], [HEADING])).toBeNull();
    });

    it("takes a bare string exactly as it always did", () => {
      // The parameter widened; it did not change meaning. Every existing caller
      // passes a string and must behave identically.
      const lines = ["```chronoanvil", `header:${NOW}`, "```"];
      expect(locateSection(lines, NOW, HEADING)).toEqual(
        locateSection(lines, [NOW], [HEADING])
      );
    });
  });

  it("finds a header-bar section and its boundary", () => {
    const lines = [
      "# Home",
      "",
      "```chronoanvil",
      "header:📚 Journals",
      "```",
      "body line",
      "## Next Section",
      "after",
    ];
    const loc = locateSection(lines, TITLE, HEADING);
    expect(loc).not.toBeNull();
    expect(loc!.viaHeaderBar).toBe(true);
    expect(loc!.titleStart).toBe(2);
    expect(loc!.titleEnd).toBe(4); // closing fence
    expect(loc!.end).toBe(6); // "## Next Section"
  });

  it("falls back to the legacy markdown heading", () => {
    const lines = ["# Home", "## 📚 Journals", "body", "## Tags", "x"];
    const loc = locateSection(lines, TITLE, HEADING);
    expect(loc).not.toBeNull();
    expect(loc!.viaHeaderBar).toBe(false);
    expect(loc!.titleStart).toBe(1);
    expect(loc!.titleEnd).toBe(1);
    expect(loc!.end).toBe(3); // "## Tags"
  });

  it("returns null when the section is absent", () => {
    expect(locateSection(["# Home", "text"], TITLE, HEADING)).toBeNull();
  });

  it("runs to EOF when there is no trailing boundary", () => {
    const lines = ["## 📚 Journals", "a", "b"];
    const loc = locateSection(lines, TITLE, HEADING);
    expect(loc!.end).toBe(3);
  });

  it("treats sibling header bars as inside when the predicate says so", () => {
    const lines = [
      "```chronoanvil",
      "header:📚 Journals",
      "```",
      "```chronoanvil",
      "header:2:Study",
      "```",
      "study body",
      "## Tags",
    ];
    const loc = locateSection(lines, TITLE, HEADING, (t) => t === "Tags");
    expect(loc!.end).toBe(7); // "## Tags", NOT the nested Study bar at 3
  });

  // The 2.8 home adds a `home-hero` block above Diary. The hero carries no
  // `header:` directive, so it must not register as a section boundary and
  // must not shift where the Journals span is found.
  it("is unaffected by the 2.8 home-hero block above it", () => {
    const lines = [
      "`chronoanvil:spacer`",
      "```chronoanvil",
      "home-hero",
      "```",
      "",
      "```chronoanvil",
      "header:📅 Diary",
      "links:home,week,month,all",
      "```",
      "",
      "```chronoanvil",
      "calendar",
      "```",
      "",
      "```chronoanvil",
      "header:📚 Journals",
      "```",
      "",
      "```chronoanvil",
      "header:2:Study",
      "```",
      "study body",
      "",
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "```",
      "",
      "```chronoanvil",
      "header:🏷️ Tags",
      "```",
    ];
    // Predicate mirrors allKnownJournalTitles(): the Study sub-bar is in-section;
    // any other header is a boundary. The point of this test is that adding the
    // hero above Diary does NOT change where the Journals section starts or
    // ends. Its end is the Trends fence, NOT Tags: Trends carries its title in
    // a ```chronoanvil-charts fence, and until 2.13.8 the boundary scan couldn't
    // see that fence, so the Journals span ran straight through Trends and a
    // rebuild deleted the whole chart section. See sectionBoundaryAt.
    const loc = locateSection(lines, TITLE, HEADING, (t) => t !== "🎓 Study" && t !== "Study");
    expect(loc).not.toBeNull();
    expect(loc!.viaHeaderBar).toBe(true);
    expect(loc!.titleStart).toBe(14); // the "```chronoanvil" opening the Journals bar
    expect(loc!.titleEnd).toBe(16); // its closing fence
    expect(loc!.end).toBe(23); // the Trends "```chronoanvil-charts" fence
  });

  it("ends a section at the Trends chart fence, not past it", () => {
    // The regression that motivated sectionBoundaryAt, reduced: on the shipped
    // home note Journals is immediately followed by Trends. A scan that can't
    // see ```chronoanvil-charts treats Trends as Journals' body, so rewriting the
    // Journals body destroys the user's charts.
    const lines = [
      "```chronoanvil",
      "header:📚 Journals",
      "```",
      "",
      "journals body",
      "",
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "chart:mood",
      "```",
    ];
    const loc = locateSection(lines, TITLE, HEADING);
    expect(loc!.end).toBe(6);
    expect(lines.slice(loc!.end)).toContain("chart:mood");
  });
});

// ── util.ts: noExt ───────────────────────────────────────────────────────
describe("noExt", () => {
  it("strips a trailing .md", () => {
    expect(noExt("a/b/c.md")).toBe("a/b/c");
  });
  it("leaves a non-md path untouched", () => {
    expect(noExt("a/b/c")).toBe("a/b/c");
  });
});

describe("basename", () => {
  it("returns the final path segment", () => {
    expect(basename("a/b/c.md")).toBe("c.md");
  });
  it("returns the input unchanged when there is no slash", () => {
    expect(basename("file.md")).toBe("file.md");
  });
  it("handles a trailing slash by returning empty last segment", () => {
    expect(basename("a/b/")).toBe("");
  });
});

// ── util.ts: moodBucket (heat-map shade bucketing) ───────────────────────
describe("moodBucket", () => {
  it("returns null for a non-value", () => {
    expect(moodBucket(null)).toBeNull();
    expect(moodBucket(NaN)).toBeNull();
    expect(moodBucket(Infinity)).toBeNull();
  });

  describe("without a declared range (native 1..5)", () => {
    it("passes through in-range values", () => {
      expect(moodBucket(1)).toBe(1);
      expect(moodBucket(3)).toBe(3);
      expect(moodBucket(5)).toBe(5);
    });
    it("clamps a legitimate 0 up to bucket 1 (not an unstyled cell)", () => {
      expect(moodBucket(0)).toBe(1);
    });
    it("clamps an out-of-scale high value down to 5", () => {
      expect(moodBucket(8)).toBe(5);
      expect(moodBucket(10)).toBe(5);
    });
    it("rounds fractional values before bucketing", () => {
      expect(moodBucket(3.4)).toBe(3);
      expect(moodBucket(4.6)).toBe(5);
    });
    it("clamps a negative value up to 1", () => {
      expect(moodBucket(-2)).toBe(1);
    });
  });

  describe("with a declared range (scale-aware normalisation)", () => {
    const r = { min: 0, max: 10 };
    it("maps the range endpoints to buckets 1 and 5", () => {
      expect(moodBucket(0, r)).toBe(1);
      expect(moodBucket(10, r)).toBe(5);
    });
    it("maps the midpoint to bucket 3", () => {
      expect(moodBucket(5, r)).toBe(3);
    });
    it("spreads intermediate values across the 5 buckets", () => {
      expect(moodBucket(2.5, r)).toBe(2);
      expect(moodBucket(7.5, r)).toBe(4);
    });
    it("clamps values outside the declared range", () => {
      expect(moodBucket(-3, r)).toBe(1);
      expect(moodBucket(20, r)).toBe(5);
    });
    it("ignores an invalid range (max <= min) and falls back", () => {
      expect(moodBucket(3, { min: 5, max: 5 })).toBe(3);
      expect(moodBucket(3, { min: 10, max: 2 })).toBe(3);
    });
    it("falls back when only one bound is present", () => {
      expect(moodBucket(3, { min: 0 })).toBe(3);
      expect(moodBucket(8, { max: 10 })).toBe(5); // no min → clamp path
    });
  });
});

// ── util.ts: sleep coupling math (parseClock / sleep / awake) ────────────
describe("parseClock", () => {
  it("parses HH:mm to minutes since midnight", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("07:30")).toBe(450);
    expect(parseClock("23:59")).toBe(1439);
  });
  it("tolerates seconds and single-digit hours", () => {
    expect(parseClock("7:05:00")).toBe(425);
  });
  it("returns null for non-times / out-of-range", () => {
    expect(parseClock(null)).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("nope")).toBeNull();
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("12:60")).toBeNull();
  });
});

describe("sleepMinutes / sleepHours / awakeHours", () => {
  it("computes a normal overnight span", () => {
    expect(sleepMinutes("23:00", "07:00")).toBe(480);
    expect(sleepHours("23:00", "07:00")).toBe(8);
    expect(awakeHours("23:00", "07:00")).toBe(16);
  });
  it("handles a bedtime after midnight", () => {
    expect(sleepHours("00:30", "08:00")).toBe(7.5);
  });
  it("handles wake earlier in the clock than bed by wrapping", () => {
    expect(sleepMinutes("22:15", "06:45")).toBe(510); // 8h30
    expect(sleepHours("22:15", "06:45")).toBe(8.5);
  });
  it("a same-time pair is zero, not a full day", () => {
    expect(sleepMinutes("07:00", "07:00")).toBe(0);
  });
  it("returns null when either time is missing", () => {
    expect(sleepHours("", "07:00")).toBeNull();
    expect(sleepHours("23:00", null)).toBeNull();
    expect(awakeHours(null, null)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("renders whole and part hours", () => {
    expect(formatDuration(8)).toBe("8h");
    expect(formatDuration(7.5)).toBe("7h 30m");
    expect(formatDuration(6.25)).toBe("6h 15m");
  });
  it("em dash for a non-value", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(NaN)).toBe("—");
  });
});

describe("formatSleepRatio", () => {
  it("renders hours and minutes in H:MMhrs format", () => {
    expect(formatSleepRatio(7.5833)).toBe("7:35hrs");
    expect(formatSleepRatio(16.4166)).toBe("16:25hrs");
    expect(formatSleepRatio(8)).toBe("8:00hrs");
    expect(formatSleepRatio(7.5)).toBe("7:30hrs");
  });
  it("em dash for a non-value", () => {
    expect(formatSleepRatio(null)).toBe("—");
    expect(formatSleepRatio(NaN)).toBe("—");
  });
});

describe("meanClock", () => {
  it("averages morning wake times back to HH:mm", () => {
    expect(meanClock([420, 480])).toBe("07:30"); // 7:00 & 8:00
  });
  it("null for an empty list", () => {
    expect(meanClock([])).toBeNull();
  });
});

// ── charts.ts: chart scope (2.18.6) ──────────────────────────────────────
describe("chart scope", () => {
  it("reads a directive written before scope existed as daily", () => {
    // The whole reason scope is an optional trailing token: every chart on
    // disk in every existing vault has four fields, and must keep meaning what
    // it meant.
    const [spec] = parseChartDirectives(["chart:c1:Weight:line:365"]);
    expect(spec).toEqual({ key: "c1", tracker: "Weight", type: "line", range: "365" });
    expect(spec.scope).toBeUndefined();
  });

  it("round-trips a monthly chart", () => {
    const spec: ChartSpec = {
      key: "c2", tracker: "Weight", type: "bar", range: "all", scope: "monthly",
    };
    const line = serializeChartSpec(spec);
    expect(line).toBe("chart:c2:Weight:bar:all:monthly");
    expect(parseChartDirectives([line])[0]).toEqual(spec);
  });

  it("writes no scope token for a daily chart", () => {
    // An upgraded vault should not see every chart directive rewritten just
    // because a field was added.
    expect(
      serializeChartSpec({ key: "c1", tracker: "Mood", type: "line", range: "30" })
    ).toBe("chart:c1:Mood:line:30");
    expect(
      serializeChartSpec({ key: "c1", tracker: "Mood", type: "line", range: "30", scope: "daily" })
    ).toBe("chart:c1:Mood:line:30");
  });

  it("still bounds a tracker id containing colons", () => {
    // type/range/scope are anchored to known sets, which is what lets the
    // greedy id group stop in the right place.
    const [spec] = parseChartDirectives(["chart:c1:Odd:Name:summary:90:monthly"]);
    expect(spec.tracker).toBe("Odd:Name");
    expect(spec.scope).toBe("monthly");
  });

  it("rejects an unknown scope rather than guessing", () => {
    // `weekly` USED TO BE THE EXAMPLE HERE, and it was the wrong one — this
    // test was written when the grammar's scope group read `(daily|monthly)`
    // and every grain became chartable in 2.58.5, so what it pinned was not the
    // refusal but the gap. A token that is genuinely no scope at all makes the
    // same assertion without depending on the list being short.
    expect(parseChartDirectives(["chart:c1:Weight:line:365:hourly"])).toEqual([]);
    expect(parseChartDirectives(["chart:c1:Weight:line:365:daily-by-week"])).toEqual([]);
  });

  it("reads back every scope its own serialiser can write", () => {
    // THE GAP THIS CLOSES WAS SILENT AND HAD BEEN OPEN SINCE 2.52.
    // `serializeChartSpec` will write any `ChartScope`, and the parser accepted
    // two of the six — so a chart scoped to `daily-by-month` (the editor's
    // *"Daily entries, by month"*) or to any grain but daily and monthly was
    // written correctly, dropped on the next read, and vanished off the note
    // with nothing said. Asserting the pair against the whole scope list is
    // what stops the two drifting apart a third time.
    for (const scope of [...TRACKER_CLASSES, "daily-by-month"] as ChartScope[]) {
      const spec: ChartSpec = { key: "c1", tracker: "Mood", type: "line", range: "period", scope };
      const line = serializeChartSpec(spec);
      const [back] = parseChartDirectives([line]);
      expect([scope, back]).toEqual([scope, scope === "daily" ? { ...spec, scope: undefined } : spec]);
      expect(serializeChartSpec(back)).toBe(line);
    }
  });

  it("filters monthly points against day-resolution windows", () => {
    // Monthly values are dated to the 1st so the existing string-compare
    // window layer keeps working untouched.
    const pts: ChartPoint[] = [
      { date: "2026-05-01", value: 80 },
      { date: "2026-06-01", value: 79 },
      { date: "2026-07-01", value: 78 },
    ];
    const win = { start: "2026-06-01", end: "2026-07-31" };
    expect(pointsInWindow(pts, win).map((p) => p.value)).toEqual([79, 78]);
  });
});

// ── charts.ts: rolling average (2.20) ────────────────────────────────────
describe("rollingMean", () => {
  it("uses a partial window before it fills, so the overlay starts with the data", () => {
    // Trailing mean, window 3: first point is itself, second the mean of two,
    // third onward a full three-wide mean. No leading blanks.
    expect(rollingMean([2, 4, 6, 8], 3)).toEqual([2, 3, 4, 6]);
  });

  it("stays index-aligned with the input", () => {
    expect(rollingMean([1, 2, 3], 2)).toHaveLength(3);
  });

  it("is trailing, never reading a later point into an earlier average", () => {
    // If it peeked ahead, the first value wouldn't equal the first input.
    const out = rollingMean([10, 0, 0, 0], 2);
    expect(out[0]).toBe(10);
  });

  it("returns the series unchanged for a degenerate window", () => {
    expect(rollingMean([5, 6], 0)).toEqual([5, 6]);
  });

  it("picks a week-ish window clamped to sane bounds", () => {
    expect(rollingWindowFor(7)).toBe(2); // round(1) -> but min 2
    expect(rollingWindowFor(70)).toBe(10);
    expect(rollingWindowFor(3)).toBe(2); // clamped up
    expect(rollingWindowFor(10_000)).toBe(30); // clamped down
  });
});

// ── charts.ts: when a journal trend smooths itself (2.44.1) ──────────────
//
// A journal chart has no flag to carry `+avg` — the decision was to draw the
// overlay automatically above a threshold instead — so the threshold is the
// whole of the feature and is pinned here rather than eyeballed on a subject
// page.
describe("journalTrendShowsAverage", () => {
  it("stays off while the window would only be the floor", () => {
    // A trailing mean of two is the raw line again, half a step late. Nothing
    // in this range gets a second series drawn over it.
    for (const n of [0, 1, 2, 5, 10, 17]) {
      expect(journalTrendShowsAverage(n)).toBe(false);
    }
  });

  it("switches on at the first count the data picks its own window", () => {
    expect(rollingWindowFor(17)).toBe(ROLLING_WINDOW_MIN);
    expect(rollingWindowFor(18)).toBe(3);
    expect(journalTrendShowsAverage(17)).toBe(false);
    expect(journalTrendShowsAverage(18)).toBe(true);
  });

  it("stays on for everything longer, including the top clamp", () => {
    for (const n of [18, 25, 70, 400, 10_000]) {
      expect(journalTrendShowsAverage(n)).toBe(true);
    }
  });

  it("is defined against the window curve, not a copy of its threshold", () => {
    // The point of deriving it: change rollingWindowFor and the overlay's
    // switch-on moves with it. A hardcoded `>= 18` here would drift silently.
    for (let n = 0; n <= 300; n++) {
      expect(journalTrendShowsAverage(n)).toBe(
        rollingWindowFor(n) > ROLLING_WINDOW_MIN
      );
    }
  });

  it("is monotonic — a longer series never loses the overlay", () => {
    let seen = false;
    for (let n = 0; n <= 300; n++) {
      const on = journalTrendShowsAverage(n);
      if (on) seen = true;
      expect(on || !seen).toBe(true);
    }
    expect(seen).toBe(true);
  });
});

// ── charts.ts: scatter pairing (2.20) ────────────────────────────────────
describe("pairPoints", () => {
  const p = (date: string, value: number): ChartPoint => ({ date, value });

  it("keeps only dates present in both series (inner join)", () => {
    const xs = [p("2026-07-01", 7), p("2026-07-02", 8), p("2026-07-03", 6)];
    const ys = [p("2026-07-02", 4), p("2026-07-03", 5), p("2026-07-04", 3)];
    expect(pairPoints(xs, ys)).toEqual([
      { date: "2026-07-02", x: 8, y: 4 },
      { date: "2026-07-03", x: 6, y: 5 },
    ]);
  });

  it("is empty when the two series never overlap", () => {
    expect(pairPoints([p("2026-07-01", 1)], [p("2026-07-02", 2)])).toEqual([]);
  });

  it("orients x from the first arg and y from the second", () => {
    const out = pairPoints([p("2026-07-01", 9)], [p("2026-07-01", 3)]);
    expect(out[0]).toEqual({ date: "2026-07-01", x: 9, y: 3 });
  });
});

// ── charts.ts: habit streaks (2.20) ──────────────────────────────────────
describe("streakStats", () => {
  const p = (date: string, value: number): ChartPoint => ({ date, value });

  it("counts the current run from the end of the data", () => {
    const pts = [
      p("2026-07-01", 1),
      p("2026-07-02", 0),
      p("2026-07-03", 1),
      p("2026-07-04", 1),
    ];
    const s = streakStats(pts);
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
    expect(s.total).toBe(3);
  });

  it("reports a current streak of 0 when the last entry was a miss", () => {
    const pts = [p("2026-07-01", 1), p("2026-07-02", 1), p("2026-07-03", 0)];
    expect(streakStats(pts).current).toBe(0);
    expect(streakStats(pts).longest).toBe(2);
  });

  it("does not treat a date gap as a broken streak", () => {
    // Two trues, three days apart — a missing log between them is not a
    // recorded failure, so the run is unbroken.
    const pts = [p("2026-07-01", 1), p("2026-07-05", 1)];
    expect(streakStats(pts).current).toBe(2);
  });

  it("sorts before scanning, so out-of-order input still reads correctly", () => {
    const pts = [p("2026-07-03", 1), p("2026-07-01", 1), p("2026-07-02", 1)];
    expect(streakStats(pts).current).toBe(3);
  });

  it("treats >= 0.5 as done", () => {
    expect(streakStats([p("2026-07-01", 0.7)]).total).toBe(1);
    expect(streakStats([p("2026-07-01", 0.2)]).total).toBe(0);
  });
});

// ── charts.ts: scatter + avg directive round-trip (2.20) ─────────────────
describe("chart directive: scatter and avg tokens", () => {
  it("round-trips a scatter with a second tracker", () => {
    const spec: ChartSpec = {
      key: "c1", tracker: "Sleep", type: "scatter", range: "90", tracker2: "Mood",
    };
    const line = serializeChartSpec(spec);
    expect(line).toBe("chart:c1:Sleep:scatter:90+y=Mood");
    expect(parseChartDirectives([line])[0]).toEqual(spec);
  });

  it("round-trips a line with the rolling-average flag", () => {
    const spec: ChartSpec = {
      key: "c2", tracker: "Weight", type: "line", range: "all", avg: true,
    };
    const line = serializeChartSpec(spec);
    expect(line).toBe("chart:c2:Weight:line:all+avg");
    expect(parseChartDirectives([line])[0]).toEqual(spec);
  });

  it("carries scope alongside the new tokens", () => {
    const spec: ChartSpec = {
      key: "c3", tracker: "Weight", type: "scatter", range: "all",
      scope: "monthly", tracker2: "Savings",
    };
    expect(serializeChartSpec(spec)).toBe(
      "chart:c3:Weight:scatter:all:monthly+y=Savings"
    );
    expect(parseChartDirectives([serializeChartSpec(spec)])[0]).toEqual(spec);
  });

  it("parses the flags in either order", () => {
    const [a] = parseChartDirectives(["chart:c1:X:line:30+avg+y=Y"]);
    const [b] = parseChartDirectives(["chart:c1:X:line:30+y=Y+avg"]);
    expect(a.tracker2).toBe("Y");
    expect(a.avg).toBe(true);
    expect(b.tracker2).toBe("Y");
    expect(b.avg).toBe(true);
  });

  it("still bounds a colon-containing id with the new tokens present", () => {
    const [spec] = parseChartDirectives(["chart:c1:Odd:Name:scatter:90+y=Other:Id"]);
    expect(spec.tracker).toBe("Odd:Name");
    expect(spec.tracker2).toBe("Other:Id");
  });

  it("leaves a plain 4-field directive byte-identical (no new tokens)", () => {
    expect(serializeChartSpec({ key: "c1", tracker: "Mood", type: "line", range: "30" }))
      .toBe("chart:c1:Mood:line:30");
  });
});

// ── chart-ui.ts: what the editor is allowed to offer ─────────────────────
describe("chart editor options", () => {
  const def = (over: Partial<TrackerDef>): TrackerDef =>
    ({ id: "X", label: "X", type: "number", surface: diarySurface("daily"), showInTemplate: false, showInBase: false, ...over }) as TrackerDef;

  it("reads a chart's scope straight off the tracker's class", () => {
    // 2.52: a daily tracker also offers "daily-by-month" — the same values,
    // bucketed on the way out. The offer goes one way only: a monthly tracker
    // has no finer data to unbucket.
    expect(scopesFor(def({ surface: diarySurface("daily") }))).toEqual([
      "daily",
      "daily-by-month",
    ]);
    expect(scopesFor(def({ surface: diarySurface("monthly") }))).toEqual(["monthly"]);
  });

  it("never offers a scope the tracker's class can't supply", () => {
    // The point of deriving scope from class: a monthly tracker has no daily
    // readings to chart, so "Daily entries" is not merely a poor choice but an
    // empty one, and it isn't in the list.
    expect(scopesFor(def({ surface: diarySurface("monthly") }))).not.toContain("daily");
    expect(scopesFor(def({ surface: diarySurface("daily") }))).not.toContain("monthly");
  });

  it("rejects a stale scope a chart directive may still carry", () => {
    // A chart written when a tracker was on both templates carries
    // `scope: monthly`; the migration resolved that tracker to daily, so the
    // directive on disk now names a folder its tracker never writes to.
    // chart-render.ts resolves against this list rather than reading the
    // stored value literally, which would draw an empty chart that looks
    // broken rather than empty.
    const daily = def({ surface: diarySurface("daily") });
    expect(scopesFor(daily).includes("monthly")).toBe(false);
    expect(scopesFor(daily)[0]).toBe("daily");
  });

  it("keeps its class for a tracker on no template at all", () => {
    // "+ Add tracker" writes into a single entry without touching a template,
    // so the values exist — in entries of the tracker's own class — even when
    // nothing auto-applies it.
    expect(scopesFor(def({ surface: diarySurface("monthly"), showInTemplate: false }))).toEqual(["monthly"]);
    expect(scopesFor(def({}))).toEqual(["daily", "daily-by-month"]);
    // No tracker at all still means the daily folder and nothing derived.
    expect(scopesFor(undefined)).toEqual(["daily"]);
  });

  // ── charting a journal tracker is pinned, so it must be refused ────────

  it("yields no scopes at all for a journal tracker", () => {
    // Empty rather than a diary class. With type-only scoping the registry
    // can't know whether a journal tracker lands on dated notes, so "not
    // chartable yet" has to be representable — and the obvious ?? "daily"
    // would point it at a folder it never writes to.
    expect(scopesFor(def({ surface: journalSurface("study") }))).toEqual([]);
    expect(scopesFor(def({ surface: journalSurface(null) }))).toEqual([]);
  });

  it("never mis-defaults a journal tracker to the daily folder", () => {
    // The specific bug: collectPoints defaults an absent scope to "daily", so
    // anything that lets a journal tracker reach it draws an empty series read
    // from the diary — a chart that looks broken rather than empty.
    for (const surface of [journalSurface("study"), journalSurface(null)]) {
      expect(scopesFor(def({ surface }))).not.toContain("daily");
      expect(scopesFor(def({ surface }))).not.toContain("monthly");
    }
  });

  it("refuses to chart a journal tracker even though its value is a number", () => {
    // chartableType alone passes it — `confidence` is a number like Weight.
    // isChartable is the gate the editor list and both renderers use, and it
    // is the difference between the two questions.
    const conf = def({ id: "confidence", type: "number", surface: journalSurface(null) });
    expect(isChartable(conf)).toBe(false);
    expect(isChartable(def({ type: "number", surface: diarySurface("daily") }))).toBe(true);
  });

  it("still refuses a diary tracker whose value isn't a magnitude", () => {
    // The other half of isChartable, unchanged: a select's arbitrary strings
    // and a bare date aren't something to average or plot.
    expect(isChartable(def({ type: "select", surface: diarySurface("daily") }))).toBe(false);
    expect(isChartable(def({ type: "date", surface: diarySurface("daily") }))).toBe(false);
  });

  it("refuses a tracker that no longer exists", () => {
    expect(isChartable(undefined)).toBe(false);
  });

  it("withholds the calendar heatmap from monthly charts", () => {
    expect(typesFor("daily").map(([k]) => k)).toContain("month");
    expect(typesFor("monthly").map(([k]) => k)).not.toContain("month");
  });

  it("offers scatter for a normal chartable tracker", () => {
    // The partner is chosen in the editor, so scatter is available wherever a
    // second axis could come from — i.e. any chartable tracker.
    expect(typesFor("daily", def({ type: "number" })).map(([k]) => k)).toContain("scatter");
  });

  it("offers streak only for a boolean tracker", () => {
    expect(typesFor("daily", def({ type: "boolean" })).map(([k]) => k)).toContain("streak");
    expect(typesFor("daily", def({ type: "number" })).map(([k]) => k)).not.toContain("streak");
  });

  it("withholds raw line/bar from a boolean, whose 0/1 reads as a streak instead", () => {
    const b = typesFor("daily", def({ type: "boolean" })).map(([k]) => k);
    expect(b).not.toContain("line");
    expect(b).not.toContain("bar");
    expect(b).toContain("summary");
    expect(b).toContain("streak");
  });

  it("offers line/bar for a scale tracker (mood generalised)", () => {
    const s = typesFor("daily", def({ type: "scale" })).map(([k]) => k);
    expect(s).toContain("line");
    expect(s).toContain("scatter");
  });

  it("withholds the short windows from monthly charts", () => {
    const monthly = rangesFor("monthly").map(([k]) => k);
    expect(monthly).not.toContain("30");
    expect(monthly).not.toContain("90");
    // "Last year" is the last twelve monthly points, so it stays.
    expect(monthly).toContain("365");
    expect(monthly).toContain("all");
    expect(rangesFor("daily").map(([k]) => k)).toContain("30");
  });

  it("always leaves at least one type and one range to pick", () => {
    // The form seeds itself from the head of these lists, so an empty one
    // would be a window with a dropdown it cannot fill.
    for (const scope of ["daily", "monthly"] as const) {
      expect(typesFor(scope).length).toBeGreaterThan(0);
      expect(rangesFor(scope).length).toBeGreaterThan(0);
    }
  });
});

// ── trackers.ts: normalizeTrackers (seeding, re-assertion, ordering) ─────
describe("normalizeTrackers", () => {
  it("seeds every built-in and orders them canonically", () => {
    // 2.41 removed LEGACY_ID_TO_BUILTIN, which used to recognise an unflagged
    // tracker called "Mood" as the mood built-in. Identification is now the
    // `builtin` flag alone: a bare id is just a custom tracker, and the real
    // built-ins are seeded beside it.
    const out = normalizeTrackers([], true);
    const kinds = out.map((t) => t.builtin);
    // energy + focus are seeded too (disabled), between mood and the sleep
    // trio; the four journal built-ins follow (accuracy joined them in 2.36).
    expect(kinds).toEqual([
      "mood", "energy", "focus", "wake", "bed", "sleep",
      "confidence", "accuracy", "status", "reviewed",
      "tags",
    ]);
    const mood = out.find((t) => t.builtin === "mood")!;
    expect(mood.type).toBe("scale");
    expect(mood.faces && mood.faces.length).toBeGreaterThanOrEqual(2);
    expect(mood.heatmap).toBe(true);
    // The two new scales ship off, so a legacy vault gains no visible widgets.
    for (const k of ["energy", "focus"] as const) {
      const t = out.find((x) => x.builtin === k)!;
      expect(t.type).toBe("scale");
      expect(t.showInTemplate).toBe(false);
      expect(t.showInBase).toBe(false);
      expect(t.heatmap ?? false).toBe(false);
    }
  });

  it("preserves the user's on/off and label on a built-in", () => {
    const input: TrackerDef[] = [
      { id: "Mood", label: "My Mood", type: "number", min: 1, max: 5, builtin: "mood", showInTemplate: false, showInBase: false } as unknown as TrackerDef,
    ];
    const out = normalizeTrackers(input, false);
    const mood = out.find((t) => t.builtin === "mood")!;
    expect(mood.label).toBe("My Mood");
    expect(mood.showInTemplate).toBe(false);
    expect(mood.showInBase).toBe(false);
  });

  // ── surfaces: validation, not migration ──────────────────────────────
  // Both pre-2.19 conversions are gone: the showInDaily/showInMonthly pair and
  // the `trackerClass` string that replaced it. What stays is the fallback,
  // because `data.json` is a file a user may edit by hand and a malformed
  // surface has no expiry date.

  it("keeps a tracker's own valid surface untouched", () => {
    const input = [
      { id: "Savings", label: "💰 Savings", type: "number", surface: diarySurface("monthly"), showInTemplate: true, showInBase: true },
    ] as unknown as TrackerDef[];
    const s = normalizeTrackers(input, false).find((t) => t.id === "Savings")!;
    expect(s.surface).toEqual(diarySurface("monthly"));
    expect(s.showInTemplate).toBe(true);
  });

  it("treats a well-known id with no builtin flag as a custom tracker", () => {
    // What LEGACY_ID_TO_BUILTIN used to intercept. The seeded mood built-in
    // and this custom entry coexist; nothing is silently promoted.
    const input = [
      { id: "Mood", label: "☀️ Mood", type: "number", showInTemplate: true, showInBase: true },
    ] as unknown as TrackerDef[];
    const out = normalizeTrackers(input, false);
    const mine = out.filter((t) => t.id === "Mood" && t.builtin == null);
    expect(mine).toHaveLength(1);
    expect(out.some((t) => t.builtin === "mood")).toBe(true);
  });

  it("falls back to the daily diary for a surface it can't read", () => {
    // A half-written surface object, a bare string, a missing field: all
    // resolve to the surface every tracker had before there was a choice.
    for (const broken of [
      { surface: { kind: "diary" } },
      { surface: { kind: "journal" } },
      { surface: "study" },
      {},
    ]) {
      const input = [
        { id: "Savings", label: "💰 Savings", type: "number", showInBase: true, ...broken },
      ] as unknown as TrackerDef[];
      const s = normalizeTrackers(input, false).find((t) => t.id === "Savings")!;
      expect(s.surface).toEqual(diarySurface("daily"));
    }
  });

  it("forces the diary-only flags off on a journal surface", () => {
    // Both flags survive a move from a diary surface to a journal one. A
    // leftover showInBase would put a column into Diary.base that is blank in
    // every row, and record it in syncedBaseTrackerIds as one the plugin owns.
    const input = [
      { id: "confidence", label: "🎯 Confidence", type: "number", surface: journalSurface("study"), showInTemplate: true, showInBase: true },
    ] as unknown as TrackerDef[];
    const c = normalizeTrackers(input, false).find((t) => t.id === "confidence")!;
    expect(c.showInTemplate).toBe(false);
    expect(c.showInBase).toBe(false);
  });

  it("leaves the diary-only flags alone on a diary surface", () => {
    const input = [
      { id: "Weight", label: "⚖️ Weight", type: "number", surface: diarySurface("daily"), showInTemplate: true, showInBase: true },
    ] as unknown as TrackerDef[];
    const w = normalizeTrackers(input, false).find((t) => t.id === "Weight")!;
    expect(w.showInTemplate).toBe(true);
    expect(w.showInBase).toBe(true);
  });

  it("keeps a journal surface it can read", () => {
    const input = [
      { id: "Recipe rating", label: "🍳 Recipe rating", type: "number", surface: journalSurface("cooking"), showInTemplate: false, showInBase: false },
    ] as unknown as TrackerDef[];
    const c = normalizeTrackers(input, false).find((t) => t.id === "Recipe rating")!;
    expect(c.surface).toEqual(journalSurface("cooking"));
  });

  it("treats a missing showInTemplate as no", () => {
    const input = [
      { id: "Migraine", label: "🤕 Migraine", type: "number", trackerClass: "daily", showInBase: true },
    ] as unknown as TrackerDef[];
    const m = normalizeTrackers(input, false).find((t) => t.id === "Migraine")!;
    expect(m.showInTemplate).toBe(false);
  });

  it("locks every diary built-in to the daily surface", () => {
    // Each one measures a day: Mood asks how today went, Wake-Up and Bedtime
    // are one night's two clock times, Sleep is the hours between.
    //
    // `tags` is excluded with the journal pair from 3.16, and for a stronger
    // reason than theirs: it measures no period at all, which is what its
    // `any` surface says. A test that asserted a daily surface over "every
    // built-in that is not a journal one" would have been asserting the
    // absence of exactly this.
    for (const enabled of [true, false]) {
      const builtins = normalizeTrackers([], enabled).filter((x) => x.builtin);
      const diary = builtins.filter(
        (t) => !JOURNAL_BUILTINS.includes(t.builtin!) && t.builtin !== "tags"
      );
      expect(diary.length).toBeGreaterThan(0);
      for (const t of diary) expect(t.surface).toEqual(diarySurface("daily"));
    }
  });

  it("locks both journal built-ins to every journal type", () => {
    // `typeId: null` is what makes seeding unnecessary: a custom journal
    // created tomorrow is already covered.
    const out = normalizeTrackers([], false);
    for (const kind of JOURNAL_BUILTINS) {
      const t = out.find((x) => x.builtin === kind)!;
      expect(t).toBeDefined();
      expect(t.surface).toEqual(journalSurface(null));
    }
  });

  it("re-asserts a journal built-in's surface over a hand-edited one", () => {
    // Scoping confidence to one type by hand would take it away from every
    // other journal, silently, on a field the editor never offered.
    const input = [
      { id: "confidence", label: "🎯 Confidence", type: "number", builtin: "confidence", surface: journalSurface("study"), showInTemplate: false, showInBase: false },
    ] as unknown as TrackerDef[];
    expect(
      normalizeTrackers(input, false).find((t) => t.builtin === "confidence")!.surface
    ).toEqual(journalSurface(null));
  });

  it("keeps the built-in journal trackers out of templates and Diary.base", () => {
    const out = normalizeTrackers([], false);
    for (const kind of JOURNAL_BUILTINS) {
      const t = out.find((x) => x.builtin === kind)!;
      expect(t.showInTemplate).toBe(false);
      expect(t.showInBase).toBe(false);
    }
  });

  it("marks both journal built-ins as built-in, which is what protects them", () => {
    // Deletion, rename and retype are all gated on `builtin` being set — the
    // same gate that has always protected Mood and Wake-Up. Nothing separate
    // needs to guard these two.
    const out = normalizeTrackers([], false);
    for (const kind of JOURNAL_BUILTINS) {
      expect(out.find((t) => t.builtin === kind)!.builtin).toBe(kind);
    }
    // And they aren't in the "custom" list the settings tab lets you delete.
    expect(out.filter((t) => !t.builtin).map((t) => t.id)).toEqual([]);
  });

  it("survives a doubled journal built-in the way the diary ones do", () => {
    const input = [
      { id: "confidence", label: "First", type: "number", builtin: "confidence", surface: journalSurface(null), showInTemplate: false, showInBase: false },
      { id: "confidence-2", label: "Second", type: "number", builtin: "confidence", surface: journalSurface(null), showInTemplate: false, showInBase: false },
    ] as unknown as TrackerDef[];
    const out = normalizeTrackers(input, false).filter((t) => t.builtin === "confidence");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("First");
  });

  it("gives status one vocabulary for every level", () => {
    // Leaves carried in-progress/completed and index notes active/paused/done
    // — two vocabularies one TrackerDef cannot hold. Unified this way because
    // it keeps `status != "completed"` working verbatim in both `base` blocks
    // on the topic template.
    const status = normalizeTrackers([], false).find((t) => t.builtin === "status")!;
    const values = parseSelectOptions(status.options).map((o) => o.value);
    expect(values).toEqual(["in-progress", "paused", "completed"]);
  });

  it("re-asserts the daily surface over a hand-edited built-in", () => {
    const input = [
      { id: "Mood", label: "☀️ Mood", type: "number", min: 1, max: 5, builtin: "mood", surface: diarySurface("monthly"), showInTemplate: true, showInBase: true },
    ] as unknown as TrackerDef[];
    expect(
      normalizeTrackers(input, false).find((t) => t.builtin === "mood")!.surface
    ).toEqual(diarySurface("daily"));
  });

  it("injects any missing input built-in", () => {
    const out = normalizeTrackers([], false);
    expect(out.map((t) => t.builtin)).toEqual([
      "mood", "energy", "focus", "wake", "bed", "confidence", "accuracy", "status", "reviewed",
      "tags",
    ]);
  });

  it("ships the scale family: Mood on, Energy and Focus off", () => {
    // The whole shape of "generalise Mood without changing what a fresh vault
    // looks like": three scale built-ins, only Mood enabled, only Mood the
    // heat-map source, and each with its own faces so two enabled scales don't
    // look identical.
    const scales = DEFAULT_TRACKERS.filter((t) => t.type === "scale");
    expect(scales.map((t) => t.builtin)).toEqual(["mood", "energy", "focus"]);

    const mood = scales.find((t) => t.builtin === "mood")!;
    expect(mood.showInTemplate).toBe(true);
    expect(mood.heatmap).toBe(true);

    for (const k of ["energy", "focus"] as const) {
      const t = scales.find((x) => x.builtin === k)!;
      expect(t.showInTemplate).toBe(false);
      expect(t.showInBase).toBe(false);
      expect(t.heatmap ?? false).toBe(false);
      expect((t.faces ?? []).length).toBeGreaterThanOrEqual(2);
    }

    // Distinct default faces, so an enabled Mood + Energy aren't one emoji row
    // twice.
    const faceSets = scales.map((t) => (t.faces ?? []).join(" "));
    expect(new Set(faceSets).size).toBe(scales.length);
  });

  it("keeps every scale built-in on a bounded range with a step", () => {
    for (const t of DEFAULT_TRACKERS.filter((x) => x.type === "scale")) {
      expect(t.min).not.toBeUndefined();
      expect(t.max).not.toBeUndefined();
      expect(t.max! > t.min!).toBe(true);
    }
  });

  it("adds Sleep only when enabled, and drops it when disabled", () => {
    expect(normalizeTrackers([], true).some((t) => t.builtin === "sleep")).toBe(true);
    expect(normalizeTrackers([], false).some((t) => t.builtin === "sleep")).toBe(false);
  });

  it("keeps the derived Sleep tracker out of the daily note", () => {
    const sleep = normalizeTrackers([], true).find((t) => t.builtin === "sleep")!;
    expect(sleep.derived).toBe(true);
    expect(sleep.showInTemplate).toBe(false);
  });

  it("ties Wake-Up + Bedtime visibility to the sleep superset toggle", () => {
    // On: both times are shown everywhere (they render as the coupled control
    // and become Diary.base columns) alongside the derived Sleep.
    const on = normalizeTrackers([], true);
    for (const kind of ["wake", "bed"] as const) {
      const t = on.find((x) => x.builtin === kind)!;
      expect(t.showInTemplate).toBe(true);
      expect(t.showInBase).toBe(true);
    }
    // Off: the whole superset disappears — no wake/bed surfaces, no Sleep.
    const off = normalizeTrackers([], false);
    for (const kind of ["wake", "bed"] as const) {
      const t = off.find((x) => x.builtin === kind)!;
      expect(t.showInTemplate).toBe(false);
      expect(t.showInBase).toBe(false);
    }
    expect(off.some((t) => t.builtin === "sleep")).toBe(false);
  });

  it("overrides a stale independent wake/bed toggle to match sleepEnabled", () => {
    // A saved registry where someone had bed on but wake off is coerced back
    // into the all-or-nothing superset rather than left half-on.
    const input: TrackerDef[] = [
      { id: "Wake-Up", label: "😴 Wake-Up", type: "time", builtin: "wake", showInTemplate: false, showInBase: false },
      { id: "Bedtime", label: "🌙 Bedtime", type: "time", builtin: "bed", showInTemplate: true, showInBase: true },
    ];
    const out = normalizeTrackers(input, true);
    for (const kind of ["wake", "bed"] as const) {
      const t = out.find((x) => x.builtin === kind)!;
      expect(t.showInTemplate).toBe(true);
      expect(t.showInBase).toBe(true);
    }
  });

  it("orders built-ins first, then custom trackers in their given order", () => {
    const input: TrackerDef[] = [
      { id: "KM", label: "🏃 KM", type: "number", showInTemplate: true, showInBase: true },
      { id: "Mood", label: "☀️ Mood", type: "number", min: 1, max: 5, builtin: "mood", showInTemplate: true, showInBase: true },
      { id: "Pages", label: "📖 Pages", type: "number", showInTemplate: true, showInBase: true },
    ];
    const out = normalizeTrackers(input, true);
    expect(out.map((t) => t.id)).toEqual([
      "Mood", "Energy", "Focus", "Wake-Up", "Bedtime", "Sleep",
      "confidence", "accuracy", "status", "reviewed", "tags", "KM", "Pages",
    ]);
  });

  it("dedupes a doubled built-in (first wins)", () => {
    const input: TrackerDef[] = [
      { id: "Mood", label: "First", type: "number", builtin: "mood", showInDaily: true, showInBase: true },
      { id: "Mood2", label: "Second", type: "number", builtin: "mood", showInDaily: true, showInBase: true },
    ];
    const out = normalizeTrackers(input, false);
    expect(out.filter((t) => t.builtin === "mood").length).toBe(1);
    expect(out.find((t) => t.builtin === "mood")!.label).toBe("First");
  });
});

// ── custom-journal.ts: slugify ───────────────────────────────────────────
describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("My New Journal")).toBe("my-new-journal");
  });
  it("collapses runs of non-alphanumerics", () => {
    expect(slugify("A -- B__C")).toBe("a-b-c");
  });
  it("trims leading/trailing separators", () => {
    expect(slugify("  !!Hello!!  ")).toBe("hello");
  });
  it("drops accented/non-ascii characters", () => {
    expect(slugify("Café ☕ Notes")).toBe("caf-notes");
  });
});

// ── query.ts: relativeActivity ───────────────────────────────────────────
describe("relativeActivity", () => {
  const iso = (offsetDays: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offsetDays);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  it("returns an em dash for null", () => {
    expect(relativeActivity(null)).toBe("—");
  });
  it("today / yesterday", () => {
    expect(relativeActivity(iso(0))).toBe("Today");
    expect(relativeActivity(iso(1))).toBe("Yesterday");
  });
  it("days / weeks / months buckets", () => {
    expect(relativeActivity(iso(3))).toBe("3d ago");
    expect(relativeActivity(iso(10))).toBe("1w ago");
    expect(relativeActivity(iso(45))).toBe("1mo ago");
  });
});

// ── charts.ts: CHART_TAG round-trip via parseChartRegion + nextChartKey ───
describe("parseChartRegion (CHART_TAG round-trip)", () => {
  it("parses chart directives inside a header-bar Trends section", () => {
    const lines = [
      "# Home",
      "```chronoanvil",
      "header:📊 Trends and Statistics",
      "```",
      "chart:c1:Mood:line:90",
      "chart:c2:Sleep:summary:all",
      "## Tags",
      "chart:c9:Ignored:line:30", // outside the section — must be skipped
    ];
    const specs = parseChartRegion(lines);
    expect(specs).toEqual([
      { key: "c1", tracker: "Mood", type: "line", range: "90" },
      { key: "c2", tracker: "Sleep", type: "summary", range: "all" },
    ]);
  });

  it("parses via the legacy markdown heading form too", () => {
    const lines = [
      "## 📊 Trends and Statistics",
      "chart:c1:Mood:bar:365",
      "## End",
    ];
    expect(parseChartRegion(lines)).toEqual([
      { key: "c1", tracker: "Mood", type: "bar", range: "365" },
    ]);
  });

  it("parses the period range", () => {
    const lines = [
      "## 📊 Trends and Statistics",
      "chart:c1:Mood:line:period",
      "chart:c2:Mood:month:period",
      "## End",
    ];
    expect(parseChartRegion(lines)).toEqual([
      { key: "c1", tracker: "Mood", type: "line", range: "period" },
      { key: "c2", tracker: "Mood", type: "month", range: "period" },
    ]);
  });

  it("ignores malformed directives (bad type / range)", () => {
    const lines = [
      "## 📊 Trends and Statistics",
      "chart:c1:Mood:pie:90", // invalid type
      "chart:c2:Mood:line:7", // invalid range
      "chart:c3:Mood:line:30", // valid
    ];
    expect(parseChartRegion(lines)).toEqual([
      { key: "c3", tracker: "Mood", type: "line", range: "30" },
    ]);
  });

  it("returns [] when no Trends section exists", () => {
    expect(parseChartRegion(["# Home", "nothing here"])).toEqual([]);
  });

  it("parses the merged self-titled ```chronoanvil-charts fence (2.1 layout)", () => {
    const lines = [
      "# Home",
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "chart:c1:Mood:line:90",
      "chart:c2:Sleep:summary:all",
      "```",
      "```chronoanvil",
      "header:🏷️ Tags",
      "```",
    ];
    expect(parseChartRegion(lines)).toEqual([
      { key: "c1", tracker: "Mood", type: "line", range: "90" },
      { key: "c2", tracker: "Sleep", type: "summary", range: "all" },
    ]);
  });

  it("parses a merged fence with no charts as empty", () => {
    const lines = [
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "```",
    ];
    expect(parseChartRegion(lines)).toEqual([]);
  });
});

// ── charts.ts: mergeTrendsSection (2.0 → 2.1 layout migration) ────────────
describe("mergeTrendsSection", () => {
  it("folds the 2.0 header-block layout into one self-titled fence", () => {
    const lines = [
      "# Home",
      "",
      "```chronoanvil",
      "header:📊 Trends and Statistics",
      "```",
      "",
      "```chronoanvil-charts",
      "chart:c1:Mood:line:90",
      "```",
      "",
      "```chronoanvil",
      "header:🏷️ Tags",
      "```",
    ];
    const out = mergeTrendsSection(lines);
    expect(out).not.toBeNull();
    // THE INPUT KEEPS 2.0'S SPELLING AND THE OUTPUT TAKES TODAY'S (4.26). The
    // fixture is what a 2.0 note actually says, so it must not be swept into
    // sentence case with the rest of the plugin; what the merge WRITES is the
    // current title, which is the whole reason the heading could be renamed —
    // `locateSection` finds the old words, and every write emits the new ones.
    expect(out!.join("\n")).toBe(
      [
        "# Home",
        "",
        "```chronoanvil-charts",
        "header:📊 Trends and statistics",
        "chart:c1:Mood:line:90",
        "```",
        "",
        "```chronoanvil",
        "header:🏷️ Tags",
        "```",
      ].join("\n")
    );
    // The migrated note still reads back the same charts.
    expect(parseChartRegion(out!)).toEqual([
      { key: "c1", tracker: "Mood", type: "line", range: "90" },
    ]);
  });

  it("folds the legacy markdown-heading layout too", () => {
    const lines = [
      "## 📊 Trends and Statistics",
      "",
      "```chronoanvil-charts",
      "chart:c1:Mood:bar:365",
      "chart:c2:Sleep:line:30",
      "```",
      "",
      "## Tags",
    ];
    const out = mergeTrendsSection(lines);
    expect(out!.join("\n")).toBe(
      [
        "```chronoanvil-charts",
        "header:📊 Trends and statistics",
        "chart:c1:Mood:bar:365",
        "chart:c2:Sleep:line:30",
        "```",
        "",
        "## Tags",
      ].join("\n")
    );
  });

  it("is idempotent — already-merged notes are left unchanged (null)", () => {
    const merged = [
      "# Home",
      "",
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "chart:c1:Mood:line:90",
      "```",
    ];
    expect(mergeTrendsSection(merged)).toBeNull();
  });

  it("returns null when there is no Trends section at all", () => {
    expect(mergeTrendsSection(["# Home", "no trends here"])).toBeNull();
  });
});

// ── charts.ts: ensureTrendsHeader (the untitled section, 3.9) ─────────────
//
// The state mergeTrendsSection cannot reach and layout.ts cannot see: a charts
// fence with no title and no block above it to have lost one. The Year
// dashboard shipped in that state in 2.35 and stayed in it, because chart
// fences are opaque to the reconciler — no keywords, therefore never a unit,
// therefore never inserted or rewritten.
// ── charts.ts: retitleTrends (the 4.25→4.26 spelling migration) ───────────
//
// The migration that made a display string renameable. Everything here is a
// property of the pair `locateSection` + `retitleTrends`: the old words are
// still FOUND, and are rewritten to the new words only where ChronoAnvil itself
// wrote them.
describe("retitleTrends", () => {
  const merged = (title: string, ...body: string[]): string[] => [
    "```chronoanvil-charts",
    `header:${title}`,
    ...body,
    "```",
  ];

  it("puts the old spelling into the new one, keeping the charts", () => {
    const out = retitleTrends(
      merged("📊 Trends and Statistics", "chart:c1:Mood:line:90")
    );
    expect(out).not.toBeNull();
    expect(out!.join("\n")).toBe(
      merged("📊 Trends and statistics", "chart:c1:Mood:line:90").join("\n")
    );
    // The reader's charts survive the retitle, which is the only thing in that
    // fence that is theirs.
    expect(parseChartRegion(out!)).toEqual([
      { key: "c1", tracker: "Mood", type: "line", range: "90" },
    ]);
  });

  it("is idempotent — a note already in the new spelling is null", () => {
    expect(retitleTrends(merged("📊 Trends and statistics"))).toBeNull();
    const once = retitleTrends(merged("📊 Trends and Statistics"))!;
    expect(retitleTrends(once)).toBeNull();
  });

  it("leaves a title ChronoAnvil never wrote completely alone", () => {
    // THE ASSERTION THE HISTORY LIST EXISTS FOR. A case-insensitive compare
    // would have "corrected" both of these into the house spelling; an exact
    // list of our own past words cannot, because neither is on it.
    expect(retitleTrends(merged("📈 My numbers"))).toBeNull();
    expect(retitleTrends(merged("📊 TRENDS AND STATISTICS"))).toBeNull();
  });

  it("keeps a header's level rather than eating the digits", () => {
    const out = retitleTrends(merged("2:📊 Trends and Statistics"))!;
    expect(out.join("\n")).toContain("header:2:📊 Trends and statistics");
  });

  it("defers to mergeTrendsSection on a two-block note", () => {
    // Same standoff ensureTrendsHeader has with the merge, for the same reason:
    // the merge writes the current title when it folds, so retitling here first
    // would be two functions writing one line.
    //
    // THE FIXTURE CARRIES THE TITLE IN BOTH BLOCKS ON PURPOSE. Written the
    // obvious way — a bare `chart:` fence under the header block — this passes
    // whether or not the guard is there, because the loop finds no `header:`
    // inside the fence and falls out returning null. Deleting the guard left it
    // green, which is the "assertion that has never failed" RESUME §6 warns
    // about; it is only a test of the guard when there IS something inside the
    // fence for the guard to stop.
    const legacy = [
      "```chronoanvil",
      "header:📊 Trends and Statistics",
      "```",
      "",
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "chart:c1:Mood:line:90",
      "```",
    ];
    expect(retitleTrends(legacy)).toBeNull();
    // And the merge does the job, emitting the NEW spelling from the OLD note.
    expect(mergeTrendsSection(legacy)!.join("\n")).toContain(
      "header:📊 Trends and statistics"
    );
  });

  it("does nothing to a note with no charts fence", () => {
    expect(retitleTrends(["# Home", "", "some prose"])).toBeNull();
  });
});

describe("ensureTrendsHeader", () => {
  it("titles a bare charts fence", () => {
    // The Year dashboard, exactly as it shipped: an empty fence, no header
    // anywhere in the note.
    const lines = [
      "---",
      'year-start: ""',
      "---",
      "```chronoanvil",
      "year-summary",
      "```",
      "",
      "```chronoanvil-charts",
      "```",
    ];
    const out = ensureTrendsHeader(lines);
    expect(out).not.toBeNull();
    expect(out!.join("\n")).toContain(
      "```chronoanvil-charts\nheader:📊 Trends and statistics\n```"
    );
  });

  it("keeps the reader's charts, and puts the title above them", () => {
    const lines = [
      "```chronoanvil-charts",
      "chart:c1:Mood:line:90",
      "chart:c2:Sleep:bar:365",
      "```",
    ];
    const out = ensureTrendsHeader(lines)!;
    expect(out.join("\n")).toBe(
      [
        "```chronoanvil-charts",
        "header:📊 Trends and statistics",
        "chart:c1:Mood:line:90",
        "chart:c2:Sleep:bar:365",
        "```",
      ].join("\n")
    );
    expect(parseChartRegion(out)).toEqual([
      { key: "c1", tracker: "Mood", type: "line", range: "90" },
      { key: "c2", tracker: "Sleep", type: "bar", range: "365" },
    ]);
  });

  it("is idempotent — a titled fence is left alone (null)", () => {
    const titled = [
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "chart:c1:Mood:line:90",
      "```",
    ];
    expect(ensureTrendsHeader(titled)).toBeNull();
    // And a second pass over its own output changes nothing.
    const once = ensureTrendsHeader(["```chronoanvil-charts", "```"])!;
    expect(ensureTrendsHeader(once)).toBeNull();
  });

  it("leaves a reader's own header text alone", () => {
    // `header:` is the retitling affordance. A note whose Trends section is
    // called something else has a title, and this only supplies a missing one.
    const renamed = [
      "```chronoanvil-charts",
      "header:📈 My numbers",
      "```",
    ];
    expect(ensureTrendsHeader(renamed)).toBeNull();
  });

  it("defers to mergeTrendsSection on a two-block note", () => {
    // THE ONE THAT KEEPS THE TWO MIGRATIONS FROM FIGHTING. Titling this fence
    // would leave the note holding the title twice — once in the block above
    // and once inside. The merge owns this state; this returns null.
    const legacy = [
      "```chronoanvil",
      "header:📊 Trends and Statistics",
      "```",
      "",
      "```chronoanvil-charts",
      "chart:c1:Mood:line:90",
      "```",
    ];
    expect(ensureTrendsHeader(legacy)).toBeNull();

    // And after the merge has run, there is nothing left for it to do.
    expect(ensureTrendsHeader(mergeTrendsSection(legacy)!)).toBeNull();
  });

  it("returns null when there is no charts fence", () => {
    expect(ensureTrendsHeader(["# Home", "no charts here"])).toBeNull();
  });
});

describe("nextChartKey", () => {
  it("returns c1 for an empty set", () => {
    expect(nextChartKey([])).toBe("c1");
  });
  it("fills the smallest gap", () => {
    const existing: ChartSpec[] = [
      { key: "c1", tracker: "M", type: "line", range: "30" },
      { key: "c3", tracker: "M", type: "line", range: "30" },
    ];
    expect(nextChartKey(existing)).toBe("c2");
  });
  it("appends past a contiguous run", () => {
    const existing: ChartSpec[] = [
      { key: "c1", tracker: "M", type: "line", range: "30" },
      { key: "c2", tracker: "M", type: "line", range: "30" },
    ];
    expect(nextChartKey(existing)).toBe("c3");
  });
});

// ── charts.ts: resolveChartWindow (range → inclusive date bounds) ─────────
// ChronoAnvil computes the window itself and filters its own daily notes against it
// with a plain string compare, so every range renders as reliably as "all
// time" did. These pin `today` for determinism; the bounds are inclusive on
// both ends (no external date parser to skew the newest day, so no +1-day hack).
describe("resolveChartWindow", () => {
  const TODAY = "2026-07-21";

  for (const widen of [false, true]) {
    it(`30-day window ends today and reaches back 29 days (widen=${widen})`, () => {
      // A fixed range ignores the widen flag entirely.
      const w = resolveChartWindow("30", null, widen, TODAY);
      expect(w).toEqual({ start: "2026-06-22", end: "2026-07-21" });
    });
  }

  it("90-day window", () => {
    expect(resolveChartWindow("90", null, false, TODAY)).toEqual({
      start: "2026-04-23",
      end: "2026-07-21",
    });
  });

  it("365-day window", () => {
    expect(resolveChartWindow("365", null, false, TODAY)).toEqual({
      start: "2025-07-22",
      end: "2026-07-21",
    });
  });

  it("all-time is unbounded both ways", () => {
    expect(resolveChartWindow("all", null, false, TODAY)).toEqual({
      start: null,
      end: null,
    });
  });

  // ── "period" range: derives bounds from the note's own period ──────────
  const week = { start: "2026-07-20", end: "2026-07-26", unit: "week" as const };
  const month = { start: "2026-07-01", end: "2026-07-31", unit: "month" as const };

  it("period heatmap/summary uses the period's exact bounds (no widen)", () => {
    expect(resolveChartWindow("period", week, false, TODAY)).toEqual({
      start: "2026-07-20",
      end: "2026-07-26",
    });
    expect(resolveChartWindow("period", month, false, TODAY)).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });

  it("period trend widens a week into a trailing 30-day window ending at the period", () => {
    expect(resolveChartWindow("period", week, true, TODAY)).toEqual({
      start: "2026-06-27", // 29 days before the week's end
      end: "2026-07-26",
    });
  });

  it("period trend widens a month into a trailing 90-day window ending at the period", () => {
    expect(resolveChartWindow("period", month, true, TODAY)).toEqual({
      start: "2026-05-03", // 89 days before the month's end
      end: "2026-07-31",
    });
  });

  // A quarter is NOT widened, for the same reason a year isn't: the page
  // exists to bound one quarter, and a trailing window would bleed the
  // previous one into it. ~90 days already reads as a trend unwidened. Pinned
  // because a chart quietly showing six months where it says three is close to
  // invisible — the same class of silent error the year's zero-span test
  // guards.
  const quarter = {
    start: "2026-07-01",
    end: "2026-09-30",
    unit: "quarter" as const,
  };

  it("period quarter shows the quarter exactly, widened or not", () => {
    const exact = { start: "2026-07-01", end: "2026-09-30" };
    expect(resolveChartWindow("period", quarter, false, TODAY)).toEqual(exact);
    expect(resolveChartWindow("period", quarter, true, TODAY)).toEqual(exact);
  });

  it("period with no resolvable period falls back to the last 30 days", () => {
    expect(resolveChartWindow("period", null, true, TODAY)).toEqual({
      start: "2026-06-22",
      end: "2026-07-21",
    });
  });
});

// ── charts.ts: point windowing + summary stats ───────────────────────────
describe("pointInWindow / pointsInWindow", () => {
  const pts: ChartPoint[] = [
    { date: "2026-07-10", value: 3 },
    { date: "2026-07-15", value: 5 },
    { date: "2026-07-21", value: 4 }, // newest — must survive an inclusive end
    { date: "2026-06-01", value: 1 },
  ];

  it("includes both inclusive edges", () => {
    const w = { start: "2026-07-10", end: "2026-07-21" };
    expect(pointInWindow("2026-07-10", w)).toBe(true);
    expect(pointInWindow("2026-07-21", w)).toBe(true);
    expect(pointInWindow("2026-07-09", w)).toBe(false);
    expect(pointInWindow("2026-07-22", w)).toBe(false);
  });

  it("an unbounded edge lets everything through that direction", () => {
    expect(pointInWindow("1999-01-01", { start: null, end: "2026-07-21" })).toBe(true);
    expect(pointInWindow("2999-01-01", { start: "2026-07-01", end: null })).toBe(true);
  });

  it("filters and sorts into date order, keeping the newest day", () => {
    const out = pointsInWindow(pts, { start: "2026-07-10", end: "2026-07-21" });
    expect(out.map((p) => p.date)).toEqual([
      "2026-07-10",
      "2026-07-15",
      "2026-07-21",
    ]);
  });

  it("all-time keeps every point, still sorted", () => {
    const out = pointsInWindow(pts, { start: null, end: null });
    expect(out.map((p) => p.date)).toEqual([
      "2026-06-01",
      "2026-07-10",
      "2026-07-15",
      "2026-07-21",
    ]);
  });
});

describe("summarize", () => {
  it("computes count/avg/min/max/total", () => {
    expect(summarize([2, 4, 6])).toEqual({
      count: 3,
      avg: 4,
      min: 2,
      max: 6,
      total: 12,
    });
  });

  it("is null for an empty set (so a chart shows a no-data note, not NaN)", () => {
    expect(summarize([])).toBeNull();
  });
});

// ── util.ts: daysSinceWeekStart (week-start alignment) ────────────────────
describe("daysSinceWeekStart", () => {
  it("Sunday-start (ws=0): column offset equals the weekday index", () => {
    expect(daysSinceWeekStart(0, 0)).toBe(0); // Sun
    expect(daysSinceWeekStart(1, 0)).toBe(1); // Mon
    expect(daysSinceWeekStart(6, 0)).toBe(6); // Sat
  });

  it("Monday-start (ws=1): Monday is column 0, Sunday wraps to column 6", () => {
    expect(daysSinceWeekStart(1, 1)).toBe(0); // Mon
    expect(daysSinceWeekStart(2, 1)).toBe(1); // Tue
    expect(daysSinceWeekStart(0, 1)).toBe(6); // Sun wraps to end
  });

  it("never returns a negative offset", () => {
    for (let ws = 0; ws < 7; ws++) {
      for (let d = 0; d < 7; d++) {
        const o = daysSinceWeekStart(d, ws);
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThan(7);
      }
    }
  });
});

// ── util.ts: aggregateActivity (study Activity chart bucketing) ───────────
describe("aggregateActivity", () => {
  const rows: ActivityCount[] = [
    { date: "2026-07-10", open: 2, done: 1 },
    { date: "2026-07-10", open: 1, done: 3 }, // same date — sums with the above
    { date: "2026-07-01", open: 0, done: 0 }, // no tasks — dropped
    { date: "2026-06-01", open: 1, done: 0 }, // outside a later window
    { date: "2026-07-15", open: 0, done: 2 },
  ];

  it("sums open/done per date, drops empty days, and sorts by date", () => {
    expect(aggregateActivity(rows, null, null)).toEqual([
      { date: "2026-06-01", open: 1, done: 0, notes: 0 },
      { date: "2026-07-10", open: 3, done: 4, notes: 0 },
      { date: "2026-07-15", open: 0, done: 2, notes: 0 },
    ]);
  });

  it("honours an inclusive window", () => {
    expect(aggregateActivity(rows, "2026-07-01", "2026-07-15")).toEqual([
      { date: "2026-07-10", open: 3, done: 4, notes: 0 },
      { date: "2026-07-15", open: 0, done: 2, notes: 0 },
    ]);
  });

  it("is empty when nothing at all falls in range", () => {
    expect(aggregateActivity(rows, "2026-08-01", "2026-08-31")).toEqual([]);
  });

  it("keeps a day whose only activity is a note", () => {
    // 3.12.1, and the whole of it. This dropped any date with no tasks — "only
    // dates that carry at least one task" — which is what made a Study root of
    // twenty-four dated lessons render as an empty twelve-month strip with four
    // zeroes over it, directly above a section listing those lessons.
    //
    // The arithmetic was never wrong. The question it answered was not the one
    // the page asks: writing a lesson is the activity these journals exist to
    // record, and whether anyone ticked a box inside it is a second question.
    expect(
      aggregateActivity([{ date: "2026-07-02", open: 0, done: 0, notes: 1 }], null, null)
    ).toEqual([{ date: "2026-07-02", open: 0, done: 0, notes: 1 }]);
  });

  it("still drops a day that carries nothing", () => {
    // The guard is narrowed, not removed: a row with no note and no task is
    // still not a day of activity. Without this the strip would shade every
    // date any caller happened to pass it.
    expect(
      aggregateActivity([{ date: "2026-07-02", open: 0, done: 0, notes: 0 }], null, null)
    ).toEqual([]);
  });
});

describe("activityWeight", () => {
  it("counts a note as activity and lets tasks deepen it", () => {
    // The shade scale, in one function so the year strip, the month grid and
    // the streak maths cannot disagree about what a busy day is.
    expect(activityWeight({ open: 0, done: 0, notes: 1 })).toBe(1);
    expect(activityWeight({ open: 2, done: 1, notes: 1 })).toBe(4);
  });

  it("reads a missing note count as none", () => {
    // `notes` is optional so every pre-3.12.1 construction site stays valid and
    // means exactly what it used to.
    expect(activityWeight({ open: 1, done: 1 })).toBe(2);
    expect(activityWeight({ open: 0, done: 0 })).toBe(0);
  });
});

// ── util.ts: activity heatmap helpers (month grid + navigation) ───────────
describe("activityBucket", () => {
  it("buckets into quartiles of the busiest day", () => {
    // max 8 → quartile edges at 2/4/6/8.
    expect(activityBucket(1, 8)).toBe(1);
    expect(activityBucket(2, 8)).toBe(1);
    expect(activityBucket(3, 8)).toBe(2);
    expect(activityBucket(5, 8)).toBe(3);
    expect(activityBucket(8, 8)).toBe(4);
  });

  it("gives a day with no work no shade at all", () => {
    // null, not shade 1 — an untouched day is a different thing from a faint
    // amount of work, and the caller renders it as the empty cell.
    expect(activityBucket(0, 8)).toBeNull();
    expect(activityBucket(-1, 8)).toBeNull();
  });

  it("returns null when nothing was logged, so no day is the 'busiest'", () => {
    expect(activityBucket(0, 0)).toBeNull();
    expect(activityBucket(3, 0)).toBeNull();
  });

  it("puts a single active day at the top shade", () => {
    // The month's only day is by definition its max, so it reads as full
    // strength rather than the faintest — a sparse month still shows up.
    expect(activityBucket(1, 1)).toBe(4);
  });

  it("puts an all-equal month at one uniform shade", () => {
    expect(activityBucket(3, 3)).toBe(4);
  });

  it("never exceeds the 4 shades the ramp defines", () => {
    expect(activityBucket(100, 1)).toBe(4);
  });
});

describe("monthActivityStats", () => {
  const rows: ActivityCount[] = [
    { date: "2026-06-28", open: 5, done: 5 }, // previous month — ignored
    { date: "2026-07-02", open: 1, done: 2 }, // total 3
    { date: "2026-07-09", open: 0, done: 4 }, // total 4 — busiest
    { date: "2026-07-20", open: 2, done: 0 }, // total 2
    { date: "2026-08-01", open: 9, done: 9 }, // next month — ignored
  ];

  it("counts active days and the open/done split for the month only", () => {
    expect(monthActivityStats(rows, "2026-07")).toEqual({
      activeDays: 3,
      open: 3,
      done: 6,
      max: 4,
    });
  });

  it("reports the busiest day's total, which scales the shades", () => {
    expect(monthActivityStats(rows, "2026-07").max).toBe(4);
  });

  it("is all zeros for a month with nothing in it", () => {
    // An empty month is an ordinary state for the month grid, not an error —
    // it renders as a full grid of empty cells and `0 active days`.
    expect(monthActivityStats(rows, "2026-09")).toEqual({
      activeDays: 0,
      open: 0,
      done: 0,
      max: 0,
    });
  });

  it("ignores dated rows that carry no tasks", () => {
    const withEmpty: ActivityCount[] = [{ date: "2026-07-05", open: 0, done: 0 }];
    expect(monthActivityStats(withEmpty, "2026-07").activeDays).toBe(0);
  });
});

describe("activityMonthBounds", () => {
  const rows: ActivityCount[] = [
    { date: "2026-03-14", open: 1, done: 0 },
    { date: "2026-07-01", open: 0, done: 2 },
  ];

  it("spans the earliest dated row to the current month", () => {
    expect(activityMonthBounds(rows, "2026-07")).toEqual({
      first: "2026-03",
      last: "2026-07",
    });
  });

  it("collapses to the current month when there's no history", () => {
    // A brand-new subject shows this month with neither chevron live, rather
    // than letting you walk backwards through empty grids forever.
    expect(activityMonthBounds([], "2026-07")).toEqual({
      first: "2026-07",
      last: "2026-07",
    });
  });

  it("never opens the future, even if a note is dated ahead", () => {
    const ahead: ActivityCount[] = [{ date: "2027-01-01", open: 1, done: 0 }];
    expect(activityMonthBounds(ahead, "2026-07").last).toBe("2026-07");
  });
});

// ── 2.13: quarter navigation for the Activity heatmap ────────────────────
// The heatmap now draws a whole calendar quarter (three month grids) per view
// and steps a quarter at a time. Quarter keys are "YYYY-Qn" specifically so
// that chronological order is plain string order — every bounds check in
// chart-render.ts is `<` / `>` on these, so that property is load-bearing.

describe("quarterOfMonth", () => {
  it("maps each month to its calendar quarter", () => {
    expect(quarterOfMonth("2026-01")).toBe("2026-Q1");
    expect(quarterOfMonth("2026-03")).toBe("2026-Q1");
    expect(quarterOfMonth("2026-04")).toBe("2026-Q2");
    expect(quarterOfMonth("2026-07")).toBe("2026-Q3");
    expect(quarterOfMonth("2026-12")).toBe("2026-Q4");
  });

  it("orders chronologically under plain string compare", () => {
    expect(quarterOfMonth("2025-12") < quarterOfMonth("2026-01")).toBe(true);
    expect(quarterOfMonth("2026-Q1".slice(0, 4) + "-04") > "2026-Q1").toBe(true);
  });
});

describe("quarterMonths", () => {
  it("returns the quarter's three months in calendar order", () => {
    expect(quarterMonths("2026-Q1")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(quarterMonths("2026-Q3")).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(quarterMonths("2026-Q4")).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("zero-pads so the keys match monthActivityStats's format", () => {
    for (const m of quarterMonths("2026-Q1")) expect(m).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("shiftQuarter", () => {
  it("steps within a year", () => {
    expect(shiftQuarter("2026-Q1", 1)).toBe("2026-Q2");
    expect(shiftQuarter("2026-Q3", -1)).toBe("2026-Q2");
  });

  it("rolls the year over in both directions", () => {
    expect(shiftQuarter("2026-Q4", 1)).toBe("2027-Q1");
    expect(shiftQuarter("2026-Q1", -1)).toBe("2025-Q4");
    expect(shiftQuarter("2026-Q2", -6)).toBe("2024-Q4");
  });

  it("is reversible", () => {
    expect(shiftQuarter(shiftQuarter("2026-Q3", 5), -5)).toBe("2026-Q3");
  });
});

describe("activityQuarterBounds", () => {
  const rows: ActivityCount[] = [
    { date: "2026-03-14", open: 1, done: 0 },
    { date: "2026-07-01", open: 0, done: 2 },
  ];

  it("spans the earliest row's quarter to the current one", () => {
    expect(activityQuarterBounds(rows, "2026-07")).toEqual({
      first: "2026-Q1",
      last: "2026-Q3",
    });
  });

  it("opens the whole first quarter, not a partial one", () => {
    // The earliest note is in March, but Q1 still starts at January: a partial
    // opening panel would make the view's shape depend on when you started.
    expect(activityQuarterBounds(rows, "2026-07").first).toBe("2026-Q1");
  });

  it("collapses to the current quarter with no history", () => {
    expect(activityQuarterBounds([], "2026-07")).toEqual({
      first: "2026-Q3",
      last: "2026-Q3",
    });
  });

  it("never opens a future quarter", () => {
    const ahead: ActivityCount[] = [{ date: "2027-01-01", open: 1, done: 0 }];
    expect(activityQuarterBounds(ahead, "2026-07").last).toBe("2026-Q3");
  });
});

describe("quarterActivityStats", () => {
  const rows: ActivityCount[] = [
    { date: "2026-07-02", open: 1, done: 1 },
    { date: "2026-08-11", open: 0, done: 4 },
    { date: "2026-09-30", open: 2, done: 0 },
    // Outside Q3 — must not leak in.
    { date: "2026-06-30", open: 9, done: 9 },
    { date: "2026-10-01", open: 7, done: 7 },
  ];

  it("sums the quarter's three months and ignores the rest", () => {
    expect(quarterActivityStats(rows, "2026-Q3")).toEqual({
      activeDays: 3,
      open: 3,
      done: 5,
      max: 4,
    });
  });

  it("takes max as the busiest single day across the whole quarter", () => {
    // Shared scale: all three grids bucket against this one number, so a quiet
    // month must not rescale itself to look as busy as a heavy one.
    expect(quarterActivityStats(rows, "2026-Q3").max).toBe(4);
  });

  it("is all zeroes for an untouched quarter", () => {
    expect(quarterActivityStats(rows, "2025-Q1")).toEqual({
      activeDays: 0,
      open: 0,
      done: 0,
      max: 0,
    });
  });
});

// ── charts.ts: hourAxisBounds (whole-hour clock axis) ────────────────────
// Time trackers plot as minutes since midnight, so Chart.js's automatic tick
// spacing lands on odd values (07:40, 08:20). These bounds snap the range out to
// whole hours and pick a whole-hour step so every gridline is an exact hour.
describe("hourAxisBounds", () => {
  const H = 60;

  it("snaps outward to the enclosing hours with a 1h step", () => {
    // 07:50 and 09:50 -> 07:00..10:00
    expect(hourAxisBounds([470, 590])).toEqual({
      min: 7 * H,
      max: 10 * H,
      stepSize: H,
    });
  });

  it("every tick is an exact hour", () => {
    for (const values of [[470, 590], [430, 470], [30, 1410], [360, 1080]]) {
      const b = hourAxisBounds(values)!;
      expect(b.min % H).toBe(0);
      expect(b.stepSize % H).toBe(0);
      // The span is a whole number of steps, so the last gridline is the max.
      expect((b.max - b.min) % b.stepSize).toBe(0);
    }
  });

  it("gives a 1h span when every value sits on one hour boundary", () => {
    expect(hourAxisBounds([480])).toEqual({ min: 8 * H, max: 9 * H, stepSize: H });
  });

  it("steps up to a coarser interval rather than stacking labels", () => {
    // A near-full-day spread would be 24 one-hour gridlines; use 3h instead.
    const b = hourAxisBounds([30, 1410])!;
    expect(b.stepSize).toBe(3 * H);
    expect((b.max - b.min) / b.stepSize).toBeLessThanOrEqual(8);
  });

  it("is null for no data", () => {
    expect(hourAxisBounds([])).toBeNull();
  });
});

describe("notestore", () => {
  // New single-comment format: `<!--chronoanvil:key` … content … `-->`.
  const OPEN = (k: string) => `<!--chronoanvil:${k}`;
  const CLOSE = "-->";

  describe("isValidNoteKey", () => {
    it("accepts alphanumerics, dash, underscore", () => {
      expect(isValidNoteKey("focus")).toBe(true);
      expect(isValidNoteKey("my-key_2")).toBe(true);
    });
    it("rejects empty, spaces, and regex metachars", () => {
      expect(isValidNoteKey("")).toBe(false);
      expect(isValidNoteKey("a b")).toBe(false);
      expect(isValidNoteKey("a.b")).toBe(false);
      expect(isValidNoteKey("a*b")).toBe(false);
      expect(isValidNoteKey("a/b")).toBe(false);
    });
  });

  describe("readNoteRegion", () => {
    it("returns empty string when the region is absent", () => {
      expect(readNoteRegion("no markers here", "focus")).toBe("");
    });
    it("reads content inside the comment, trimming the bounding newlines", () => {
      const text = `intro\n${OPEN("focus")}\nhello world\n${CLOSE}\nrest`;
      expect(readNoteRegion(text, "focus")).toBe("hello world");
    });
    it("reads an empty region as empty string", () => {
      const text = `${OPEN("focus")}\n${CLOSE}`;
      expect(readNoteRegion(text, "focus")).toBe("");
    });
    it("preserves internal blank lines in multi-line content", () => {
      const body = "line 1\n\nline 3";
      const text = `${OPEN("log")}\n${body}\n${CLOSE}`;
      expect(readNoteRegion(text, "log")).toBe(body);
    });
    it("returns empty when the comment is never closed", () => {
      const text = `${OPEN("focus")}\ndangling`;
      expect(readNoteRegion(text, "focus")).toBe("");
    });
    it("does not confuse a key with a longer key sharing its prefix", () => {
      const text = `${OPEN("todo2")}\nother\n${CLOSE}`;
      // `todo` must not match the `todo2` opener.
      expect(readNoteRegion(text, "todo")).toBe("");
      expect(readNoteRegion(text, "todo2")).toBe("other");
    });
    it("reads the first of two regions correctly", () => {
      const text = `${OPEN("a")}\naaa\n${CLOSE}\n\n${OPEN("b")}\nbbb\n${CLOSE}`;
      expect(readNoteRegion(text, "a")).toBe("aaa");
      expect(readNoteRegion(text, "b")).toBe("bbb");
    });
    it("decodes an escaped comment-close sequence in content", () => {
      // A user value containing `-->` is stored escaped; read decodes it back.
      const out = writeNoteRegion("", "log", "arrow --> here");
      expect(out).not.toContain("arrow --> here"); // stored escaped
      expect(readNoteRegion(out, "log")).toBe("arrow --> here");
    });
  });

  describe("writeNoteRegion", () => {
    it("appends a new region when absent, with a blank-line separator", () => {
      const out = writeNoteRegion("body text", "focus", "hi");
      expect(out).toBe(`body text\n\n${OPEN("focus")}\nhi\n${CLOSE}\n`);
    });
    it("appends cleanly to empty input without a leading blank line", () => {
      const out = writeNoteRegion("", "focus", "hi");
      expect(out).toBe(`${OPEN("focus")}\nhi\n${CLOSE}\n`);
    });
    it("replaces existing content in place, leaving surrounding text intact", () => {
      const text = `before\n${OPEN("focus")}\nold\n${CLOSE}\nafter`;
      const out = writeNoteRegion(text, "focus", "new");
      expect(out).toBe(`before\n${OPEN("focus")}\nnew\n${CLOSE}\nafter`);
    });
    it("round-trips: reading back what was written yields the same value", () => {
      const v = "some multi\nline value";
      const out = writeNoteRegion("x", "log", v);
      expect(readNoteRegion(out, "log")).toBe(v);
    });
    it("round-trips content that itself contains -->", () => {
      const v = "a --> b --> c";
      const out = writeNoteRegion("x", "log", v);
      expect(readNoteRegion(out, "log")).toBe(v);
    });
    it("is idempotent for the same value", () => {
      const once = writeNoteRegion("x", "focus", "v");
      const twice = writeNoteRegion(once, "focus", "v");
      expect(twice).toBe(once);
    });
    it("clears a region by writing empty, still round-trips to empty", () => {
      const filled = writeNoteRegion("x", "focus", "content");
      const cleared = writeNoteRegion(filled, "focus", "");
      expect(readNoteRegion(cleared, "focus")).toBe("");
    });
    it("only touches its own key when multiple regions exist", () => {
      let text = writeNoteRegion("", "a", "AAA");
      text = writeNoteRegion(text, "b", "BBB");
      text = writeNoteRegion(text, "a", "A2");
      expect(readNoteRegion(text, "a")).toBe("A2");
      expect(readNoteRegion(text, "b")).toBe("BBB");
    });
  });

  describe("ensureNoteRegions", () => {
    it("returns null when every key already exists", () => {
      let text = writeNoteRegion("", "a", "");
      text = writeNoteRegion(text, "b", "");
      expect(ensureNoteRegions(text, ["a", "b"])).toBeNull();
    });
    it("appends only the missing keys, in order", () => {
      const text = writeNoteRegion("", "a", "keep");
      const out = ensureNoteRegions(text, ["a", "b", "c"]);
      expect(out).not.toBeNull();
      expect(readNoteRegion(out as string, "a")).toBe("keep");
      expect(readNoteRegion(out as string, "b")).toBe("");
      expect(readNoteRegion(out as string, "c")).toBe("");
    });
  });

  describe("allNoteRegions", () => {
    it("returns [] when there are no markers", () => {
      expect(allNoteRegions("just prose\nno markers")).toEqual([]);
    });
    it("finds a single region", () => {
      const text = writeNoteRegion("", "todo", "- ( ) task one");
      expect(allNoteRegions(text)).toEqual([
        { key: "todo", content: "- ( ) task one" },
      ]);
    });
    it("finds every region, in document order", () => {
      let text = writeNoteRegion("body\n", "focus", "focus text");
      text = writeNoteRegion(text, "todo", "- ( ) a\n- (x) b");
      text = writeNoteRegion(text, "log", "notes here");
      expect(allNoteRegions(text)).toEqual([
        { key: "focus", content: "focus text" },
        { key: "todo", content: "- ( ) a\n- (x) b" },
        { key: "log", content: "notes here" },
      ]);
    });
    it("decodes escaped close sequences in content", () => {
      const text = writeNoteRegion("", "log", "a --> b");
      const regions = allNoteRegions(text);
      expect(regions).toHaveLength(1);
      expect(regions[0].content).toBe("a --> b");
    });
    it("returns empty content for an empty region", () => {
      const text = writeNoteRegion("", "todo", "");
      expect(allNoteRegions(text)).toEqual([{ key: "todo", content: "" }]);
    });
    it("ignores a prefix with no key", () => {
      expect(allNoteRegions("<!--chronoanvil:\n-->")).toEqual([]);
    });
    it("skips an unterminated final region and keeps earlier ones", () => {
      const good = writeNoteRegion("", "todo", "- ( ) a");
      const text = good + "\n<!--chronoanvil:log\nnever closed";
      expect(allNoteRegions(text)).toEqual([
        { key: "todo", content: "- ( ) a" },
      ]);
    });
    it("does not treat a longer key as a match for a shorter one", () => {
      // Both regions are distinct keys; allNoteRegions returns both verbatim,
      // and neither `todo2`'s content bleeds into `todo`.
      let text = writeNoteRegion("", "todo", "short");
      text = writeNoteRegion(text, "todo2", "long");
      const regions = allNoteRegions(text);
      expect(regions.map((r) => r.key)).toEqual(["todo", "todo2"]);
      expect(regions.find((r) => r.key === "todo")?.content).toBe("short");
    });
    it("round-trips with parseTasks to recover open tasks per region", () => {
      let text = writeNoteRegion("", "todo", "- ( ) open one\n- (x) done");
      text = writeNoteRegion(text, "later", "- ( ) open two [priority:: high]");
      const open = allNoteRegions(text)
        .flatMap((r) => parseTasks(r.content))
        .filter((t) => !t.done)
        .map((t) => t.text);
      expect(open).toEqual(["open one", "open two"]);
    });
  });
});

describe("tasks format", () => {
  describe("parseTaskLine", () => {
    it("returns null for non-task lines", () => {
      expect(parseTaskLine("")).toBeNull();
      expect(parseTaskLine("just text")).toBeNull();
      expect(parseTaskLine("- [ ] standard checkbox")).toBeNull(); // not ChronoAnvil marker
      expect(parseTaskLine("# heading")).toBeNull();
    });

    it("parses a plain open task as normal priority, no due", () => {
      const t = parseTaskLine("- ( ) Water plants");
      expect(t).toEqual({
        done: false, text: "Water plants", priority: "normal", due: null, at: null, extraFields: [],
      });
    });

    it("parses a done task", () => {
      const t = parseTaskLine("- (x) Reply to email");
      expect(t?.done).toBe(true);
      expect(t?.text).toBe("Reply to email");
    });

    it("accepts uppercase X and empty box", () => {
      expect(parseTaskLine("- (X) done")?.done).toBe(true);
      expect(parseTaskLine("- () open")?.done).toBe(false);
    });

    it("parses priority and due inline fields, stripping them from text", () => {
      const t = parseTaskLine("- ( ) Draft proposal [priority:: high] [due:: 2026-07-25]");
      expect(t?.text).toBe("Draft proposal");
      expect(t?.priority).toBe("high");
      expect(t?.due).toBe("2026-07-25");
    });

    it("is order-independent for fields", () => {
      const t = parseTaskLine("- ( ) X [due:: 2026-01-02] [priority:: low]");
      expect(t?.priority).toBe("low");
      expect(t?.due).toBe("2026-01-02");
    });

    it("ignores an invalid priority value (keeps default) and malformed due", () => {
      const t = parseTaskLine("- ( ) X [priority:: urgent] [due:: notadate]");
      expect(t?.priority).toBe("normal");
      expect(t?.due).toBeNull();
      // Unrecognized/malformed fields are preserved verbatim.
      expect(t?.extraFields).toContain("[priority:: urgent]");
      expect(t?.extraFields).toContain("[due:: notadate]");
    });

    it("preserves unknown fields", () => {
      const t = parseTaskLine("- ( ) X [tag:: work]");
      expect(t?.text).toBe("X");
      expect(t?.extraFields).toEqual(["[tag:: work]"]);
    });

    // ── the hour, 4.55 ────────────────────────────────────────────
    //
    // A task with a `due` is a fact about a day and the time grid needs the
    // ones that are facts about a minute. `[at:: HH:mm]` is that minute, and
    // the field went in beside `due` rather than into the text because the
    // grammar has preserved unknown `[k:: v]` verbatim since it was written —
    // which is also why a note from an older build survives this change
    // untouched.
    it("reads an hour beside the day, padding a hand-typed one", () => {
      const t = parseTaskLine("- ( ) Stand-up [due:: 2026-08-21] [at:: 9:05]");
      expect(t?.text).toBe("Stand-up");
      expect(t?.due).toBe("2026-08-21");
      expect(t?.at).toBe("09:05");
    });

    it("drops an hour with no day, and does not write it back as an unknown field", () => {
      // An hour on no day is not a time. Preserving it would let a task carry a
      // stamp that means nothing and put it on a grid column it has no claim to.
      const t = parseTaskLine("- ( ) Sometime [at:: 09:05]");
      expect(t?.at).toBeNull();
      expect(t?.extraFields).toEqual([]);
    });

    it("keeps a malformed hour verbatim rather than guessing at one", () => {
      const t = parseTaskLine("- ( ) X [due:: 2026-08-21] [at:: half nine]");
      expect(t?.at).toBeNull();
      expect(t?.extraFields).toContain("[at:: half nine]");
    });
  });

  describe("serializeTaskLine", () => {
    it("omits priority when normal and due when unset", () => {
      expect(serializeTaskLine(newTask("Water plants"))).toBe("- ( ) Water plants");
    });

    it("emits priority when not normal", () => {
      const t: ChronoAnvilTask = { done: false, text: "X", priority: "high", due: null, extraFields: [] };
      expect(serializeTaskLine(t)).toBe("- ( ) X [priority:: high]");
    });

    it("emits due when set", () => {
      const t: ChronoAnvilTask = { done: true, text: "X", priority: "normal", due: "2026-07-25", extraFields: [] };
      expect(serializeTaskLine(t)).toBe("- (x) X [due:: 2026-07-25]");
    });

    it("appends unknown fields", () => {
      const t: ChronoAnvilTask = { done: false, text: "X", priority: "low", due: null, at: null, extraFields: ["[tag:: work]"] };
      expect(serializeTaskLine(t)).toBe("- ( ) X [priority:: low] [tag:: work]");
    });

    it("emits the hour after the day (4.55)", () => {
      const t: ChronoAnvilTask = { done: false, text: "X", priority: "normal", due: "2026-08-21", at: "09:05", extraFields: [] };
      expect(serializeTaskLine(t)).toBe("- ( ) X [due:: 2026-08-21] [at:: 09:05]");
    });

    it("writes no hour for a task with no day", () => {
      // THE COMPATIBILITY CLAIM. Every task already in a vault has no `at`, and
      // a round trip must not start writing the key onto lines that never had it.
      const t: ChronoAnvilTask = { done: false, text: "X", priority: "normal", due: null, at: "09:05", extraFields: [] };
      expect(serializeTaskLine(t)).toBe("- ( ) X");
    });
  });

  describe("round-trip", () => {
    const lines = [
      "- ( ) Water plants",
      "- (x) Reply to email [priority:: low]",
      "- ( ) Draft proposal [priority:: high] [due:: 2026-07-25]",
      "- ( ) Stand-up [due:: 2026-08-21] [at:: 09:05]",
      "- ( ) Tagged [tag:: work]",
    ];
    it("parse→serialize is stable for each line", () => {
      for (const line of lines) {
        const t = parseTaskLine(line)!;
        expect(serializeTaskLine(t)).toBe(line);
      }
    });
    it("parseTasks/serializeTasks round-trips a block", () => {
      const block = lines.join("\n");
      expect(serializeTasks(parseTasks(block))).toBe(block);
    });
    it("parseTasks skips blank and non-task lines", () => {
      const block = "\n- ( ) A\n\nsome note\n- (x) B\n";
      const tasks = parseTasks(block);
      expect(tasks.map((t) => t.text)).toEqual(["A", "B"]);
    });
  });

  describe("moveTask", () => {
    const mk = (texts: string[]): ChronoAnvilTask[] =>
      parseTasks(texts.map((t) => `- ( ) ${t}`).join("\n"));

    it("moves a step to a new position, preserving the rest of the order", () => {
      const steps = mk(["a", "b", "c"]);
      expect(moveTask(steps, 0, 2).map((t) => t.text)).toEqual(["b", "c", "a"]);
      expect(moveTask(steps, 2, 0).map((t) => t.text)).toEqual(["c", "a", "b"]);
    });

    it("supports single-step up/down moves (the widget's buttons)", () => {
      const steps = mk(["a", "b", "c"]);
      expect(moveTask(steps, 1, 0).map((t) => t.text)).toEqual(["b", "a", "c"]);
      expect(moveTask(steps, 1, 2).map((t) => t.text)).toEqual(["a", "c", "b"]);
    });

    it("returns the same array for a no-op or out-of-range move", () => {
      const steps = mk(["a", "b", "c"]);
      // Same identity so the widget can skip a write/repaint — up on the first
      // row and down on the last both land here.
      expect(moveTask(steps, 0, 0)).toBe(steps);
      expect(moveTask(steps, 0, -1)).toBe(steps);
      expect(moveTask(steps, 2, 3)).toBe(steps);
    });

    it("never mutates the input array", () => {
      const steps = mk(["a", "b", "c"]);
      moveTask(steps, 0, 2);
      expect(steps.map((t) => t.text)).toEqual(["a", "b", "c"]);
    });
  });

  describe("isValidPriority", () => {
    it("accepts the three levels only", () => {
      expect(isValidPriority("high")).toBe(true);
      expect(isValidPriority("normal")).toBe(true);
      expect(isValidPriority("low")).toBe(true);
      expect(isValidPriority("urgent")).toBe(false);
      expect(isValidPriority("")).toBe(false);
    });
  });
});

// ── tables.ts: tasks-table toggle + concurrency ──────────────────────────

describe("tasks-table logic", () => {
  // Build a task list from `- ( )` / `- (x)` lines for readable fixtures.
  const mk = (lines: string[]): ChronoAnvilTask[] =>
    parseTasks(lines.join("\n"));

  describe("resolveToggleTarget", () => {
    it("matches an open task by its serialized line", () => {
      const tasks = mk(["- ( ) alpha", "- ( ) beta", "- ( ) gamma"]);
      expect(resolveToggleTarget(tasks, "- ( ) beta", 1)).toBe(1);
    });

    it("finds the line even when its position has shifted", () => {
      // Row was rendered at index 2, but a task was inserted above it since,
      // so it now lives at index 3. The line match wins over the stale hint.
      const tasks = mk([
        "- ( ) inserted",
        "- ( ) alpha",
        "- ( ) beta",
        "- ( ) gamma",
      ]);
      expect(resolveToggleTarget(tasks, "- ( ) gamma", 2)).toBe(3);
    });

    it("returns -1 when the line is already completed (no toggle-back)", () => {
      const tasks = mk(["- ( ) alpha", "- (x) beta"]);
      // The row was for `beta` when it was open; it's since been completed.
      // Its serialized *open* line no longer matches any open task.
      expect(resolveToggleTarget(tasks, "- ( ) beta", 1)).toBe(-1);
    });

    it("returns -1 when the line is gone entirely", () => {
      const tasks = mk(["- ( ) alpha"]);
      expect(resolveToggleTarget(tasks, "- ( ) deleted", 0)).toBe(-1);
    });

    it("falls back to the index hint only when it points at the matching open line", () => {
      // Two identical open lines. Line match returns the *first* (index 0);
      // the hint can't override that, which is the safe default.
      const tasks = mk(["- ( ) dup", "- ( ) dup"]);
      expect(resolveToggleTarget(tasks, "- ( ) dup", 1)).toBe(0);
    });

    it("does not fall back to a hint that lands on a non-matching task", () => {
      const tasks = mk(["- ( ) alpha", "- ( ) beta"]);
      // Line gone; hint points at a real open task, but its line differs, so
      // no accidental completion of `beta`.
      expect(resolveToggleTarget(tasks, "- ( ) removed", 1)).toBe(-1);
    });

    it("ignores an out-of-range hint", () => {
      const tasks = mk(["- ( ) alpha"]);
      expect(resolveToggleTarget(tasks, "- ( ) gone", 99)).toBe(-1);
      expect(resolveToggleTarget(tasks, "- ( ) gone", -1)).toBe(-1);
    });

    it("matches a line carrying priority/due metadata", () => {
      const tasks = mk([
        "- ( ) plain",
        "- ( ) urgent [priority:: high] [due:: 2026-08-01]",
      ]);
      const line = serializeTaskLine(tasks[1]);
      expect(resolveToggleTarget(tasks, line, 1)).toBe(1);
    });

    it("skips done tasks when a same-text open task exists", () => {
      // A completed `alpha` sits before an open `alpha`; the open one wins.
      const tasks = mk(["- (x) alpha", "- ( ) alpha"]);
      expect(resolveToggleTarget(tasks, "- ( ) alpha", 1)).toBe(1);
    });
  });

  describe("dueLabel", () => {
    // Fixed "today" so every branch is deterministic (no real clock).
    const today = "2026-07-22";

    it("flags a past date as overdue with a day count", () => {
      expect(dueLabel("2026-07-20", today)).toEqual({
        text: "2d ago",
        overdue: true,
      });
    });

    it("uses singular-form day count one day overdue", () => {
      expect(dueLabel("2026-07-21", today)).toEqual({
        text: "1d ago",
        overdue: true,
      });
    });

    it("labels today", () => {
      expect(dueLabel("2026-07-22", today)).toEqual({
        text: "today",
        overdue: false,
      });
    });

    it("labels tomorrow", () => {
      expect(dueLabel("2026-07-23", today)).toEqual({
        text: "tomorrow",
        overdue: false,
      });
    });

    it("labels 2..6 days out as 'in Nd'", () => {
      expect(dueLabel("2026-07-25", today)).toEqual({
        text: "in 3d",
        overdue: false,
      });
      expect(dueLabel("2026-07-28", today)).toEqual({
        text: "in 6d",
        overdue: false,
      });
    });

    it("switches to an absolute date at 7+ days", () => {
      expect(dueLabel("2026-07-29", today)).toEqual({
        text: "29 Jul",
        overdue: false,
      });
    });

    it("formats a far-future date absolutely", () => {
      expect(dueLabel("2026-12-05", today)).toEqual({
        text: "5 Dec",
        overdue: false,
      });
    });
  });

  describe("countChronoAnvilTasks", () => {
    it("counts open and done across a region", () => {
      const text = writeNoteRegion(
        "",
        "todo",
        ["- ( ) a", "- (x) b", "- ( ) c"].join("\n")
      );
      expect(countChronoAnvilTasks(text)).toEqual({ open: 2, done: 1 });
    });

    it("returns zero for a note with no regions", () => {
      expect(countChronoAnvilTasks("just some body text, no tasks")).toEqual({
        open: 0,
        done: 0,
      });
    });

    it("ignores native `- [ ]` checkboxes (only ChronoAnvil markers count)", () => {
      // Native Markdown tasks are invisible to the ChronoAnvil format by design;
      // they must not be counted here.
      const text = writeNoteRegion("", "todo", ["- [ ] native", "- ( ) chronoanvil"].join("\n"));
      expect(countChronoAnvilTasks(text)).toEqual({ open: 1, done: 0 });
    });

    it("sums across multiple regions in one note", () => {
      let text = writeNoteRegion("", "todo", ["- ( ) a", "- (x) b"].join("\n"));
      text = writeNoteRegion(text, "later", ["- ( ) c", "- ( ) d"].join("\n"));
      expect(countChronoAnvilTasks(text)).toEqual({ open: 3, done: 1 });
    });
  });

  describe("mapWithLimit", () => {
    it("preserves input order regardless of resolution order", async () => {
      const delays = [30, 5, 20, 1, 15];
      const out = await mapWithLimit(delays, 2, async (d, i) => {
        await new Promise((r) => setTimeout(r, d));
        return i;
      });
      expect(out).toEqual([0, 1, 2, 3, 4]);
    });

    it("never exceeds the concurrency limit", async () => {
      let active = 0;
      let peak = 0;
      const items = Array.from({ length: 20 }, (_, i) => i);
      await mapWithLimit(items, 4, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return null;
      });
      expect(peak).toBeLessThanOrEqual(4);
    });

    it("handles an empty input", async () => {
      const out = await mapWithLimit<number, number>([], 4, async (x) => x);
      expect(out).toEqual([]);
    });

    it("handles a limit larger than the item count", async () => {
      const out = await mapWithLimit([1, 2, 3], 10, async (x) => x * 2);
      expect(out).toEqual([2, 4, 6]);
    });

    it("runs every item exactly once", async () => {
      const seen: number[] = [];
      await mapWithLimit([5, 6, 7, 8], 3, async (x) => {
        seen.push(x);
        return x;
      });
      expect(seen.sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
    });
  });

  describe("openTasksInFile (mtime/size cache)", () => {
    // A tiny fake vault: serves per-path text and counts read() calls so a
    // cache hit (no read) is observable. TFile.stat drives cache validity.
    interface FakeVault {
      read: (f: TFile) => Promise<string>;
    }
    const makeApp = (
      texts: Map<string, string>,
      counter: { reads: number }
    ): { vault: FakeVault } => ({
      vault: {
        read: async (f: TFile) => {
          counter.reads++;
          return texts.get(f.path) ?? "";
        },
      },
    });
    const makeFile = (path: string, mtime: number, size: number): TFile => {
      const f = new TFile();
      f.path = path;
      f.name = path.split("/").pop() ?? path;
      f.stat = { ctime: 0, mtime, size };
      return f;
    };

    beforeEach(() => __clearTaskCache());

    it("reads on a cold cache and returns the open tasks", async () => {
      const texts = new Map([
        ["a.md", "<!--chronoanvil:todo\n- ( ) one\n- (x) two\n-->"],
      ]);
      const counter = { reads: 0 };
      const app = makeApp(texts, counter) as never;
      const rows = await openTasksInFile(app, makeFile("a.md", 100, 40));
      expect(counter.reads).toBe(1);
      expect(rows.map((r) => r.task.text)).toEqual(["one"]);
    });

    it("does not re-read when mtime and size are unchanged", async () => {
      const texts = new Map([["a.md", "<!--chronoanvil:todo\n- ( ) one\n-->"]]);
      const counter = { reads: 0 };
      const app = makeApp(texts, counter) as never;
      const file = makeFile("a.md", 100, 30);
      await openTasksInFile(app, file);
      await openTasksInFile(app, file);
      expect(counter.reads).toBe(1); // second call served from cache
    });

    it("re-reads when mtime changes", async () => {
      const texts = new Map([["a.md", "<!--chronoanvil:todo\n- ( ) one\n-->"]]);
      const counter = { reads: 0 };
      const app = makeApp(texts, counter) as never;
      await openTasksInFile(app, makeFile("a.md", 100, 30));
      await openTasksInFile(app, makeFile("a.md", 101, 30));
      expect(counter.reads).toBe(2);
    });

    it("re-reads when size changes even if mtime is identical", async () => {
      // Guards the same-second-edit case coarse mtime granularity can miss.
      const texts = new Map([["a.md", "<!--chronoanvil:todo\n- ( ) one\n-->"]]);
      const counter = { reads: 0 };
      const app = makeApp(texts, counter) as never;
      await openTasksInFile(app, makeFile("a.md", 100, 30));
      await openTasksInFile(app, makeFile("a.md", 100, 31));
      expect(counter.reads).toBe(2);
    });

    it("reflects updated content after an invalidating read", async () => {
      const texts = new Map([["a.md", "<!--chronoanvil:todo\n- ( ) one\n-->"]]);
      const counter = { reads: 0 };
      const app = makeApp(texts, counter) as never;
      const first = await openTasksInFile(app, makeFile("a.md", 100, 30));
      expect(first.map((r) => r.task.text)).toEqual(["one"]);
      texts.set("a.md", "<!--chronoanvil:todo\n- ( ) one\n- ( ) two\n-->");
      const second = await openTasksInFile(app, makeFile("a.md", 101, 45));
      expect(second.map((r) => r.task.text)).toEqual(["one", "two"]);
    });
  });
});

// ── attachments.ts ───────────────────────────────────────────────────────

describe("attachments format", () => {
  describe("classification", () => {
    it("reads an extension through a query string or fragment", () => {
      expect(extensionOf("a/b/photo.PNG")).toBe("png");
      expect(extensionOf("https://x.test/p.jpg?w=800")).toBe("jpg");
      expect(extensionOf("https://x.test/p.webp#top")).toBe("webp");
      expect(extensionOf("no-extension")).toBe("");
      expect(extensionOf("trailing.")).toBe("");
      expect(extensionOf(".dotfile")).toBe("");
    });

    it("recognises image targets case-insensitively", () => {
      expect(isImageTarget("Cloud.JPEG")).toBe(true);
      expect(isImageTarget("scan.pdf")).toBe(false);
    });

    it("accepts only openable URL schemes", () => {
      expect(isExternalUrl("https://example.com")).toBe(true);
      expect(isExternalUrl("mailto:a@b.test")).toBe(true);
      expect(isExternalUrl("obsidian://open?vault=x")).toBe(true);
      expect(isExternalUrl("ftp://example.com")).toBe(false);
      expect(isExternalUrl("01 - Material/Attachments/a.png")).toBe(false);
    });

    it("refuses script and data URLs, and control-char smuggling", () => {
      expect(isSafeUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
      expect(isSafeUrl("java\nscript:alert(1)")).toBe(false);
      expect(isSafeUrl("https://example.com/ok")).toBe(true);
    });
  });

  describe("parseAttachmentLine", () => {
    it("parses an embedded vault image, with and without a caption", () => {
      expect(parseAttachmentLine("- ![[01 - Material/Attachments/2026/07/Cloud.png]]")).toEqual({
        kind: "image",
        target: "01 - Material/Attachments/2026/07/Cloud.png",
        title: "",
      });
      expect(parseAttachmentLine("![[Cloud.png|A cool cloud]]")).toEqual({
        kind: "image",
        target: "Cloud.png",
        title: "A cool cloud",
      });
    });

    it("parses a vault file link as a file, not an image", () => {
      expect(parseAttachmentLine("- [[Recipes/Bread.md|Sourdough]]")).toEqual({
        kind: "file",
        target: "Recipes/Bread.md",
        title: "Sourdough",
      });
      expect(parseAttachmentLine("- [[Some Note]]")?.kind).toBe("file");
    });

    it("parses a markdown hyperlink", () => {
      expect(parseAttachmentLine("- [Market square](https://example.com/x)")).toEqual({
        kind: "link",
        target: "https://example.com/x",
        title: "Market square",
      });
    });

    it("treats a remote image as a link unless it is explicitly embedded", () => {
      expect(parseAttachmentLine("[Photo](https://x.test/a.jpg)")?.kind).toBe("link");
      expect(parseAttachmentLine("![Photo](https://x.test/a.jpg)")?.kind).toBe("image");
    });

    it("parses a bare or angle-bracketed URL", () => {
      expect(parseAttachmentLine("https://example.com/a")).toEqual({
        kind: "link",
        target: "https://example.com/a",
        title: "",
      });
      expect(parseAttachmentLine("<https://example.com/a>")?.target).toBe(
        "https://example.com/a"
      );
    });

    it("keeps anything else as free text so nothing is lost", () => {
      expect(parseAttachmentLine("just some notes to myself")).toEqual({
        kind: "text",
        target: "",
        title: "just some notes to myself",
      });
    });

    it("ignores blank lines and bare bullets", () => {
      expect(parseAttachmentLine("")).toBeNull();
      expect(parseAttachmentLine("   ")).toBeNull();
      expect(parseAttachmentLine("- ")).toBeNull();
    });
  });

  describe("serializeAttachmentLine", () => {
    it("emits an alias only when there is a caption", () => {
      expect(
        serializeAttachmentLine({ kind: "image", target: "a/b.png", title: "" })
      ).toBe("- ![[a/b.png]]");
      expect(
        serializeAttachmentLine({ kind: "image", target: "a/b.png", title: "Cloud" })
      ).toBe("- ![[a/b.png|Cloud]]");
    });

    it("falls back to the host when an external link has no caption", () => {
      expect(
        serializeAttachmentLine({
          kind: "link",
          target: "https://www.example.com/a/b",
          title: "",
        })
      ).toBe("- [example.com](https://www.example.com/a/b)");
    });

    it("strips link delimiters out of a caption", () => {
      expect(
        serializeAttachmentLine({
          kind: "file",
          target: "Note.md",
          title: "a [b] | c",
        })
      ).toBe("- [[Note.md|a b c]]");
    });
  });

  describe("round-trip", () => {
    const lines = [
      "- ![[01 - Material/Attachments/2026/07/Cloud 2026-07-22.png]]",
      "- ![[Cloud.png|A cool cloud]]",
      "- [[Recipes/Bread.md|Sourdough]]",
      "- [[Some Note]]",
      "- [Market square](https://example.com/story)",
      "- ![Photo of the day](https://example.com/apod.jpg)",
      "- leftover free text from the old textarea",
    ];

    it("parse→serialize is stable for each line", () => {
      for (const line of lines) {
        expect(serializeAttachmentLine(parseAttachmentLine(line)!)).toBe(line);
      }
    });

    it("round-trips a whole region block", () => {
      const block = lines.join("\n");
      expect(serializeAttachments(parseAttachments(block))).toBe(block);
    });

    it("normalises a hand-written block without losing anything", () => {
      const block = "https://example.com/a\n\n* [[Note]]\nprose\n";
      expect(serializeAttachments(parseAttachments(block))).toBe(
        "- [example.com](https://example.com/a)\n- [[Note]]\n- prose"
      );
    });
  });

  describe("displayTitle", () => {
    it("prefers the caption, then derives one", () => {
      expect(displayTitle({ kind: "image", target: "a/b.png", title: "Cloud" })).toBe(
        "Cloud"
      );
      expect(displayTitle({ kind: "image", target: "a/b.png", title: "" })).toBe("b");
      expect(
        displayTitle({ kind: "link", target: "https://www.example.com/x", title: "" })
      ).toBe("example.com");
      expect(
        displayTitle({ kind: "link", target: "mailto:a@b.test", title: "" })
      ).toBe("a@b.test");
    });
  });

  describe("coerceUrl", () => {
    it("accepts what people actually paste", () => {
      expect(coerceUrl("https://example.com")).toBe("https://example.com");
      expect(coerceUrl("www.example.com/a")).toBe("https://www.example.com/a");
      expect(coerceUrl("example.co.uk")).toBe("https://example.co.uk");
      expect(coerceUrl("//example.com")).toBe("https://example.com");
    });

    it("rejects prose, empty input and unsafe schemes", () => {
      expect(coerceUrl("not a url")).toBeNull();
      expect(coerceUrl("")).toBeNull();
      expect(coerceUrl("javascript:alert(1)")).toBeNull();
      expect(coerceUrl("file:///etc/passwd")).toBeNull();
    });
  });

  describe("newAttachment / hasTarget / moveAttachment", () => {
    it("classifies a new attachment from its target", () => {
      expect(newAttachment("a/b.png").kind).toBe("image");
      expect(newAttachment("a/b.pdf").kind).toBe("file");
      expect(newAttachment("https://example.com").kind).toBe("link");
    });

    it("matches targets case-insensitively for de-duplication", () => {
      const items = [newAttachment("A/B.png")];
      expect(hasTarget(items, "a/b.png")).toBe(true);
      expect(hasTarget(items, "a/c.png")).toBe(false);
    });

    it("moves an item and leaves out-of-range moves alone", () => {
      const items = [
        newAttachment("a.png"),
        newAttachment("b.png"),
        newAttachment("c.png"),
      ];
      expect(moveAttachment(items, 0, 2).map((a) => a.target)).toEqual([
        "b.png",
        "c.png",
        "a.png",
      ]);
      expect(moveAttachment(items, 0, 9)).toBe(items);
      expect(moveAttachment(items, 1, 1)).toBe(items);
      // The original array is never mutated.
      expect(items.map((a) => a.target)).toEqual(["a.png", "b.png", "c.png"]);
    });
  });

  describe("file naming", () => {
    it("substitutes known tokens and leaves unknown ones visible", () => {
      expect(
        applyTokens("{yyyy}/{MM}/{note}", {
          yyyy: "2026",
          mm: "07",
          note: "2026-07-22",
        })
      ).toBe("2026/07/2026-07-22");
      expect(applyTokens("{nope}", {})).toBe("{nope}");
    });

    it("strips characters that break file systems or wikilinks", () => {
      expect(sanitizeFileName('a/b:c*d?e"f<g>h|i#j^k[l]m')).toBe(
        "a-b-c-d-e-f-g-h-i-j-k-l-m"
      );
      expect(sanitizeFileName("  ..hidden  ")).toBe("hidden");
      expect(sanitizeFileName("///")).toBe("attachment");
    });

    it("keeps a folder pattern inside its root", () => {
      expect(sanitizeFolderPath("2026/07")).toBe("2026/07");
      // `..` segments are dropped rather than resolved, so a pattern can
      // never climb above the attachments root — what's left is an ordinary
      // subfolder name.
      expect(sanitizeFolderPath("/../../etc//")).toBe("etc");
      expect(sanitizeFolderPath("a/../b")).toBe("a/b");
    });

    it("splits an extension only when there is one", () => {
      expect(splitExtension("photo.png")).toEqual({ base: "photo", ext: "png" });
      expect(splitExtension("noext")).toEqual({ base: "noext", ext: "" });
      expect(splitExtension(".gitignore")).toEqual({
        base: ".gitignore",
        ext: "",
      });
    });

    it("maps clipboard MIME types to extensions", () => {
      expect(extensionForMime("image/jpeg")).toBe("jpg");
      expect(extensionForMime("image/svg+xml")).toBe("svg");
      expect(extensionForMime("image/webp")).toBe("webp");
      expect(extensionForMime("application/pdf")).toBe("");
    });

    it("suffixes a colliding name before the extension", () => {
      const taken = new Set(["f/a.png", "f/a 1.png"]);
      expect(uniquePath("f/a.png", (p) => taken.has(p))).toBe("f/a 2.png");
      expect(uniquePath("f/b.png", (p) => taken.has(p))).toBe("f/b.png");
      expect(uniquePath("noext", () => false)).toBe("noext");
    });
  });
});

// ── pathwatch.ts ─────────────────────────────────────────────────────────

describe("path remapping on folder rename", () => {
  describe("remapPath", () => {
    it("retargets an exact match", () => {
      expect(remapPath("01 - Material", "01 - Material", "01 - Raw")).toBe(
        "01 - Raw"
      );
    });

    it("retargets anything beneath the renamed folder", () => {
      expect(
        remapPath(
          "01 - Material/Attachments/2026",
          "01 - Material",
          "01 - Raw"
        )
      ).toBe("01 - Raw/Attachments/2026");
    });

    it("does not match a sibling that merely shares a prefix", () => {
      expect(remapPath("02 - Diary Archive", "02 - Diary", "Journal")).toBeNull();
      expect(remapPath("02 - Diaries/Daily", "02 - Diary", "Journal")).toBeNull();
    });

    it("leaves unrelated and empty paths alone", () => {
      expect(remapPath("03 - Journals", "02 - Diary", "Journal")).toBeNull();
      expect(remapPath("", "02 - Diary", "Journal")).toBeNull();
    });
  });

  describe("remapConfiguredPaths", () => {
    const fresh = () => ({
      paths: {
        home: "Homepage.md",
        staging: "01 - Material/Staging",
        diaryRoot: "02 - Diary",
        diaryDaily: "02 - Diary/Daily",
        templates: "00 - Infrastructure/Templates",
      } as Record<string, string>,
      customJournals: [
        {
          name: "Recipes",
          root: "03 - Journals/Recipes",
          templatesFolder: "00 - Infrastructure/Templates/Recipes",
        },
      ],
    });

    it("moves a root and everything configured beneath it", () => {
      const s = fresh();
      const changed = remapConfiguredPaths(
        s,
        "00 - Infrastructure",
        "00 - System",
        true
      );
      expect(s.paths.templates).toBe("00 - System/Templates");
      expect(s.customJournals[0].templatesFolder).toBe(
        "00 - System/Templates/Recipes"
      );
      expect(changed).toHaveLength(2);
      // Untouched paths stay exactly as they were.
      expect(s.paths.diaryDaily).toBe("02 - Diary/Daily");
    });

    it("updates the root and its children in one pass", () => {
      const s = fresh();
      remapConfiguredPaths(s, "02 - Diary", "02 - Journal", true);
      expect(s.paths.diaryRoot).toBe("02 - Journal");
      expect(s.paths.diaryDaily).toBe("02 - Journal/Daily");
    });

    it("reports nothing when the rename is unrelated", () => {
      const s = fresh();
      expect(remapConfiguredPaths(s, "99 - Elsewhere", "98 - Elsewhere", true))
        .toEqual([]);
    });

    it("only lets a file rename touch the homepage", () => {
      const s = fresh();
      // A *file* at that path can't be the staging folder, so nothing moves.
      expect(
        remapConfiguredPaths(s, "01 - Material/Staging", "01 - Raw", false)
      ).toEqual([]);
      expect(s.paths.staging).toBe("01 - Material/Staging");

      const changed = remapConfiguredPaths(s, "Homepage.md", "Home.md", false);
      expect(changed).toEqual(["homepage"]);
      expect(s.paths.home).toBe("Home.md");
    });

    it("tolerates a config with no custom journals", () => {
      const s = { paths: { diaryRoot: "02 - Diary" } as Record<string, string> };
      expect(remapConfiguredPaths(s, "02 - Diary", "Diary", true)).toEqual([
        "diary root",
      ]);
    });
  });
});

// ── constants.ts: the root → children map ────────────────────────────────
//
// Settings only exposes the roots; everything else follows its root by prefix.
// That silently stops working for any path that isn't registered under the
// right root, so the invariants are asserted rather than assumed.

describe("path roots", () => {
  const rootKeys = Object.keys(ROOT_CHILDREN);

  it("registers every root as a real path", () => {
    for (const root of rootKeys) {
      expect(DEFAULT_PATHS).toHaveProperty(root);
    }
  });

  it("accounts for every configured path exactly once", () => {
    const claimed = Object.values(ROOT_CHILDREN).flat();
    expect(new Set(claimed).size).toBe(claimed.length); // no path under two roots

    // `home` is a file and belongs to no root; everything else is either a
    // root itself or a child of one. An unaccounted path would sit in the
    // settings tab's blind spot and quietly ignore a root change.
    const accounted = new Set<string>([...rootKeys, ...claimed, "home"]);
    for (const key of Object.keys(DEFAULT_PATHS)) {
      expect(accounted.has(key)).toBe(true);
    }
  });

  it("defaults every child inside its own root", () => {
    for (const [root, children] of Object.entries(ROOT_CHILDREN)) {
      const prefix = DEFAULT_PATHS[root as keyof typeof DEFAULT_PATHS];
      for (const child of children) {
        expect(DEFAULT_PATHS[child].startsWith(`${prefix}/`)).toBe(true);
      }
    }
  });

  it("carries a root's children along when the root is edited", () => {
    // Exactly what the settings tab does on a root edit.
    const settings = { paths: { ...DEFAULT_PATHS } as Record<string, string> };
    const before = settings.paths.materialRoot;
    remapConfiguredPaths(settings, before, "01 - Raw", true);

    expect(settings.paths.materialRoot).toBe("01 - Raw");
    expect(settings.paths.staging).toBe("01 - Raw/Staging");
    expect(settings.paths.attachments).toBe("01 - Raw/Attachments");
    // A different root is untouched.
    expect(settings.paths.diaryDaily).toBe(DEFAULT_PATHS.diaryDaily);
  });
});

// ── util.ts: folder-note derivation ──────────────────────────────────────
//
// The weekly/monthly overview dashboards are the folder notes of the folders
// their entries live in. These used to be frozen constants that every caller
// took basename() of, which meant the filename stayed "Daily.md" even after the
// folder was renamed. Deriving is only correct if it tracks the folder.

describe("folderNotePath", () => {
  it("names the note after its own folder", () => {
    expect(folderNotePath("03 - Journals/Development")).toBe(
      "03 - Journals/Development/Development.md"
    );
  });

  it("handles a top-level folder and a trailing slash", () => {
    expect(folderNotePath("Development")).toBe("Development/Development.md");
    expect(folderNotePath("a/Development/")).toBe("a/Development/Development.md");
  });
});

describe("the period overviews", () => {
  // ONE FOLDER, FOUR NOTES, AS OF 4.81. The 2.57 rule — "a folder holds that
  // period's entries and its folder note is that period's dashboard" — held for
  // as long as the grain folder was where entries lived. Under the period tree
  // it is not, so a dashboard would be the folder note of a folder holding
  // nothing. The four move into `Dashboards/` and keep their basenames, which
  // is what every hidden link and the vault map resolve by.
  it("sit together in the dashboards folder", () => {
    const p = { diaryDashboards: "02 - Diary/Dashboards" };
    expect(weeklyOverviewPath(p)).toBe("02 - Diary/Dashboards/Weekly.md");
    expect(monthlyOverviewPath(p)).toBe("02 - Diary/Dashboards/Monthly.md");
    expect(quarterOverviewPath(p)).toBe("02 - Diary/Dashboards/Quarterly.md");
    expect(yearOverviewPath(p)).toBe("02 - Diary/Dashboards/Yearly.md");
  });

  it("follow a renamed dashboards folder", () => {
    expect(weeklyOverviewPath({ diaryDashboards: "Log/Boards" })).toBe(
      "Log/Boards/Weekly.md"
    );
    expect(quarterOverviewPath({ diaryDashboards: "Log/Boards" })).toBe(
      "Log/Boards/Quarterly.md"
    );
  });

  // Where the same four notes are in a vault written before 4.81, which is the
  // one thing the move migration has to know and nothing else may use.
  it("remembers the address they are moved from", () => {
    const p = {
      diaryWeekly: "02 - Diary/Weekly",
      diaryMonthly: "02 - Diary/Monthly",
      diaryQuarterly: "02 - Diary/Quarterly",
      diaryYearly: "02 - Diary/Yearly",
    };
    expect(legacyOverviewPath(p, "weekly")).toBe("02 - Diary/Weekly/Weekly.md");
    expect(legacyOverviewPath(p, "yearly")).toBe("02 - Diary/Yearly/Yearly.md");
    expect(legacyOverviewPath({ ...p, diaryWeekly: "Log/Weeks" }, "weekly")).toBe(
      "Log/Weeks/Weeks.md"
    );
  });

  // ── AND A VAULT THAT HAS NOT REPAIRED YET STILL HAS FOUR ─────────────
  //
  // The move happens on repair; a click happens whenever the reader likes. Every
  // opener asking for the new address alone would have told a whole upgraded
  // vault "Weekly Overview note not found" — and the command palette would have
  // CREATED a second, empty one beside the real note.
  it("opens whichever of the two addresses the vault actually has", () => {
    const p = DEFAULT_PATHS;
    const vault = (paths: readonly string[]): App =>
      ({
        vault: {
          getAbstractFileByPath: (path: string) =>
            paths.includes(path) ? new TFile(path) : null,
        },
      }) as unknown as App;

    const repaired = vault(["02 - Diary/Dashboards/Weekly.md"]);
    expect(resolveOverviewPath(repaired, p, "weekly")).toBe(
      "02 - Diary/Dashboards/Weekly.md"
    );

    const old = vault(["02 - Diary/Weekly/Weekly.md"]);
    expect(resolveOverviewPath(old, p, "weekly")).toBe(
      "02 - Diary/Weekly/Weekly.md"
    );

    // Mid-repair, both on disk: the new address wins, so nothing reads the note
    // that is about to be gone.
    const both = vault([
      "02 - Diary/Dashboards/Weekly.md",
      "02 - Diary/Weekly/Weekly.md",
    ]);
    expect(resolveOverviewPath(both, p, "weekly")).toBe(
      "02 - Diary/Dashboards/Weekly.md"
    );

    // And neither: the answer is where a note being created should go.
    expect(resolveOverviewPath(vault([]), p, "quarterly")).toBe(
      "02 - Diary/Dashboards/Quarterly.md"
    );
  });

  it("gives the daily folder no dashboard at all", () => {
    // The one asymmetry, and it is deliberate: a daily entry IS the note, so
    // there is nothing for a daily dashboard to summarise. Inventing one to
    // fill the slot would be symmetry for its own sake.
    // Asserted on the EXPORT, not the word — util.ts's own comment says "there
    // is no dailyOverviewPath" to explain the gap, and a bare substring check
    // fails on the sentence documenting the thing it is checking for. Second
    // time this release; the lesson is that negative source assertions have to
    // name a construct, not a token.
    expect(readSrc("util")).not.toContain("export function dailyOverviewPath");
  });

  it("no longer stores the quarter and year dashboards as their own paths", () => {
    // They were bare notes while weekly and monthly were folder notes — the
    // same role with two mechanisms. Derived now, because a dashboard is a fact
    // about its folder rather than an independent location, and a second
    // setting pointing at the same place is a second thing that can disagree.
    expect("quarter" in DEFAULT_PATHS).toBe(false);
    expect("year" in DEFAULT_PATHS).toBe(false);
  });
});

// ── THE THREE HOME-HERO SUITES ARE DELETED (4.13.1 §3) ─────────────────
// `greetingForHour`, `countInMonth` and `entryStreak` backed the diary hero's
// greeting, its "entries this month" and its streak. The hero is gone and so are
// they; `src/core/util.ts` carries the argument for removing them rather than
// leaving three green suites over three functions nothing calls.
//
// Their coverage is not silently lost, because there is nothing left to cover.
// The one RULE worth keeping — a day with no entry today does not break a streak
// until tomorrow — lives on in `yearStripStats`, which cites it and has its own
// tests in `test/year-stats.test.ts`.

// ── 2.10: the monthly port ───────────────────────────────────────────────
// These cover the three things the port changed that had no coverage before,
// each of which failed silently rather than loudly:
//   - summaries counting tasks through a cache that cannot see them
//   - a period dashboard whose task list ignored the period
//   - a template whose frontmatter stopped matching the fill regexes

describe("sumChronoAnvilTasks", () => {
  // Same fake-vault shape the openTasksInFile suite uses, but over cachedRead,
  // which is what the summaries call.
  interface FakeVault {
    cachedRead: (f: TFile) => Promise<string>;
  }
  const makeApp = (texts: Map<string, string>): { vault: FakeVault } => ({
    vault: { cachedRead: async (f: TFile) => texts.get(f.path) ?? "" },
  });
  const makeFile = (path: string): TFile => {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    return f;
  };
  const region = (lines: string[]): string =>
    writeNoteRegion("", "todo", lines.join("\n"));

  it("sums open and done across several notes", async () => {
    const texts = new Map([
      ["a.md", region(["- ( ) one", "- (x) two"])],
      ["b.md", region(["- ( ) three"])],
      ["c.md", region(["- (x) four", "- (x) five"])],
    ]);
    const app = makeApp(texts) as never;
    const files = ["a.md", "b.md", "c.md"].map(makeFile);
    expect(await sumChronoAnvilTasks(app, files)).toEqual({ open: 2, done: 3 });
  });

  it("is zero for an empty file list without touching the vault", async () => {
    let reads = 0;
    const app = {
      vault: {
        cachedRead: async () => {
          reads++;
          return "";
        },
      },
    } as never;
    expect(await sumChronoAnvilTasks(app, [])).toEqual({ open: 0, done: 0 });
    expect(reads).toBe(0);
  });

  it("equals the sum of per-note countChronoAnvilTasks — the summaries' contract", async () => {
    // The regression this whole change exists for: month-summary used to route
    // its counts through util.ts::taskCounts, which reads Obsidian's listItems
    // cache and so reported 0 for every `- ( )` task in the vault. Asserting
    // the aggregate against the per-note counter is what pins the two together.
    const bodies = [
      region(["- ( ) a", "- (x) b", "- ( ) c"]),
      region(["- [ ] native, not counted", "- ( ) d"]),
      "no regions at all",
      region(["- (x) e"]),
    ];
    const texts = new Map(bodies.map((b, i) => [`day-${i}.md`, b]));
    const app = makeApp(texts) as never;
    const files = bodies.map((_, i) => makeFile(`day-${i}.md`));

    const expected = bodies.reduce(
      (acc, b) => {
        const c = countChronoAnvilTasks(b);
        return { open: acc.open + c.open, done: acc.done + c.done };
      },
      { open: 0, done: 0 }
    );

    expect(await sumChronoAnvilTasks(app, files)).toEqual(expected);
    expect(expected).toEqual({ open: 3, done: 2 });
  });
});

describe("countBodyTasks / sumBodyTasks", () => {
  // The study dashboards' counter. Unlike countChronoAnvilTasks (regions only),
  // this scans a whole note body, because the Lesson/Practice/Topic templates
  // carry content-level `- ( )` checkboxes that live in the prose, outside any
  // `<!--chronoanvil:todo-->` region.
  const makeFile = (path: string): TFile => {
    const f = new TFile();
    f.path = path;
    f.name = path.split("/").pop() ?? path;
    return f;
  };
  const makeApp = (texts: Map<string, string>): never =>
    ({ vault: { cachedRead: async (f: TFile) => texts.get(f.path) ?? "" } } as never);

  it("counts a content-level checkbox that sits outside any region", () => {
    // Exactly the shape template-lesson.md ships: a `- ( )` line in the body,
    // no region wrapper. countChronoAnvilTasks sees nothing here; countBodyTasks
    // must see the one open task.
    const body = "# Title\n\n- ( ) #status/understood Title\n\n## Overview\n";
    expect(countChronoAnvilTasks(body)).toEqual({ open: 0, done: 0 });
    expect(countBodyTasks(body)).toEqual({ open: 1, done: 0 });
  });

  it("counts open and done together, and ignores native `- [ ]`", () => {
    const body = ["- ( ) open one", "- (x) done one", "- [ ] native, not chronoanvil", "prose"].join("\n");
    expect(countBodyTasks(body)).toEqual({ open: 1, done: 1 });
  });

  it("counts a task in a region and one in free prose exactly once each", () => {
    // A note may have both a `tasks:` widget region and a stray content-level
    // checkbox; each line is counted a single time regardless of where it sits.
    const body = writeNoteRegion("- ( ) loose\n", "todo", "- ( ) in region\n- (x) done");
    expect(countBodyTasks(body)).toEqual({ open: 2, done: 1 });
  });

  it("sums across notes over cachedRead", async () => {
    const texts = new Map([
      ["lesson.md", "- ( ) #status/understood X"],
      ["practice.md", "- ( ) Complete all practice exercises"],
      ["topic.md", "- (x) done path item"],
      ["prose.md", "no tasks here"],
    ]);
    const app = makeApp(texts);
    const files = ["lesson.md", "practice.md", "topic.md", "prose.md"].map(makeFile);
    expect(await sumBodyTasks(app, files)).toEqual({ open: 2, done: 1 });
  });

  it("is zero for an empty file list without touching the vault", async () => {
    let reads = 0;
    const app = { vault: { cachedRead: async () => (reads++, "") } } as never;
    expect(await sumBodyTasks(app, [])).toEqual({ open: 0, done: 0 });
    expect(reads).toBe(0);
  });
});

describe("inPeriod", () => {
  const july = { start: "2026-07-01", end: "2026-07-31", unit: "month" as const };
  const week = { start: "2026-07-20", end: "2026-07-26", unit: "week" as const };

  it("admits everything when unscoped", () => {
    expect(inPeriod("2020-01-01", null)).toBe(true);
    expect(inPeriod(null, null)).toBe(true);
  });

  it("is inclusive at both edges", () => {
    expect(inPeriod("2026-07-01", july)).toBe(true);
    expect(inPeriod("2026-07-31", july)).toBe(true);
  });

  it("excludes the days either side of the period", () => {
    expect(inPeriod("2026-06-30", july)).toBe(false);
    expect(inPeriod("2026-08-01", july)).toBe(false);
  });

  it("excludes an undated note from a scoped table", () => {
    // Deliberate: a note that can't be shown to belong to the period must not
    // pin itself to every period.
    expect(inPeriod(null, july)).toBe(false);
  });

  it("works the same for a week window", () => {
    expect(inPeriod("2026-07-19", week)).toBe(false);
    expect(inPeriod("2026-07-20", week)).toBe(true);
    expect(inPeriod("2026-07-26", week)).toBe(true);
    expect(inPeriod("2026-07-27", week)).toBe(false);
  });

  it("tolerates a full ISO timestamp by comparing the date prefix", () => {
    // isoDate() normalizes before this is called, but a lexicographic compare
    // on a timestamp still lands inside the window rather than outside it.
    expect(inPeriod("2026-07-15T09:30:00", july)).toBe(true);
  });
});

describe("diary template fills", () => {

  it("fills the shipped daily template's journal-date", () => {
    const out = fillDailyTemplate(composeEntryTemplate("daily"), "2026-07-22");
    expect(out).toContain('journal-date: "2026-07-22"');
    expect(out).not.toMatch(/^journal-date: ""$/m);
  });

  it("fills the shipped monthly template's month and journal-date", () => {
    const out = fillMonthlyTemplate(composeEntryTemplate("monthly"), "2026-07");
    expect(out).toContain("month: 2026-07");
    expect(out).toContain('journal-date: "2026-07-01"');
    expect(out).not.toMatch(/^month:$/m);
  });

  it("quotes the dates so YAML keeps them strings", () => {
    // An unquoted YYYY-MM-DD becomes a Date in Obsidian's parser, which breaks
    // every bounded chart range. `month:` is intentionally unquoted — it's a
    // YYYY-MM, which YAML doesn't coerce.
    const out = fillMonthlyTemplate(composeEntryTemplate("monthly"), "2026-07");
    expect(out).toMatch(/^journal-date: "2026-07-01"$/m);
  });

  it("only replaces the frontmatter lines, not body text", () => {
    const tpl = ['---', 'month:', 'journal-date: ""', '---', "month: not frontmatter"].join("\n");
    const out = fillMonthlyTemplate(tpl, "2026-07");
    expect(out).toContain("month: not frontmatter");
    expect(out.match(/month: 2026-07/g)).toHaveLength(1);
  });
});

describe("shipped daily template", () => {
  // Composed since 2.60.1, not read from disk.
  const daily = composeEntryTemplate("daily");

  it("ships the banner and the tracker region in TWO fences (4.20)", () => {
    // ── THE INVARIANT THIS REPLACES, AND WHY IT WAS RIGHT UNTIL IT WASN'T ──
    //
    // 2.18.4 welded the tracker region into the banner's fence and this test
    // pinned it, on a true limit: Obsidian renders each fenced block as its own
    // sibling, so two fences can never be enclosed by one card and one fence is
    // what made the entry banner a real object rather than a resemblance.
    //
    // 4.20 SPLITS THEM ON PURPOSE, because the argument settled what a banner IS
    // — the file's name, its navigation and the control that edits it. The grid
    // is the note's most-used CONTENT, and it was in that card for a reason that
    // had nothing to do with what it is: the markers needed somewhere above the
    // rule to live, and the banner's fence was the only fence there.
    //
    // The 2.18.4 limit is untouched and is now doing the opposite job: one fence
    // is one card, so taking the grid out of the card means taking it out of the
    // fence. `EntrySection.fence` carries the argument.
    const lines = daily.split("\n");
    const fenceAfter = (probe: string): string[] => {
      const open = lines.findIndex(
        (l, i) => l.trim() === "```chronoanvil" && lines[i + 1]?.trim() === probe
      );
      expect(open, probe).toBeGreaterThan(-1);
      const close = lines.findIndex((l, i) => i > open && l.trim() === "```");
      return lines.slice(open + 1, close).map((l) => l.trim());
    };

    // The banner: the strip that names the note, and nothing else.
    const banner = fenceAfter("entry-header");
    expect(banner).toContain("entry-header");
    expect(banner).not.toContain("# chronoanvil:trackers:start");
    expect(banner).not.toContain("tracker:Mood");

    // The grid, in a block of its own directly beneath it.
    const trackers = fenceAfter("# chronoanvil:trackers:start");
    expect(trackers).toContain("tracker:Mood");
    expect(trackers).toContain("sleep");
    expect(trackers).toContain("# chronoanvil:trackers:end");
    expect(trackers).not.toContain("entry-header");
  });

  it("still exposes the region to the per-note editor after the split", () => {
    // The split must not cost the note its editable tracker list: the markers
    // bound the writable span, so + Add tracker and the per-cell × keep working
    // wherever that span now sits. `locateTrackerRegion` walks every fence, so
    // this passed before the move and has to keep passing after it.
    const region = locateTrackerRegion(daily.split("\n"));
    expect(region).not.toBeNull();
    expect(region!.marked).toBe(true);
    expect(noteTrackerDirectives(daily.split("\n"))).toEqual([
      "tracker:Mood",
      "sleep",
    ]);
  });

  it("and the writable span still cannot reach the header row", () => {
    const lines = daily.split("\n");
    const region = locateTrackerRegion(lines)!;
    const headerAt = lines.findIndex((l) => l.startsWith("entry-header"));
    expect(headerAt).toBeGreaterThan(0);
    expect(headerAt).toBeLessThan(region.bodyStart);
    expect(lines.slice(region.bodyStart, region.bodyEnd).join("\n")).not.toContain(
      "entry-header"
    );
  });
});

describe("shipped monthly template", () => {
  const monthly = composeEntryTemplate("monthly");

  it("carries the interactive widgets the daily template has", () => {
    expect(monthly).toContain("entry-header");
    expect(monthly).not.toContain("links:home,today,scopes#diary");
    expect(monthly).toContain("note:focus#line:");
    expect(monthly).toContain("note:log:");
    expect(monthly).toContain("attach:attachments|Attachments");
    expect(monthly).toContain("tasks:todo|Goals this month");
  });

  it("declares a body region for every note/task/attach key it references", () => {
    // A `note:`/`tasks:` directive with no matching region renders an empty
    // widget that writes nowhere — the failure is invisible until you type in
    // it and lose the text.
    const keys = ["focus", "highlights", "challenges", "log", "attachments", "todo"];
    const regions = allNoteRegions(monthly).map((r) => r.key);
    for (const key of keys) expect(regions).toContain(key);
  });

  it("ships no callouts at all — every field is a ChronoAnvil region now", () => {
    // 2.11: the last four (`highlights`, `challenges`, `learnings`, `goals`)
    // are gone. A callout can't be typed into from reading view and nothing in
    // ChronoAnvil can read one, so anything meant to be *filled in* is a widget.
    for (const kind of ["highlights", "challenges", "learnings", "goals"]) {
      expect(monthly).not.toContain(`[!${kind}]`);
    }
  });

  it("keeps highlights and challenges as two regions, not one merged field", () => {
    // The pair renders as a single box (styles.css joins them), but the
    // storage stays split so a year-in-review can read twelve months of
    // highlights as regions rather than by parsing prose. If this ever becomes
    // one field, un-merging means hand-editing every month note.
    expect(monthly).toContain("list:highlights:");
    expect(monthly).toContain("list:challenges:");
    const regions = allNoteRegions(monthly).map((r) => r.key);
    expect(regions).toContain("highlights");
    expect(regions).toContain("challenges");
  });

  it("orders the fields by when they are written, in two rows", () => {
    // 4.70. It was theme -> what happened -> loose notes -> attachments ->
    // next month, one column, goals last because last is what you leave with.
    // The template composes two rows now, so the grouping is by WHEN a field is
    // filled in: the theme and the goals at the start of the month, what went
    // well and what got in the way at the end of it, and the prose and
    // attachments underneath. `fields.ts` carries the argument; this is the
    // shipped consequence.
    const order = ["note:focus", "list:highlights", "list:challenges", "note:log", "attach:", "tasks:"];
    const at = order.map((d) => monthly.indexOf(d));
    expect(at.every((i) => i !== -1)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it("ships a managed tracker region, empty until something opts in", () => {
    // Inverted in 2.18.5. The old assertion — "ships no tracker region" — was
    // right for the reason it gave: sync managed Templates/Daily.md alone, so
    // markers here would have been permanently unmanaged and a renamed tracker
    // would have silently failed to propagate. syncEntryTemplate now covers
    // both templates, which removes the objection rather than overruling it.
    //
    // The region ships *empty*: since 2.19 every built-in is locked to the
    // daily class and no monthly tracker exists until someone defines one, so
    // a fresh vault's monthly review looks exactly as it did and no existing
    // vault gains widgets on upgrade. It exists so the sync has a span to
    // write into and the banner has somewhere to put "+ Add tracker".
    expect(monthly).toContain("# chronoanvil:trackers:start");
    expect(monthly).toContain("# chronoanvil:trackers:end");
    const region = locateTrackerRegion(monthly.split("\n"));
    expect(region).not.toBeNull();
    expect(region!.marked).toBe(true);
    expect(noteTrackerDirectives(monthly.split("\n"))).toEqual([]);
  });

  it("keeps the tracker region findable now that it has a fence of its own", () => {
    // 4.20 moved it out of the banner — see the daily template's test for the
    // argument. What has to survive the move is that `locateTrackerRegion` still
    // finds it, because every "+ Add tracker" write goes through that function
    // and it walks ALL chronoanvil fences rather than assuming one.
    const lines = monthly.split("\n");
    const region = locateTrackerRegion(lines)!;
    expect(region.marked).toBe(true);
    const fence = lines.slice(region.fenceOpen, region.fenceClose);
    // Its own block, so the banner's directive is not in it.
    expect(fence).not.toContain("entry-header");
  });

  it("picks up a goal written as a ChronoAnvil task", () => {
    const withGoal = writeNoteRegion(monthly, "todo", "- ( ) Ship the port");
    expect(countChronoAnvilTasks(withGoal)).toEqual({ open: 1, done: 0 });
  });
});

describe("shipped overview assets", () => {
  // The four period dashboards stopped being assets in 2.59.3 and are composed
  // from the diary section catalogue. These assertions are about what a
  // dashboard SAYS, so they follow the content rather than the file.
  const asset = (name: string): string => {
    const composed: Record<string, string> = {
      "weekly-overview.md": composeDiaryDashboard("weekly"),
      "monthly-overview.md": composeDiaryDashboard("monthly"),
      "quarter.md": composeDiaryDashboard("quarterly"),
      "year.md": composeDiaryDashboard("yearly"),
    };
    return composed[name] ?? studyFile(name);
  };

  it("scopes the monthly overview's task table to the period", () => {
    expect(asset("monthly-overview.md")).toContain("tasks-table:,period");
  });

  it("scopes the weekly overview's task table to the period too", () => {
    // WAS "leaves the weekly overview's task table unscoped", and the asymmetry
    // had a test but never an argument: the reason given below is about path
    // renames, which `,period` satisfies equally. The real reason it was bare is
    // that its folder WAS the daily-entries folder, so "this note's folder" and
    // "this week's days" were the same set.
    //
    // 2.57.6 moved it into `Weekly/`, which holds weekly ENTRIES. The directive
    // did not change and what it read did — a rollup of tasks from weekly notes
    // where the page promises the week's open tasks.
    expect(asset("weekly-overview.md")).toContain("tasks-table:,period");
  });

  it("uses the host folder rather than a hardcoded path in both", () => {
    // Neither names a folder, so both survive a path rename in Settings —
    // which `,period` does as well as the bare form, since it scopes by the
    // note's declared period rather than by any path at all.
    expect(asset("weekly-overview.md")).not.toContain("tasks-table:02");
    expect(asset("monthly-overview.md")).not.toContain("tasks-table:02");
  });
});

describe("subject and topic dashboard banner", () => {
  // 2.25.0: the plain `header:{{emoji}} … Dashboard` bar + bare `links:`
  // pills merge into the same titlebar-capped card the diary's entries use
  // (`links:...#diary`) — see the "carries the interactive widgets" check on
  // the monthly template above for the diary-side half of this pattern.

  it("makes the Subject dashboard's banner its only navigation", () => {
    const t = studyTemplate("Subject Index.md");
    // A subject sits directly under the journals root, so its trail is Home
    // alone — which is exactly what the `links:home#journals` card used to
    // draw, in a second card of its own above the page.
    expect(t).toContain("journal-header");
    expect(t).not.toContain("links:home#journals");
    expect(t).not.toMatch(/^header:.*Subject Dashboard/m);
  });

  it("gives the Subject dashboard a real status property", () => {
    const t = studyTemplate("Subject Index.md");
    expect(t).toMatch(/^type: subject$/m);
    expect(t).toMatch(/^status: in-progress$/m);
    // The directive comes from the registry now — one `status` tracker, one
    // vocabulary, shared with the leaf notes.
    expect(t).toContain("tracker:status");
    expect(t).not.toContain("select:status:");
    expect(t).not.toMatch(/^\*\*Status:\*\*/m);
  });

  it("resolves the Subject dashboard's folder arguments at read time", () => {
    const t = studyTemplate("Subject Index.md");
    // Both of these used to carry a creation-time literal — `{{folder}}` and
    // `{{name}}` — that a folder rename left pointing at a path which no
    // longer existed. tasks-table already defaults to its host note's folder,
    // and new-topic now resolves its subject the same way, so neither can go
    // stale. The New Topic case was the worse of the two: newContainer would
    // recreate the renamed-away folder rather than fail.
    // `new-container` since 2.40, when the dashboard became composed — the
    // catalogue emits the type-agnostic spelling and widgets.ts routes both.
    // What this test is about is the ABSENCE of an argument after it.
    expect(t).toContain("button:study:new-container\n");
    expect(t).toContain("tasks-table\n");
    expect(t).not.toContain("{{folder}}");
    expect(t).not.toContain("{{name}}");
  });

  it("makes the Topic dashboard's banner its only navigation", () => {
    const t = studyTemplate("Topic Index.md");
    // The banner is the whole trail: Home, then the subject. The template
    // used to carry a `links:home,up#journals` card above it, but `up`
    // resolves to the parent folder note — the subject — which the trail
    // already names, so the card's two destinations were Home and a
    // duplicate of a crumb.
    expect(t).toContain("journal-header");
    expect(t).not.toContain("links:home,up#journals");
    expect(t).not.toMatch(/^header:.*Topic Dashboard/m);
  });

  it("gives the Topic dashboard real properties instead of prose", () => {
    const t = studyTemplate("Topic Index.md");
    // Status was a hardcoded `**Status:** Active` line that could never say
    // anything else; Subject was `{{subject}}` resolved at creation, so a
    // renamed subject folder left it stale. Both are frontmatter now — one
    // editable, one read live by the banner's trail.
    expect(t).toMatch(/^type: topic$/m);
    expect(t).toMatch(/^subject: \{\{subject\}\}$/m);
    expect(t).toMatch(/^status: in-progress$/m);
    expect(t).toContain("tracker:status");
    expect(t).not.toContain("select:status:");
    expect(t).not.toMatch(/^\*\*Subject:\*\*/m);
    expect(t).not.toMatch(/^\*\*Status:\*\*/m);
  });

  it("states the topic's totals as a band, not a sentence", () => {
    const t = studyTemplate("Topic Index.md");
    // The band replaces the one-line confidence-summary under its own
    // collapsible Progress header, matching how the subject page one level
    // up already states its totals.
    //
    // `stats-band` SINCE 4.46, AND BARE. The word changed when `topic-stats` and
    // `journal-totals` merged; what it DRAWS did not, because a bare band at
    // container scope resolves to the `progress` preset, which is `topic-stats`
    // cell for cell. Asserted as the composed line rather than as the old word,
    // and asserted BARE — writing `stats-band:progress` would be the note
    // restating a rule the plugin already applies.
    expect(t).toContain("stats-band");
    expect(t).not.toContain("stats-band:");
    expect(t).not.toContain("confidence-summary");
    expect(t).not.toMatch(/^header:.*Progress/m);
  });

  it("gives an index note a created stamp but no date of its own", () => {
    const t = studyTemplate("Topic Index.md");
    // A `date` here would be read as study activity by buildTopicsTable,
    // reporting the day the topic was made as the day it was last worked on.
    expect(t).toMatch(/^created: \{\{created\}\}$/m);
    expect(t).not.toMatch(/^date:/m);
  });
});

describe("subject Progress section", () => {
  const asset = studyFile;

  const srcOf = (name: string): string =>
    readSrc(name);

  it("folds Activity into Progress as a single section", () => {
    const t = studyTemplate("Subject Index.md");
    expect(t).toContain("header:\u{1F4C8} Progress");
    expect(t).toContain("activity-chart");
    // The separate collapsible Activity sub-header is gone — the heatmap now
    // sits directly under Progress.
    expect(t).not.toContain("Activity\n```");
  });

  it("carries no explanatory prose", () => {
    // The paragraph explained the old bar chart's open-vs-completed encoding,
    // which genuinely needed the help. A heatmap with a Less→More legend and a
    // labelled stat rail says the same things itself, so the prose was three
    // lines of restatement standing between the header and the data.
    const t = studyTemplate("Subject Index.md");
    expect(t).not.toContain("activity bars");
    expect(t).not.toContain("Aggregates every lesson");
  });

  it("merges confidence into the heatmap rail rather than its own widget", () => {
    // One stat rail, not a sentence above three stat cells: the confidence line
    // and the month stats were the same class of information rendered two ways.
    const t = studyTemplate("Subject Index.md");
    expect(t).not.toContain("confidence-summary");
    expect(srcOf("widgets.ts")).toContain("confidence: stats");
  });

  it("gives all four study templates a managed tracker region", () => {
    // The picker needs somewhere to write. Without markers, "+ Add tracker"
    // on a study note falls back to creating a region, and the four shipped
    // templates should not need that on their first use.
    for (const file of [
      "Subject Index.md",
      "Topic Index.md",
      "template-lesson.md",
      "template-practice.md",
    ]) {
      const t = asset(file);
      expect(t).toContain("# chronoanvil:trackers:start");
      expect(t).toContain("# chronoanvil:trackers:end");
      // Inside the banner's fence, so the grid welds beneath the strip rather
      // than becoming a second block.
      expect(t.indexOf("journal-header")).toBeLessThan(
        t.indexOf("# chronoanvil:trackers:start")
      );
    }
  });

  it("takes confidence and status from the registry on every study template", () => {
    // The property names are unchanged — the `base` blocks and year-view.ts
    // still read `confidence` and `status`. What changed is where the widget
    // comes from: one registry entry each, relabelable in one place, instead
    // of a literal spelled out four times with two different vocabularies.
    const lesson = asset("template-lesson.md");
    expect(lesson).toContain("tracker:confidence");
    expect(lesson).toContain("tracker:status");
    expect(lesson).not.toContain("slider:confidence");
    expect(lesson).not.toContain("select:status:");

    for (const f of ["Subject Index.md", "Topic Index.md", "template-practice.md"]) {
      expect(asset(f)).toContain("tracker:status");
      expect(asset(f)).not.toContain("select:status:");
    }
  });

  it("gives the Subject and Topic dashboards a review section", () => {
    // The only surface in the study journal that gives a reason to reopen a
    // note that already exists.
    //
    // TWO TITLES FOR ONE SECTION AS OF 4.70, and the difference is the row. On
    // a Subject index the queue is the opening cell of "🔁 Due and open" — it
    // sits beside the open-task table and one bar spans both — and on a Topic
    // index there is no such row, because Open tasks is not composed there, so
    // it keeps the title it has always written. `journal-sections.ts` carries
    // the argument; this is what each page ends up saying.
    const BAR: Record<string, string> = {
      "Subject Index.md": "header:🔁 Due and open",
      "Topic Index.md": "header:🔁 Review",
    };
    for (const f of ["Subject Index.md", "Topic Index.md"]) {
      const t = asset(f);
      expect(t).toContain("review-queue");
      expect(t).toContain(BAR[f]);
      // A confidence trend, still — as of 2.35 held in the note's managed
      // charts region rather than written out as a `confidence-trend`
      // directive. What the dashboard shows is what this is pinning.
      expect(t).toContain("jchart:j1:trend:confidence");
    }
  });

  it("keeps the review queue out of the leaf templates", () => {
    // A queue on a lesson would list the lesson's own folder — the topic —
    // from inside one of its items. The queue belongs on a dashboard.
    for (const f of ["template-lesson.md", "template-practice.md"]) {
      expect(asset(f)).not.toContain("review-queue");
    }
  });

  it("keeps the status vocabulary's load-bearing consumers working", () => {
    // The reason the vocabulary unified towards in-progress/completed rather
    // than active/paused/done: the note tables were the load-bearing
    // consumers, and unifying the other way would have meant rewriting them
    // for no gain.
    //
    // Those consumers were two `base` filter lines in this template until
    // 2.54 (`status != "completed"` and its twin) and are now one predicate in
    // tables.ts, because the tables became native — so the claim is asserted
    // against the predicate. The other half is unchanged: a leaf note is still
    // seeded `in-progress`, and that is still what the tables read.
    expect(studyTemplate("template-lesson.md")).toMatch(
      /^status: in-progress$/m
    );
    expect(isCompletedStatus("completed")).toBe(true);
    expect(isCompletedStatus("in-progress")).toBe(false);
    // Hand-typed and dropdown-picked values reach this the same way.
    expect(isCompletedStatus(" Completed ")).toBe(true);
    expect(isCompletedStatus(undefined)).toBe(false);
  });

  it("uses the type-agnostic banner directive on every study template", () => {
    // `study-header` still renders (notes on disk carry it), but the shipped
    // templates name the widget for what it now is: the banner for any journal
    // type, not Study's.
    for (const f of [
      "Subject Index.md",
      "Topic Index.md",
      "template-lesson.md",
      "template-practice.md",
    ]) {
      expect(asset(f)).toContain("journal-header");
      expect(asset(f)).not.toMatch(/^study-header$/m);
    }
  });

  it("keeps related-lessons outside the Practice template's region", () => {
    // It is not a registry tracker and nothing can remove it, so it has no
    // business inside the span the picker splices into.
    const t = asset("template-practice.md");
    expect(t.indexOf("related-lessons")).toBeLessThan(
      t.indexOf("# chronoanvil:trackers:start")
    );
  });

  it("shares one confidence calculation between both surfaces", () => {
    // The standalone confidence-summary widget still exists for other notes, so
    // both it and the rail must read the same helper — two copies of the
    // averaging would drift into reporting different numbers for one subject.
    const tb = srcOf("tables.ts");
    expect(tb).toContain("export function confidenceStats");
    expect(tb.match(/confidenceStats\(/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it("keeps the selected quarter outside the rebuilt widget", () => {
    // The regression this pins is invisible in a screenshot: the widget is
    // wrapped in liveScopedWidget, which rebuilds the subtree on ANY change
    // under the subject folder. Period state held inside the build closure
    // would reset on every edit, so ticking a task would snap the view back
    // to the current quarter mid-browse. The `let quarter` must live in the
    // case block that outlives the rebuilds, and be passed back in on each
    // build.
    // Was a slice from the case label to the switch's `default:`. The body
    // moved to ./directive-regions.ts in 2.56.25, so the slice would now stop
    // at a one-line delegation and assert on nothing.
    const body = fnBody("buildActivityChartRegion");
    expect(body).toMatch(/let quarter/);
    expect(body).toContain("initialQuarter: quarter");
    expect(body).toContain("onQuarterChange");
  });

  it("drops the Chart.js bar chart but keeps Chart.js for trackers", () => {
    const c = srcOf("chart-render.ts");
    expect(c).not.toContain("ACTIVITY_OPEN_COLOR");
    expect(c).not.toContain("drawActivityChart");
    // Tracker line/bar charts still need it.
    expect(c).toContain("new Chart(");
  });
});
describe("study templates use the ChronoAnvil task marker", () => {
  const asset = studyFile;
  // The Lesson/Practice templates carry content-level checkboxes and must ship
  // ChronoAnvil's `- ( )` (which the study dashboards count from the body via
  // countBodyTasks), never Obsidian's `- [ ]` (invisible to that path). The
  // Topic template's checkbox became the `path:learning-path` widget, so it
  // holds no literal task line — but it must still never emit `- [ ]`.


  for (const name of ["template-lesson.md", "template-practice.md", "Topic Index.md"]) {
    it(`${name} never ships a native \`- [ ]\` checkbox`, () => {
      expect(asset(name)).not.toMatch(/^- \[[ xX]?\]/m);
    });
  }

  // Both compose to the catalogue's one checklist key. Study's assets used to
  // carry `review` on the Lesson and `checklist` on the Practice; the section
  // has a single region and nothing was compatible with those two names but
  // the assets themselves, which 2.42 replaced.
  for (const [name, key] of [
    ["template-lesson.md", "tasks"],
    ["template-practice.md", "tasks"],
  ] as const) {
    it(`${name} drives its checklist as a tasks widget with an empty region`, () => {
      const text = asset(name);
      // The widget and its body region ship, so the note has a task list
      // with an add-input from the first render.
      expect(text).toContain(`tasks:${key}`);
      expect(text).toContain(`<!--chronoanvil:${key}`);
      // And the region ships *empty*, exactly as the topic template's
      // learning-path does. The lesson and practice templates used to seed a
      // boilerplate `- ( )` line each ("#status/understood <title>",
      // "Complete all practice exercises"); both restated the note's own
      // status property back to it, and the lesson's also repeated the title
      // the banner already shows. Removing them means a topic's Open count
      // reflects work the reader declared rather than what the template
      // wrote to itself.
      expect(readNoteRegion(text, key).trim()).toBe("");
    });
  }

  it("no study template seeds a checkbox of its own", () => {
    for (const name of ["template-lesson.md", "template-practice.md", "Topic Index.md"]) {
      expect(asset(name)).not.toMatch(/^- \( \)/m);
    }
  });

  it("the topic template drives Learning Path and Resources as widgets", () => {
    const text = studyTemplate("Topic Index.md");
    // Learning Path is the re-orderable path widget with its body region. The
    // bar keeps Study's label; the region key is the catalogue's since 2.41.
    expect(text).toContain("header:🧭 Learning Path");
    expect(text).toContain("path:path");
    expect(text).toContain("<!--chronoanvil:path");
    // Resources is three joined attachment sections, each with a body region.
    for (const key of ["res-docs", "res-tutorials", "res-practice"]) {
      expect(text).toContain(`attach:${key}|`);
      expect(text).toContain(`<!--chronoanvil:${key}`);
    }
    // Related was removed for simplicity (redundant with the subject links).
    expect(text).not.toContain("header:🔗 Related");
    expect(text).not.toContain("subject index");
  });
});

describe("summaries do not regress to a cache-based task counter", () => {
  // An architecture guard rather than a behaviour test, because the bug it
  // targets has no observable pure-logic surface: the old util.ts::taskCounts
  // read Obsidian's listItems cache, which by design cannot see a ChronoAnvil
  // `- ( )` line, so any summary calling it reported a confident, silent zero.
  // Nothing threw and nothing looked wrong. That counter has now been deleted;
  // these checks keep any cache-based reader from creeping back onto a surface
  // that counts ChronoAnvil tasks. Every task-counting surface now reads note
  // bodies (tables.ts::sumChronoAnvilTasks / sumBodyTasks).
  const src = (name: string): string =>
    readSrc(name);

  it("calendar.ts counts through tables.ts, not a cache counter", () => {
    expect(src("calendar.ts")).not.toMatch(/taskCounts\(/);
    expect(src("calendar.ts")).toContain("sumChronoAnvilTasks");
  });

  it("diary-header.ts counts nothing at all now", () => {
    // Was home-hero.ts until 2.13.7, when the greeting moved inside the calendar
    // card and took the name of what it actually is — and this asserted that its
    // open-tasks cell read note BODIES (`sumChronoAnvilTasks`) rather than the
    // listItems cache, which cannot see a ChronoAnvil `- ( )` line.
    //
    // 4.13.1 §3 deleted the cell, the strip it sat in and the whole hero. The
    // guard is inverted rather than removed: the file counts nothing, so neither
    // counter may appear in it, and the day a number comes back to this surface
    // this fails and asks which one it is reading.
    expect(src("diary-header.ts")).not.toMatch(/^\s*taskCounts,$/m);
    expect(src("diary-header.ts")).not.toContain("sumChronoAnvilTasks");
  });

  it("study surfaces count ChronoAnvil `- ( )` from bodies, not the cache", () => {
    // The study dashboards (topics-table in tables.ts, the Activity chart in
    // chart-render.ts) used to read util.ts::taskCounts because their Lesson,
    // Practice and Topic templates shipped native `- [ ]` checkboxes. Those
    // templates now ship ChronoAnvil `- ( )`, which the listItems cache can't see —
    // so both surfaces read note bodies through countBodyTasks instead. Pin
    // that so the cache-based reader can't creep back onto these surfaces.
    // Match imports and calls, not the word in a comment — the history of why
    // the counter moved is worth keeping in prose. A named import sits alone on
    // an indented line (`  taskCounts,`); a call is `taskCounts(`.
    const namedImport = /^\s*taskCounts,\s*$/m;
    const call = /taskCounts\(/;
    for (const name of ["query.ts", "chart-render.ts"]) {
      expect(src(name)).not.toMatch(namedImport);
      expect(src(name)).not.toMatch(call);
    }
    expect(src("chart-render.ts")).toContain("countBodyTasks");
    expect(src("tables.ts")).toContain("countBodyTasks");
  });
});

describe("shipped stylesheet", () => {
  const css = readCss();
  const monthly = composeEntryTemplate("monthly");

  it("declares every design token inside :root, reachable on both themes", () => {
    // 2.51.5 opened `.theme-light {` partway through the :root block in order to
    // override one token. That closed :root early and swept everything after it
    // — the type scale, the mood palette, the activity ramp, the event palette,
    // the area hues — into the light-theme rule, so on a dark theme every one of
    // them resolved to nothing. The study heatmap lost its greens, the calendar
    // its mood dots, the events their colours.
    //
    // The existing `toContain("--ca-act-1:")` assertions did not catch it: the
    // declarations were all still present in the file, just unreachable. So this
    // checks *location*, not existence, and separately forbids any rule opening
    // inside the block — which is the mistake itself rather than its symptoms,
    // and will catch the next token that gets orphaned the same way.
    const fromRoot = css.slice(css.indexOf(":root {"));
    const block = fromRoot.slice(0, fromRoot.indexOf("\n}") + 2);
    for (const token of [
      "--ca-radius-sm",
      "--ca-radius-md",
      "--ca-radius-pill",
      "--ca-widget-gap",
      "--ca-text-2xs",
      "--ca-text-xs",
      "--ca-text-sm",
      "--ca-text-base",
      "--ca-caps-weight",
      "--ca-caps-tracking",
      // `--ca-band-recess` was here and is deleted (4.13.1 §3b). It was the
      // token this whole check exists for — the one 2.51.5 opened a
      // `.theme-light {` mid-block to override — and the diary card, its only
      // reader, stopped being made of sunk bands. The list is a SAMPLE of each
      // family rather than a census, so removing an entry costs nothing here;
      // what would cost something is the deleted token going on being asserted,
      // since a token that exists only because a test asks for it is the shape
      // this file's own `--ca-heat-max-w` note describes.
      "--ca-mood-1",
      "--ca-mood-5",
      "--ca-act-1",
      "--ca-act-4",
      "--ca-ev-red",
      "--ca-ev-grey",
    ]) {
      expect(block).toContain(`${token}:`);
    }
    // No rule may open inside the block. `{` appears once, in `:root {` itself.
    expect(block.slice(block.indexOf("{") + 1)).not.toContain("{");
  });

  it("except the two that read a theme variable, which belong on body", () => {
    // THE AREA HUES LEFT THE LIST ABOVE IN 3.6, and the reason is the exact
    // inverse of the reason the list exists. Every other token declares a
    // literal, so `:root` is the widest reachable place to put it. These two
    // declare `var(--interactive-accent)` — and Obsidian declares
    // `--interactive-accent` on `body`, one level BELOW `:root`.
    //
    // A custom property is substituted where it is declared, so from `:root`
    // the lookup found nothing, `--ca-area-diary` computed to the
    // guaranteed-invalid value, and every descendant inherited that. It is the
    // same failure the test above was written for — a token present in the file
    // and unreachable at the element — arrived at from the other direction, and
    // this test would have been the one to catch it had the distinction been
    // named. It is named now.
    const fromBody = css.slice(css.indexOf("\nbody {"));
    const block = fromBody.slice(0, fromBody.indexOf("\n}") + 2);
    for (const token of [
      "--ca-area-diary",
      "--ca-area-diary-rgb",
      "--ca-area-journals",
      "--ca-area-journals-rgb",
    ]) {
      expect(block, token).toContain(`${token}:`);
    }
    // And they are not ALSO in :root — two declarations of one token, one of
    // them broken, is worse than the bug.
    const fromRoot = css.slice(css.indexOf(":root {"));
    const rootBlock = fromRoot.slice(0, fromRoot.indexOf("\n}") + 2);
    expect(rootBlock).not.toContain("--ca-area-diary:");
  });

  it("styles every note key the monthly template joins into one box", () => {
    // The joined highlights/challenges box is CSS-only — buildNote emits the
    // `journal-note--<key>` hook and the stylesheet does the rest. If a key is
    // renamed in the template and not here, the box silently falls apart into
    // two plain fields with no error anywhere.
    for (const key of ["highlights", "challenges"]) {
      expect(monthly).toContain(`list:${key}:`);
      expect(css).toContain(`.ca-journal-list--${key}`);
    }
  });

  it("styles each topic Resources section under the shared header", () => {
    // The three Resources sections (Docs/Tutorials/Practice) are grouped by the
    // shared header + their own labels, and each carries a `.journal-attach--<key>`
    // rule so its label/zone styling lands. A renamed key with no matching rule
    // would fall back to the bare attach look with no section styling.
    // The keys come from STUDY_JOURNAL.layout now, not from a hand-written
    // asset — which is exactly why they still have to be these three: existing
    // Topic notes keep their content in `<!--chronoanvil:res-docs-->` and friends,
    // and a composed template emitting different keys would orphan all of it.
    const topic = studyTemplate("Topic Index.md");
    for (const key of ["res-docs", "res-tutorials", "res-practice"]) {
      expect(topic).toContain(`attach:${key}|`);
      expect(css).toContain(`.ca-journal-attach--${key}`);
    }
    // Each section keeps a fully-rounded input bar — the sections are NOT fused
    // into one squared box (that clipped each bar's inner corners), so none of
    // the per-key zone rules zero out a corner or drop a border.
    expect(css).not.toMatch(/\.journal-attach--res-\w+\s+\.ca-journal-attach-zone\s*\{[^}]*border-radius:\s*0/);
    expect(css).not.toMatch(/\.journal-attach--res-\w+\s+\.ca-journal-attach-zone\s*\{[^}]*border-bottom:\s*none/);
  });

  it("styles the activity heatmap and its own colour ramp", () => {
    // The heatmap is pure DOM + CSS now (no canvas), so every visual it has
    // comes from these hooks. The ramp is deliberately separate from
    // --ca-mood-*: that one runs red→green because low mood is bad, whereas a
    // low task count is just less work and wants one hue at rising strength.
    for (const cls of [
      ".ca-journal-activity-heatmap",
      ".ca-journal-act-grid",
      ".ca-journal-act-cell",
      ".ca-journal-act-arrow:disabled",
    ]) {
      expect(css).toContain(cls);
    }
    for (let b = 1; b <= 4; b++) {
      expect(css).toContain(`--ca-act-${b}:`);
      expect(css).toContain(`.ca-journal-act-cell.ca-act-${b}`);
    }
  });

  it("sizes heatmap cells in fixed px, whatever the column does", () => {
    // THE REGRESSION THIS PINS, AND THE ASSERTION MOVED IN 4.38.4 WITHOUT THE
    // RULE MOVING. An early version used `1fr` columns with a max-width on the
    // grid, and `aspect-ratio: 1` on the cell inflated each square to ~46px so one
    // month towered over the section to show a handful of days. A calendar wants a
    // legible cell, not a proportional one.
    //
    // The columns are flexible again — the rail has to fill its section, which is
    // what the heatmap one widget over already does — so pinning
    // `repeat(7, <n>px)` would now pin the wrong half. **The cell's own stated
    // size is the mechanism**, exactly as `.ca-jjh-cell` is inside its
    // `minmax(cell, 1fr)` tracks: a wider track is wider SPACING, not a bigger
    // square.
    expect(css).toMatch(/\.ca-journal-act-cell\s*\{[^}]*width:\s*\d+px/);
    expect(css).toMatch(/\.ca-journal-act-cell\s*\{[^}]*height:\s*\d+px/);
    expect(css).not.toMatch(/\.ca-journal-act-cell\s*\{[^}]*aspect-ratio/);
    // AND THE TRACK HAS A CEILING, or a 1050px dashboard gives each column 46px
    // and the month reads as a scatter of loose squares. A bare `1fr` is the shape
    // that fails, so it is the shape that is refused.
    expect(css).toMatch(
      /\.ca-journal-act-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(\d+px,\s*\d+px\)\)/
    );
    expect(css).not.toMatch(/\.ca-journal-act-grid\s*\{[^}]*repeat\(7,\s*1fr\)/);
    // The cell is centred in a track it no longer fills, or the days drift left
    // and stop lining up with the weekday letters above them.
    expect(css).toMatch(/\.ca-journal-act-grid\s*\{[^}]*justify-items:\s*center/);
  });

  it("gives the three months the whole section (4.38.4)", () => {
    // MEASURED: a wrapping flex row of three fixed 172px panels ended at x=650 in
    // a section running to x=780, so the rail sat in the left two-thirds of a box
    // it was the only occupant of. Three equal tracks is the heatmap's answer one
    // level up — the panels take a third each.
    const at = css.indexOf(".ca-journal-act-months {");
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    // `minmax(0, 1fr)` AND NOT `1fr`: a track's default minimum is `auto`, which
    // is the panel's content, so three 172px panels in a 400px pane would overflow
    // rather than shrink.
    expect(block).not.toMatch(/grid-template-columns:\s*repeat\(3,\s*1fr\)/);
    // Centred, so on a wide section the months distribute rather than bunching at
    // the left with the slack on the right — which is the thing being fixed.
    expect(block).toContain("justify-items: center");
  });

  it("styles the Learning Path widget", () => {
    // The `path:` widget only looks like a checklist table because the stylesheet
    // carries its row/move/number rules. Pin the load-bearing hooks.
    for (const cls of [
      ".ca-journal-path-row",
      ".ca-journal-path-num",
      ".ca-journal-path-move",
      ".ca-journal-path-move:disabled",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("cancels the widget gap so the joined box is one box", () => {
    // The bug this pins: `.ca-journal-widget-block` separates its children with
    // flex `gap`, which `margin-bottom: 0` cannot close — the first attempt
    // shipped a 10px trough straight down the middle of a "single" box. The
    // cancel has to reference the same token the gap uses, so retuning the
    // spacing can't reopen the seam.
    expect(css).toContain("--ca-widget-gap");
    expect(css).toMatch(/gap:\s*var\(--ca-widget-gap\)/);
    expect(css).toMatch(
      /\.ca-journal-list--challenges\s*\{[^}]*margin-top:\s*calc\(-1 \* var\(--ca-widget-gap\)\)/
    );
  });

  it("keeps :has() out of the plain hover rule", () => {
    // One unsupported selector invalidates its whole group, so a `:has()` in
    // the main hover list would take ordinary hover down with it. It belongs in
    // its own rule.
    // Comments are stripped first: the explanatory comment above the :has()
    // rule contains both commas and the word hover, and would otherwise be
    // parsed as part of the selector list.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const mixed = bare
      .split("}")
      .map((r) => r.split("{")[0])
      .filter((sel) => sel.includes(":has(") && sel.includes(":hover"))
      .filter((sel) => sel.split(",").some((one) => !one.includes(":has(")));
    expect(mixed).toEqual([]);
  });

  it("drops the callout kinds no template ships any more", () => {
    for (const kind of ["highlights", "challenges", "learnings", "goals"]) {
      expect(css).not.toContain(`data-callout="${kind}"`);
    }
  });

  it("keeps the callout kinds still produced in code", () => {
    // `empty` is built by tables.ts::emptyCallout, `study` by the home page's
    // subject cards, `note` by hand-written vault notes.
    for (const kind of ["note", "empty", "study"]) {
      expect(css).toContain(`data-callout="${kind}"`);
    }
  });
});

describe("the archive script", () => {
  const read = (n: string): string =>
    readFileSync(resolve(__dirname, "..", n), "utf8");
  const src = (): string => read("tools/archive.mjs");

  // ── WHAT THIS PINS, AND WHY IT IS WORTH A TEST ──────────────────────────
  //
  // The archives were made by hand until 4.34.4, and by hand is how they went
  // wrong: three times in one session a `tar` ran in a subshell that had
  // inherited a `cd` from earlier in the same command line, and wrote a valid,
  // correctly named, 410-byte archive of nothing. Exit code 0. The only symptom
  // was the file size.
  //
  // An archive is opened for the first time on the day it is the only copy of
  // something, so the properties below are the ones that make it worth having at
  // all — and each of them is a line somebody could delete as redundant.

  it("anchors every path to the repository, never to the caller's cwd", () => {
    // The bug, at its root: the script must not have a cwd it can be wrong
    // about. `zip` is given an explicit `cwd` per call rather than the process
    // being moved to it.
    expect(src()).toContain(
      'const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");'
    );
    expect(src()).toContain("{ cwd: from }");
    expect(src()).not.toContain("process.chdir");
  });

  it("reads back what it wrote, and deletes an archive that lies", () => {
    // THE WHOLE POINT. Writing the file proves nothing — a hollow zip is a valid
    // zip. What proves it is opening the thing on disk and finding the files its
    // name claims.
    //
    // AND THE DELETION IS THE HALF THAT IS EASY TO SOFTEN into a warning. A
    // hollow archive left on disk is indistinguishable from a good one at a
    // glance and will be believed later; a missing one fails loudly the moment
    // it is needed.
    expect(src()).toContain("async function verify(");
    expect(src()).toContain('await run("unzip", ["-l", archive])');
    const at = src().indexOf("async function verify(");
    const body = src().slice(at, src().indexOf("\n}\n", at));
    expect(body).toContain("await rm(archive, { force: true })");
  });

  it("refuses to file a stale build under a new number", () => {
    // The one error verification cannot catch, because everything in the archive
    // is real: bump the version, archive, forget to package, and the PREVIOUS
    // build is filed as the new one.
    expect(src()).toContain('readFile(path.join(folder, "manifest.json")');
    expect(src()).toContain("if (built.version !== version)");
  });

  it("will not overwrite a version's archive without being told to", () => {
    // An archived version is the record of what shipped under that number, and
    // this repo has no git to recover one from — `RESUME.md` is in the source
    // zips for exactly that reason.
    expect(src()).toContain("--force");
    expect(src()).toContain("already exists");
  });

  it("keeps the build output out of the source archive", () => {
    // Two copies of one build, in two archives beside each other, that drift the
    // first time either is rebuilt.
    expect(src()).toMatch(/SOURCE_SKIP = new Set\(\[[^\]]*"node_modules"/);
    expect(src()).toMatch(/SOURCE_SKIP = new Set\(\[[^\]]*"dist"/);
  });

  it("is reachable as a script rather than a command to remember", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.archive).toBe("node tools/archive.mjs");
    // And the pair that is always run together has one name.
    expect(pkg.scripts.release).toContain("npm run package");
    expect(pkg.scripts.release).toContain("tools/archive.mjs");
  });
});

describe("package manifest", () => {
  const read = (n: string): string =>
    readFileSync(resolve(__dirname, "..", n), "utf8");

  it("declares every file an installed plugin folder needs", () => {
    // The 2.10 build zip shipped without assets/, which loads fine and then
    // fails at first use because readAsset resolves manifest.dir at runtime.
    // tools/package.mjs is the fix; this pins its contents so a new required
    // file can't be added to the plugin without being added to the package
    // step.
    //
    // The licence files are on the list for the same reason and a stronger
    // one: a plugin folder is a conveyed copy, AGPL-3.0 section 4 wants the
    // licence to travel with it, and the section 7 attribution and naming
    // terms bind only someone who has actually been given them — including the
    // recipient who may fork and needs to know the name is not part of the
    // grant. That is a compliance bug rather than a missing file, and exactly
    // the kind that reappears quietly when this list is edited.
    const pkg = read("tools/package.mjs");
    for (const f of [
      "main.js",
      "manifest.json",
      "styles.css",
      "assets",
      "LICENSE",
      "NOTICE",
    ]) {
      expect(pkg).toContain(`"${f}"`);
    }
  });

  it("exposes a package script", () => {
    expect(JSON.parse(read("package.json")).scripts.package).toBeTruthy();
  });

  it("generates styles.css from styles/ rather than carrying an edited copy", () => {
    // styles.css was one 9,794-line file until 2.56.25 and is now generated by
    // tools/build-css.mjs from styles/*.css, concatenated in filename order.
    //
    // The failure this guards against is editing the generated file. It works
    // — the plugin picks it up, the change appears in Obsidian — right up
    // until the next build silently reverts it. Nothing else in the project
    // would notice, because styles.css is gitignored and the edit never
    // reaches a diff.
    //
    // Order is the other half. CSS cascades, 00-tokens.css defines the custom
    // properties every later file reads, and the numeric prefixes are what
    // encode that. Comparing against a sorted rebuild asserts the ordering rule
    // as much as the contents.
    //
    // REBUILT THROUGH composeCss AS OF 5.0.1, not through `parts.join("\n")`.
    // The build strips comments now — see tools/build-css.mjs — so the plain
    // concatenation this compared against stopped being what the build produces,
    // and the choice was between teaching the test the new shape or keeping a
    // second implementation of it here that would drift. What the assertion is
    // FOR has not changed: styles.css must be exactly what the build makes of
    // styles/, so a hand-edit of the generated file fails. That the composition
    // is itself correct is test/css-build.test.ts's question, not this one's.
    const parts = readdirSync(resolve(__dirname, "..", "styles"))
      .filter((f) => f.endsWith(".css"))
      .sort();
    expect(parts.length).toBeGreaterThan(1);
    const rebuilt = composeCss(
      parts.map((name) => ({
        name,
        css: readFileSync(resolve(__dirname, "..", "styles", name), "utf8"),
      }))
    );

    // styles.css is gitignored and generated, so on a fresh clone it does not
    // exist until the `pretest` hook runs it. Reading it directly gave a bare
    // ENOENT naming a missing file, which is the same wrong-thing-named failure
    // test/sources.ts was written about: the problem is not that the file is
    // absent, it is that vitest was invoked without the hook that builds it.
    if (!existsSync(resolve(__dirname, "..", "styles.css"))) {
      throw new Error(
        "styles.css has not been generated. Run `npm test`, which builds it " +
          "via the pretest hook, rather than vitest directly."
      );
    }
    expect(repoFile("styles.css")).toBe(rebuilt);
  });

  it("refuses to build a stylesheet whose comments close early", () => {
    // THIS COST A RELEASE. A paragraph added to the middle of a block comment
    // carried its own `*/`, so the text after it parsed as a selector and the
    // CSS parser — which never complains — dropped the rule that followed:
    // `position: relative` on the widget block. The drag grip that reads it then
    // anchored to whatever WAS positioned above it, which is the code-block
    // widget in Live Preview and the note's sizer in reading view. Perfect in
    // one mode, gone in the other.
    //
    // Nothing else could have caught it: the build is a concatenation and does
    // not parse, the suite reads the stylesheet as text, and a browser reports
    // nothing. So the build asserts the one property text alone gets wrong.
    // NAMED `stripComments` SINCE 5.0.1, when the walk that checks this became
    // the same walk that removes the comments from the shipped file. One state
    // machine rather than two that could disagree about where a comment ends —
    // which would be this bug again, with the check passing on text the strip
    // then cut in the wrong place. test/css-build.test.ts asserts it still
    // throws; this asserts the build still calls it.
    const build = read("tools/build-css.mjs");
    expect(build).toContain("stripComments");
    // Every `*/` closes a comment that was open, in every file, before the
    // concatenation is written.
    for (const f of readdirSync(resolve(__dirname, "..", "styles")).filter((n) =>
      n.endsWith(".css")
    )) {
      const css = readFileSync(resolve(__dirname, "..", "styles", f), "utf8");
      let open = false;
      for (let i = 0; i < css.length - 1; i++) {
        const two = css[i] + css[i + 1];
        if (!open && two === "/*") {
          open = true;
          i++;
        } else if (open && two === "*/") {
          open = false;
          i++;
        } else if (!open && two === "*/") {
          expect.fail(`${f}:${css.slice(0, i).split("\n").length} closes a comment that was not open`);
        }
      }
      expect(open, `${f} ends inside an unclosed comment`).toBe(false);
    }
  });

  it("keeps manifest, package and versions in step", () => {
    // A TESTING BUILD IS NUMBERED BELOW THE HEAD AND IS NOT IN THE LEDGER.
    //
    // `versions.json` is the record of what SHIPPED — Obsidian reads it to work
    // out which release a given app version may install — so a build that is not
    // a release must not be in it, and a build numbered below the head is not a
    // release by construction: Obsidian's updater will never offer it over the
    // version already out.
    //
    // So the invariant is not "the manifest version is in versions.json". It is
    // the pair below, and stating it this way catches the mistake the old
    // spelling could not: a testing build's number reaching the ledger, where it
    // would sit forever as a release nobody made.
    //
    // MEMBERSHIP IS THE QUESTION, NOT ORDER. An earlier spelling of this made
    // the rule depend on whether the manifest version outranked the ledger's
    // head, which is a fact about numbering rather than about what a build IS —
    // and it gets the answer wrong in both directions, because a testing build
    // can be numbered either side of the release it is being tested against.
    //
    // What is always true: the two files that state the version agree, and a
    // version the ledger DOES list agrees with it about `minAppVersion`. A
    // version it does not list is a build that has not shipped, which is a state
    // this repo is deliberately in whenever a testing build is current.
    //
    // THE SAME RULE IS IN `tools/check-version-agreement.mjs`. Two readers of one
    // fact, which is the shape this project spends releases removing — it stays
    // two spellings only because that tool is a standalone `.mjs` run by
    // `npm run check:versions` with nothing to import from the suite. Each names
    // the other, so a change to one is a change somebody goes looking for.
    const manifest = JSON.parse(read("manifest.json"));
    const versions = JSON.parse(read("versions.json"));
    expect(manifest.version).toBe(JSON.parse(read("package.json")).version);

    const registered = versions[manifest.version];
    if (registered !== undefined) {
      expect(registered).toBe(manifest.minAppVersion);
    }

    // AND EVERY VERSION THE LEDGER LISTS NAMES A REAL MINIMUM. The check above
    // says nothing when the current build is unreleased, so this is what keeps
    // the file itself honest on those days.
    for (const [v, min] of Object.entries(versions)) {
      expect(typeof min, v).toBe("string");
      expect((min as string).length, v).toBeGreaterThan(0);
    }
  });
});

// ── 2.12: list entries ───────────────────────────────────────────────────
describe("parseEntries / serializeEntries", () => {
  it("treats each non-blank line as its own entry", () => {
    // The whole point of the widget: two sentences on two lines are two
    // highlights, not one paragraph that happens to wrap.
    const text = [
      "Financial adviser said my credit is healthy enough for the loan.",
      "My brother's birthday. We went out for dinner in Perth.",
    ].join("\n");
    expect(parseEntries(text)).toHaveLength(2);
  });

  it("drops blank lines rather than making empty entries", () => {
    expect(parseEntries("\n\na\n\n\nb\n\n")).toEqual(["a", "b"]);
  });

  it("trims surrounding whitespace on each entry", () => {
    expect(parseEntries("  a  \n\tb\t")).toEqual(["a", "b"]);
  });

  it("is empty for an empty or whitespace-only region", () => {
    expect(parseEntries("")).toEqual([]);
    expect(parseEntries("   \n\t\n")).toEqual([]);
  });

  it("round-trips", () => {
    const entries = ["first thing", "second thing", "third"];
    expect(parseEntries(serializeEntries(entries))).toEqual(entries);
  });

  it("flattens a newline inside an entry instead of splitting the list", () => {
    // An entry containing a newline would re-parse as two entries, so the list
    // would change shape between a write and the next read.
    expect(serializeEntries(["one\ntwo"])).toBe("one two");
    expect(parseEntries(serializeEntries(["one\ntwo"]))).toEqual(["one two"]);
  });

  it("drops entries that serialize to nothing", () => {
    expect(serializeEntries(["a", "   ", "", "b"])).toBe("a\nb");
  });

  it("keeps the entry count stable across a round-trip with ragged input", () => {
    const ragged = ["  padded  ", "has\ttabs", "trailing   "];
    expect(parseEntries(serializeEntries(ragged))).toHaveLength(3);
  });
});

describe("normalizeEntry", () => {
  it("collapses whitespace runs, including pasted newlines", () => {
    expect(normalizeEntry("a   b\n\nc\td")).toBe("a b c d");
  });

  it("is idempotent", () => {
    const once = normalizeEntry("  messy \n text  ");
    expect(normalizeEntry(once)).toBe(once);
  });

  it("yields an empty string for whitespace only", () => {
    expect(normalizeEntry("  \n\t ")).toBe("");
  });
});

describe("list widget registration", () => {
  const widgets = readSrc("widgets");

  it("is registered as a composite kind", () => {
    // Not cosmetic: a non-composite widget is appended into a
    // `.ca-journal-widget-bar`, which is a wrap-flex *row* meant for buttons and
    // pickers. A full-width list dropped in there lays out as an inline pill
    // next to its neighbour. `note`, `tasks` and `attach` are all composite for
    // the same reason.
    const block = widgets.slice(
      widgets.indexOf("const INLINE_KINDS"),
      widgets.indexOf("]", widgets.indexOf("const INLINE_KINDS"))
    );
    // Inverted in 2.56.25: these four are full-width, which now means absent
    // from the inline list rather than present in a composite one.
    for (const kind of ["note", "list", "tasks", "attach"]) {
      expect(block).not.toContain(`"${kind}"`);
    }
  });

  it("is dispatched from the directive switch", () => {
    expect(widgets).toContain('case "list":');
    // Two call forms are legal here. A builder still on the class is called as
    // `this.buildX(rest, ctx, label)`; one extracted to ./note-regions.ts or
    // ./controls.ts is called as `buildX(this, rest, ctx, label)`, passing the
    // class as its host. Which form a given kind uses says only how far the
    // 2.56.25 split has reached, and asserting one of them would make this
    // test fail on the next extraction rather than on a real change.
    expect(widgets).toMatch(/buildList\((?:this, )?rest, ctx, label\)/);
  });
});

describe("self-labelled widget kinds", () => {
  const widgets = readSrc("widgets");

  // A builder that takes `label` renders that label itself. Those are exactly
  // the kinds the generic wrapper has to skip. Deriving the expected set from
  // the dispatch switch rather than restating it is the point: a restated list
  // is the thing that went stale in 2.12.
  const dispatched = new Set<string>();
  // ASKED OF EACH CASE BLOCK, NOT MATCHED AS ONE CALL SHAPE (4.28).
  //
  // This was a single regex pinning `[this.]buildX(rest, ctx, label)`, and it
  // had already been widened once — the comment it replaces records why: a
  // builder extracted to a sibling module is called with `this` first, and
  // matching only the original spelling would have made the derived set shrink
  // silently. A third form then arrived (`note` picks between two builders on
  // the region key) and it shrank silently exactly as predicted, in the one
  // direction the guard below does not catch.
  //
  // RESUME §6: an assertion must not anchor on FORMATTING. So this asks each
  // case block the question the describe is actually about — does this kind
  // hand a builder the label? — and does not care how the call is written or
  // how many of them there are. Over `readCode`, so a comment that happens to
  // use the word cannot answer for the code.
  // SCOPED TO THE `widget =` SWITCH, which the old regex did by accident of its
  // shape and this has to do on purpose. There is a second dispatch further
  // down that `return`s a region builder instead of assigning, and four of its
  // cases take a label too — but they are not what `SELF_LABELLED_KINDS` is
  // about, which is the kinds the generic wrapper must skip.
  const code = readCode("widgets");
  for (const m of code.matchAll(
    /case "([a-z-]+)":([\s\S]*?)(?=\n\s*case "|\n\s*default:)/g
  )) {
    const body = m[2];
    if (/widget =/.test(body) && /build[A-Za-z]+\([^;]*\blabel\b/.test(body)) {
      dispatched.add(m[1]);
    }
  }

  const declared = new Set(
    (/const SELF_LABELLED_KINDS = new Set\(\[([^\]]*)\]/
      .exec(widgets)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean)
  );

  it("finds the label-taking builders in the dispatch switch", () => {
    // Guards the regex itself — if the switch is reformatted so this stops
    // matching, the comparison below would pass vacuously.
    expect(dispatched.size).toBeGreaterThanOrEqual(4);
  });

  it("declares every kind whose builder renders its own label", () => {
    const missing = [...dispatched].filter((k) => !declared.has(k));
    expect(missing).toEqual([]);
  });

  it("declares nothing that isn't self-labelling", () => {
    const extra = [...declared].filter((k) => !dispatched.has(k));
    expect(extra).toEqual([]);
  });
});

describe("list regions are inert to the task machinery", () => {
  // notestore.ts::allNoteRegions is directive-agnostic — it yields every
  // `<!--chronoanvil:KEY-->` region regardless of which widget wrote it. Both
  // countChronoAnvilTasks and the tasks-table's row parser walk all regions and
  // run parseTasks over each, so a new region type that happened to look
  // task-shaped would quietly inflate every task count in the vault.
  it("does not count prose entries as tasks", () => {
    const text = writeNoteRegion(
      "",
      "highlights",
      serializeEntries([
        "Financial adviser said my credit is healthy enough for the loan.",
        "My brother's birthday. We went out for dinner in Perth.",
      ])
    );
    expect(countChronoAnvilTasks(text)).toEqual({ open: 0, done: 0 });
  });

  it("counts only the task region when both live in one note", () => {
    let text = writeNoteRegion("", "highlights", serializeEntries(["a win", "another"]));
    text = writeNoteRegion(text, "todo", "- ( ) a real task\n- (x) a done one");
    expect(countChronoAnvilTasks(text)).toEqual({ open: 1, done: 1 });
  });

  it("does not treat an entry starting with a dash as a task", () => {
    // A user typing "- see the dentist" into a highlights row is writing prose
    // that looks like a list item, not a ChronoAnvil task: the `- ( )` marker is
    // what makes a task, deliberately.
    const text = writeNoteRegion("", "highlights", serializeEntries(["- see the dentist"]));
    expect(countChronoAnvilTasks(text)).toEqual({ open: 0, done: 0 });
  });

  it("leaves entries untouched when a task region round-trips", () => {
    let text = writeNoteRegion("", "highlights", serializeEntries(["kept intact"]));
    text = writeNoteRegion(text, "todo", "- ( ) x");
    text = writeNoteRegion(text, "todo", "- (x) x");
    expect(parseEntries(readNoteRegion(text, "highlights"))).toEqual(["kept intact"]);
  });
});

describe("entry list transitions", () => {
  // Rows are [...entries, ""], so index === entries.length is the trailing
  // "type here" row.
  describe("the Enter-then-blur double commit", () => {
    it("does not duplicate the entry (the 2.12.1 bug)", () => {
      // Pressing Enter rebuilds the rows, which blurs the focused textarea and
      // fires its blur commit on top of the Enter commit. The second commit
      // must see the model the first produced — index 0 is no longer trailing —
      // and overwrite rather than append.
      const afterEnter = applyEntryEnter([], 0, "Example text");
      expect(afterEnter.entries).toEqual(["Example text"]);

      const afterBlur = applyEntryCommit(afterEnter.entries, 0, "Example text");
      expect(afterBlur.entries).toEqual(["Example text"]);
    });

    it("returns the same array reference so the caller can skip the write", () => {
      // Identity is what lets buildList short-circuit: a redundant commit does
      // no disk write and no repaint.
      const entries = ["Example text"];
      expect(applyEntryCommit(entries, 0, "Example text").entries).toBe(entries);
    });

    it("survives the commit firing three times", () => {
      let e = applyEntryEnter([], 0, "once").entries;
      for (let i = 0; i < 3; i++) e = applyEntryCommit(e, 0, "once").entries;
      expect(e).toEqual(["once"]);
    });

    it("does not duplicate when Enter repeats on the same row", () => {
      const first = applyEntryEnter([], 0, "a");
      const second = applyEntryEnter(first.entries, first.focus, "");
      expect(second.entries).toEqual(["a"]);
    });
  });

  describe("applyEntryEnter", () => {
    it("appends from the trailing row and lands on the new trailing row", () => {
      const out = applyEntryEnter(["a"], 1, "b");
      expect(out.entries).toEqual(["a", "b"]);
      expect(out.focus).toBe(2);
    });

    it("ignores Enter on an empty trailing row", () => {
      const entries = ["a"];
      const out = applyEntryEnter(entries, 1, "   ");
      expect(out.entries).toBe(entries);
      expect(out.focus).toBe(-1);
    });

    it("inserts a blank below when pressed mid-list", () => {
      // "Enter opens the next entry" has to hold in the middle too, or a list
      // can only ever be filled in from the bottom.
      const out = applyEntryEnter(["a", "b"], 0, "a");
      expect(out.entries).toEqual(["a", "", "b"]);
      expect(out.focus).toBe(1);
    });

    it("commits an edit and inserts below in one keystroke", () => {
      const out = applyEntryEnter(["old", "b"], 0, "new");
      expect(out.entries).toEqual(["new", "", "b"]);
    });

    it("removes a row emptied before Enter", () => {
      expect(applyEntryEnter(["a", "b"], 0, "").entries).toEqual(["b"]);
    });

    it("never persists the inserted blank", () => {
      const out = applyEntryEnter(["a", "b"], 0, "a");
      expect(parseEntries(serializeEntries(out.entries))).toEqual(["a", "b"]);
    });
  });

  describe("applyEntryCommit", () => {
    it("appends a new entry from the trailing row", () => {
      expect(applyEntryCommit(["a"], 1, "b").entries).toEqual(["a", "b"]);
    });

    it("ignores an empty trailing row", () => {
      const entries = ["a"];
      expect(applyEntryCommit(entries, 1, "  ").entries).toBe(entries);
    });

    it("deletes an existing row that was emptied", () => {
      expect(applyEntryCommit(["a", "b", "c"], 1, "").entries).toEqual(["a", "c"]);
    });

    it("normalizes as it commits", () => {
      expect(applyEntryCommit([""], 0, "  spaced   out  ").entries).toEqual([
        "spaced out",
      ]);
    });

    it("never moves focus", () => {
      expect(applyEntryCommit(["a"], 1, "b").focus).toBe(-1);
    });
  });

  describe("applyEntryBackspace", () => {
    it("removes an empty row and returns to the end of the one above", () => {
      const out = applyEntryBackspace(["a", "", "c"], 1);
      expect(out.entries).toEqual(["a", "c"]);
      expect(out.focus).toBe(0);
      expect(out.focusAtEnd).toBe(true);
    });

    it("steps back from the trailing row without deleting anything", () => {
      // Backspace on the blank at the bottom should move the caret into the
      // last entry, not eat it.
      const entries = ["a", "b"];
      const out = applyEntryBackspace(entries, 2);
      expect(out.entries).toBe(entries);
      expect(out.focus).toBe(1);
      expect(out.focusAtEnd).toBe(true);
    });

    it("does nothing on the first row", () => {
      const entries = ["a"];
      expect(applyEntryBackspace(entries, 0).entries).toBe(entries);
      expect(applyEntryBackspace(entries, 0).focus).toBe(-1);
    });

    it("does nothing on an empty list", () => {
      const entries: string[] = [];
      expect(applyEntryBackspace(entries, 0).entries).toBe(entries);
    });
  });

  it("builds a list the way a user types one", () => {
    // type, Enter, type, Enter — the whole interaction, with the stray blur
    // commit that follows every Enter interleaved as it really fires.
    let e: string[] = [];
    const enter = (i: number, v: string) => {
      const out = applyEntryEnter(e, i, v);
      e = out.entries;
      // the re-render's blur commit, against the row just left
      e = applyEntryCommit(e, i, v).entries;
      return out.focus;
    };
    let focus = enter(0, "Financial adviser said my credit is healthy.");
    focus = enter(focus, "My brother's birthday. Dinner in Perth.");
    expect(e).toEqual([
      "Financial adviser said my credit is healthy.",
      "My brother's birthday. Dinner in Perth.",
    ]);
    expect(focus).toBe(2);
  });
});

// ── Special events ──────────────────────────────────────────────────────
describe("special events", () => {
  const birthday: EventDef = {
    id: "annas-birthday",
    title: "Anna's birthday",
    kind: "recurring",
    month: 4,
    day: 12,
    icon: "cake",
    color: "pink",
  };
  const leapling: EventDef = {
    id: "leapling",
    title: "Leapling",
    kind: "recurring",
    month: 2,
    day: 29,
    icon: "cake",
    color: "blue",
  };
  const trip: EventDef = {
    id: "munich-trip",
    title: "Munich trip",
    kind: "single",
    start: "2026-03-09",
    end: "2026-03-13",
    icon: "plane",
    color: "teal",
  };
  const sickDay: EventDef = {
    id: "sick-day",
    title: "Sick day",
    kind: "single",
    start: "2026-03-11",
    icon: "thermometer",
    color: "red",
  };

  describe("date validation", () => {
    it("accepts real dates and rejects impossible ones", () => {
      expect(isValidIso("2026-03-09")).toBe(true);
      expect(isValidIso("2024-02-29")).toBe(true);
      // 2026 is not a leap year, so the 29th does not exist in it.
      expect(isValidIso("2026-02-29")).toBe(false);
      expect(isValidIso("2026-13-01")).toBe(false);
      expect(isValidIso("2026-04-31")).toBe(false);
      expect(isValidIso("9 March 2026")).toBe(false);
      expect(isValidIso(undefined)).toBe(false);
    });

    it("does the arithmetic in UTC so a day is always a day", () => {
      expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
      expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
      expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
      expect(daysBetween("2026-03-09", "2026-03-13")).toBe(4);
      expect(daysBetween("2026-03-13", "2026-03-09")).toBe(-4);
    });
  });

  describe("parsing a hand-editable list", () => {
    it("keeps the good rows and drops only the unusable ones", () => {
      const list = parseEvents([
        birthday,
        { title: "", kind: "recurring", month: 1, day: 1 }, // no title
        { title: "Nothing dated", kind: "single" }, // no usable date
        "not an object",
        null,
        trip,
      ]);
      expect(list.map((e) => e.id)).toEqual(["annas-birthday", "munich-trip"]);
    });

    it("infers the kind from the dates when the label disagrees", () => {
      // A row calling itself recurring but carrying only a start date is a
      // mislabelled single event, not a row worth discarding.
      const [only] = parseEvents([
        { title: "Mislabelled", kind: "recurring", start: "2026-05-04" },
      ]);
      expect(only.kind).toBe("single");
      expect(only.start).toBe("2026-05-04");
    });

    it("swaps a reversed range rather than rejecting it", () => {
      const [only] = parseEvents([
        { title: "Backwards", kind: "single", start: "2026-03-13", end: "2026-03-09" },
      ]);
      expect(only.start).toBe("2026-03-09");
      expect(only.end).toBe("2026-03-13");
    });

    it("collapses a one-day range to a bare start", () => {
      const [only] = parseEvents([
        { title: "Same day", kind: "single", start: "2026-03-09", end: "2026-03-09" },
      ]);
      expect(only.end).toBeUndefined();
      expect(isMultiDay(only)).toBe(false);
    });

    it("falls back to safe decorations rather than trusting the file", () => {
      const [only] = parseEvents([
        { ...birthday, icon: "not-a-real-icon", color: "#ff0000" },
      ]);
      expect(only.icon).toBe(DEFAULT_EVENT_ICON);
      expect(only.color).toBe(DEFAULT_EVENT_COLOR);
    });

    it("re-slugs a duplicate id instead of losing the event", () => {
      const list = parseEvents([birthday, { ...birthday, title: "Anna's birthday" }]);
      expect(list).toHaveLength(2);
      expect(new Set(list.map((e) => e.id)).size).toBe(2);
    });

    it("round-trips through serialize unchanged", () => {
      const list = [birthday, trip];
      expect(parseEvents(serializeEvents(list))).toEqual(list);
    });

    // ── the hour, 4.52 ──────────────────────────────────────────────
    //
    // A meeting is an event with a time on it, which is what let the Meetings
    // logbook be a VIEW of the events note rather than a second store of dated
    // things the calendar knows nothing about. What these guard is that adding
    // the field cost every `Events.md` already in a vault nothing.
    it("keeps an hour and pads a hand-typed one", () => {
      // A list sorted as strings has to be padded, or 09:00 sorts after 10:00.
      const [only] = parseEvents([{ ...trip, time: "9:05" }]);
      expect(only.time).toBe("09:05");
    });

    it("drops an unusable time rather than clamping it", () => {
      // A clamp would turn a typo into a plausible time and file the meeting at
      // midnight without saying so. An event with no time is a fact about the
      // day, which is a safe thing for a mistyped one to become.
      for (const bad of ["25:00", "10:75", "morning", "", 9]) {
        expect(parseEvents([{ ...trip, time: bad }])[0].time).toBeUndefined();
      }
    });

    it("writes no `time` key for an event that has none", () => {
      // THE COMPATIBILITY CLAIM, ASSERTED. A vault's events note is a file of
      // events with no times; a round trip must not start writing the key into
      // every row of it.
      const out = serializeEvents([birthday, trip]);
      expect(out.every((row) => !("time" in row))).toBe(true);
      expect(parseEvents(serializeEvents([{ ...trip, time: "14:00" }]))[0].time).toBe(
        "14:00"
      );
    });

    // ── the length, 4.55 ────────────────────────────────────────────
    //
    // MINUTES, NOT AN END TIME, and the reason is the sibling grammar: a log
    // stamp holds one clock field, so a second `HH:mm` would read as a range
    // and collide with the `\d{1,2}:\d{2}` alternative in `STAMP_RE`. A count
    // of minutes goes in the extensible slot both formats already have.
    it("keeps a length on a timed event", () => {
      const [only] = parseEvents([{ ...trip, time: "09:00", duration: 90 }]);
      expect(only.duration).toBe(90);
    });

    it("takes a length written as a string, and rounds one written as a fraction", () => {
      // A hand-edited note writes `duration: 45`; YAML hands back whichever of
      // the two the file happened to quote.
      expect(parseEvents([{ ...trip, time: "09:00", duration: "45" }])[0].duration).toBe(45);
      expect(parseEvents([{ ...trip, time: "09:00", duration: 45.4 }])[0].duration).toBe(45);
    });

    it("drops a length that is not one", () => {
      for (const bad of [0, -30, "soon", "", null, {}]) {
        expect(
          parseEvents([{ ...trip, time: "09:00", duration: bad }])[0].duration
        ).toBeUndefined();
      }
    });

    it("drops a length on an event with no hour", () => {
      // A length with no start is not a span. A birthday that lasts 90 minutes
      // is a claim nobody made.
      expect(parseEvents([{ ...trip, duration: 90 }])[0].duration).toBeUndefined();
    });

    it("writes no `duration` key for an event that has none", () => {
      expect(serializeEvents([birthday, trip]).every((row) => !("duration" in row))).toBe(
        true
      );
      const back = parseEvents(
        serializeEvents([{ ...trip, time: "09:00", duration: 90 }])
      );
      expect(back[0].duration).toBe(90);
    });
  });

  describe("ids", () => {
    it("derives a legible slug from the title", () => {
      expect(slugifyEventId("Anna's birthday", [])).toBe("annas-birthday");
      expect(slugifyEventId("Trip — München!", [])).toBe("trip-munchen");
      expect(slugifyEventId("...", [])).toBe("event");
    });

    it("uniquifies against ids already in use", () => {
      expect(slugifyEventId("Sick day", ["sick-day"])).toBe("sick-day-2");
      expect(slugifyEventId("Sick day", ["sick-day", "sick-day-2"])).toBe("sick-day-3");
    });
  });

  describe("recurring dates", () => {
    it("repeats on the same calendar date every year", () => {
      expect(recurringIso(birthday, 2026)?.iso).toBe("2026-04-12");
      expect(recurringIso(birthday, 2031)?.iso).toBe("2031-04-12");
    });

    it("shows a 29 February event on the 28th in a common year, and flags it", () => {
      expect(recurringIso(leapling, 2024)).toEqual({ iso: "2024-02-29", shifted: false });
      expect(recurringIso(leapling, 2026)).toEqual({ iso: "2026-02-28", shifted: true });
    });

    it("clamps a day the month cannot have instead of rolling into the next", () => {
      const bad: EventDef = { ...birthday, month: 4, day: 31 };
      expect(recurringIso(bad, 2026)?.iso).toBe("2026-04-30");
    });
  });

  describe("expanding a window", () => {
    it("finds a recurring event in every year the window covers", () => {
      const map = expandEvents([birthday], "2025-01-01", "2027-12-31");
      expect([...map.keys()].sort()).toEqual([
        "2025-04-12",
        "2026-04-12",
        "2027-04-12",
      ]);
    });

    it("tags each day of a span so the grid can draw one continuous bar", () => {
      const map = expandEvents([trip], "2026-03-01", "2026-03-31");
      expect(map.get("2026-03-09")?.[0].pos).toBe("start");
      expect(map.get("2026-03-10")?.[0].pos).toBe("mid");
      expect(map.get("2026-03-12")?.[0].pos).toBe("mid");
      expect(map.get("2026-03-13")?.[0].pos).toBe("end");
      expect(map.get("2026-03-14")).toBeUndefined();
    });

    it("keeps a span that starts before the window looking continuous", () => {
      // The window opens mid-trip. The 11th must still read as "mid" — if it
      // reported "start" the grid would cap the bar and the trip would look
      // like it began on the 11th.
      const map = expandEvents([trip], "2026-03-11", "2026-03-31");
      expect(map.get("2026-03-11")?.[0].pos).toBe("mid");
      expect(map.get("2026-03-09")).toBeUndefined();
    });

    it("sorts spans ahead of single-day events so bars go down before badges", () => {
      const map = expandEvents([sickDay, trip], "2026-03-01", "2026-03-31");
      const day = map.get("2026-03-11") ?? [];
      expect(day.map((o) => o.def.id)).toEqual(["munich-trip", "sick-day"]);
    });

    it("ignores a disabled event", () => {
      const map = expandEvents([{ ...trip, enabled: false }], "2026-03-01", "2026-03-31");
      expect(map.size).toBe(0);
    });

    it("returns nothing for a backwards or invalid window", () => {
      expect(expandEvents([trip], "2026-03-31", "2026-03-01").size).toBe(0);
      expect(expandEvents([trip], "nonsense", "2026-03-31").size).toBe(0);
    });

    it("never invents a day outside the window", () => {
      const map = expandEvents([birthday, trip, sickDay], "2026-03-10", "2026-03-12");
      for (const iso of map.keys()) {
        expect(iso >= "2026-03-10" && iso <= "2026-03-12").toBe(true);
      }
    });
  });

  // The invariant the whole feature rests on. Events decorate days; they do not
  // populate them. If this boundary ever softens, "N/M days logged" quietly
  // starts counting days nobody wrote anything on.
  describe("events and entries stay separate", () => {
    it("yields dates and definitions only — nothing that could open or create a note", () => {
      const day = expandEvents([trip], "2026-03-09", "2026-03-09").get("2026-03-09");
      expect(day).toHaveLength(1);
      expect(Object.keys(day![0]).sort()).toEqual(["def", "iso", "pos"]);
      // No file, no path, no vault handle anywhere in the payload.
      expect(JSON.stringify(day)).not.toMatch(/\.md/);
    });

    it("reports a marked day the same whether or not an entry exists", () => {
      // There is no entry input to vary: the function's only arguments are the
      // definitions and the window, which is what makes the separation
      // structural rather than a rule someone has to remember.
      const first = eventsOnDay([birthday, trip], "2026-04-12");
      const second = eventsOnDay([birthday, trip], "2026-04-12");
      expect(first.map((e) => e.id)).toEqual(["annas-birthday"]);
      expect(second).toEqual(first);
    });
  });

  describe("upcoming", () => {
    it("rolls a passed recurring event to next year", () => {
      const items = upcomingEvents([birthday], "2026-06-01", 5);
      expect(items[0].iso).toBe("2027-04-12");
    });

    it("keeps this year's date when it hasn't passed yet", () => {
      const items = upcomingEvents([birthday], "2026-01-01", 5);
      expect(items[0].iso).toBe("2026-04-12");
      expect(items[0].daysAway).toBe(101);
    });

    it("surfaces an in-progress span and says how far through it you are", () => {
      const items = upcomingEvents([trip], "2026-03-11", 5);
      expect(items[0].ongoing).toBe(true);
      expect(describeRelative(items[0])).toBe("day 3 of 5");
    });

    it("drops a span that has already finished", () => {
      expect(upcomingEvents([trip], "2026-03-14", 5)).toEqual([]);
    });

    it("still finds a single event years out once the near ones run out", () => {
      const far: EventDef = { ...trip, id: "far", start: "2030-01-01", end: undefined };
      const items = upcomingEvents([far], "2026-03-01", 5);
      expect(items).toHaveLength(1);
      expect(items[0].iso).toBe("2030-01-01");
    });

    it("orders by date and honours the count", () => {
      const items = upcomingEvents([birthday, trip, sickDay], "2026-03-01", 2);
      expect(items.map((i) => i.def.id)).toEqual(["munich-trip", "sick-day"]);
    });

    it("orders one day's events by the hour, not by the title", () => {
      // 4.52, and it is a FIX rather than a refinement: within a day the sort
      // was alphabetical, so a 17:00 review came before a 09:00 stand-up in
      // every agenda that drew them.
      const standup = { ...sickDay, id: "standup", title: "Stand-up", time: "09:00" };
      const review = { ...sickDay, id: "review", title: "A review", time: "17:00" };
      const items = upcomingEvents([review, standup], "2026-03-11", 5);
      expect(items.map((i) => i.def.id)).toEqual(["standup", "review"]);
    });

    it("puts a day's untimed facts before its appointments", () => {
      // A birthday is true of the whole day; a meeting happens inside it.
      const meeting = { ...sickDay, id: "meeting", title: "A meeting", time: "09:00" };
      const items = upcomingEvents([meeting, sickDay], "2026-03-11", 5);
      expect(items.map((i) => i.def.id)).toEqual(["sick-day", "meeting"]);
    });
  });

  describe("phrasing", () => {
    it("describes a recurring event without a year", () => {
      expect(describeEventDate(birthday)).toBe("12 April, every year");
    });

    it("says the hour where there is one, and leaves the date alone", () => {
      // TWO FUNCTIONS RATHER THAN A FLAG (4.52): `describeEventDate` is read by
      // the calendar, the manager and the settings row, and every one of them is
      // describing a DAY. Appending a time inside it would have changed what the
      // rows above are about.
      expect(describeEventWhen(sickDay)).toBe(describeEventDate(sickDay));
      expect(describeEventWhen({ ...sickDay, time: "14:00" })).toBe(
        "11 March 2026, 14:00"
      );
    });

    it("describes a span as a range with its length", () => {
      expect(describeEventDate(trip)).toBe("9–13 March 2026 (5 days)");
      expect(describeEventDate(sickDay)).toBe("11 March 2026");
    });

    it("counts days the way a person would", () => {
      const at = (iso: string) => describeRelative(upcomingEvents([sickDay], iso, 1)[0]);
      expect(at("2026-03-11")).toBe("today");
      expect(at("2026-03-10")).toBe("tomorrow");
      expect(at("2026-03-08")).toBe("in 3 days");
    });

    it("puts the leap-day shift in the tooltip rather than hiding it", () => {
      const map = expandEvents([leapling], "2026-02-01", "2026-02-28");
      expect(describeDay(map.get("2026-02-28")!)).toContain("shown on the 28th");
    });

    it("says which day of a span a tooltip is describing", () => {
      const map = expandEvents([trip], "2026-03-01", "2026-03-31");
      expect(describeDay(map.get("2026-03-11")!)).toContain("day 3 of 5");
    });
  });
});

// ── Journals hero: the 53-week year strip (2.13.8) ────────────────────────
// The strip is a fixed window, so almost everything that can go wrong is an
// off-by-one in its alignment: a start that isn't a week boundary makes every
// column a mixed bag of weekdays, and a length that isn't a whole number of
// weeks leaves a ragged edge. Those are the cases pinned here, plus the two
// pieces of arithmetic the band actually reports (streaks).
//
// The moment stub has no locale data, so weekStartDay() falls back to Monday
// (1) — deterministic, and the same default ChronoAnvil has always shipped.
describe("yearStripBounds", () => {
  it("starts on a week boundary and spans whole weeks", () => {
    // 2026-07-23 is a Thursday.
    const { start, end } = yearStripBounds("2026-07-23");
    expect(moment(start).day()).toBe(1); // Monday
    expect(moment(end).day()).toBe(0); // Sunday
    expect(moment(end).diff(moment(start), "days")).toBe(53 * 7 - 1);
  });

  it("ends on the end of the week containing today, not on today", () => {
    // Thursday 2026-07-23 → the window runs to Sunday the 26th, so the final
    // column is a full week and the strip's right edge stays straight.
    expect(yearStripBounds("2026-07-23").end).toBe("2026-07-26");
  });

  it("does not extend the window when today is already the week's last day", () => {
    // Sunday 2026-07-26: the week containing today ends on today.
    expect(yearStripBounds("2026-07-26").end).toBe("2026-07-26");
  });

  it("honours a shorter window", () => {
    const { start, end } = yearStripBounds("2026-07-23", 4);
    expect(moment(end).diff(moment(start), "days")).toBe(4 * 7 - 1);
  });
});

describe("yearStripCells", () => {
  const rows: ActivityCount[] = [
    { date: "2026-07-20", open: 1, done: 2 },
    { date: "2026-07-22", open: 0, done: 4 },
  ];

  it("emits exactly one cell per day of the window", () => {
    expect(yearStripCells(rows, "2026-07-23").length).toBe(53 * 7);
  });

  it("lays out column-major, seven rows to a column", () => {
    const cells = yearStripCells(rows, "2026-07-23", 3);
    expect(cells.slice(0, 7).every((c) => c.week === 0)).toBe(true);
    expect(cells.slice(0, 7).map((c) => c.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cells[7].week).toBe(1);
  });

  it("joins activity onto the right dates and zeroes the rest", () => {
    const cells = yearStripCells(rows, "2026-07-23");
    const at = (iso: string) => cells.find((c) => c.iso === iso)!;
    expect(at("2026-07-20")).toMatchObject({ open: 1, done: 2 });
    expect(at("2026-07-22")).toMatchObject({ open: 0, done: 4 });
    expect(at("2026-07-21")).toMatchObject({ open: 0, done: 0 });
  });

  it("marks days after today as future so the edge stays straight", () => {
    const cells = yearStripCells(rows, "2026-07-23");
    expect(cells.find((c) => c.iso === "2026-07-23")!.future).toBe(false);
    // Fri/Sat/Sun of the final column.
    expect(cells.find((c) => c.iso === "2026-07-24")!.future).toBe(true);
    expect(cells.find((c) => c.iso === "2026-07-26")!.future).toBe(true);
    expect(cells.filter((c) => c.future).length).toBe(3);
  });
});

describe("yearStripMonthLabels", () => {
  it("places each label on the column its month begins in", () => {
    const cells = yearStripCells([], "2026-07-23");
    const labels = yearStripMonthLabels(cells);
    for (const { label, week } of labels) {
      // The label's column must actually contain that month's 1st.
      const column = cells.filter((c) => c.week === week);
      expect(column.some((c) => moment(c.iso).format("MMM") === label)).toBe(true);
    }
  });

  it("drops a label that would collide with the previous one", () => {
    const cells = yearStripCells([], "2026-07-23");
    const labels = yearStripMonthLabels(cells, 3);
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].week - labels[i - 1].week).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("yearStripStats", () => {
  const stats = (rows: ActivityCount[], today = "2026-07-23") =>
    yearStripStats(yearStripCells(rows, today), today);

  it("totals only days that carry work", () => {
    const s = stats([
      { date: "2026-07-20", open: 1, done: 2 },
      { date: "2026-07-22", open: 0, done: 4 },
    ]);
    expect(s).toMatchObject({ activeDays: 2, open: 1, done: 6, max: 4 });
  });

  it("scores zero active days for dated notes that carry no tasks", () => {
    // THE ARITHMETIC BEHIND §14.8, and it is correct — which is the point.
    //
    // `activeDays` counts days where `open + done > 0`, so a Study root full of
    // dated lessons nobody has ticked anything off in scores zero. Nothing here
    // is wrong; what was wrong was the SENTENCE the Journals band printed on
    // the strength of it — "No dated notes yet", to a reader with twenty-two
    // lessons on screen.
    //
    // Pinned here so the distinction stays visible from the stats side: this
    // function cannot tell "no notes" from "no tasks" and is not supposed to.
    // The caller has `collected.length` for that (journals-header.ts).
    const s = stats([
      { date: "2026-07-20", open: 0, done: 0 },
      { date: "2026-07-21", open: 0, done: 0 },
    ]);
    expect(s.activeDays).toBe(0);
    expect(s.longest).toBe(0);
    expect(s.max).toBe(0);
  });

  it("ignores future cells entirely", () => {
    // A note dated tomorrow must not count toward the year's totals.
    const s = stats([{ date: "2026-07-25", open: 3, done: 3 }]);
    expect(s.activeDays).toBe(0);
    expect(s.open).toBe(0);
  });

  it("counts the current streak back from today", () => {
    const s = stats([
      { date: "2026-07-21", open: 0, done: 1 },
      { date: "2026-07-22", open: 0, done: 1 },
      { date: "2026-07-23", open: 0, done: 1 },
    ]);
    expect(s.streak).toBe(3);
  });

  it("does not break a streak merely because today has not started", () => {
    // Opening the home page at 9am should not show a zero you earned by not
    // having worked yet — the forgiveness the diary's deleted `entryStreak` gave,
    // and the only part of it 4.13.1 §3 kept.
    const s = stats([
      { date: "2026-07-21", open: 0, done: 1 },
      { date: "2026-07-22", open: 0, done: 1 },
    ]);
    expect(s.streak).toBe(2);
  });

  it("breaks the streak on a genuine gap", () => {
    const s = stats([
      { date: "2026-07-20", open: 0, done: 1 },
      { date: "2026-07-22", open: 0, done: 1 },
    ]);
    expect(s.streak).toBe(1); // the 21st is empty
  });

  it("reports the longest run anywhere in the window", () => {
    const s = stats([
      { date: "2026-01-05", open: 0, done: 1 },
      { date: "2026-01-06", open: 0, done: 1 },
      { date: "2026-01-07", open: 0, done: 1 },
      { date: "2026-01-08", open: 0, done: 1 },
      { date: "2026-07-22", open: 0, done: 1 },
    ]);
    expect(s.longest).toBe(4);
    expect(s.streak).toBe(1);
  });

  it("is all zeroes on an empty vault", () => {
    expect(stats([])).toEqual({
      activeDays: 0,
      open: 0,
      done: 0,
      max: 0,
      streak: 0,
      longest: 0,
    });
  });
});

// ── journal.ts: ensureJournalsBlock ───────────────────────────────────────
// Was `migrateJournalsSection` until 2.41 — a one-shot upgrade from the old
// generated-markdown Journals container, with boundary detection delicate
// enough to need a knownTitles set. No note carries that form, so what remains
// is repair: a home note that has lost its Journals block gets one back.
describe("ensureJournalsBlock", () => {
  const NEW_BLOCK = "```chronoanvil\nframe: section\njournals\n```";

  it("leaves a note that already has the block alone", () => {
    const src = [
      "`chronoanvil:spacer`",
      "```chronoanvil",
      "journals",
      "```",
      "",
      "```chronoanvil",
      "header:🏷️ Tags",
      "```",
    ].join("\n");
    expect(ensureJournalsBlock(src)).toBe(src);
  });

  it("counts a hand-added directive inside a longer block", () => {
    // The widget renders wherever it appears, so a second copy above it would
    // be worse than leaving the note alone.
    const src = ["```chronoanvil", "diary:3", "journals", "```"].join("\n");
    expect(ensureJournalsBlock(src)).toBe(src);
  });

  it("appends the block to a note that has lost it", () => {
    const src = ["`chronoanvil:spacer`", "```chronoanvil", "diary:3", "```"].join("\n");
    const out = ensureJournalsBlock(src);
    expect(out).toContain(NEW_BLOCK);
    // Everything that was there is still there, and the block is on the end.
    expect(out).toContain("diary:3");
    expect(out.indexOf("diary:3")).toBeLessThan(out.indexOf("journals"));
    expect(out.endsWith("\n")).toBe(true);
  });

  it("counts the composed homepage's own spelling (4.38.3)", () => {
    // THE BUG A READER HIT ON A CLEAN VAULT. This compared each line to
    // `JOURNALS_DIRECTIVE` exactly, so `journals:cards` — what the homepage has
    // composed since 4.37 — read as ABSENT and a second block was appended.
    //
    // The path is short and had nothing to do with repair: install, add the Study
    // journal, and `rebuildJournalHome` calls this. The homepage had two Journals
    // sections before the repair window had been opened once, and every later
    // symptom was downstream of it.
    const home = composeHomeNote(DEFAULT_PATHS.diaryRoot);
    expect(home, "the homepage stopped composing the argument form").toContain(
      "journals:cards"
    );
    expect(ensureJournalsBlock(home)).toBe(home);
    // The bare fence form too, whatever the argument, because an ARGUMENT is an
    // arrangement of this section rather than a different section.
    for (const line of ["journals", "journals:cards"]) {
      const src = ["```chronoanvil", "frame: section", line, "```"].join("\n");
      expect(ensureJournalsBlock(src), line).toBe(src);
    }
  });

  it("still adds one when a DIFFERENT widget shares the prefix", () => {
    // `journals-header:study` is on every journal dashboard and is not this
    // section. The old check would not have matched it either, but the fix must
    // not reach for a loose prefix on the way past — that is the trap the shared
    // predicate in `constants.ts` is written to close.
    const src = ["```chronoanvil", "journals-header:study", "```"].join("\n");
    expect(ensureJournalsBlock(src)).toContain(NEW_BLOCK);
  });

  it("does not touch the sections around it", () => {
    // The failure mode of the migration this replaced was eating the chart
    // section that follows Journals on the shipped home note.
    const src = [
      "```chronoanvil-charts",
      "header:📊 Trends and Statistics",
      "chart:mood",
      "```",
      "",
      "```chronoanvil",
      "header:🏷️ Tags",
      "```",
    ].join("\n");
    const out = ensureJournalsBlock(src);
    expect(out).toContain("chart:mood");
    expect(out).toContain("header:🏷️ Tags");
    expect(out).toContain(NEW_BLOCK);
  });
});

// ── Per-entry trackers ───────────────────────────────────────────────────
// Settings seeds the daily *template*; these functions edit one note's own
// `tracker:` directives. The invariants worth pinning down are all about not
// damaging a note: never write outside the tracker region, never touch a `nav`
// block, never lose a logged value, never double up a widget on one property.
describe("per-entry trackers", () => {
  const FENCE = "```chronoanvil";
  const CLOSE = "```";
  const START = "# chronoanvil:trackers:start";
  const END = "# chronoanvil:trackers:end";

  // A generated daily entry: frontmatter, an entry-header fence, then the
  // marked tracker fence — the exact shape composeEntryTemplate("daily") makes.
  const entry = (directives: string[]): string[] => [
    "---",
    "journal-date: 2026-07-23",
    "---",
    "`chronoanvil:spacer`",
    FENCE,
    "entry-header",
    CLOSE,
    "",
    FENCE,
    START,
    ...directives,
    END,
    CLOSE,
    "",
    "body text",
  ];

  const trackers: TrackerDef[] = [
    {
      id: "Mood",
      label: "☀️ Mood",
      type: "number",
      min: 1,
      max: 5,
      builtin: "mood",
      surface: diarySurface("daily"),
      showInTemplate: true,
      showInBase: true,
    },
    {
      id: "Wake-Up",
      label: "😴 Wake-Up",
      type: "time",
      builtin: "wake",
      surface: diarySurface("daily"),
      showInTemplate: true,
      showInBase: true,
    },
    {
      id: "Bedtime",
      label: "🌙 Bedtime",
      type: "time",
      builtin: "bed",
      surface: diarySurface("daily"),
      showInTemplate: true,
      showInBase: true,
    },
    {
      id: "Sleep",
      label: "🛌 Sleep",
      type: "number",
      builtin: "sleep",
      derived: true,
      surface: diarySurface("daily"),
      showInTemplate: false,
      showInBase: true,
    },
    {
      id: "KM",
      label: "🏃 KM",
      type: "number",
      unit: "km",
      surface: diarySurface("daily"),
      showInTemplate: false,
      showInBase: true,
    },
    {
      id: "Weight",
      label: "⚖️ Weight",
      type: "number",
      surface: diarySurface("daily"),
      showInTemplate: false,
      showInBase: false,
    },
    {
      id: "Savings",
      label: "💰 Savings",
      type: "number",
      surface: diarySurface("monthly"),
      showInTemplate: true,
      showInBase: true,
    },
    {
      id: "confidence",
      label: "🎯 Confidence",
      type: "number",
      min: 1,
      max: 5,
      // The all-journals surface the built-ins use: offered on every
      // registered type, so a new custom journal needs no seeding.
      surface: journalSurface(null),
      showInTemplate: false,
      showInBase: false,
    },
    {
      id: "Recipe rating",
      label: "🍳 Recipe rating",
      type: "number",
      min: 1,
      max: 5,
      surface: journalSurface("cooking"),
      showInTemplate: false,
      showInBase: false,
    },
  ];

  describe("locateTrackerRegion", () => {
    it("prefers the marked region and bounds it inside the markers", () => {
      const lines = entry(["tracker:Mood", "sleep"]);
      const region = locateTrackerRegion(lines);
      expect(region).not.toBeNull();
      expect(region!.marked).toBe(true);
      expect(lines[region!.bodyStart]).toBe("tracker:Mood");
      expect(lines[region!.bodyEnd]).toBe(END);
    });

    it("falls back to an unmarked fence that holds tracker directives", () => {
      const lines = [FENCE, "tracker:Mood", CLOSE];
      const region = locateTrackerRegion(lines);
      expect(region!.marked).toBe(false);
      expect(region!.bodyStart).toBe(1);
      expect(region!.bodyEnd).toBe(2);
    });

    it("never elects a bare nav block as the tracker region", () => {
      // Trackers dropped into the navigation strip is the exact duplication
      // the template sync already guards against; the per-note editor must not
      // reintroduce it from the other end.
      const lines = [FENCE, "nav", CLOSE, "", "no trackers here"];
      expect(locateTrackerRegion(lines)).toBeNull();
    });

    it("returns null for a note with no chronoanvil fence at all", () => {
      expect(locateTrackerRegion(["# Just a note", "", "text"])).toBeNull();
    });

    it("ignores an unterminated fence rather than guessing its end", () => {
      expect(locateTrackerRegion([FENCE, "tracker:Mood"])).toBeNull();
    });
  });

  describe("noteTrackerDirectives", () => {
    it("reads the modules a note shows, in render order", () => {
      expect(noteTrackerDirectives(entry(["tracker:Mood", "sleep"]))).toEqual([
        "tracker:Mood",
        "sleep",
      ]);
    });

    it("skips the markers and any non-tracker directive sharing the block", () => {
      const lines = [FENCE, START, "tracker:Mood", "links:home", END, CLOSE];
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:Mood"]);
    });

    it("ignores a directive mentioned in prose rather than a fence", () => {
      const lines = [
        "Some prose mentioning tracker:KM in passing.",
        ...entry(["tracker:Mood"]),
      ];
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:Mood"]);
    });

    // ── the note, not the region ──────────────────────────────────────
    // The renderer walks fences, so a tracker outside the marked region is
    // still a control the reader can see. A picker that consulted only the
    // region would offer it again and hand one property two editors.

    it("sees a tracker sharing the banner fence but sitting outside the markers", () => {
      const lines = [
        FENCE,
        "journal-header",
        "tracker:confidence",
        START,
        "tracker:status",
        END,
        CLOSE,
      ];
      expect(noteTrackerDirectives(lines)).toEqual([
        "tracker:confidence",
        "tracker:status",
      ]);
      // The region is still the narrower span — that's where writes go.
      expect(regionTrackerDirectives(lines)).toEqual(["tracker:status"]);
    });

    it("sees a tracker in a note with no marked region at all", () => {
      // A template that predates the markers. locateTrackerRegion's unmarked
      // fallback happens to cover this one, but the answer must not depend on
      // which fence it elects.
      const lines = [FENCE, "study-header", "tracker:confidence", CLOSE];
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:confidence"]);
    });

    it("sees a tracker in a second fence the region isn't in", () => {
      // The case the region genuinely cannot reach: markers in one block,
      // a hand-placed widget in another.
      const lines = [
        FENCE,
        START,
        "tracker:status",
        END,
        CLOSE,
        "",
        FENCE,
        "tracker:confidence",
        CLOSE,
      ];
      expect(noteTrackerDirectives(lines)).toEqual([
        "tracker:status",
        "tracker:confidence",
      ]);
      expect(regionTrackerDirectives(lines)).toEqual(["tracker:status"]);
    });
  });

  // ── the banner's crumb trail, for any journal type ────────────────────
  describe("journalAncestors", () => {
    // journalAncestors reads type.root and nothing else — no plugin at all
    // since 2.42, which is the point of a JournalType being plain data.
    const cooking = buildJournalType({
      id: "cooking",
      name: "Cooking",
      emoji: "🍳",
      root: "03 - Journals/Cooking",
      templatesFolder: "00 - Infrastructure/Templates/Cooking",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
    });

    it("names a leaf note's containers, outermost first", () => {
      const out = journalAncestors(STUDY_JOURNAL,
        "03 - Journals/Study/Maths/Algebra/Quadratics.md"
      );
      expect(out.map((a) => a.name)).toEqual(["Maths", "Algebra"]);
      expect(out.map((a) => a.folder)).toEqual([
        "03 - Journals/Study/Maths",
        "03 - Journals/Study/Maths/Algebra",
      ]);
    });

    it("treats a folder note as its own folder", () => {
      // `Algebra/Algebra.md` *is* the Algebra container, so it has the same
      // ancestors a leaf beside it does — the banner drops the last one as
      // being the note itself.
      expect(
        journalAncestors(STUDY_JOURNAL,
          "03 - Journals/Study/Maths/Algebra/Algebra.md"
        ).map((a) => a.name)
      ).toEqual(["Maths", "Algebra"]);
    });

    it("reads a one-level journal, whose notes have a single container", () => {
      expect(
        journalAncestors(cooking,
          "03 - Journals/Cooking/Sauces/Béchamel.md"
        ).map((a) => a.name)
      ).toEqual(["Sauces"]);
    });

    it("never returns more containers than the type has levels", () => {
      // A note filed deeper than the type's hierarchy allows shouldn't invent
      // crumbs for folders the type has no noun for.
      expect(
        journalAncestors(cooking,
          "03 - Journals/Cooking/Sauces/Warm/Hollandaise.md"
        ).map((a) => a.name)
      ).toEqual(["Sauces"]);
    });

    it("returns nothing for a note sitting at the type's root", () => {
      expect(
        journalAncestors(STUDY_JOURNAL, "03 - Journals/Stray.md")
      ).toEqual([]);
    });

    it("resolves each type against its own root, not the journals root", () => {
      // Cooking's root is nested inside Study's. Reading paths.journalsRoot
      // directly — which is what the old Study-only implementation did —
      // would make "Cooking" itself the first crumb of every recipe.
      expect(
        journalAncestors(cooking,
          "03 - Journals/Cooking/Sauces/Béchamel.md"
        ).map((a) => a.name)
      ).not.toContain("Cooking");
    });
  });

  // ── custom journals get the same banner Study has ─────────────────────
  describe("custom journal templates", () => {
    const cfg = freshCustomJournal(new Set());
    const files = customTemplateFiles(cfg);
    const byName = (name: string): string =>
      files.find((f) => f.name === name)!.content;

    it("writes one template per level and one per kind", () => {
      expect(files.map((f) => f.name)).toEqual(["section-index.md", "entry.md"]);
    });

    it("gives the kind template a banner with a managed tracker region", () => {
      // Without this a custom journal has no grid to render a tracker in, so
      // the journal built-ins existed in its registry and were invisible in
      // its notes.
      const t = byName("entry.md");
      expect(t).toContain("journal-header");
      expect(t).toContain("# chronoanvil:trackers:start");
      expect(t).toContain("# chronoanvil:trackers:end");
      expect(t.indexOf("journal-header")).toBeLessThan(
        t.indexOf("# chronoanvil:trackers:start")
      );
    });

    it("takes both journal built-ins from the registry", () => {
      const t = byName("entry.md");
      expect(t).toContain("tracker:confidence");
      expect(t).toContain("tracker:status");
      expect(t).not.toContain("select:status:");
    });

    it("gives the index template a banner and real frontmatter", () => {
      // It used to carry a `**Status:** Active` line that could never say
      // anything else — the same prose-instead-of-property the Study templates
      // dropped in 2.26.
      const t = byName("section-index.md");
      expect(t).toContain("journal-header");
      expect(t).toMatch(/^type: section$/m);
      expect(t).toMatch(/^status: in-progress$/m);
      expect(t).toContain("tracker:status");
      expect(t).not.toContain("**Status:** Active");
    });

    it("keeps an index note out of its own Notes table", () => {
      // The table lists what is *under* this folder. The old generic table
      // filtered `type != null` and had to exclude the index's own type by
      // name; the catalogue's per-kind tables name one kind, so an index note
      // is out of scope by construction rather than by exception.
      //
      // `kind-table:entry` since 2.54, where it was `type == "entry"` inside a
      // ```base block. Same statement, made to ChronoAnvil instead of to Bases.
      const t = byName("section-index.md");
      expect(t).toContain("kind-table:entry");
      expect(t).not.toContain("type != null");
    });

    it("derives the index note's type from the level noun", () => {
      const custom = customTemplateFiles({
        ...cfg,
        levels: [{ noun: "Project Area", fallbackEmoji: "📂" }],
      });
      expect(custom[0].name).toBe("project-area-index.md");
      expect(custom[0].content).toMatch(/^type: project-area$/m);
    });

    it("lets the banner own the title rather than a second heading", () => {
      // Same rule the Lesson and Practice templates follow: the banner renders
      // a click-to-edit title, so an H1 above it would be the same name twice.
      // (`# chronoanvil:trackers:start` is a marker comment, not a heading — hence
      // matching the token rather than a bare `# `.)
      for (const name of ["entry.md", "section-index.md"]) {
        expect(byName(name)).not.toContain("{{title}}");
        expect(byName(name)).not.toMatch(/^#\s+\S*\s*\{\{/m);
      }
    });

    // ── leak 1: Study's level nouns in every type's frontmatter ──────────
    describe("derives leaf frontmatter from the type's own levels", () => {
      const leaf = (levels: JournalLevelConfig[]): string =>
        customTemplateFiles({ ...cfg, levels }).find((f) =>
          f.name === "entry.md"
        )!.content;

      it("names the containers after this journal's nouns, not Study's", () => {
        // The leak: `subject:`/`topic:` were written into every custom type.
        // A Cooking journal with a Section level got a `subject` property that
        // nothing would ever write and nothing would ever read.
        const t = leaf([{ noun: "Cuisine", fallbackEmoji: "🍳" }]);
        expect(t).toMatch(/^cuisine: \{\{subject\}\}$/m);
        expect(t).not.toMatch(/^subject:/m);
        expect(t).not.toMatch(/^topic:/m);
      });

      it("writes one property per container level, outermost first", () => {
        const t = leaf([
          { noun: "Cuisine", fallbackEmoji: "🍳" },
          { noun: "Dish", fallbackEmoji: "🍲" },
        ]);
        expect(t).toMatch(/^cuisine: \{\{subject\}\}$/m);
        expect(t).toMatch(/^dish: \{\{topic\}\}$/m);
        expect(t.indexOf("cuisine:")).toBeLessThan(t.indexOf("dish:"));
      });

      it("uses the same rule the index template writes its own type with", () => {
        // deriveLevelId on both sides. A second spelling here would generate
        // leaf notes naming a container the index note calls something else.
        const files = customTemplateFiles({
          ...cfg,
          levels: [{ noun: "Project Area", fallbackEmoji: "📂" }],
        });
        const index = files.find((f) => f.name === "project-area-index.md")!;
        expect(index.content).toMatch(/^type: project-area$/m);
        expect(
          files.find((f) => f.name === "entry.md")!.content
        ).toMatch(/^project-area: \{\{subject\}\}$/m);
      });

      it("drops a level whose noun collides with a key it already writes", () => {
        // YAML keeps one of two identical keys and which one is a parser
        // detail, so the level line loses to the property the plugin reads.
        const t = leaf([{ noun: "Status", fallbackEmoji: "📂" }]);
        expect(t).toMatch(/^status: in-progress$/m);
        expect(t).not.toMatch(/^status: \{\{/m);
      });

      it("stops at the deepest level newNote has a token for", () => {
        // Three levels, two positional tokens. Emitting `{{...}}` for the
        // third would leave the literal braces in the finished note.
        const t = leaf([
          { noun: "One", fallbackEmoji: "📂" },
          { noun: "Two", fallbackEmoji: "📂" },
          { noun: "Three", fallbackEmoji: "📂" },
        ]);
        expect(t).toMatch(/^one: \{\{subject\}\}$/m);
        expect(t).toMatch(/^two: \{\{topic\}\}$/m);
        expect(t).not.toMatch(/^three:/m);
      });
    });

    // ── leak 2: a stale Confidence seeded whatever the kind measures ─────
    describe("seeds the rating the kind actually declares", () => {
      const leafFor = (kind: JournalKindConfig): string => {
        const files = customTemplateFiles({ ...cfg, kinds: [kind] });
        return files.find((f) => f.name === `${kind.id}.md`)!.content;
      };

      it("seeds nothing for a kind that measures nothing", () => {
        // The leak: `confidence: 1` regardless. A kind rated on nothing got a
        // Confidence it has no use for, and the review queue then treated the
        // note as gradeable.
        const t = leafFor({ id: "note", emoji: "📝", label: "Note" });
        expect(t).not.toContain("confidence");
        expect(t).not.toMatch(/^\w+: 1$/m);
        expect(t).toContain("tracker:status");
      });

      it("seeds the declared rating for a kind rated on something else", () => {
        const t = leafFor({
          id: "drill",
          emoji: "🛠️",
          label: "Drill",
          rating: "accuracy",
        });
        expect(t).toMatch(/^accuracy: 1$/m);
        expect(t).toContain("tracker:accuracy");
        expect(t).not.toContain("confidence");
      });

      it("puts the rating in the banner grid, above Status", () => {
        // The shipped Lesson and Practice regions are rating-then-status, and
        // the generated one is the same list from the same declaration rather
        // than a second hardcoded pair.
        const t = leafFor({
          id: "drill",
          emoji: "🛠️",
          label: "Drill",
          rating: "accuracy",
        });
        expect(t.indexOf("tracker:accuracy")).toBeLessThan(
          t.indexOf("tracker:status")
        );
      });

      it("keeps Status on a kind graded on something else — the 3.18 loss", () => {
        // THIS TEST ASSERTED THE OPPOSITE UNTIL 3.18, and the inversion is the
        // one behaviour §7.4 gives up rather than an accident to be repaired.
        //
        // A kind used to enumerate `trackers`, so a sibling naming Status made
        // this kind's silence about it a real exclusion. With the list gone,
        // exclusion is by RATING only: nothing here is graded on Status, so
        // Status is unmentioned, and unmentioned is universal.
        //
        // What is lost is the ability to hide a NON-RATING tracker from one
        // kind. What that costs is a longer "+ Add tracker" picker and one more
        // widget in a generated banner — entry-trackers.ts is explicit that the
        // kind gate "can never strand a value or manufacture a refusal", so a
        // widening cannot break a note. What is kept is the split that mattered:
        // b is graded on accuracy and a is not, and no average mixes them.
        const files = customTemplateFiles({
          ...cfg,
          kinds: [
            { id: "a", emoji: "📝", label: "A" },
            { id: "b", emoji: "📝", label: "B", rating: "accuracy" },
          ],
        });
        const b = files.find((f) => f.name === "b.md")!.content;
        const a = files.find((f) => f.name === "a.md")!.content;
        expect(b).toContain("tracker:accuracy");
        expect(b).toContain("tracker:status");
        // The exclusion that survives, and the one worth having: a is not
        // graded on accuracy, so it is not offered it.
        expect(a).not.toContain("tracker:accuracy");
      });

      it("keeps Status when no kind of the type has an opinion about it", () => {
        const t = leafFor({ id: "note", emoji: "📝", label: "Note" });
        expect(t).toContain("tracker:status");
      });
    });
  });

  describe("noteEditedProperties", () => {
    it("collects the properties a registry tracker writes", () => {
      const lines = [FENCE, START, "tracker:Mood", END, CLOSE];
      expect(noteEditedProperties(trackers, lines)).toEqual(["Mood"]);
    });

    it("counts all three properties the coupled sleep module owns", () => {
      const lines = [FENCE, START, "sleep", END, CLOSE];
      expect(noteEditedProperties(trackers, lines).sort()).toEqual([
        "Bedtime",
        "Sleep",
        "Wake-Up",
      ]);
    });

    it("sees a raw slider or select editing a property directly", () => {
      // The pre-registry spelling the Study templates used. A vault set up
      // before Confidence and Status became trackers still writes notes this
      // way, because scaffold.ts never overwrites an existing template.
      const lines = [
        FENCE,
        "journal-header",
        "slider:confidence|🎯 Confidence (1-5)",
        "select:status:in-progress=In Progress,completed=Completed|📌 Status",
        CLOSE,
      ];
      expect(noteEditedProperties(trackers, lines).sort()).toEqual([
        "confidence",
        "status",
      ]);
    });

    it("reads time and date widgets too", () => {
      const lines = [FENCE, "time:Wake-Up|😴 Up", "date:Deadline", CLOSE];
      expect(noteEditedProperties(trackers, lines).sort()).toEqual([
        "Deadline",
        "Wake-Up",
      ]);
    });

    it("ignores directives that write no property", () => {
      const lines = [FENCE, "study-header", "links:home,up", "nav", CLOSE];
      expect(noteEditedProperties(trackers, lines)).toEqual([]);
    });
  });

  describe("not offering what the note already shows", () => {
    it("excludes a tracker rendering from outside the region", () => {
      const lines = [
        FENCE,
        "journal-header",
        "tracker:confidence",
        START,
        END,
        CLOSE,
      ];
      const opts = trackerOptions(
        trackers,
        true,
        noteTrackerDirectives(lines),
        journalSurface("study")
      ).map((o) => o.directive);
      expect(opts).not.toContain("tracker:confidence");
    });

    it("refuses to insert a duplicate of one already outside the region", () => {
      const lines = [
        FENCE,
        "journal-header",
        "tracker:confidence",
        START,
        END,
        CLOSE,
      ];
      expect(insertTrackerDirective(lines, "tracker:confidence")).toBeNull();
    });

    it("excludes a tracker whose property a raw widget already edits", () => {
      // The upgrade case, end to end: an old Lesson template gives the note a
      // `slider:confidence`, so offering Confidence would hand one property
      // two controls — a stepper and a slider fighting over the same value.
      const lines = [
        FENCE,
        "journal-header",
        "slider:confidence|🎯 Confidence (1-5)",
        "select:status:in-progress=In Progress,completed=Completed|📌 Status",
        CLOSE,
      ];
      const opts = trackerOptions(
        trackers,
        true,
        noteTrackerDirectives(lines),
        journalSurface("study"),
        noteEditedProperties(trackers, lines)
      ).map((o) => o.directive);
      expect(opts).not.toContain("tracker:confidence");
      expect(opts).not.toContain("tracker:status");
    });

    it("still offers a journal tracker the note has no control for", () => {
      // The exclusion must not become "offer nothing on an old note".
      const lines = [FENCE, "study-header", "slider:confidence", CLOSE];
      const opts = trackerOptions(
        trackers,
        true,
        noteTrackerDirectives(lines),
        journalSurface("cooking"),
        noteEditedProperties(trackers, lines)
      ).map((o) => o.directive);
      expect(opts).toContain("tracker:Recipe rating");
    });

    it("removes a directive sitting outside the region", () => {
      // The × is drawn on whatever renders, so it has to be able to take that
      // widget off again.
      const lines = [
        FENCE,
        "journal-header",
        "tracker:confidence",
        START,
        "tracker:status",
        END,
        CLOSE,
      ];
      const out = removeTrackerDirective(lines, "tracker:confidence")!;
      expect(out).not.toBeNull();
      expect(noteTrackerDirectives(out)).toEqual(["tracker:status"]);
    });
  });

  describe("insertTrackerDirective", () => {
    it("appends after the last directive, inside the markers", () => {
      const out = insertTrackerDirective(entry(["tracker:Mood", "sleep"]), "tracker:KM")!;
      expect(noteTrackerDirectives(out)).toEqual([
        "tracker:Mood",
        "sleep",
        "tracker:KM",
      ]);
      // The end marker still follows the body — the splice landed inside it.
      expect(out[out.indexOf("tracker:KM") + 1]).toBe(END);
    });

    it("declines a duplicate rather than adding a second widget for one property", () => {
      expect(insertTrackerDirective(entry(["tracker:KM"]), "tracker:KM")).toBeNull();
    });

    it("writes into an empty marked region", () => {
      const out = insertTrackerDirective(entry([]), "tracker:KM")!;
      expect(noteTrackerDirectives(out)).toEqual(["tracker:KM"]);
    });

    it("creates the region inside the entry banner's own fence", () => {
      // Reversed in 2.18.4. This used to assert the region landed in a fence of
      // its own *below* the header, on the rule "never splice into an existing
      // block". The banner made that rule wrong: the strip and the grid render
      // as one card out of one fence, so a region written below it would put
      // the note's trackers outside the banner that exists to hold them.
      const lines = ["---", "journal-date: 2026-07-23", "---", FENCE, "entry-header", CLOSE, "", "body"];
      const out = insertTrackerDirective(lines, "tracker:KM")!;
      expect(noteTrackerDirectives(out)).toEqual(["tracker:KM"]);
      // Inside the banner: after its directive, before its closing fence.
      expect(out.indexOf("tracker:KM")).toBeGreaterThan(out.indexOf("entry-header"));
      expect(out.indexOf("tracker:KM")).toBeLessThan(out.indexOf(CLOSE));
      expect(out.filter((l) => l.trim() === "entry-header")).toHaveLength(1);
      // and no second fence was opened for it
      expect(out.filter((l) => l.trim() === FENCE)).toHaveLength(1);
    });

    it("creates a region after frontmatter when there is no fence at all", () => {
      const out = insertTrackerDirective(["---", "a: 1", "---", "body"], "tracker:KM")!;
      expect(noteTrackerDirectives(out)).toEqual(["tracker:KM"]);
      expect(out.indexOf("tracker:KM")).toBeGreaterThan(out.lastIndexOf("---"));
    });

    it("leaves a nav block alone when it has to create a region", () => {
      const out = insertTrackerDirective([FENCE, "nav", CLOSE], "tracker:KM")!;
      const navFenceEnd = out.indexOf("nav") + 1;
      expect(out[navFenceEnd]).toBe(CLOSE);
      expect(noteTrackerDirectives(out)).toEqual(["tracker:KM"]);
    });
  });

  describe("mergeEntryFences", () => {
    // The pre-2.18.4 shape: two consecutive fences, which Obsidian renders as
    // two blocks — the reason the banner could not enclose the grid.
    const twoFence = [
      "---",
      "journal-date: 2026-07-23",
      "---",
      "`chronoanvil:spacer`",
      FENCE,
      "entry-header",
      CLOSE,
      "",
      FENCE,
      START,
      "tracker:Mood",
      "sleep",
      END,
      CLOSE,
      "",
      "---",
      "body",
    ].join("\n");

    it("folds the tracker fence into the banner, preserving order and markers", () => {
      const out = mergeEntryFences(twoFence)!;
      const lines = out.split("\n");
      expect(lines.filter((l) => l.trim() === FENCE)).toHaveLength(1);
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:Mood", "sleep"]);
      // The region is still marked, and still inside the one remaining fence.
      const region = locateTrackerRegion(lines)!;
      expect(region.marked).toBe(true);
      expect(lines[region.fenceOpen]).toBe(FENCE);
      expect(lines.slice(region.fenceOpen, region.fenceClose)).toContain(
        "entry-header"
      );
      // Nothing after the banner was disturbed.
      expect(out.endsWith("---\nbody")).toBe(true);
    });

    it("is a no-op on a note that is already merged", () => {
      const merged = mergeEntryFences(twoFence)!;
      expect(mergeEntryFences(merged)).toBeNull();
    });

    it("is a no-op when the note has no entry banner", () => {
      const noBanner = [FENCE, START, "tracker:Mood", END, CLOSE].join("\n");
      expect(mergeEntryFences(noBanner)).toBeNull();
    });

    it("is a no-op when the banner has no tracker fence after it", () => {
      const bare = [FENCE, "entry-header", CLOSE, "", "body"].join("\n");
      expect(mergeEntryFences(bare)).toBeNull();
    });

    it("leaves the note alone when prose separates the two fences", () => {
      // Reordering a note whose layout someone has deliberately changed is a
      // judgement about that layout, not a migration.
      const spaced = [
        FENCE,
        "entry-header",
        CLOSE,
        "",
        "Some notes I wrote here.",
        "",
        FENCE,
        START,
        "tracker:Mood",
        END,
        CLOSE,
      ].join("\n");
      expect(mergeEntryFences(spaced)).toBeNull();
    });

    it("does not fold a following fence that holds no trackers", () => {
      const next = [FENCE, "entry-header", CLOSE, "", FENCE, "tasks:todo", CLOSE].join("\n");
      expect(mergeEntryFences(next)).toBeNull();
    });

    it("merges an unmarked tracker fence too", () => {
      const unmarked = [FENCE, "entry-header", CLOSE, "", FENCE, "tracker:Mood", CLOSE].join("\n");
      const out = mergeEntryFences(unmarked)!;
      expect(out.split("\n").filter((l) => l.trim() === FENCE)).toHaveLength(1);
      expect(noteTrackerDirectives(out.split("\n"))).toEqual(["tracker:Mood"]);
    });

    it("carries an empty region across, so a monthly review keeps somewhere to add to", () => {
      const empty = [FENCE, "entry-header", CLOSE, "", FENCE, START, END, CLOSE].join("\n");
      const out = mergeEntryFences(empty)!;
      const lines = out.split("\n");
      expect(lines.filter((l) => l.trim() === FENCE)).toHaveLength(1);
      expect(locateTrackerRegion(lines)!.marked).toBe(true);
      expect(noteTrackerDirectives(lines)).toEqual([]);
    });
  });

  describe("splitEntryFences", () => {
    const singleFenceMerged = [
      "---",
      "journal-date: 2026-07-23",
      "---",
      "`chronoanvil:spacer`",
      FENCE,
      "links:home,today,scopes#diary",
      "entry-header",
      START,
      "tracker:Mood",
      "sleep",
      END,
      CLOSE,
      "",
      "---",
      "body",
    ].join("\n");

    it("splits merged banner and trackers into two distinct fences", () => {
      const out = splitEntryFences(singleFenceMerged)!;
      const lines = out.split("\n");
      expect(lines.filter((l) => l.trim() === FENCE)).toHaveLength(2);
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:Mood", "sleep"]);
      const region = locateTrackerRegion(lines)!;
      expect(region.marked).toBe(true);
      expect(lines.slice(region.fenceOpen, region.fenceClose)).not.toContain("entry-header");
      expect(lines.slice(region.fenceOpen, region.fenceClose)).not.toContain("links:home,today,scopes#diary");
    });

    it("is a no-op on a note whose banner and trackers are already separate (4.20+ format)", () => {
      const alreadySplit = splitEntryFences(singleFenceMerged)!;
      expect(splitEntryFences(alreadySplit)).toBeNull();
    });

    it("is a no-op when the note has no banner", () => {
      const noBanner = [FENCE, START, "tracker:Mood", END, CLOSE].join("\n");
      expect(splitEntryFences(noBanner)).toBeNull();
    });

    it("is a no-op when the banner fence has no trackers", () => {
      const bareBanner = [FENCE, "links:home,today", "entry-header", CLOSE].join("\n");
      expect(splitEntryFences(bareBanner)).toBeNull();
    });
  });

  describe("removeTrackerDirective", () => {
    it("removes only the named module", () => {
      const out = removeTrackerDirective(entry(["tracker:Mood", "sleep", "tracker:KM"]), "sleep")!;
      expect(noteTrackerDirectives(out)).toEqual(["tracker:Mood", "tracker:KM"]);
    });

    it("returns null when the note doesn't carry it", () => {
      expect(removeTrackerDirective(entry(["tracker:Mood"]), "tracker:KM")).toBeNull();
    });

    it("never touches an identical line outside the region", () => {
      const lines = ["tracker:KM", ...entry(["tracker:KM"])];
      const out = removeTrackerDirective(lines, "tracker:KM")!;
      expect(out[0]).toBe("tracker:KM"); // the prose line survives
      expect(noteTrackerDirectives(out)).toEqual([]);
    });

    it("round-trips with insert", () => {
      const before = entry(["tracker:Mood", "sleep"]);
      const added = insertTrackerDirective(before, "tracker:Weight")!;
      expect(removeTrackerDirective(added, "tracker:Weight")).toEqual(before);
    });
  });

  describe("trackerOptions", () => {
    it("offers what the note doesn't already show", () => {
      const opts = trackerOptions(trackers, true, ["tracker:Mood", "sleep"], diarySurface("daily"));
      expect(opts.map((o) => o.directive)).toEqual(["tracker:KM", "tracker:Weight"]);
    });

    it("ignores showInTemplate — an occasional tracker is the whole point", () => {
      // KM and Weight are both off for new entries, and both must still be
      // reachable per-entry, or the setting means "disabled" rather than
      // "not by default". The class is a boundary; the seed flag is a default,
      // and only the first is enforced here.
      const opts = trackerOptions(trackers, true, [], diarySurface("daily"));
      expect(opts.map((o) => o.directive)).toContain("tracker:KM");
      expect(opts.map((o) => o.directive)).toContain("tracker:Weight");
    });

    it("offers Wake-Up + Bedtime only as the one coupled sleep module", () => {
      const opts = trackerOptions(trackers, true, ["tracker:Mood"], diarySurface("daily"));
      expect(opts.map((o) => o.directive)).toContain("sleep");
      expect(opts.map((o) => o.directive)).not.toContain("tracker:Wake-Up");
      expect(opts.map((o) => o.directive)).not.toContain("tracker:Bedtime");
    });

    it("never offers the derived Sleep value, which is computed not entered", () => {
      const opts = trackerOptions(trackers, true, [], diarySurface("daily"));
      expect(opts.map((o) => o.directive)).not.toContain("tracker:Sleep");
    });

    // ── 2.19: the class gate ──────────────────────────────────────────
    // The reason the whole feature exists. A daily module in a monthly review
    // doesn't collect the measurement its name promises — a Mood logged
    // against July is not a Mood logged against the 14th — so the picker
    // refuses rather than accepting it and leaving the problem to surface
    // later, in a chart, as a number that looks fine and isn't.

    it("never offers a daily tracker on a monthly entry", () => {
      const opts = trackerOptions(trackers, true, [], diarySurface("monthly")).map((o) => o.directive);
      expect(opts).not.toContain("tracker:Mood");
      expect(opts).not.toContain("tracker:KM");
      expect(opts).not.toContain("tracker:Weight");
    });

    it("never offers a monthly tracker on a daily entry", () => {
      const opts = trackerOptions(trackers, true, [], diarySurface("daily")).map((o) => o.directive);
      expect(opts).not.toContain("tracker:Savings");
    });

    it("offers the monthly tracker on a monthly entry", () => {
      const opts = trackerOptions(trackers, true, [], diarySurface("monthly")).map((o) => o.directive);
      expect(opts).toEqual(["tracker:Savings"]);
    });

    // ── the surface gate, beyond the diary ────────────────────────────

    it("never offers a diary tracker on a journal note", () => {
      const opts = trackerOptions(trackers, true, [], journalSurface("study")).map((o) => o.directive);
      expect(opts).not.toContain("tracker:Mood");
      expect(opts).not.toContain("tracker:Savings");
      expect(opts).not.toContain("sleep");
    });

    it("never offers a journal tracker on a diary entry", () => {
      const opts = trackerOptions(trackers, true, [], diarySurface("daily")).map((o) => o.directive);
      expect(opts).not.toContain("tracker:confidence");
      expect(opts).not.toContain("tracker:Recipe rating");
    });

    it("offers an all-journals tracker on every type", () => {
      // The built-in surface: `typeId: null` means a new custom journal gets
      // confidence without anything being seeded into its registry.
      for (const type of ["study", "cooking", "brand-new"]) {
        const opts = trackerOptions(trackers, true, [], journalSurface(type)).map((o) => o.directive);
        expect(opts).toContain("tracker:confidence");
      }
    });

    it("keeps a type-scoped journal tracker inside its own type", () => {
      const cooking = trackerOptions(trackers, true, [], journalSurface("cooking")).map((o) => o.directive);
      const study = trackerOptions(trackers, true, [], journalSurface("study")).map((o) => o.directive);
      expect(cooking).toContain("tracker:Recipe rating");
      expect(study).not.toContain("tracker:Recipe rating");
    });

    it("withholds the coupled sleep module from a monthly entry", () => {
      // Bedtime and Wake-Up are one night's two clock times, and a month has
      // no night to read them against.
      const opts = trackerOptions(trackers, true, [], diarySurface("monthly")).map((o) => o.directive);
      expect(opts).not.toContain("sleep");
    });

    it("filters nothing on a note it can't classify", () => {
      // A dashboard, a hand-built page, a scratch file. The rule keeps daily
      // and monthly entries from borrowing each other's modules; it is not a
      // licence to police tracker grids wherever else one has been put, and a
      // note we can't classify is not one we know enough about to refuse.
      const opts = trackerOptions(trackers, true, [], null).map((o) => o.directive);
      expect(opts).toContain("tracker:KM");
      expect(opts).toContain("tracker:Savings");
      expect(opts).toContain("tracker:confidence");
      expect(opts).toContain("sleep");
    });

    it("withholds the sleep module when the superset is switched off", () => {
      const opts = trackerOptions(trackers, false, []);
      expect(opts.map((o) => o.directive)).not.toContain("sleep");
    });

    it("treats either half of the pair as already present", () => {
      // A hand-written note may carry the two times separately; offering the
      // coupled control on top would give one property two editors.
      const opts = trackerOptions(trackers, true, ["tracker:Bedtime"]);
      expect(opts.map((o) => o.directive)).not.toContain("sleep");
    });

    it("matches a relabelled directive against its tracker", () => {
      const opts = trackerOptions(trackers, true, ["tracker:KM|Cycling"]);
      expect(opts.map((o) => o.directive)).not.toContain("tracker:KM");
    });
  });

  // ── classifying the note a tracker is being put on ───────────────────
  describe("classifyNote", () => {
    // The default layout, and the one that makes the journal half hard: Study
    // claims the journals root itself, and a custom journal's default root is
    // a folder *inside* it. Every custom-journal note therefore sits under two
    // registered roots.
    const paths = {
      diaryDaily: "02 - Diary/Weekly",
      diaryMonthly: "02 - Diary/Monthly",
      templatesDiary: "00 - Infrastructure/Templates/Diary",
      journalRoots: [
        { typeId: "study", root: "03 - Journals" },
        { typeId: "cooking", root: "03 - Journals/Cooking" },
      ],
    };

    it("reads the journal property first", () => {
      // What the entry says it is beats where it sits: a note moved out of its
      // folder is still a monthly review, and `journal` is already what
      // Diary.base and the search filters key off.
      expect(classifyNote(paths, "somewhere/else.md", "Monthly Entry")).toEqual(diarySurface("monthly"));
      expect(classifyNote(paths, "somewhere/else.md", "Daily Notes")).toEqual(diarySurface("daily"));
    });

    it("falls back to the folder when the frontmatter is missing", () => {
      expect(classifyNote(paths, "02 - Diary/Monthly/Month-2026-07.md")).toEqual(diarySurface("monthly"));
      expect(classifyNote(paths, "02 - Diary/Weekly/Day-2026-07-14.md")).toEqual(diarySurface("daily"));
    });

    it("lets the property override a mismatched folder", () => {
      expect(
        classifyNote(paths, "02 - Diary/Weekly/Month-2026-07.md", "Monthly Entry")
      ).toEqual(diarySurface("monthly"));
    });

    it("classifies each diary template, which is in neither entry folder", () => {
      expect(
        classifyNote(paths, "00 - Infrastructure/Templates/Diary/Daily.md")
      ).toEqual(diarySurface("daily"));
      expect(
        classifyNote(paths, "00 - Infrastructure/Templates/Diary/Monthly Entry.md")
      ).toEqual(diarySurface("monthly"));
    });

    it("ignores a non-string journal property rather than throwing", () => {
      expect(classifyNote(paths, "Homepage.md", 42)).toBeNull();
      expect(classifyNote(paths, "02 - Diary/Weekly/Day-2026-07-14.md", null)).toEqual(diarySurface("daily"));
    });

    it("doesn't match a folder by name prefix alone", () => {
      // "02 - Diary/Weekly Archive" is not inside "02 - Diary/Weekly".
      expect(classifyNote(paths, "02 - Diary/Weekly Archive/Day-2026-07-14.md")).toBeNull();
    });

    // ── the 4.81 period tree ──────────────────────────────────────────
    //
    // An entry written today is in NO grain folder — it is inside the periods
    // that contain it — so the folder pass alone returned null for every one of
    // them, and a note that classifies as nothing gets no tracker, no head and
    // no section menu. The filename carries the grain because `entryNoteName`
    // put it there.
    it("classifies an entry in the period tree by its filename", () => {
      const tree = "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08";
      expect(
        classifyNote(DEFAULT_PATHS, `${tree}/Week-2026-W35/Day-2026-08-29.md`)
      ).toEqual(diarySurface("daily"));
      expect(
        classifyNote(DEFAULT_PATHS, `${tree}/Week-2026-W35/Week-2026-W35.md`)
      ).toEqual(diarySurface("weekly"));
      expect(classifyNote(DEFAULT_PATHS, `${tree}/Month-2026-08.md`)).toEqual(
        diarySurface("monthly")
      );
      expect(
        classifyNote(
          DEFAULT_PATHS,
          "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Quarter-2026-Q3.md"
        )
      ).toEqual(diarySurface("quarterly"));
      expect(
        classifyNote(DEFAULT_PATHS, "02 - Diary/Entries/Year-2026/Year-2026.md")
      ).toEqual(diarySurface("yearly"));
    });

    it("only reads the prefix inside the diary", () => {
      // The prefixes are the plugin's, not the vault's. A reader's own
      // `Week-in-review` is not a weekly entry, and would be handed the weekly
      // trackers and a **WEEKLY ENTRY** eyebrow if this pass were global.
      expect(
        classifyNote(DEFAULT_PATHS, "01 - Notes/Week-in-review.md")
      ).toBeNull();
      expect(classifyNote(DEFAULT_PATHS, "02 - Diary/Homepage.md")).toBeNull();
    });

    it("knows the period dashboards at both addresses", () => {
      // 4.81 moved these into `Dashboards/`, where no grain folder contains
      // them; until then each one WAS its grain folder's note. Both vaults have
      // a weekly dashboard.
      expect(
        classifyNote(DEFAULT_PATHS, "02 - Diary/Dashboards/Weekly.md")
      ).toEqual(diarySurface("weekly"));
      expect(
        classifyNote(DEFAULT_PATHS, "02 - Diary/Dashboards/Yearly.md")
      ).toEqual(diarySurface("yearly"));
      expect(
        classifyNote(DEFAULT_PATHS, "02 - Diary/Quarterly/Quarterly.md")
      ).toEqual(diarySurface("quarterly"));
    });

    // ── the journal half ──────────────────────────────────────────────

    it("resolves each level of a journal type from its path", () => {
      // Subject index, topic index, and the two leaf kinds. All four are the
      // same answer: the surface is the *type*, not the level or the kind.
      const study = journalSurface("study");
      expect(classifyNote(paths, "03 - Journals/Maths/Maths.md")).toEqual(study);
      expect(classifyNote(paths, "03 - Journals/Maths/Algebra/Algebra.md")).toEqual(study);
      expect(classifyNote(paths, "03 - Journals/Maths/Algebra/Quadratics.md")).toEqual(study);
      expect(classifyNote(paths, "03 - Journals/Maths/Algebra/Drills.md")).toEqual(study);
    });

    it("gives a nested custom root its own type, not the root it sits inside", () => {
      // THE journal-path test. Study's root is the journals root itself and a
      // custom journal defaults to a folder under it, so this note is inside
      // both — and Study's root is the shorter match. Registration order would
      // resolve every custom-journal note to Study; longest root wins is what
      // makes the nesting work at all.
      expect(classifyNote(paths, "03 - Journals/Cooking/Sauces/Béchamel.md")).toEqual(
        journalSurface("cooking")
      );
      expect(classifyNote(paths, "03 - Journals/Cooking/Cooking.md")).toEqual(
        journalSurface("cooking")
      );
    });

    it("doesn't care what order the roots arrive in", () => {
      // The sort is by root length, not by position, so a type registered
      // first can't shadow one registered later.
      const reversed = { ...paths, journalRoots: [...paths.journalRoots].reverse() };
      expect(classifyNote(reversed, "03 - Journals/Cooking/Sauces/Béchamel.md")).toEqual(
        journalSurface("cooking")
      );
    });

    it("returns null for a note outside every root", () => {
      // Null means unclassified, and unclassified is deliberately permissive
      // downstream — refusing what we can't classify would break hand-built
      // pages for no gain.
      expect(classifyNote(paths, "Homepage.md")).toBeNull();
      expect(classifyNote(paths, "02 - Diary/Year.md")).toBeNull();
      expect(classifyNote(paths, "04 - Archive/Old Study/Maths.md")).toBeNull();
    });

    it("leaves a journal type's own templates unclassified", () => {
      // A journal template lives under templatesFolder, not under the type's
      // root. Unlike a diary template nothing regenerates it, so a directive
      // written there is the user's and stays — which is exactly why this
      // resolves to null instead of being named the way CLASS_DEFS names the
      // diary templates.
      expect(
        classifyNote(paths, "00 - Infrastructure/Templates/Studies/Lesson.md")
      ).toBeNull();
    });

    it("reads a diary folder placed inside the journals root as diary", () => {
      // The diary passes run first, so a vault that points diaryDaily
      // somewhere unusual still gets its entries classified as entries.
      const odd = { ...paths, diaryDaily: "03 - Journals/Daybook" };
      expect(classifyNote(odd, "03 - Journals/Daybook/Day-2026-07-14.md")).toEqual(
        diarySurface("daily")
      );
    });

    it("classifies nothing as a journal when no types are registered", () => {
      const none = { ...paths, journalRoots: [] };
      expect(classifyNote(none, "03 - Journals/Maths/Algebra/Quadratics.md")).toBeNull();
    });
  });

  // ── which folders a surface's readings live in ───────────────────────
  describe("surfaceFolders", () => {
    const paths = {
      diaryDaily: "02 - Diary/Weekly",
      diaryMonthly: "02 - Diary/Monthly",
      templatesDiary: "00 - Infrastructure/Templates/Diary",
      journalRoots: [
        { typeId: "study", root: "03 - Journals" },
        { typeId: "cooking", root: "03 - Journals/Cooking" },
      ],
    };

    it("gives a diary class its own folder", () => {
      expect(surfaceFolders(paths, diarySurface("daily"))).toEqual(["02 - Diary/Weekly"]);
      expect(surfaceFolders(paths, diarySurface("monthly"))).toEqual(["02 - Diary/Monthly"]);
    });

    it("gives a journal type its root", () => {
      expect(surfaceFolders(paths, journalSurface("cooking"))).toEqual([
        "03 - Journals/Cooking",
      ]);
    });

    it("gives the all-journals surface every root", () => {
      expect(surfaceFolders(paths, journalSurface(null))).toEqual([
        "03 - Journals",
        "03 - Journals/Cooking",
      ]);
    });

    it("gives nothing for a type that is no longer registered", () => {
      // A tracker can outlive the journal it was scoped to — deleting the type
      // doesn't delete the registry entry. No folder is the honest answer;
      // counting readings against a folder that isn't there would be worse.
      expect(surfaceFolders(paths, journalSurface("gone"))).toEqual([]);
    });
  });

  // ── 2.19: which Diary.base views take a class's columns ──────────────
  describe("viewAcceptsClass", () => {
    it("gives an unfiltered view every class's columns", () => {
      // The shipped "Recent Entries" view mixes both kinds, and is the one
      // place a monthly reading and a daily one legitimately share a table.
      expect(viewAcceptsClass(undefined, "daily")).toBe(true);
      expect(viewAcceptsClass(undefined, "monthly")).toBe(true);
      expect(viewAcceptsClass("", "daily")).toBe(true);
    });

    it("keeps a class's columns out of a view scoped to another class", () => {
      // Otherwise "Monthly Entries" gains Mood/Wake-Up/Bedtime columns that
      // are blank in every row by construction.
      expect(viewAcceptsClass('journal == "Monthly Entry"', "daily")).toBe(false);
      expect(viewAcceptsClass('journal == "Daily Notes"', "monthly")).toBe(false);
    });

    it("gives a view scoped to a class its own columns", () => {
      expect(viewAcceptsClass('journal == "Monthly Entry"', "monthly")).toBe(true);
      expect(viewAcceptsClass('journal == "Daily Notes"', "daily")).toBe(true);
    });

    it("tolerates a non-string filter rather than throwing", () => {
      // Diary.base is user-editable YAML; a filter written as a map or list is
      // the user's business, and the sync must not die on it mid-write.
      expect(viewAcceptsClass({ and: [] }, "daily")).toBe(true);
      expect(viewAcceptsClass(null, "monthly")).toBe(true);
    });

    it("excludes a view naming another class anywhere in a compound filter", () => {
      expect(
        viewAcceptsClass('journal == "Monthly Entry" and file.hasTag("x")', "daily")
      ).toBe(false);
    });
  });

  // ── the study banner is a banner too ─────────────────────────────────
  describe("tracker regions in a study banner", () => {
    // The four levels, as the shipped templates write them. Subject and topic
    // are index notes (state, no series); lesson and practice are leaves.
    const banner = (...body: string[]): string[] => [
      "---",
      "type: lesson",
      "---",
      "`chronoanvil:spacer`",
      "```chronoanvil",
      "journal-header",
      ...body,
      "```",
      "",
      "## Notes",
    ];

    it("finds the marked region inside a study banner", () => {
      const lines = banner(
        "# chronoanvil:trackers:start",
        "tracker:confidence",
        "# chronoanvil:trackers:end"
      );
      const region = locateTrackerRegion(lines)!;
      expect(region).not.toBeNull();
      expect(region.marked).toBe(true);
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:confidence"]);
    });

    it("writes a fresh region INSIDE the banner, not a new fence below it", () => {
      // The bug this fixes. entryHeaderFence matched only `entry-header`, so a
      // study note fell through to the no-banner path and got a whole new
      // ```chronoanvil block after the first one — putting the note's trackers
      // outside the card that exists to hold them.
      const lines = banner();
      const out = createTrackerRegion(lines);
      expect(out.filter((l) => l.trim() === "```chronoanvil")).toHaveLength(1);
      const region = locateTrackerRegion(out)!;
      expect(region.marked).toBe(true);
      // The region sits between the banner's own directive and its closing
      // fence, so the grid renders welded beneath the strip.
      expect(out.indexOf("# chronoanvil:trackers:start")).toBeGreaterThan(
        out.indexOf("journal-header")
      );
      expect(out.indexOf("# chronoanvil:trackers:end")).toBeLessThan(
        out.lastIndexOf("```")
      );
    });

    it("round-trips add and remove on a study banner", () => {
      let lines = banner(
        "# chronoanvil:trackers:start",
        "# chronoanvil:trackers:end"
      );
      lines = insertTrackerDirective(lines, "tracker:confidence")!;
      lines = insertTrackerDirective(lines, "tracker:status")!;
      expect(noteTrackerDirectives(lines)).toEqual([
        "tracker:confidence",
        "tracker:status",
      ]);

      lines = removeTrackerDirective(lines, "tracker:confidence")!;
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:status"]);
      // Removing the last one leaves the region, not a dead end: the add tile
      // renders from the markers alone.
      lines = removeTrackerDirective(lines, "tracker:status")!;
      expect(noteTrackerDirectives(lines)).toEqual([]);
      expect(locateTrackerRegion(lines)!.marked).toBe(true);
    });

    it("leaves a non-tracker cell outside the region alone", () => {
      // `related-lessons` sits above the markers on the Practice template. It
      // isn't a registry tracker, nothing can remove it, and the picker's
      // splice must never reach it.
      const lines = banner(
        "related-lessons|🔗 Related Lessons",
        "# chronoanvil:trackers:start",
        "tracker:status",
        "# chronoanvil:trackers:end"
      );
      expect(noteTrackerDirectives(lines)).toEqual(["tracker:status"]);
      const out = insertTrackerDirective(lines, "tracker:confidence")!;
      expect(out).toContain("related-lessons|🔗 Related Lessons");
      expect(out.indexOf("related-lessons|🔗 Related Lessons")).toBeLessThan(
        out.indexOf("# chronoanvil:trackers:start")
      );
    });

    it("still writes its own fence on a note with no banner at all", () => {
      // The no-banner path is unchanged — it was only ever wrong when a banner
      // was present and unrecognised.
      const lines = ["---", "type: note", "---", "", "## Notes"];
      const out = createTrackerRegion(lines);
      expect(out.filter((l) => l.trim() === "```chronoanvil")).toHaveLength(1);
      expect(locateTrackerRegion(out)!.marked).toBe(true);
    });
  });

  describe("directiveAllowedOn", () => {
    it("refuses a directive whose tracker belongs to another surface", () => {
      expect(directiveAllowedOn(trackers, "tracker:Mood", diarySurface("monthly"))).toBe(false);
      expect(directiveAllowedOn(trackers, "tracker:Savings", diarySurface("daily"))).toBe(false);
      expect(directiveAllowedOn(trackers, "tracker:Mood", journalSurface("study"))).toBe(false);
      expect(directiveAllowedOn(trackers, "tracker:confidence", diarySurface("daily"))).toBe(false);
    });

    it("allows a directive that matches", () => {
      expect(directiveAllowedOn(trackers, "tracker:Mood", diarySurface("daily"))).toBe(true);
      expect(directiveAllowedOn(trackers, "tracker:Savings", diarySurface("monthly"))).toBe(true);
      expect(directiveAllowedOn(trackers, "tracker:confidence", journalSurface("study"))).toBe(true);
    });

    it("lets an all-journals tracker onto any type", () => {
      for (const type of ["study", "cooking", "brand-new"]) {
        expect(directiveAllowedOn(trackers, "tracker:confidence", journalSurface(type))).toBe(true);
      }
    });

    it("keeps a type-scoped tracker out of another type", () => {
      expect(directiveAllowedOn(trackers, "tracker:Recipe rating", journalSurface("cooking"))).toBe(true);
      expect(directiveAllowedOn(trackers, "tracker:Recipe rating", journalSurface("study"))).toBe(false);
    });

    it("treats the coupled sleep module as its two halves", () => {
      expect(directiveAllowedOn(trackers, "sleep", diarySurface("daily"))).toBe(true);
      expect(directiveAllowedOn(trackers, "sleep", diarySurface("monthly"))).toBe(false);
      expect(directiveAllowedOn(trackers, "sleep", journalSurface("study"))).toBe(false);
    });

    it("ignores an inline label override when matching the registry", () => {
      expect(directiveAllowedOn(trackers, "tracker:Mood|How was it?", diarySurface("monthly"))).toBe(false);
    });

    it("allows anything on an unclassified note", () => {
      expect(directiveAllowedOn(trackers, "tracker:Savings", null)).toBe(true);
      expect(directiveAllowedOn(trackers, "tracker:confidence", null)).toBe(true);
    });

    it("defers to buildTracker's own error for an unknown tracker", () => {
      // "Unknown tracker" is a different and better message than "wrong
      // surface", and the renderer reports it first — so this must not claim
      // the directive is misplaced.
      expect(directiveAllowedOn(trackers, "tracker:Nonexistent", diarySurface("daily"))).toBe(true);
    });
  });

  // ── confirming a move that would strand readings ──────────────────────
  describe("resurfacePrompt", () => {
    const names = (id: string): string | undefined =>
      ({ study: "Study", cooking: "Cooking" })[id];

    it("asks for nothing when the surface didn't change", () => {
      expect(resurfacePrompt("Weight", diarySurface("daily"), diarySurface("daily"), 40)).toBeNull();
      expect(
        resurfacePrompt("Confidence", journalSurface("study"), journalSurface("study"), 40)
      ).toBeNull();
    });

    it("asks for nothing when the old surface holds no readings", () => {
      // A fresh tracker, or one whose surface is being fixed before any data
      // exists: the common cases stay one click.
      expect(resurfacePrompt("Weight", diarySurface("daily"), diarySurface("monthly"), 0)).toBeNull();
    });

    it("treats a negative count as nothing to strand", () => {
      expect(resurfacePrompt("X", diarySurface("daily"), diarySurface("monthly"), -1)).toBeNull();
    });

    it("confirms, with the count, when a move would strand readings", () => {
      const p = resurfacePrompt("Weight", diarySurface("daily"), diarySurface("monthly"), 12)!;
      expect(p).not.toBeNull();
      expect(p.message).toContain("12 readings");
      expect(p.message).toContain("nothing on disk is edited");
    });

    it("singularises one reading", () => {
      const p = resurfacePrompt("Weight", diarySurface("daily"), diarySurface("monthly"), 1)!;
      expect(p.message).toContain("1 reading in");
      expect(p.message).not.toContain("1 readings");
    });

    it("names the destination in title and button", () => {
      const p = resurfacePrompt("Weight", diarySurface("daily"), diarySurface("monthly"), 3)!;
      expect(p.title).toContain("Monthly");
      expect(p.confirmLabel).toContain("Monthly");
    });

    it("names a journal destination by its display name, not its id", () => {
      const p = resurfacePrompt(
        "Confidence", diarySurface("daily"), journalSurface("cooking"), 3, names
      )!;
      expect(p.title).toContain("Cooking");
      expect(p.title).not.toContain("cooking\"");
      expect(p.confirmLabel).toContain("Cooking");
    });

    it("falls back to the raw id when the type has no name to give", () => {
      // A tracker can outlive the journal it named. The prompt still has to
      // say something, and the id is what there is.
      const p = resurfacePrompt(
        "Confidence", diarySurface("daily"), journalSurface("gone"), 3, names
      )!;
      expect(p.title).toContain("gone");
    });

    it("gives the diary-to-journal move its own reason", () => {
      // Within the diary the argument is about periods — a daily series can't
      // become a monthly one without a reduction the data doesn't carry.
      // Crossing to a journal it isn't about periods at all: the readings are
      // simply in notes the new surface doesn't cover.
      const within = resurfacePrompt("Weight", diarySurface("daily"), diarySurface("monthly"), 5)!;
      const across = resurfacePrompt(
        "Weight", diarySurface("daily"), journalSurface("cooking"), 5, names
      )!;
      expect(within.message).toContain("read monthly entries from now on");
      expect(across.message).toContain("somewhere else entirely");
      expect(across.message).not.toContain("read cooking entries");
    });

    it("points at the two-tracker alternative rather than offering a move", () => {
      const p = resurfacePrompt("Weight", diarySurface("daily"), diarySurface("monthly"), 5)!;
      expect(p.message).toContain("cancel and add a separate");
    });
  });

  describe("describeSurfaceMismatch", () => {
    const names = (id: string): string | undefined =>
      ({ study: "Study", cooking: "Cooking" })[id];

    it("names both surfaces and the way out", () => {
      const msg = describeSurfaceMismatch(trackers, "tracker:Mood", diarySurface("monthly"));
      expect(msg).toContain("☀️ Mood");
      expect(msg).toContain("daily tracker");
      expect(msg).toContain("monthly entry");
      expect(msg).toContain("Settings → Trackers");
    });

    it("names a journal type rather than repeating two slugs", () => {
      const msg = describeSurfaceMismatch(
        trackers, "tracker:Recipe rating", journalSurface("study"), names
      );
      expect(msg).toContain("Cooking tracker");
      expect(msg).toContain("Study note");
    });

    it("calls a journal note a note and a diary entry an entry", () => {
      expect(
        describeSurfaceMismatch(trackers, "tracker:Mood", journalSurface("study"), names)
      ).toContain("Study note");
      expect(
        describeSurfaceMismatch(trackers, "tracker:confidence", diarySurface("daily"))
      ).toContain("daily entry");
    });
  });

  describe("directiveProperties / isEmptyValue", () => {
    it("maps the sleep module to both times plus the derived value", () => {
      expect(directiveProperties(trackers, "sleep")).toEqual([
        "Bedtime",
        "Wake-Up",
        "Sleep",
      ]);
    });

    it("maps a plain tracker to its one property", () => {
      expect(directiveProperties(trackers, "tracker:KM")).toEqual(["KM"]);
    });

    it("treats zero as a real reading, not an empty slot", () => {
      // Removing a widget prunes only untouched properties. A logged 0 km is a
      // fact about that day and must survive the widget being taken away.
      expect(isEmptyValue(0)).toBe(false);
      expect(isEmptyValue("")).toBe(true);
      expect(isEmptyValue(null)).toBe(true);
      expect(isEmptyValue(undefined)).toBe(true);
    });
  });

  describe("describeDirective", () => {
    it("names a tracker from the registry", () => {
      expect(describeDirective(trackers, "tracker:KM")).toBe("🏃 KM");
    });

    it("names the coupled pair from the built-ins' own labels", () => {
      expect(describeDirective(trackers, "sleep")).toBe("🌙 Bedtime + 😴 Wake-Up");
    });

    it("still identifies a tracker deleted from Settings, so it can be removed", () => {
      expect(describeDirective(trackers, "tracker:Gone")).toBe("⚠️ Gone");
    });
  });
});

describe("the tracker grid is editable per entry", () => {
  const css = readCss();

  it("styles the scale context-note affordance", () => {
    // The pencil is appended by the widget code, so the stylesheet is the only
    // thing that positions it over the selected face and shows the "has a
    // note" accent. It is a badge on the reading now, not a button beside the
    // widget — and it must not eat the click, since the face underneath is
    // what opens the capture.
    for (const cls of [
      ".ca-journal-scale-note-mark",
      ".ca-journal-scale-note-mark.has-note",
      "pointer-events: none",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("styles the Habits cell its boolean trackers fold into", () => {
    // The cell, its wrapping chip row and the chips are all built by the
    // code-block processor rather than written into the note, so a missing
    // rule leaves a row of bare buttons where a set of pills should be.
    for (const cls of [
      ".ca-journal-habits-cell",
      ".ca-journal-habits-row",
      ".ca-journal-habit-chip",
      ".ca-journal-habit-chip-btn",
      ".ca-journal-habit-chip-name",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("reveals a habit chip's remove × per chip, not per cell", () => {
    // The generic cell rule reveals .journal-tracker-remove on cell hover,
    // which is right for a cell holding one tracker and wrong for this one:
    // hovering anywhere in Habits would light up every × at once. The cell
    // rule is cancelled and re-granted on the chip.
    expect(css).toContain(".ca-journal-habit-chip:hover");
    expect(css).toMatch(
      /\.ca-journal-habits-cell:hover[\s\S]{0,120}\.ca-journal-tracker-remove\s*\{\s*opacity:\s*0;/
    );
  });

  it("styles the + Add tracker picker window", () => {
    // The picker is a modal the plugin draws itself, borrowing the editor's
    // frame. Without these it is an unstyled list in a box.
    for (const cls of [
      ".ca-tracker-picker",
      ".ca-picker-search",
      ".ca-picker-list",
      ".ca-picker-row",
      ".ca-picker-row-detail",
      ".ca-picker-empty",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("styles the add tile and the per-cell remove button", () => {
    // Both controls are appended by the code-block processor rather than
    // written into the note, so the stylesheet is the only thing that makes
    // them look like part of the grid. A missing rule leaves a raw button
    // sitting in the middle of the logging cells.
    for (const cls of [
      ".ca-journal-tracker-add",
      ".ca-journal-tracker-add-btn",
      ".ca-journal-tracker-remove",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("keeps the remove button anchored to its cell", () => {
    // It is absolutely positioned, which only works because the cell itself is
    // a positioning context. Losing that rule sends every × to the corner of
    // the page.
    expect(css).toMatch(
      /\.ca-journal-tracker-bar \.ca-journal-tracker-cell \{[^}]*position: relative/
    );
  });

  it("keeps the remove button reachable without hover", () => {
    // Hover-only chrome does not exist on a phone, which is where a daily
    // journal is most often filled in.
    expect(css).toMatch(/@media \(hover: none\)[^}]*\{[^]*?journal-tracker-remove/);
  });
});

// ── scale-notes.ts: tagged capture context notes (2.21) ──────────────────
describe("scale note tag", () => {
  const note = (over: Partial<ScaleNote>): ScaleNote =>
    ({ trackerId: "Mood", value: 4, text: "rough day", ...over });

  it("formats the tagged fragment the capture layer stamps", () => {
    expect(formatScaleNoteTag(note({}))).toBe("[scale:Mood=4] rough day");
  });

  it("round-trips through format → parse", () => {
    const frag = formatScaleNoteTag(note({}))!;
    expect(parseScaleNoteLine(frag)).toEqual({
      trackerId: "Mood", value: 4, text: "rough day",
    });
  });

  it("parses the tag out of a full timestamped capture line", () => {
    const line = "09:14 — [scale:Mood=4] rough afternoon";
    expect(parseScaleNoteLine(line)).toEqual({
      trackerId: "Mood", value: 4, text: "rough afternoon",
    });
  });

  it("keeps a bare tag (no prose) — the timestamp still records the reading", () => {
    expect(formatScaleNoteTag(note({ text: "   " }))).toBe("[scale:Mood=4]");
    expect(parseScaleNoteLine("08:00 — [scale:Mood=4]")).toEqual({
      trackerId: "Mood", value: 4, text: "",
    });
  });

  it("keeps the value numeric for exact pairing to a reading", () => {
    const p = parseScaleNoteLine("7:00 — [scale:Weight=72.5] heavy lunch")!;
    expect(p.value).toBe(72.5);
    expect(typeof p.value).toBe("number");
  });

  it("handles a decimal and a negative value", () => {
    expect(parseScaleNoteLine("[scale:X=-2] low")!.value).toBe(-2);
    expect(parseScaleNoteLine("[scale:X=3.5] mid")!.value).toBe(3.5);
  });

  it("parses an id containing '=' by anchoring on the last one", () => {
    const p = parseScaleNoteLine("[scale:a=b=4] note")!;
    expect(p.trackerId).toBe("a=b");
    expect(p.value).toBe(4);
  });

  it("ignores lines with no tag or a malformed one", () => {
    expect(parseScaleNoteLine("09:00 — just a normal capture")).toBeNull();
    expect(parseScaleNoteLine("[scale:Mood=] no value")).toBeNull();
    expect(parseScaleNoteLine("[scale:Mood=nan] bad")).toBeNull();
    expect(parseScaleNoteLine("")).toBeNull();
  });

  it("flattens newlines so a note stays one capture line", () => {
    expect(normalizeNoteText("a\nb   c")).toBe("a b c");
    expect(formatScaleNoteTag(note({ text: "a\nb" }))!.split("\n")).toHaveLength(1);
  });

  it("refuses to format an id that couldn't be parsed back", () => {
    expect(canAnnotate("ok")).toBe(true);
    expect(canAnnotate("bad]id")).toBe(false);
    expect(formatScaleNoteTag(note({ trackerId: "bad]id" }))).toBeNull();
  });

  it("survives a note whose own text contains the marker syntax", () => {
    // The tag closes at the first ], so a "[scale:x=1]" typed as prose after it
    // stays prose rather than becoming a second tag.
    const frag = formatScaleNoteTag(note({ text: "looked like [scale:x=1]" }))!;
    const round = parseScaleNoteLine(`09:00 — ${frag}`)!;
    expect(round.trackerId).toBe("Mood");
    expect(round.value).toBe(4);
    expect(round.text).toContain("[scale:x=1]");
  });
});

describe("scale notes in a capture log", () => {
  const log = [
    "08:10 — woke up late",
    "09:14 — [scale:Mood=4] good walk",
    "12:00 — [scale:Energy=2] drained",
    "13:30 — lunch with A",
  ].join("\n");

  it("pulls every tagged note out of a mixed capture block, in order", () => {
    expect(parseScaleNotes(log)).toEqual([
      { trackerId: "Mood", value: 4, text: "good walk" },
      { trackerId: "Energy", value: 2, text: "drained" },
    ]);
  });

  it("reports a note present only for the matching tracker AND value", () => {
    expect(hasScaleNoteFor(log, "Mood", 4)).toBe(true);
    // Same tracker, different value — the 4's note doesn't describe a 5.
    expect(hasScaleNoteFor(log, "Mood", 5)).toBe(false);
    // Different tracker entirely.
    expect(hasScaleNoteFor(log, "Focus", 4)).toBe(false);
  });

  it("finds a note whether or not it carries prose", () => {
    expect(hasScaleNoteFor("07:00 — [scale:Mood=3]", "Mood", 3)).toBe(true);
  });

  it("is empty for a log with no tagged lines", () => {
    expect(parseScaleNotes("08:00 — nothing tagged here")).toEqual([]);
    expect(hasScaleNoteFor("08:00 — nothing tagged", "Mood", 4)).toBe(false);
  });
});

// ── a journal type's containers exclude another type's root ───────────────
//
// ── 2.45: Study is a tenant of the journals root, not the root itself ─────
//
// The defect this closes was reported as "the study journal puts its subjects
// directly into 03 - Journals". It did, and everything downstream followed
// from it: any folder a user made under the journals root became a Study
// subject by construction, so an unregistered journal type's folder was
// adopted rather than ignored, and the symptom — a custom journal listed as a
// Study subject — was indistinguishable from a legitimate arrangement.
describe("Study's default root", () => {
  // `DEFAULT_PATHS.studyRoot` went with the migration that read it (3.21).
  // Study's root is derived from its name like every other journal's, so these
  // ask the preset rather than the path table — the same claims, about the
  // object that now holds the answer.
  const installed = (): JournalConfig =>
    presetAsNewJournal(STUDY_PRESET, {
      journalsRoot: DEFAULT_PATHS.journalsRoot,
      templates: DEFAULT_PATHS.templates,
    });

  it("sits under the journals root rather than being it", () => {
    expect(STUDY_JOURNAL.root).toBe(`${DEFAULT_PATHS.journalsRoot}/Study`);
    expect(installed().root).toBe(STUDY_JOURNAL.root);
  });

  it("is a sibling of a custom journal's derived root, not its parent", () => {
    const cooking = deriveJournalFolders("Cooking", {
      journalsRoot: DEFAULT_PATHS.journalsRoot,
      templates: DEFAULT_PATHS.templates,
    });
    const study = installed().root;
    expect(cooking.root.startsWith(`${study}/`)).toBe(false);
    expect(study.startsWith(`${cooking.root}/`)).toBe(false);
  });

  it("leaves a folder under the journals root unclaimed by anyone", () => {
    // The whole point. Before 2.45 this folder was a Study subject whether or
    // not anything had registered it, which is why an unloaded config looked
    // like a working vault.
    const plugin = {
      settings: {
        paths: DEFAULT_PATHS,
        // Study installed, as a stored journal (3.20). The claim under test is
        // unchanged: a folder under the journals root belongs to nobody unless
        // a registered journal claims it.
        customJournals: [installed()],
      },
    } as unknown as Parameters<typeof journalChildFolders>[0];
    const roots = registeredJournalTypes(plugin).map((t) => ({
      typeId: t.id,
      root: t.root,
    }));
    expect(
      journalTypeOfPath(roots, `${DEFAULT_PATHS.journalsRoot}/Cooking/Italian/Ragu.md`)
    ).toBeNull();
    // …while a Study note still resolves to Study.
    expect(
      journalTypeOfPath(roots, `${installed().root}/Maths/Algebra/Quadratics.md`)
    ).toBe("study");
  });

  it("is remapped as a journal's own root, not as a configured path", () => {
    // `studyRoot` was a real path under ROOT_CHILDREN.journalsRoot, so renaming
    // the journals root carried it by the same prefix remap every other child
    // path got. Since 3.21 Study has no entry there and none is wanted: its
    // root lives in its config, and `remapConfiguredPaths` walks
    // `customJournals` for exactly that. The empty list is the statement.
    expect(ROOT_CHILDREN.journalsRoot).toEqual([]);
    expect(readSrc("pathwatch")).toContain("customJournals");
  });
});

// Reproduces the arrangement that produced the bug: one type's root sitting
// inside another's, so the inner type's root folder sits exactly where the
// outer type's containers sit and is indistinguishable from one by shape alone
// — Study listed it as a subject and its sections as topics, and the journal
// appeared twice on the home page.
//
// This WAS the default layout until 2.45, when Study moved from the journals
// root into its own folder beneath it. The stub therefore pins Study's root to
// the journals root explicitly: the rule still has to hold, because a custom
// journal's root is a settings value and can still be pointed inside another
// type's root — it is just no longer what a vault gets by default.
describe("journalChildFolders", () => {
  const plugin = {
    settings: {
      paths: { journalsRoot: "03 - Journals", studyRoot: "03 - Journals" },
      customJournals: [
        {
          id: "cook-book",
          name: "Cook Book",
          emoji: "📕",
          root: "03 - Journals/Cook Book",
          templatesFolder: "05 - Templates/Cook Book",
          levels: [{ noun: "Section", fallbackEmoji: "📂" }],
          kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
        },
      ],
    },
  } as unknown as Parameters<typeof journalChildFolders>[0];

  const cookBook = registeredJournalTypes(plugin).find(
    (t) => t.id === "cook-book"
  )!;

  const journalsRoot = (): TFolder => {
    const root = new TFolder("03 - Journals");
    root.children = [
      new TFolder("03 - Journals/Cook Book"),
      new TFolder("03 - Journals/Maths"),
      new TFolder("03 - Journals/History"),
    ];
    return root;
  };

  it("keeps another type's root out of Study's subjects", () => {
    expect(
      journalChildFolders(plugin, STUDY_JOURNAL, journalsRoot()).map(
        (f) => f.name
      )
    ).toEqual(["History", "Maths"]);
  });

  it("treats every registered root as foreign when there is no type", () => {
    // 3.19.1: a folder outside every journal belongs to none, so there is no
    // journal whose siblings should be spared. Callers used to pass
    // `?? STUDY_JOURNAL` here and thereby spare Study's root from a listing
    // that had nothing to do with Study — and on a vault with Study turned
    // off, spare a root that was not registered at all.
    const root = journalsRoot();
    root.children.push(new TFolder("03 - Journals/Loose Notes"));
    expect(journalChildFolders(plugin, null, root).map((f) => f.name)).toEqual([
      "History",
      "Loose Notes",
      "Maths",
    ]);
  });

  it("spares Study's root only when Study is the host", () => {
    // The contrast that makes the case above meaningful rather than incidental.
    const root = new TFolder("03 - Journals");
    root.children = [new TFolder("03 - Journals/Cook Book")];
    expect(
      journalChildFolders(plugin, STUDY_JOURNAL, root).map((f) => f.name)
    ).toEqual([]);
    expect(journalChildFolders(plugin, null, root).map((f) => f.name)).toEqual(
      []
    );
  });

  it("still lists a type's own root's children as its containers", () => {
    const cookRoot = new TFolder("03 - Journals/Cook Book");
    cookRoot.children = [new TFolder("03 - Journals/Cook Book/Baking")];
    expect(
      journalChildFolders(plugin, cookBook, cookRoot).map((f) => f.name)
    ).toEqual(["Baking"]);
  });

  it("does not exclude a type's own root from its own listing", () => {
    // The filter is "another type's root", not "any type's root". A journal
    // whose root happened to be listed under itself would vanish entirely.
    const nested = new TFolder("03 - Journals");
    nested.children = [new TFolder("03 - Journals/Cook Book")];
    expect(
      journalChildFolders(plugin, cookBook, nested).map((f) => f.name)
    ).toEqual(["Cook Book"]);
  });

  it("filters at any depth, not just directly under the root", () => {
    // A custom root is a settings value. Pointing one at a folder two deep
    // would make it look like a Study *topic* — the same bug one level down.
    const deep = {
      settings: {
        ...(plugin as unknown as { settings: Record<string, unknown> }).settings,
        customJournals: [
          {
            id: "cook-book",
            name: "Cook Book",
            emoji: "📕",
            root: "03 - Journals/Maths/Cook Book",
            templatesFolder: "05 - Templates/Cook Book",
            levels: [{ noun: "Section", fallbackEmoji: "📂" }],
            kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
          },
        ],
      },
    } as unknown as Parameters<typeof journalChildFolders>[0];
    const maths = new TFolder("03 - Journals/Maths");
    maths.children = [
      new TFolder("03 - Journals/Maths/Algebra"),
      new TFolder("03 - Journals/Maths/Cook Book"),
    ];
    expect(
      journalChildFolders(deep, STUDY_JOURNAL, maths).map((f) => f.name)
    ).toEqual(["Algebra"]);
  });

  it("is unaffected when Study is turned off", () => {
    const noStudy = {
      settings: {
        ...(plugin as unknown as { settings: Record<string, unknown> }).settings,
        studyEnabled: false,
      },
    } as unknown as Parameters<typeof journalChildFolders>[0];
    const cookRoot = new TFolder("03 - Journals/Cook Book");
    cookRoot.children = [new TFolder("03 - Journals/Cook Book/Baking")];
    expect(
      journalChildFolders(noStudy, cookBook, cookRoot).map((f) => f.name)
    ).toEqual(["Baking"]);
  });

  it("returns nothing for a missing folder", () => {
    expect(journalChildFolders(plugin, STUDY_JOURNAL, null)).toEqual([]);
  });
});

// ── Fold state has a lifecycle ───────────────────────────────────────────
//
// `collapsedNoteSections` is keyed `<notePath>::<section title>` and lives in
// settings, so a fold syncs across devices like every other setting. What it
// lacked was any response to the vault changing underneath it: a rename reset
// every fold in the note, and a deletion left its keys in data.json forever.

describe("collapsed section keys follow a rename", () => {
  const make = () => ({
    paths: { journalsRoot: "03 - Journals" },
    collapsedNoteSections: {
      "03 - Journals/Maths/Maths.md::🗂️ Topics": true,
      "03 - Journals/Maths/Algebra/Algebra.md::🔁 Review": true,
      "02 - Diary/2026-01-01.md::Tasks": true,
    } as Record<string, boolean>,
  });

  it("retargets every fold under a renamed folder", () => {
    const s = make();
    const changed = remapConfiguredPaths(s, "03 - Journals", "Journals", true);
    expect(Object.keys(s.collapsedNoteSections).sort()).toEqual([
      "02 - Diary/2026-01-01.md::Tasks",
      "Journals/Maths/Algebra/Algebra.md::🔁 Review",
      "Journals/Maths/Maths.md::🗂️ Topics",
    ]);
    expect(changed).toContain("collapsed sections");
  });

  it("retargets a single note rename", () => {
    const s = make();
    remapConfiguredPaths(
      s,
      "03 - Journals/Maths/Maths.md",
      "03 - Journals/Maths/Mathematics.md",
      false
    );
    expect(
      s.collapsedNoteSections["03 - Journals/Maths/Mathematics.md::🗂️ Topics"]
    ).toBe(true);
  });

  it("leaves untouched notes alone and reports nothing", () => {
    const s = make();
    const changed = remapConfiguredPaths(s, "99 - Nowhere", "Elsewhere", true);
    expect(changed).not.toContain("collapsed sections");
    expect(Object.keys(s.collapsedNoteSections)).toHaveLength(3);
  });

  it("splits on the last separator, so a title may contain one", () => {
    // A note path can't hold "::" — Obsidian forbids `:` in file names — but a
    // section title can.
    const s = {
      paths: {},
      collapsedNoteSections: { "a/b.md::Note:: read this": true },
    };
    remapConfiguredPaths(s, "a", "z", true);
    expect(s.collapsedNoteSections["z/b.md::Note:: read this"]).toBe(true);
  });
});

describe("pruneCollapsedSections", () => {
  it("drops folds for notes that no longer exist", () => {
    const folds = {
      "kept.md::A": true,
      "gone.md::A": true,
      "gone.md::B": true,
    };
    expect(pruneCollapsedSections(folds, new Set(["kept.md"]))).toBe(2);
    expect(Object.keys(folds)).toEqual(["kept.md::A"]);
  });

  it("leaves a malformed key rather than guessing at it", () => {
    const folds = { "no-separator": true };
    expect(pruneCollapsedSections(folds, new Set())).toBe(0);
    expect(folds["no-separator"]).toBe(true);
  });

  it("reports zero when there is nothing to do", () => {
    const folds = { "kept.md::A": true };
    expect(pruneCollapsedSections(folds, new Set(["kept.md"]))).toBe(0);
  });
});

describe("a fold key splits at the first separator (3.13 §6)", () => {
  it("keeps a section whose title contains the separator", () => {
    // The comment above SECTION_KEY_SEP proved the right answer and then stated
    // the opposite: a note path cannot contain `::` and a section TITLE can, so
    // the side that cannot contain it is the side BEFORE the separator, and the
    // first occurrence is always the boundary.
    //
    // Split at the last, `Home.md::📊 Before :: After` yields the path
    // `Home.md::📊 Before`, which matches no live note — so this section's fold
    // state was deleted at every startup, and a rename never retargeted it.
    const folds = { "Home.md::📊 Before :: After": true };
    expect(pruneCollapsedSections(folds, new Set(["Home.md"]))).toBe(0);
    expect(folds).toEqual({ "Home.md::📊 Before :: After": true });
  });

  it("still drops a key whose note is gone", () => {
    // The narrowing must not cost the pruning its job.
    const folds = { "Gone.md::📊 A :: B": true };
    expect(pruneCollapsedSections(folds, new Set(["Home.md"]))).toBe(1);
    expect(folds).toEqual({});
  });
});

// ── A header bar's fold scope stops at a markdown heading ────────────────
//
// The bug this guards, measured on the shipped Lesson template before the fix:
// its only bar is `header:📄 Pages`, nothing after it was another bar, so
// folding it hid 21 blocks — every heading, both widgets and the whole body.
// The user folded a pages table and the note vanished.
//
// headerbar.ts::recompute does the real walk over rendered DOM siblings; this
// models the same rule over a template's blocks, which is what decides whether
// a shipped template can be folded sensibly at all.

describe("fold scope in the shipped templates", () => {
  // Blocks as Obsidian renders them: one per blank-line-separated chunk.
  const blocksOf = (text: string): string[] =>
    text
      .split(/^---$/m)
      .slice(2)
      .join("---")
      .split(/\n\s*\n/)
      .filter((b) => b.trim());

  // What a fold of the first bar hides, under the rule that a bar is closed by
  // the next bar OR by any markdown heading.
  //
  // Counts TWO things, because the real walk does — see headerbar.ts, which
  // opens by naming them: "A bar owns TWO KINDS OF THING and both are siblings
  // rather than children. The blocks after it … and the widgets welded into
  // its own fence." Until 2.54 nearly every section put its body in the block
  // *after* its bar, so counting blocks was the whole of it. Now most sections
  // are one fence, and a model that only looked at following blocks would
  // report 0 for a section that folds perfectly well.
  //
  // A welded line counts iff it renders as a sibling of the bar rather than
  // into it: `button:` and the simple widgets anchor inside the bar and go
  // with it, everything else is a composite that Widgets.register appends to
  // the shared container. See COMPOSITE_KINDS in widgets.ts — this is the
  // text-level shadow of that set, and it is the one thing here that would
  // need editing if a simple widget were ever welded into a section's fence.
  const weldedSiblings = (fenceBlock: string): number =>
    fenceBlock
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l !== "" &&
          !l.startsWith("```") &&
          !l.startsWith("header:") &&
          !l.startsWith("button:") &&
          !l.startsWith("#")
      ).length;

  const hiddenAfterFirstBar = (text: string): number => {
    let active = false;
    let hidden = 0;
    for (const b of blocksOf(text)) {
      const isBar = /^```chronoanvil\nheader:/m.test(b);
      // `# chronoanvil:trackers:start` is a marker comment inside a fence, never a
      // heading. The real walk in headerbar.ts can't be fooled by it — it looks
      // at rendered DOM, where a fence's contents are never an <h1> — but a
      // text-level model has to say so.
      const isHeading =
        /^#{1,6} /.test(b.trim()) && !b.includes("chronoanvil:trackers:");
      if (isBar || isHeading) {
        if (active) active = false;
        if (isBar) {
          active = true;
          hidden += weldedSiblings(b);
        }
        continue;
      }
      if (active) hidden++;
    }
    return hidden;
  };

  it("folds only the pages table on a Lesson, not the whole note", () => {
    // The Lesson's one bar is `header:📄 Pages`, and since 2.54 its table is
    // welded into the same fence rather than sitting in the next block — so
    // the one thing folding hides is that table, and the prose skeleton
    // beneath it still terminates the scope. Both halves of the claim matter:
    // measured before the heading rule existed, folding this bar hid 21
    // blocks and the note vanished.
    const lesson = studyFile("template-lesson.md");
    expect(hiddenAfterFirstBar(lesson)).toBe(1);
  });

  it("gives the composed dashboards a bar for every section", () => {
    // A dashboard is all bars and no prose, so each fold is bounded by the
    // next bar and the heading rule never comes into play.
    for (const name of ["Subject Index.md", "Topic Index.md"]) {
      const text = studyFile(name);
      const headings = text
        .split("\n")
        .filter((l) => /^#{1,6} /.test(l) && !l.includes("chronoanvil:trackers:"));
      expect(headings, name).toEqual([]);
    }
  });

  it("leaves a note with no bar unaffected", () => {
    expect(hiddenAfterFirstBar(studyFile("template-practice.md"))).toBe(0);
  });
});

// ── Chart tile spans (2.46) ─────────────────────────────────────────────────
//
// The default table is a taste call made once. Pinning it here is what stops it
// drifting silently: a chart's size is invisible in a diff of the note, so a
// changed threshold would show up only as "the dashboard looks different now".

describe("SPAN_CELLS", () => {
  it("covers every ChartSpan member", () => {
    // Exhaustiveness by construction: the annotation forces a compile error if
    // a span is added without a geometry, and the runtime check catches a key
    // that was added to the type but left out of the table.
    const spans: ChartSpan[] = ["small", "wide", "tall", "large"];
    for (const s of spans) expect(SPAN_CELLS[s]).toBeDefined();
    expect(Object.keys(SPAN_CELLS).sort()).toEqual([...spans].sort());
  });

  it("gives each name the geometry its label claims", () => {
    expect(SPAN_CELLS.small).toEqual({ cols: 1, rows: 1 });
    expect(SPAN_CELLS.wide).toEqual({ cols: 2, rows: 1 });
    expect(SPAN_CELLS.tall).toEqual({ cols: 1, rows: 2 });
    expect(SPAN_CELLS.large).toEqual({ cols: 2, rows: 2 });
  });
});

describe("isChartSpan", () => {
  it("accepts the four names", () => {
    for (const s of ["small", "wide", "tall", "large"]) {
      expect(isChartSpan(s)).toBe(true);
    }
  });

  it("rejects anything else, including inherited Object keys", () => {
    expect(isChartSpan("huge")).toBe(false);
    expect(isChartSpan("")).toBe(false);
    expect(isChartSpan("2x2")).toBe(false);
    // hasOwnProperty rather than `in`, so a lookup can't be satisfied by the
    // prototype chain and `+size=constructor` can't become a valid span.
    expect(isChartSpan("constructor")).toBe(false);
    expect(isChartSpan("toString")).toBe(false);
  });
});

describe("rangeDays", () => {
  it("reads the fixed windows literally", () => {
    expect(rangeDays("30", null)).toBe(30);
    expect(rangeDays("90", null)).toBe(90);
    expect(rangeDays("365", null)).toBe(365);
  });

  it("reports all-time as the longest bucket", () => {
    expect(rangeDays("all", null)).toBe(ALL_TIME_DAYS);
    // Whatever the sentinel is, it must clear every threshold — a chart over
    // all history is the one most in need of room, and treating an unknown
    // span as short is the failure that reads as a bug.
    expect(defaultSpan("month", rangeDays("all", null))).toBe("tall");
    expect(defaultSpan("line", rangeDays("all", null))).toBe("wide");
  });

  it("resolves `period` against the host note's period, not the token", () => {
    // The case the whole feature turns on: one token, two windows two orders of
    // magnitude apart. A rule reading the token alone would size the year
    // dashboard's heatmap as though it held seven days.
    expect(rangeDays("period", "week")).toBe(7);
    expect(rangeDays("period", "month")).toBe(30);
    expect(rangeDays("period", "quarter")).toBe(90);
    expect(rangeDays("period", "year")).toBe(365);
  });

  it("falls back to 30 days for a chart on a non-dashboard note", () => {
    // Must match resolveChartWindow's own fallback, or a chart on a plain note
    // is sized for a window it isn't drawing.
    expect(rangeDays("period", null)).toBe(30);
    const w = resolveChartWindow("period", null, false, "2026-07-27");
    expect(w).toEqual({ start: "2026-06-28", end: "2026-07-27" });
  });
});

describe("defaultSpan", () => {
  it("keeps the numeric reductions small at every length", () => {
    // Four numbers spread across a full row are four numbers further apart,
    // not four numbers better understood.
    for (const days of [7, 30, 90, 365, ALL_TIME_DAYS]) {
      expect(defaultSpan("summary", days)).toBe("small");
      expect(defaultSpan("streak", days)).toBe("small");
    }
  });

  it("keeps scatter small even over a long window", () => {
    // A point cloud reads square. Widening stretches it and makes the
    // correlation look stronger along x than it is — a chart that lies rather
    // than a chart that is cramped.
    expect(defaultSpan("scatter", 365)).toBe("small");
    expect(defaultSpan("scatter", ALL_TIME_DAYS)).toBe("small");
  });

  it("gives a long trend the width and nothing else", () => {
    expect(defaultSpan("line", 7)).toBe("small");
    expect(defaultSpan("line", 30)).toBe("small");
    expect(defaultSpan("line", 89)).toBe("small");
    expect(defaultSpan("line", 90)).toBe("wide");
    expect(defaultSpan("line", 365)).toBe("wide");
    expect(defaultSpan("bar", 365)).toBe("wide");
    // Width, never height: a trend's readability is x-axis room, and a taller
    // tile gives a line chart nothing.
    expect(defaultSpan("line", ALL_TIME_DAYS)).toBe("wide");
  });

  it("gives a long heatmap height and never width", () => {
    expect(defaultSpan("month", 7)).toBe("small");
    expect(defaultSpan("month", 30)).toBe("small");
    expect(defaultSpan("month", 59)).toBe("small");
    expect(defaultSpan("month", 60)).toBe("tall");
    expect(defaultSpan("month", 90)).toBe("tall");
    expect(defaultSpan("month", 365)).toBe("tall");
  });

  it("never gives a heatmap a wide tile, however long the window", () => {
    // Not a stylistic preference — a measured result, and the counter-intuitive
    // one. Heatmap cells are squares sized by their column, so a wider tile
    // makes each cell bigger and fits FEWER week rows into the same height.
    // Rendered against a full year, a 2×2 tile showed about five week rows
    // where a 1×2 showed eleven. If this ever starts returning "wide" or
    // "large", the renderer has to have been transposed first.
    for (const days of [60, 90, 180, 365, ALL_TIME_DAYS]) {
      const span = defaultSpan("month", days);
      expect(SPAN_CELLS[span].cols).toBe(1);
    }
  });

  it("sizes a trend and a heatmap of the same window on different axes", () => {
    // The observation the whole span vocabulary exists for: a trend's
    // readability is width and a heatmap's is height. If these two ever agree,
    // "make the tiles bigger" would have been the cheaper fix.
    expect(defaultSpan("line", 90)).toBe("wide");
    expect(defaultSpan("month", 90)).toBe("tall");
  });
});

describe("spanOf", () => {
  const base: ChartSpec = {
    key: "c1",
    tracker: "Mood",
    type: "month",
    range: "365",
  };

  it("derives a size when the spec has none", () => {
    expect(spanOf(base, null)).toBe("tall");
  });

  it("lets an explicit size win over the derivation", () => {
    expect(spanOf({ ...base, size: "small" }, null)).toBe("small");
    expect(spanOf({ ...base, size: "wide" }, null)).toBe("wide");
  });

  it("re-derives a `period` chart against the note it is on", () => {
    // The same directive, unchanged on disk, sized differently on the weekly
    // overview and the year dashboard — because the window it draws changed.
    const spec: ChartSpec = { ...base, range: "period" };
    expect(spanOf(spec, "week")).toBe("small");
    expect(spanOf(spec, "year")).toBe("tall");
  });

  it("does not re-derive when the size was set by hand", () => {
    const spec: ChartSpec = { ...base, range: "period", size: "small" };
    expect(spanOf(spec, "year")).toBe("small");
  });
});

describe("chart directive: the size token", () => {
  it("round-trips every size", () => {
    for (const size of ["small", "wide", "tall", "large"] as ChartSpan[]) {
      const spec: ChartSpec = {
        key: "c1",
        tracker: "Mood",
        type: "month",
        range: "365",
        size,
      };
      const line = serializeChartSpec(spec);
      expect(line).toBe(`chart:c1:Mood:month:365+size=${size}`);
      expect(parseChartDirectives([line])[0]).toEqual(spec);
    }
  });

  it("round-trips alongside the scatter and average tokens", () => {
    const spec: ChartSpec = {
      key: "c2",
      tracker: "Sleep",
      type: "scatter",
      range: "90",
      tracker2: "Mood",
      size: "large",
    };
    expect(serializeChartSpec(spec)).toBe(
      "chart:c2:Sleep:scatter:90+y=Mood+size=large"
    );
    expect(parseChartDirectives([serializeChartSpec(spec)])[0]).toEqual(spec);

    const avg: ChartSpec = {
      key: "c3",
      tracker: "Weight",
      type: "line",
      range: "365",
      avg: true,
      size: "wide",
    };
    expect(serializeChartSpec(avg)).toBe(
      "chart:c3:Weight:line:365+avg+size=wide"
    );
    expect(parseChartDirectives([serializeChartSpec(avg)])[0]).toEqual(avg);
  });

  it("accepts the flags in any order", () => {
    const [a] = parseChartDirectives(["chart:c1:X:line:30+size=wide+avg+y=Y"]);
    const [b] = parseChartDirectives(["chart:c1:X:line:30+y=Y+avg+size=wide"]);
    const [c] = parseChartDirectives(["chart:c1:X:line:30+avg+size=wide+y=Y"]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.size).toBe("wide");
  });

  it("survives a scope token before it", () => {
    const spec: ChartSpec = {
      key: "c1",
      tracker: "Weight",
      type: "summary",
      range: "365",
      scope: "monthly",
      size: "wide",
    };
    expect(serializeChartSpec(spec)).toBe(
      "chart:c1:Weight:summary:365:monthly+size=wide"
    );
    expect(parseChartDirectives([serializeChartSpec(spec)])[0]).toEqual(spec);
  });

  it("drops an unrecognised size and keeps the chart", () => {
    // Gentler than an unrecognised *scope*, which fails the line match and
    // loses the chart. A size is cosmetic; discarding a whole chart over a typo
    // in one would be the worse trade.
    const [spec] = parseChartDirectives(["chart:c1:Mood:line:30+size=huge"]);
    expect(spec).toEqual({
      key: "c1",
      tracker: "Mood",
      type: "line",
      range: "30",
    });
    expect(spec.size).toBeUndefined();
  });

  it("keeps the other flags when the size is the bad one", () => {
    const [spec] = parseChartDirectives(["chart:c1:X:line:30+avg+size=enormous"]);
    expect(spec.avg).toBe(true);
    expect(spec.size).toBeUndefined();
  });

  it("writes no token for an auto-sized chart", () => {
    // The guard that the feature costs an existing note nothing: every
    // directive written before 2.46 serialises byte-identically. This is the
    // one test that catches an accidental `+size=small` being emitted.
    expect(
      serializeChartSpec({ key: "c1", tracker: "Mood", type: "line", range: "30" })
    ).toBe("chart:c1:Mood:line:30");
    expect(
      serializeChartSpec({
        key: "c2",
        tracker: "Weight",
        type: "line",
        range: "365",
        avg: true,
      })
    ).toBe("chart:c2:Weight:line:365+avg");
    expect(
      serializeChartSpec({
        key: "c3",
        tracker: "Sleep",
        type: "scatter",
        range: "90",
        tracker2: "Mood",
      })
    ).toBe("chart:c3:Sleep:scatter:90+y=Mood");
  });
});

describe("periodUnitOf / periodPropertyFor", () => {
  const declaring = (...props: string[]) => (p: string) => props.includes(p);

  it("maps each property to its unit", () => {
    expect(periodUnitOf(declaring("week-start"))).toBe("week");
    expect(periodUnitOf(declaring("quarter-start"))).toBe("quarter");
    expect(periodUnitOf(declaring("year-start"))).toBe("year");
    expect(periodUnitOf(declaring("month-start"))).toBe("month");
  });

  it("returns null for a note that is not a dashboard", () => {
    expect(periodUnitOf(declaring())).toBeNull();
    expect(periodUnitOf(declaring("journal-date", "tags"))).toBeNull();
  });

  it("is first-match-wins in the documented order", () => {
    // The invariant is that a note carries at most one of these, guarded by
    // scope-properties.test.ts against the shipped assets. This pins the
    // tie-break for the case that invariant is ever violated, so the behaviour
    // is decided rather than incidental to branch order.
    expect(periodUnitOf(declaring("week-start", "month-start"))).toBe("week");
    expect(periodUnitOf(declaring("quarter-start", "year-start"))).toBe(
      "quarter"
    );
    expect(periodUnitOf(declaring("year-start", "month-start"))).toBe("year");
  });

  it("round-trips a unit back to its property", () => {
    for (const { prop, unit } of PERIOD_PROPERTIES) {
      expect(periodPropertyFor(unit)).toBe(prop);
      expect(periodUnitOf(declaring(prop))).toBe(unit);
    }
  });
});

// ── toValue: the habit-boolean gap ─────────────────────────────────────────
//
// ChronoAnvil's own habit checkbox writes 1 and 0, never true/false, so on that
// path this is all dead code. It is not the only write path: the property is
// ordinary frontmatter, and Obsidian's Properties panel will render it as a
// checkbox and store a real `true`, as will a hand-edit or another plugin.
// Every one of those used to miss all three branches and return null, so the
// point was silently dropped and a habit with months of history charted as
// though it had never been logged — the streak tile reading "No entries logged
// for this habit in this range yet." on a tracker that was working fine.

const habit = { id: "Exercise", label: "Exercise", type: "boolean" } as TrackerDef;
const num = { id: "Weight", label: "Weight", type: "number" } as TrackerDef;

describe("toValue", () => {
  it("reads a real YAML boolean as 1 / 0", () => {
    expect(toValue(habit, true)).toBe(1);
    expect(toValue(habit, false)).toBe(0);
  });

  it("reads a real boolean whatever the tracker's declared type", () => {
    // Unconditional on type: a tracker retyped from boolean to number leaves
    // its old true/false values on disk, and they should keep charting.
    expect(toValue(num, true)).toBe(1);
    expect(toValue(num, false)).toBe(0);
  });

  it("still reads the 0/1 the habit checkbox actually writes", () => {
    expect(toValue(habit, 1)).toBe(1);
    expect(toValue(habit, 0)).toBe(0);
    expect(toValue(habit, "1")).toBe(1);
    expect(toValue(habit, "0")).toBe(0);
  });

  it("reads quoted boolean spellings for a habit", () => {
    for (const v of ["true", "True", "TRUE", "yes", "Yes"]) {
      expect(toValue(habit, v)).toBe(1);
    }
    for (const v of ["false", "False", "no", "No"]) {
      expect(toValue(habit, v)).toBe(0);
    }
  });

  it("does not read boolean words as numbers for a number tracker", () => {
    // Gated deliberately, unlike the real-boolean branch above. A real `true`
    // is unambiguous whatever the tracker type, but the string "no" in a
    // `number` tracker is garbage rather than zero — reading it as 0 would
    // invent a data point where dropping it is the honest answer.
    expect(toValue(num, "no")).toBeNull();
    expect(toValue(num, "yes")).toBeNull();
    expect(toValue(num, "true")).toBeNull();
  });

  it("keeps dropping the genuinely absent and unparseable", () => {
    expect(toValue(habit, undefined)).toBeNull();
    expect(toValue(habit, null)).toBeNull();
    expect(toValue(habit, "")).toBeNull();
    expect(toValue(habit, "   ")).toBeNull();
    expect(toValue(num, "not a number")).toBeNull();
    expect(toValue(num, NaN)).toBeNull();
    expect(toValue(num, Infinity)).toBeNull();
  });

  it("a boolean-logged habit now produces streak points at all", () => {
    // The end-to-end shape of the bug, at the only layer that is pure: a week
    // of true/false readings used to reduce to nothing.
    const raw = [true, true, false, true, true, true, false];
    const values = raw.map((v) => toValue(habit, v));
    expect(values.every((v) => v != null)).toBe(true);

    const points: ChartPoint[] = values.map((v, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      value: v as number,
    }));
    const s = streakStats(points);
    expect(s.total).toBe(5);
    expect(s.longest).toBe(3);
  });
});

describe("periodCoverage", () => {
  // The denominator every review dashboard's "N/M days logged" divides by.
  // Until 2.52 each caller supplied its own and the quarter supplied the whole
  // quarter, so a quarter five days old read "3/92".
  it("counts a finished period in full", () => {
    const c = periodCoverage("2026-07-01", "2026-09-30", "2026-11-04");
    expect(c).toEqual({ elapsed: 92, total: 92, partial: false, started: true });
  });

  it("stops a running period at today", () => {
    const c = periodCoverage("2026-07-01", "2026-09-30", "2026-07-05");
    expect(c.elapsed).toBe(5);
    expect(c.total).toBe(92);
    expect(c.partial).toBe(true);
    expect(c.started).toBe(true);
  });

  it("treats the last day as complete, not as one day short", () => {
    const c = periodCoverage("2026-07-01", "2026-07-31", "2026-07-31");
    expect(c.elapsed).toBe(31);
    expect(c.partial).toBe(false);
  });

  it("reports a period that hasn't begun as unstarted, not as empty", () => {
    // The distinction the year and quarter views both draw between "not yet"
    // and "you didn't write": 0/92 invites a reader to feel behind on days
    // that haven't happened.
    const c = periodCoverage("2026-10-01", "2026-12-31", "2026-07-05");
    expect(c).toEqual({ elapsed: 0, total: 92, partial: true, started: false });
  });

  it("gives the first day of a period an elapsed day, not zero", () => {
    // On a Monday the current week is 1/1, not 1/0 and not 1/7.
    const c = periodCoverage("2026-07-20", "2026-07-26", "2026-07-20");
    expect(c.elapsed).toBe(1);
    expect(c.total).toBe(7);
    expect(c.partial).toBe(true);
  });

  it("handles a single-day period", () => {
    const c = periodCoverage("2026-07-20", "2026-07-20", "2026-07-20");
    expect(c).toEqual({ elapsed: 1, total: 1, partial: false, started: true });
  });

  it("is leap-aware across February", () => {
    expect(periodCoverage("2028-02-01", "2028-02-29", "2028-03-05").total).toBe(29);
    expect(periodCoverage("2026-02-01", "2026-02-28", "2026-03-05").total).toBe(28);
  });

  it("spans a year boundary", () => {
    const c = periodCoverage("2026-12-01", "2027-01-31", "2027-01-10");
    expect(c.total).toBe(62);
    expect(c.elapsed).toBe(41);
  });
});

describe("formatPeriodLabel", () => {
  // Was a two-branch conditional over a four-value union inside tables.ts, so
  // two of the four units formatted as a week. Neither had been seen because
  // no quarter or year dashboard shipped a tasks-table yet.
  it("names a week by its Monday", () => {
    expect(formatPeriodLabel("week", "2026-07-20")).toBe("week of 20 Jul 2026");
  });

  it("names a month", () => {
    expect(formatPeriodLabel("month", "2026-07-01")).toBe("July 2026");
  });

  it("names a quarter as a quarter, not as a week", () => {
    expect(formatPeriodLabel("quarter", "2026-07-01")).toBe("Q3 2026");
    expect(formatPeriodLabel("quarter", "2026-01-01")).toBe("Q1 2026");
    expect(formatPeriodLabel("quarter", "2026-04-01")).toBe("Q2 2026");
    expect(formatPeriodLabel("quarter", "2026-10-01")).toBe("Q4 2026");
  });

  it("names a year as a year, not as a week", () => {
    expect(formatPeriodLabel("year", "2026-01-01")).toBe("2026");
  });
});

// The "scope ladder" describe lived here and was retired in 2.53. It
// enumerated the six assets carrying the row — which is the bug it was meant
// to guard against, and did not catch search.md for exactly that reason. The
// derived guard in test/layout.test.ts reads the assets folder instead.

describe("bucketByMonth", () => {
  // The 2.52 scope. A `period` line chart on the year note plotted 365 raw
  // daily points and on the quarter 92 — the window was right and only the
  // resolution was wrong.
  const p = (date: string, value: number) => ({ date, value });

  it("collapses a month's dailies into one point dated to the 1st", () => {
    expect(bucketByMonth([p("2026-07-04", 2), p("2026-07-20", 4)])).toEqual([
      { date: "2026-07-01", value: 3 },
    ]);
  });

  it("defaults to mean, not sum", () => {
    // Mean applies silently because a wrong mean reads as a plausible number
    // and a wrong sum reads as a wildly inflated one.
    expect(bucketByMonth([p("2026-07-01", 10), p("2026-07-02", 20)])[0].value).toBe(15);
  });

  it("sums when the tracker asks it to", () => {
    expect(
      bucketByMonth([p("2026-07-01", 10), p("2026-07-02", 20)], "sum")[0].value
    ).toBe(30);
  });

  it("rounds a mean but never a sum", () => {
    // A sum of exact values is exact; rounding it would be a lie.
    expect(bucketByMonth([p("2026-07-01", 1), p("2026-07-02", 2), p("2026-07-03", 2)])[0].value).toBe(1.67);
    expect(
      bucketByMonth([p("2026-07-01", 0.1), p("2026-07-02", 0.2)], "sum")[0].value
    ).toBeCloseTo(0.3, 10);
  });

  it("sorts by month, because the vault's file order isn't dated", () => {
    // collectPoints walks filesUnder, which is not date-ordered, and a line
    // chart joins points in array order — an unsorted bucketed series
    // zig-zags through the year.
    const out = bucketByMonth([p("2026-09-02", 1), p("2026-01-05", 2), p("2026-05-09", 3)]);
    expect(out.map((x) => x.date)).toEqual(["2026-01-01", "2026-05-01", "2026-09-01"]);
  });

  it("keeps months in different years apart", () => {
    const out = bucketByMonth([p("2025-07-01", 1), p("2026-07-01", 9)]);
    expect(out).toEqual([
      { date: "2025-07-01", value: 1 },
      { date: "2026-07-01", value: 9 },
    ]);
  });

  it("yields a point for a month with a single reading", () => {
    expect(bucketByMonth([p("2026-07-14", 7)])).toEqual([
      { date: "2026-07-01", value: 7 },
    ]);
  });

  it("is empty for no points", () => {
    expect(bucketByMonth([])).toEqual([]);
  });

  it("dates every point to the 1st so the window layer needs no change", () => {
    // pointInWindow is a string compare, so a bucketed point filters correctly
    // against bounds computed in days.
    const out = bucketByMonth([p("2026-07-31", 1)]);
    expect(out[0].date >= "2026-07-01" && out[0].date <= "2026-07-31").toBe(true);
  });
});

// ── an empty region is still a comment (2.56.7) ──────────────────────────
//
// notestore.ts's opening paragraph is a promise: content lives inside ONE HTML
// comment so "Obsidian never renders it in either Reading mode or Live
// Preview — comments are dropped natively — so there's no need for any
// plugin-side hiding". That holds for a comment Obsidian parses as one block.
//
// `buildBlock(key, "")` used to emit a BLANK LINE between the markers, which
// ends the HTML block early: the opener and the closer then render as two
// paragraphs of literal text. It was visible under an untouched Learning Path
// as `<!--chronoanvil:path` and `-->` printed on the page — and it was every region
// on first use, because a region is created empty.

describe("note regions survive being empty", () => {
  it("writes no blank line inside an empty region", () => {
    const out = writeNoteRegion("", "path", "");
    expect(out).toContain("<!--chronoanvil:path\n-->");
    expect(out).not.toContain("\n\n-->");
  });

  it("still round-trips an empty value", () => {
    const out = writeNoteRegion("# Note\n", "path", "");
    expect(readNoteRegion(out, "path")).toBe("");
  });

  it("keeps the bounding newlines when there IS content", () => {
    // The markers sit on their own lines so the stored text starts and ends
    // where a reader would expect in the raw file.
    const out = writeNoteRegion("", "path", "- [ ] step one");
    expect(out).toContain("<!--chronoanvil:path\n- [ ] step one\n-->");
    expect(readNoteRegion(out, "path")).toBe("- [ ] step one");
  });

  it("is idempotent for an empty value", () => {
    const once = writeNoteRegion("# Note\n", "path", "");
    expect(writeNoteRegion(once, "path", "")).toBe(once);
  });

  it("empties an existing region without leaving a blank line", () => {
    // The path that actually produced the bug: a reader deletes their last
    // step, and the region is rewritten with nothing in it.
    const filled = writeNoteRegion("# Note\n", "path", "- [ ] step one");
    const emptied = writeNoteRegion(filled, "path", "");
    expect(emptied).toContain("<!--chronoanvil:path\n-->");
    expect(emptied).not.toContain("\n\n-->");
    expect(readNoteRegion(emptied, "path")).toBe("");
  });
});

// ── the anchors already on disk (2.56.8) ─────────────────────────────────
//
// 2.56.7 fixed what `buildBlock` WRITES and changed nothing about the anchors
// already sitting in every note that had ever rendered a `path:`, `tasks:` or
// `note:` widget — which is where the bug is visible. `ensureNoteRegions` is
// the repair hook because it already runs on render and already writes when it
// has to: no migration for anyone to run, and no new machinery.

describe("ensureNoteRegions repairs as well as creates", () => {
  it("tightens a region left with a blank line in it", () => {
    const stale = "# Note\n\n<!--chronoanvil:path\n\n-->\n";
    const out = ensureNoteRegions(stale, ["path"]);
    expect(out).not.toBeNull();
    expect(out).toContain("<!--chronoanvil:path\n-->");
    expect(out).not.toContain("\n\n-->");
  });

  it("reports no change when every region is already tight", () => {
    // Idempotence is what makes a render-time repair acceptable: it fires once
    // per affected note and then never again.
    const clean = "# Note\n\n<!--chronoanvil:path\n-->\n";
    expect(ensureNoteRegions(clean, ["path"])).toBeNull();
  });

  it("never touches a region that holds content", () => {
    const filled = "# Note\n\n<!--chronoanvil:path\n- [ ] step one\n-->\n";
    expect(ensureNoteRegions(filled, ["path"])).toBeNull();
  });

  it("does not mistake real whitespace content for damage", () => {
    // A region holding only spaces is still repaired to the tight form, and
    // reading it back gives "" either way — so nothing a reader typed is lost.
    const spaces = "# Note\n\n<!--chronoanvil:path\n   \n-->\n";
    const out = ensureNoteRegions(spaces, ["path"]);
    expect(readNoteRegion(out ?? spaces, "path")).toBe("");
  });

  it("still creates a region that is missing entirely", () => {
    const out = ensureNoteRegions("# Note\n", ["path"]);
    expect(out).toContain("<!--chronoanvil:path\n-->");
  });
});

// ── a layer's name is its folder's (2.56.21) ─────────────────────────────
//
// Renaming a subject or topic from its banner renamed the NOTE and left the
// folder alone. A layer is `Subjects/Algebra/Algebra.md`, and everything that
// links to it derives the path from the folder — the Journals card on the home
// note, the breadcrumbs, the topic tables, `folderNotePath` itself. So the
// folder stayed called Algebra with no note of its own inside it, and every one
// of those links pointed at a file that had ceased to exist. The banner looked
// right, because it reads the file it was rendered for; everything pointing AT
// it broke.

describe("isFolderNote", () => {
  const f = (basename: string, parentPath: string | null) => ({
    basename,
    parent:
      parentPath === null
        ? null
        : { path: parentPath, name: parentPath.split("/").pop() ?? "" },
  });

  it("recognises a layer's index note", () => {
    expect(isFolderNote(f("Algebra", "03 - Journals/Study/Maths/Algebra"))).toBe(
      true
    );
  });

  it("rejects an ordinary note beside it", () => {
    expect(isFolderNote(f("Surds", "03 - Journals/Study/Maths/Algebra"))).toBe(
      false
    );
  });

  it("recognises a period dashboard, which is the same shape", () => {
    // `folderNotePath` is one rule for the whole vault: the weekly and monthly
    // overviews are folder notes too.
    expect(isFolderNote(f("Weekly", "01 - Diary/Weekly"))).toBe(true);
  });

  it("does not treat a root-level note as the vault's folder note", () => {
    // A note called `MyVault.md` at the top level is not the root's folder note
    // in any sense that would make renaming it rename the vault.
    expect(isFolderNote(f("MyVault", "/"))).toBe(false);
    expect(isFolderNote(f("MyVault", ""))).toBe(false);
    expect(isFolderNote(f("MyVault", null))).toBe(false);
  });

  it("is the inverse of folderNotePath", () => {
    const folder = "03 - Journals/Study/Maths";
    const path = folderNotePath(folder);
    expect(path).toBe("03 - Journals/Study/Maths/Maths.md");
    expect(isFolderNote(f("Maths", folder))).toBe(true);
  });
});

describe("renaming a layer moves its folder", () => {
  // MOVED IN 4.5 AND ASSERTED WHERE IT LIVES. Every line of this was
  // `buildStudyHeader`'s second row until the page title card wanted the same
  // control; it is now `attachNoteRename` in header-title.ts and the banner
  // calls it. The rules below did not change — only the file they are in — and
  // the row after this one is what makes the move safe to assert: there must be
  // exactly one implementation, and the banner must be a caller of it.
  const src = readSrc("header-title");

  it("renames the folder before the note", () => {
    // `renameFile` on a folder is what updates links to the notes inside it.
    // Doing the note first would strand the folder note for the moment in
    // between — a window in which `folderNotePath` resolves to nothing.
    const at = src.indexOf("const folder = isFolderNote(file)");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 1200);
    const folderRename = body.indexOf("renameFile(folder, folderTarget)");
    const noteRename = body.indexOf("renameFile(file, `${folderTarget}");
    expect(folderRename).toBeGreaterThan(0);
    expect(noteRename).toBeGreaterThan(folderRename);
  });

  it("checks the folder target for a collision, not just the note", () => {
    const at = src.indexOf("const folder = isFolderNote(file)");
    const body = src.slice(at, at + 1200);
    expect(body).toContain("getAbstractFileByPath(folderTarget)");
  });

  it("leaves an ordinary note renaming only itself", () => {
    // A lesson is not a folder note and must not grow a folder — and neither
    // is the homepage, which is the branch the page title card takes.
    expect(src).toContain("const parent = file.parent?.path ?? \"\";");
  });

  it("has one implementation, and the banner is a caller of it", () => {
    // THE POINT OF THE EXTRACTION. A copy of a rename is how two callers start
    // disagreeing about which characters a name may have, and there is already
    // a second, wider spelling of that rule in attachments.ts for a different
    // job — which is the warning, not the precedent.
    expect(readSrc("study-header")).toContain("attachNoteRename(app, titleWrap, file,");
    for (const gone of ["renameFile(folder, folderTarget)", "let settled = false;"]) {
      expect(readSrc("study-header"), gone).not.toContain(gone);
    }
    // And the illegal-character rule is not spelled a third time.
    expect(readSrc("study-header")).not.toContain("ILLEGAL_NAME");
  });
});

// ── one commit per edit (2.56.22) ────────────────────────────────────────
//
// Both inline title editors bind Enter, Escape and blur to one `commit`. Any
// path that removes the input — a rename, a restore — detaches a focused
// element, and detaching a focused element fires `blur`. So every commit called
// a second commit.
//
// On the journal banner that surfaced as the rename reporting a collision with
// the folder it had itself just created. On the diary banner it was quieter and
// worse: Escape restored the title, the restore fired blur, and blur saved the
// edit that had just been cancelled.

describe("inline title editors settle once", () => {
  // `study-header.ts` was one of these until 4.5 moved its editor into
  // header-title.ts; the rule is unchanged and follows the code.
  const editors = ["header-title.ts", "entryheader.ts"];

  for (const f of editors) {
    it(`guards re-entry in ${f}`, () => {
      const src = readSrc(f);
      const at = src.indexOf("const commit = async (save: boolean)");
      expect(at, f).toBeGreaterThan(0);
      // The flag is declared before commit and checked as its first act.
      expect(src.slice(0, at), f).toContain("let settled = false;");
      const body = src.slice(at, at + 200);
      expect(body, f).toContain("if (settled) return;");
      expect(body, f).toContain("settled = true;");
    });

    it(`still binds blur in ${f}, which is what made it necessary`, () => {
      // The listener is not the bug and removing it would lose click-away-to-
      // save. The bug is that it fires on teardown.
      const src = readSrc(f);
      expect(src, f).toContain('addEventListener("blur", () => void commit(true))');
    });
  }
});

describe("the inline-kinds exception list", () => {
  // INLINE_KINDS was COMPOSITE_KINDS until 2.56.25, listing the thirty-nine
  // full-width kinds instead of the seven inline ones. Inverting it made the
  // *default* safe — a kind nobody remembered to list now renders full-width,
  // which is right for 39 of 46 — but it moved the risk rather than removing
  // it.
  //
  // The new failure mode is a name that is in the set and matches nothing: a
  // typo, or a kind renamed in the switch and not here. Under the old set that
  // was survivable, because presence was what did the work and a dead entry
  // just sat there. Now absence is what does the work, so a dead entry means
  // some real kind is silently getting full-width layout it was never meant to
  // have, and there is no other signal.
  //
  // So: every name in the list must be a kind the switch actually dispatches.
  const widgets = readSrc("widgets");

  const inline = new Set(
    (/const INLINE_KINDS = new Set\(\[([^\]]*)\]/.exec(widgets)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean)
  );

  const dispatched = new Set(
    [...widgets.matchAll(/case "([a-z0-9-]+)":/g)].map((m) => m[1])
  );

  it("finds both sets", () => {
    // Guards the two regexes: if either stops matching, the comparison below
    // would pass on empty sets and assert nothing at all.
    expect(inline.size).toBeGreaterThanOrEqual(5);
    expect(dispatched.size).toBeGreaterThanOrEqual(30);
  });

  it("lists only kinds the switch dispatches", () => {
    const dead = [...inline].filter((k) => !dispatched.has(k));
    expect(dead).toEqual([]);
  });

  it("stays the minority it claims to be", () => {
    // The whole argument for the inversion is that inline is the exception.
    // If this ever fails, the set should probably be flipped back rather than
    // grown — the comment on INLINE_KINDS explains which default is safer at
    // which ratio.
    expect(inline.size).toBeLessThan(dispatched.size / 2);
  });
});

describe("3.6 patch 4: the rule-weight scale", () => {
  const css = readCss();

  it("declares three tiers, once, in :root", () => {
    // Tokens only. Nothing references them yet and nothing on screen changes —
    // the same shape as 2.59.1's adapter and 3.0's patch 2. The evidence that
    // this patch is correct is a green suite and an unchanged render; the
    // evidence that it was WORTH doing is the next test.
    const fromRoot = css.slice(css.indexOf(":root {"));
    const block = fromRoot.slice(0, fromRoot.indexOf("\n}") + 2);
    for (const token of ["--ca-rule-hair:", "--ca-rule:", "--ca-rule-edge:"]) {
      expect(block, token).toContain(token);
    }
  });

  it("and no border in the sheet is written at a weight outside it", () => {
    // THE ASSERTION THAT EARNS THE SCALE. A weight typed at a call site is
    // invisible: 1px against 1.5px against 2px cannot be told apart by reading,
    // only by grepping, and nobody greps a stylesheet for numbers they do not
    // already suspect. This is that grep, standing.
    //
    // 1.5px is on the list and is NOT on the scale: it is
    // `.ca-journal-habit-box`'s checkbox outline, which is the drawing of a
    // control rather than a rule between things. It is listed here so that
    // adding a fourth weight fails even though a third already exists — the
    // point is that every weight in the sheet is one somebody argued for.
    // THE TWO FAMILIES HAVE DIFFERENT ALPHABETS, and that is not a style
    // preference — it is what the engine does. Chromium floors border-width to
    // whole CSS pixels: 1.4px, 1.5px and 1.6px all compute to 1px, at every
    // device pixel ratio. A box-shadow's spread does not floor, and keeps 1.5px.
    //
    // So a border may only be 1, 2 or 3, and 1.5 is available to rings alone.
    // This is also why `--ca-rule` cannot be 1.5: the dividers would silently
    // render at 1px while the cell rings rendered at 1.5px, and the one number
    // the scale exists to keep in step would be out of step by construction.
    //
    // Two borders in this sheet were written at 1.5px and drew 1px for their
    // whole life. They are `--ca-rule-hair` now, which changed nothing on
    // screen and made the file honest about it.
    const borderOk = new Set(["1px", "2px", "3px"]);
    const ringOk = new Set(["1px", "1.5px", "2px", "3px"]);
    const widths = css.match(
      /border(?:-(?:top|right|bottom|left))?(?:-width)?: *[0-9.]+px/g
    );
    expect(widths?.length ?? 0).toBeGreaterThan(100);
    // AND THE OTHER FAMILY, which is the half the 3.6 plan did not know about.
    // §4.4 asks for "heavier borders around cells", and the cells do not draw
    // borders: a day cell, a month cell and a hovered quarter cell each draw an
    // inset ring, because a box-shadow takes no layout space and a border does
    // — inside a grid with a fixed cell height and a gap, converting one to the
    // other resizes every cell. So there are two vocabularies for one idea, and
    // a scale that governed only the first would leave §4.4's actual surfaces
    // outside it.
    const rings = css.match(/box-shadow: inset 0 0 0 [0-9.]+px/g);
    expect(rings?.length ?? 0).toBeGreaterThan(4);

    const px = (d: string): string => /([0-9.]+px)/.exec(d)?.[1] ?? "";
    expect(
      [...new Set(widths ?? [])].map(px).filter((w) => !borderOk.has(w))
    ).toEqual([]);
    expect(
      [...new Set(rings ?? [])].map(px).filter((w) => !ringOk.has(w))
    ).toEqual([]);
  });
});
