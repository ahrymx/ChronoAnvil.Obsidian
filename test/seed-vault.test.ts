// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `tools/seed-vault.mjs` — the engine that fills the example vault. 4.43.
//
// ── WHY THIS FILE IMPORTS THE TOOL INSTEAD OF READING IT ─────────────────
//
// The other tool tests in this suite (`archive.mjs`, `package.mjs`,
// `build-css.mjs`) assert on source TEXT, because what they are pinning is a
// build contract — which files get copied, in what order — and there is no
// return value to look at. This tool is different: it is a pile of pure string
// and date transforms with one impure shell around them, and the transforms are
// where every defect so far has lived. Reading the source would let a wrong
// regex pass as long as it was still spelled the way the test expected.
//
// ── THE ASSERTION THAT MATTERS MOST IS THE ROUND TRIP ────────────────────
//
// The seeder writes four different formats into `<!--chronoanvil:… -->` regions and
// they all look alike: tasks are `- ( ) text`, recall is `q :: a`, list entries
// are bare lines, attachments are their own thing. Nothing about a region's name
// says which it holds, and nothing warns when the wrong one goes in — the write
// succeeds, the file looks plausible, and the widget renders rubbish. That is
// not hypothetical: the first version of the tool wrote recall cards in the task
// format, produced 50 notes, and reported zero warnings.
//
// So the recall and task tests below do not check a string shape. They feed the
// seeder's output to **the plugin's own parsers** and check what comes back out.
// A test that knew the format would have agreed with the bug.

import { describe, expect, it } from "vitest";
// The events note stores its events in FRONTMATTER, so what the seeder writes is
// YAML and what the plugin reads is the value OBSIDIAN parsed out of it —
// `parseEvents` never sees the text at all. The test therefore takes the same
// two steps in the same order, and takes the first one with `js-yaml` — which,
// since 5.0.1, the plugin no longer bundles (it reads YAML through Obsidian's
// `parseYaml` now). That makes it an INDEPENDENT parser here rather than the
// same one the code under test uses, which is the stronger position for an
// oracle to be in. It is a devDependency for this and for the stub.
import { load as loadYaml } from "js-yaml";

import { JOURNAL_PRESETS } from "../src/journals/journal";
import { DEFAULT_TRACKERS } from "../src/core/constants";
import { parseChartDirectives, serializeChartSpec } from "../src/charts/charts";
import {
  parseJournalChartDirectives,
  serializeJournalChartSpec,
} from "../src/charts/journal-charts";
import { locateTrackerRegion, noteTrackerDirectives } from "../src/trackers/entry-trackers";
import { sleepHours } from "../src/core/util";
import { parseEntries } from "../src/diary/entries";
import { parseEvents } from "../src/events/events";
import { parseLogItems } from "../src/diary/log-items";
import { parseRecall } from "../src/review/recall";
import { parseTaskLine } from "../src/ui/tasks";
import {
  activeDays,
  buildPatches,
  buildPlan,
  addTrackerDirective,
  chartLine,
  chartableTrackers,
  clearEvents,
  clearJournalChartsFence,
  dayModel,
  fillJournalChartsFence,
  gapEdges,
  journalChartLine,
  journalChartTrackers,
  pickFresh,
  taskAging,
  trackerValueFor,
  ensureRegion,
  eventsYaml,
  fillChartsFence,
  fillEvents,
  folderNote,
  logBlock,
  logbookItems,
  readRegion,
  resolveEvents,
  stampLine,
  fillRegion,
  fillSection,
  fillTemplate,
  isoDaysBetween,
  isoShift,
  longestStreak,
  mulberry32,
  recallLine,
  safeName,
  setFrontmatter,
  taskLine,
  entryFolder,
  periodHierarchy,
  setGraphLinks,
  uniquePicks,
  // @ts-expect-error — a plain .mjs tool with no declaration file; the point of
  // this suite is to run it, and typing it would mean maintaining a second
  // description of the same twelve functions.
} from "../tools/seed-vault.mjs";
import {
  CORPUS,
  DIARY_CAPTURES,
  DIARY_CHARTS,
  DIARY_CHALLENGES,
  DIARY_FOCUS,
  DIARY_HIGHLIGHTS,
  DIARY_LINES,
  DIARY_LINES_BY_TONE,
  DIARY_LINES_GOOD,
  DIARY_LINES_HARD,
  DIARY_LINES_MIXED,
  DIARY_TASKS,
  LOGBOOK_CORPUS,
  SEED_EVENTS,
  // @ts-expect-error — see above.
} from "../tools/seed-corpus.mjs";

// The `chronoanvil-events` value, out of a block of frontmatter YAML.
const yamlList = (text: string): unknown =>
  (loadYaml(text.replace(/^---\n/, "")) as Record<string, unknown>)["chronoanvil-events"];

describe("seed-vault: the generator", () => {
  it("gives the same sequence for the same seed and a different one otherwise", () => {
    const a = Array.from({ length: 8 }, mulberry32(20260818));
    const b = Array.from({ length: 8 }, mulberry32(20260818));
    const c = Array.from({ length: 8 }, mulberry32(20260819));
    expect(a).toEqual(b);
    // DETERMINISM IS THE WHOLE POINT — a screenshot of the example vault has to
    // be reproducible — but a "PRNG" that returned a constant would satisfy that
    // and nothing else, so the divergence is asserted in the same breath.
    expect(a).not.toEqual(c);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(a).size).toBe(8);
  });

  it("draws distinct entries and leaves the corpus alone", () => {
    const rng = mulberry32(7);
    const source = ["a", "b", "c", "d"];
    const drawn = uniquePicks(rng, source, 3);
    expect(drawn).toHaveLength(3);
    expect(new Set(drawn).size).toBe(3);
    // THE ARRAYS ARE MODULE CONSTANTS shared by every journal in a run. A draw
    // that spliced the original would make the output depend on the order the
    // journals happen to be written in, which is the kind of coupling that turns
    // a reordered loop into a diff of 300 files.
    expect(source).toEqual(["a", "b", "c", "d"]);
    expect(uniquePicks(mulberry32(1), source, 99)).toHaveLength(4);
  });
});

describe("seed-vault: dates", () => {
  it("shifts in UTC across months, years and a leap day", () => {
    expect(isoShift("2026-08-18", 1)).toBe("2026-08-19");
    expect(isoShift("2026-08-31", 1)).toBe("2026-09-01");
    expect(isoShift("2026-01-01", -1)).toBe("2025-12-31");
    expect(isoShift("2024-02-28", 1)).toBe("2024-02-29");
    expect(isoShift("2025-02-28", 1)).toBe("2025-03-01");
    expect(isoDaysBetween("2026-08-18", "2026-08-19")).toBe(1);
    expect(isoDaysBetween("2025-08-18", "2026-08-18")).toBe(365);
    expect(isoDaysBetween("2026-08-19", "2026-08-18")).toBe(-1);
  });

  it("counts the longest consecutive run and only a consecutive one", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-08-18"])).toBe(1);
    expect(longestStreak(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-09"])).toBe(3);
    // A GAP BREAKS IT. Without this line a `longestStreak` that simply returned
    // `dates.length` would pass every case above.
    expect(longestStreak(["2026-08-01", "2026-08-03", "2026-08-05"])).toBe(1);
  });

  it("draws a year that looks lived in rather than uniform", () => {
    const today = "2026-08-18";
    const days = activeDays({ today, months: 13, rng: mulberry32(20260818) });
    const start = isoShift(today, -Math.round(13 * 30.4));

    expect(days.length).toBeGreaterThan(0);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort()).toEqual(days);
    for (const d of days) {
      expect(isoDaysBetween(start, d)).toBeGreaterThanOrEqual(0);
      expect(isoDaysBetween(d, today)).toBeGreaterThanOrEqual(0);
    }

    // THE THREE SHAPE CLAIMS THE FUNCTION'S COMMENT MAKES, each of which some
    // plausible implementation gets wrong: "every day" (a solid heatmap and a
    // streak equal to the year), "a coin flip" (uniform static, no long runs),
    // and "no lapse" (nothing to notice when you look back).
    const span = isoDaysBetween(start, today) + 1;
    expect(days.length).toBeLessThan(span);
    expect(longestStreak(days)).toBeGreaterThan(5);
    const gaps = days.slice(1).map((d: string, i: number) => isoDaysBetween(days[i], d) - 1);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(14);
  });

  it("ends on the day it is given, so a screenshot can be reproduced", () => {
    const rng = mulberry32(5);
    const days = activeDays({ today: "2026-08-18", months: 13, rng });
    expect(isoDaysBetween(days[days.length - 1], "2026-08-18")).toBeLessThan(30);
    expect(days[days.length - 1] <= "2026-08-18").toBe(true);
  });
});

describe("seed-vault: frontmatter", () => {
  const NOTE = ['---', 'type: lesson', 'status: todo', '---', '', 'status: not this one', ''].join("\n");

  it("replaces a key the template declares", () => {
    expect(setFrontmatter(NOTE, "status", "done")).toContain("status: done");
    // AND ONLY IN THE FRONTMATTER. Belt and braces in the source — the replace
    // runs on `slice(0, end)` AND the regex is not global — so no single mutation
    // makes this line fail. It is kept as documentation of the intent, and the
    // test below is the one that guards it.
    expect(setFrontmatter(NOTE, "status", "done")).toContain("status: not this one");
  });

  it("decides what is declared from the frontmatter and not from the prose", () => {
    // THE ONE-CHARACTER SLIP THIS CATCHES: asking `re.test(body)` instead of
    // `re.test(head)`. A note whose PROSE happens to say `duration: 44` would then
    // count as declaring the key, the head replace would match nothing, and the
    // function would hand back an unchanged note as though it had written one —
    // a tracker value silently dropped, with no warning and no diff.
    const prose = ["---", "type: workout", "---", "", "duration: 44 was the plan", ""].join("\n");
    expect(setFrontmatter(prose, "duration", 30)).toBeNull();
    expect(setFrontmatter(prose, "duration", 30, { add: true })).toContain("duration: 30\n---");
  });

  it("declines an undeclared key unless the caller says it is a tracker", () => {
    // THE GUARD, not a formality: `add` is the difference between a seeder that
    // logs a tracker the way the plugin does and one that invents frontmatter no
    // template ever produces.
    expect(setFrontmatter(NOTE, "duration", 44)).toBeNull();
    const added = setFrontmatter(NOTE, "duration", 44, { add: true });
    expect(added).toContain("duration: 44");
    expect(added).toContain("type: lesson");
    expect(added.indexOf("duration:")).toBeLessThan(added.indexOf("\n---"));
  });

  it("declines a note with no frontmatter at all", () => {
    expect(setFrontmatter("# Just a heading\n", "status", "done", { add: true })).toBeNull();
    expect(setFrontmatter("---\nnever closed\n", "status", "done", { add: true })).toBeNull();
  });
});

describe("seed-vault: sections", () => {
  const NOTE = [
    "# Title",
    "",
    "## Key Concepts",
    "",
    "- **Definition:** …",
    "",
    "```chronoanvil",
    "recall",
    "```",
    "",
    "## Next",
    "",
    "- …",
    "",
  ].join("\n");

  it("replaces what is under a heading and stops at the fence", () => {
    const out = fillSection(NOTE, "Key Concepts", ["one", "two"]);
    expect(out).toContain("- one");
    expect(out).toContain("- two");
    expect(out).not.toContain("**Definition:** …");
    // THE FENCE IS A WIDGET. Swallowing it would silently delete the recall
    // block from every lesson in the example vault.
    expect(out).toContain("```chronoanvil\nrecall\n```");
    expect(out).toContain("## Next");
  });

  it("bullets a bold lead-in, which is the one the marker test got wrong", () => {
    // `**Definition:**` starts with `*`, and a marker test of `[-*>|]` read that
    // as a list item — so the corpus's most heavily used shape was the one shape
    // that came out unbulleted, in a vault whose whole job is to be looked at.
    const out = fillSection(NOTE, "Key Concepts", ["**Definition:** a stereocentre."]);
    expect(out).toContain("- **Definition:** a stereocentre.");
  });

  it("leaves a line that already carries a marker alone", () => {
    const out = fillSection(NOTE, "Key Concepts", ["- already", "> a quote", "### deeper", "", "plain"]);
    expect(out).toContain("\n- already\n");
    expect(out).not.toContain("- - already");
    expect(out).toContain("\n> a quote\n");
    expect(out).toContain("\n### deeper\n");
    expect(out).toContain("\n- plain\n");
  });

  it("writes a string as prose rather than as a bullet", () => {
    expect(fillSection(NOTE, "Key Concepts", "a paragraph")).toContain("\na paragraph\n");
  });

  it("declines a heading the template does not have", () => {
    // THE WARNING PATH. A corpus key that names a section no template carries is
    // a corpus error, and it has to surface as one rather than as a note that
    // quietly lost a third of its content.
    expect(fillSection(NOTE, "Summary", ["x"])).toBeNull();
  });
});

describe("seed-vault: regions round-trip through the plugin's own parsers", () => {
  const REGION = (id: string): string => `head\n\n<!--chronoanvil:${id}\n-->\n\ntail\n`;

  const read = (body: string, id: string): string => {
    const open = `<!--chronoanvil:${id}`;
    const at = body.indexOf(open) + open.length;
    return body.slice(at, body.indexOf("-->", at));
  };

  it("writes tasks that parseTaskLine accepts, with the done flag intact", () => {
    const lines = [taskLine({ text: "Back up the vault", done: false }), taskLine({ text: "Groceries", done: true })];
    const body = fillRegion(REGION("todo"), "todo", lines);
    const parsed = read(body, "todo")
      .split("\n")
      .filter((l: string) => l.trim())
      .map(parseTaskLine);
    expect(parsed.map((t) => t && t.text)).toEqual(["Back up the vault", "Groceries"]);
    expect(parsed.map((t) => t && t.done)).toEqual([false, true]);
    // `- [ ]` IS OBSIDIAN'S CHECKBOX AND `- ( )` IS CHRONOANVIL'S. A seeder that
    // wrote the native one would produce tasks the widgets cannot see.
    expect(parseTaskLine("- [ ] Back up the vault")).toBeNull();
  });

  it("writes recall cards that parseRecall reads as question AND answer", () => {
    // THE BUG THIS SUITE EXISTS FOR. The first version wrote `- ( ) question`
    // into the recall region: it parsed, it produced a card, and the card's
    // prompt read "- ( ) What makes an atom a stereocentre?" with nothing behind
    // the reveal. Fifty notes, zero warnings.
    const body = fillRegion(REGION("recall"), "recall", [
      recallLine(["What makes an atom a stereocentre?", "Four different substituents."]),
    ]);
    const [card] = parseRecall(read(body, "recall"));
    expect(card.question).toBe("What makes an atom a stereocentre?");
    expect(card.answer).toBe("Four different substituents.");
    expect(card.question).not.toContain("(");
  });

  it("writes list entries that parseEntries reads one per line, unmarked", () => {
    const body = fillRegion(REGION("highlights"), "highlights", ["Inbox empty.", "Good lunch."]);
    expect(parseEntries(read(body, "highlights"))).toEqual(["Inbox empty.", "Good lunch."]);
    // A LIST REGION IS NOT A MARKDOWN LIST. `serializeEntries` stores bare
    // lines and `plain-markdown.ts` adds the `- ` on export, so a seeded `- `
    // would come out as `- - Inbox empty.` in every export.
    expect(read(body, "highlights")).not.toContain("- Inbox");
  });

  it("leaves an empty region empty and declines one the template lacks", () => {
    expect(read(fillRegion(REGION("todo"), "todo", []), "todo").trim()).toBe("");
    expect(fillRegion(REGION("todo"), "capture", ["x"])).toBeNull();
  });
});

describe("seed-vault: names and tokens", () => {
  it("leaves an unknown token in place so a missing value is visible", () => {
    expect(fillTemplate("{{title}} on {{date}}", { title: "A" })).toBe("A on {{date}}");
    expect(fillTemplate("{{ title }}", { title: "A" })).toBe("A");
  });

  it("strips the characters a filename cannot carry", () => {
    expect(safeName(' Chirality and R,S: notes? ')).toBe("Chirality and R,S- notes-");
    expect(safeName("a/b\\c")).toBe("a-b-c");
  });
});

describe("seed-corpus", () => {
  it("keys its journals by the ids the presets actually use", () => {
    // A FIXTURE THAT RESTATES THE SOURCE IS A FIXTURE THAT CAN BE WRONG TOGETHER
    // WITH IT. This suite has been caught testing `exercise` against a real id of
    // `exercise-diet` — the assertion was green and the behaviour it described was
    // the opposite of the truth. So the ids come from the shipped presets, and a
    // preset renamed turns this red instead of turning the seeder into a no-op
    // that reports "0 written" and looks like a configuration problem.
    const ids = JOURNAL_PRESETS.map((p) => p.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(Object.keys(CORPUS).sort()).toEqual([...ids].sort());
  });

  it("gives every recall card an answer", () => {
    const cards: unknown[] = [];
    const walk = (nodes: { children?: unknown[]; notes?: { recall?: unknown[] }[] }[]): void => {
      for (const n of nodes) {
        for (const note of n.notes ?? []) cards.push(...(note.recall ?? []));
        if (n.children) walk(n.children as never);
      }
    };
    for (const j of Object.values(CORPUS) as { containers: never[] }[]) walk(j.containers);
    expect(cards.length).toBeGreaterThan(0);
    // A CARD WITH A BLANK REVEAL demonstrates the widget without demonstrating
    // the feature, and nothing in the tool warns about one.
    for (const c of cards) {
      expect(Array.isArray(c)).toBe(true);
      expect((c as string[])[1]).toBeTruthy();
    }
  });

  it("writes its sections as tight lists, with nesting done by indent", () => {
    // THE CONVENTION, pinned because the corpus predates `asMarkdown` and was
    // written when every line went in raw. Back then a `""` was a paragraph break
    // and a `"- "` was how you got a bullet at all. Now that unmarked lines are
    // bulleted for you, both spellings misfire: the blank becomes a loose list,
    // and the `- ` sub-item lands at the same level as the line it belongs under.
    // An array is a TIGHT LIST, one bullet per entry; nesting is leading spaces;
    // a paragraph is a string.
    const bad: string[] = [];
    const walk = (nodes: { children?: unknown[]; notes?: { sections?: Record<string, unknown> }[] }[]): void => {
      for (const n of nodes) {
        for (const note of n.notes ?? []) {
          for (const lines of Object.values(note.sections ?? {})) {
            if (!Array.isArray(lines)) continue;
            for (const l of lines as string[]) {
              if (l.trim() === "") bad.push("blank separator");
              if (/^[-*+]\s/.test(l)) bad.push(l);
            }
          }
        }
        if (n.children) walk(n.children as never);
      }
    };
    for (const j of Object.values(CORPUS) as { containers: never[] }[]) walk(j.containers);
    expect(bad).toEqual([]);
    // AND THE INDENTED FORM STILL SURVIVES, so the convention has somewhere to put
    // a genuine sub-list rather than just forbidding one.
    expect(fillSection("x\n## H\n\nold\n", "H", ["Options:", "  - a", "  - b"])).toContain("\n  - a\n");
  });

  it("answers each of the daily's four prompts with its own list", () => {
    const lists = [DIARY_FOCUS, DIARY_HIGHLIGHTS, DIARY_CHALLENGES, DIARY_TASKS, DIARY_LINES];
    for (const l of lists) expect(l.length).toBeGreaterThanOrEqual(10);
    // NO SHARED LINES. A vault whose Challenges read like its Highlights teaches
    // a reader that the prompts do not matter.
    const all = lists.flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

// ── The second pass: charts, logs and events (4.62) ──────────────────────
//
// SAME DISCIPLINE, THREE MORE GRAMMARS. The tool now writes stamped log items,
// `chart:` directives and an events list, and it writes all three in files that
// cannot import the plugin's serialisers — so each of them is a SECOND SPELLING
// of a format the plugin owns, which is exactly the situation that produced
// recall cards in the task format the first time round.
//
// So none of the tests below assert on a string this file also spells out. Each
// one feeds the seeder's output to the plugin's own reader — `parseLogItems`,
// `parseChartDirectives`, `parseEvents` — and asserts on what comes back. A
// stamp with the date and the time the wrong way round, a `+y=` written before
// the scope, a YAML list indented one space too few: all of them produce a file
// that looks right and a widget that shows nothing, and all of them fail here.
describe("seed-vault: the log grammar", () => {
  it("writes items the plugin's own parser reads back whole", () => {
    const line = stampLine({
      date: "2026-08-21",
      time: "14:32",
      text: "rewrote the pathwatch remap",
      mins: 45,
      done: "2026-08-22",
    });
    const [item] = parseLogItems(line);
    expect(item.date).toBe("2026-08-21");
    expect(item.time).toBe("14:32");
    expect(item.text).toBe("rewrote the pathwatch remap");
    expect(item.mins).toBe(45);
    expect(item.done).toBe("2026-08-22");
  });

  it("stamps a capture with the minute alone, because its note is the date", () => {
    const [item] = parseLogItems(stampLine({ time: "09:05", text: "call the dentist" }));
    expect(item.date).toBeNull();
    expect(item.time).toBe("09:05");
    // NOT ZERO. `mins: 0` and `mins: null` are different items — one took no
    // time, the other is a moment — and only the second is what a capture is.
    expect(item.mins).toBeNull();
  });

  it("keeps a multi-line thought one item, blank line and all", () => {
    const line = stampLine({ time: "10:00", text: "one\n\ntwo" });
    const items = parseLogItems(line);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("one\n\ntwo");
  });

  it("separates items so two of them do not parse as one", () => {
    // The blank line between items is the thing being pinned. Written without
    // it, the second stamp reads as text belonging to the first.
    const region = logBlock([
      stampLine({ date: "2026-08-01", time: "09:00", text: "first" }),
      stampLine({ date: "2026-08-02", time: "11:30", text: "second" }),
    ]).join("\n");
    const items = parseLogItems(region);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.text)).toEqual(["first", "second"]);
  });

  it("appends the region a logbook nobody has opened does not have yet", () => {
    // A logbook note carries its `logbook:` directive from the scaffold and
    // grows the region on first render, so seeding one means creating it.
    const note = "---\ntitle: Work log\n---\n\n```chronoanvil\nlogbook:work\n```\n";
    const withRegion = ensureRegion(note, "logbook");
    expect(readRegion(withRegion, "logbook")).toBe("");
    // And it is idempotent: a second pass must not stack a second region, which
    // would give the widget two places to write and one to read.
    expect(ensureRegion(withRegion, "logbook")).toBe(withRegion);
  });

  it("gives each logbook the shape its blurb promises", () => {
    const dates = activeDays({ today: "2026-08-23", months: 13, rng: mulberry32(7) });
    const rng = mulberry32(11);
    const work = logbookItems(LOGBOOK_CORPUS.work, dates, rng).map((l: string) => parseLogItems(l)[0]);
    const review = logbookItems(LOGBOOK_CORPUS.review, dates, rng).map((l: string) => parseLogItems(l)[0]);
    const focus = logbookItems(LOGBOOK_CORPUS.focus, dates, rng).map((l: string) => parseLogItems(l)[0]);

    // A WORK LOG IS DENSE AND TIMED, a focus log is neither, and a review list
    // is half crossed off. Seeding all three alike would render three identical
    // widgets and teach a reader that the distinction is decorative.
    expect(work.length).toBeGreaterThan(focus.length * 4);
    expect(work.some((i) => i.mins != null)).toBe(true);
    expect(focus.every((i) => i.mins == null)).toBe(true);
    expect(review.some((i) => i.done != null)).toBe(true);
    expect(review.some((i) => i.done == null)).toBe(true);

    // Every item dated, timed, and in order — the logbook renders newest last.
    for (const i of [...work, ...focus, ...review]) {
      expect(i.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(i.time).toMatch(/^\d{2}:\d{2}$/);
    }
    const dated = work.map((i) => i.date);
    expect([...dated].sort()).toEqual(dated);
  });

  it("says so when the vault has no journals to fill", () => {
    // The corpus's four journals cannot be written into a vault that declares
    // none — there is no shape to derive and no template to fill. Silence there
    // reads as "seeded", which is how a run that wrote a diary and nothing else
    // came to look like a complete one.
    const warnings: string[] = [];
    buildPlan({
      settings: { paths: { templatesDiary: "T", diaryDaily: "D" }, customJournals: [], trackers: [] },
      templates: new Map(),
      corpus: CORPUS,
      dates: ["2026-08-23"],
      rng: mulberry32(1),
      warn: (m: string) => warnings.push(m),
    });
    expect(warnings.some((w) => w.includes("no journals"))).toBe(true);
    // And it names the journals it would have written, so the warning is
    // actionable rather than an observation.
    for (const id of Object.keys(CORPUS)) expect(warnings.join("\n")).toContain(id);
  });

  it("fills the capture region of the entries it writes", () => {
    const daily =
      "---\njournal-date: \"\"\n# chronoanvil:trackers:start\nMood:\n# chronoanvil:trackers:end\n---\n" +
      "<!--chronoanvil:log\n-->\n\n<!--chronoanvil:capture\n-->\n";
    const dates = activeDays({ today: "2026-08-23", months: 2, rng: mulberry32(3) });
    const files = buildPlan({
      settings: { paths: { templatesDiary: "T", diaryDaily: "D" }, customJournals: [], trackers: [] },
      templates: new Map([["T/Daily.md", daily]]),
      corpus: {},
      dates,
      rng: mulberry32(5),
      warn: () => {},
    });
    const captured = files
      .map((f: { content: string }) => readRegion(f.content, "capture"))
      .filter((r: string) => r !== "");
    // Some days, not every day — an entry with nothing captured is a normal
    // entry, and the 4.62 time grid needs the ones that do have something.
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.length).toBeLessThan(files.length);
    for (const region of captured) {
      const items = parseLogItems(region);
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) {
        // A capture never carries a date; its note is the date.
        expect(i.date).toBeNull();
        expect(i.time).toMatch(/^\d{2}:\d{2}$/);
        expect(DIARY_CAPTURES).toContain(i.text);
      }
    }
  });
});

describe("seed-vault: charts", () => {
  it("writes directives byte-for-byte as the plugin would write them back", () => {
    // NOT JUST PARSEABLE — IDENTICAL. The chart editor rewrites the whole fence
    // the first time a reader touches one chart, so a seeded directive that
    // parses but serialises differently turns into a diff nobody made.
    for (const plan of Object.values(DIARY_CHARTS) as Record<string, unknown>[][]) {
      for (const spec of plan) {
        const line = chartLine(spec);
        const [parsed] = parseChartDirectives([line]);
        expect(parsed, line).toBeTruthy();
        expect(serializeChartSpec(parsed)).toBe(line);
      }
    }
  });

  it("carries the plan's own words through to the parsed spec", () => {
    const [spec] = parseChartDirectives([
      chartLine({ key: "k", tracker: "Sleep", type: "scatter", range: "365", y: "Mood", avg: true, title: "Does sleep move mood?" }),
    ]);
    expect(spec.tracker).toBe("Sleep");
    expect(spec.tracker2).toBe("Mood");
    expect(spec.avg).toBe(true);
    expect(spec.title).toBe("Does sleep move mood?");
  });

  it("keeps every key unique inside a note, since the key is the handle", () => {
    for (const [surface, plan] of Object.entries(DIARY_CHARTS) as [string, { key: string }[]][]) {
      const keys = plan.map((s) => s.key);
      expect(new Set(keys).size, surface).toBe(keys.length);
    }
  });

  it("fills an empty fence and refuses one that already has charts", () => {
    const note = "`chronoanvil:spacer`\n\n```chronoanvil-charts\nheader:📊 Trends\n```\n";
    const filled = fillChartsFence(note, ["chart:a:Mood:line:90"]);
    // THE HEADER SURVIVES. In the merged layout the fence carries the section
    // title as well as the charts, so a fill that replaced the body would take
    // the heading off the section it belongs to.
    expect(filled).toContain("header:📊 Trends");
    expect(parseChartDirectives(filled.split("\n"))).toHaveLength(1);
    // Second pass: already answered, so nothing to do. Not an error — this is
    // what re-running the tool on a seeded vault looks like.
    expect(fillChartsFence(filled, ["chart:b:Sleep:line:90"])).toBeNull();
    // And a note with no fence at all is left alone rather than grown one.
    expect(fillChartsFence("just prose\n", ["chart:a:Mood:line:90"])).toBeNull();
  });

  it("only charts a tracker the daily template actually writes", () => {
    // Declared in settings, absent from the template's frontmatter block: the
    // chart editor would offer it and every reading would be missing. This is
    // the difference between a demo vault and a vault full of empty tiles.
    const settings = {
      trackers: [
        { id: "Mood", surface: { kind: "diary" } },
        { id: "Energy", surface: { kind: "diary" } },
        { id: "confidence", surface: { kind: "journal" } },
      ],
    };
    const daily = "---\n# chronoanvil:trackers:start\nMood:\nSleep:\n# chronoanvil:trackers:end\n---\n";
    const usable = chartableTrackers({ settings, dailyTemplate: daily });
    expect([...usable]).toEqual(["Mood"]);
  });
});

describe("seed-vault: events", () => {
  it("writes YAML the plugin's own event reader accepts", () => {
    const events = resolveEvents(SEED_EVENTS, "2026-08-23");
    // `eventsYaml` writes what Obsidian's frontmatter parser would hand to
    // `parseEvents`, so the test parses the YAML and then reads it as events —
    // the same two steps the plugin takes, in the same order.
    const yaml = eventsYaml(events);
    const raw = yamlList(yaml);
    const parsed = parseEvents(raw);
    expect(parsed).toHaveLength(events.length);
    expect(parsed.every((e) => e.id && e.title)).toBe(true);
    // The three kinds the corpus carries all survive the round trip.
    expect(parsed.some((e) => e.kind === "single" && e.end)).toBe(true);
    expect(parsed.some((e) => e.kind === "recurring" && e.month != null)).toBe(true);
    const weekly = parsed.find((e) => e.every === "week");
    expect(weekly?.weekday).toBe(3);
    expect(weekly?.time).toBe("09:30");
    expect(weekly?.duration).toBe(15);
  });

  it("resolves the corpus's offsets against the run's own today", () => {
    const a = resolveEvents(SEED_EVENTS, "2026-08-23");
    const b = resolveEvents(SEED_EVENTS, "2026-09-23");
    const single = (list: { kind: string; start?: string }[]) => list.filter((e) => e.kind === "single");
    // A dated event moves with `--today`; an annual one does not, because a
    // birthday is a month and a day.
    expect(single(a)[0].start).not.toBe(single(b)[0].start);
    expect(a.filter((e) => e.month != null)).toEqual(b.filter((e) => e.month != null));
  });

  it("fills an empty events list and refuses one somebody has used", () => {
    const note = "---\nchronoanvil-events: []\n---\nbody\n";
    const events = resolveEvents(SEED_EVENTS, "2026-08-23");
    const filled = fillEvents(note, events);
    expect(parseEvents(yamlList(filled.split("\n---")[0]))).toHaveLength(events.length);
    expect(fillEvents(filled, events)).toBeNull();
    // `--force` empties it first, which is the only way to replace a list — and
    // is a single decision rather than the caller clearing things behind the
    // transform's back.
    expect(fillEvents(clearEvents(filled), events)).not.toBeNull();
  });
});

describe("seed-vault: the patch pass", () => {
  const settings = {
    paths: {
      home: "Homepage.md",
      diaryRoot: "02 - Diary",
      diaryWeekly: "02 - Diary/Weekly",
      diaryMonthly: "02 - Diary/Monthly",
      diaryQuarterly: "02 - Diary/Quarterly",
      diaryYearly: "02 - Diary/Yearly",
      diaryDaily: "02 - Diary/Daily",
      events: "02 - Diary/Events.md",
      templatesDiary: "T",
    },
    trackers: ["Mood", "Sleep", "Wake-Up", "Bedtime"].map((id) => ({ id, surface: { kind: "diary" } })),
    logbooks: [
      { id: "work", source: "region", path: "02 - Diary/Logbooks/Work log.md" },
      { id: "focus", source: "region", path: "02 - Diary/Logbooks/Current focus.md" },
      { id: "review", source: "region", path: "02 - Diary/Logbooks/Review links.md" },
      { id: "meetings", source: "events", path: "02 - Diary/Logbooks/Meetings.md" },
    ],
  };
  const templates = new Map([
    ["T/Daily.md", "---\n# chronoanvil:trackers:start\nMood:\nSleep:\nWake-Up:\nBedtime:\n# chronoanvil:trackers:end\n---\n"],
  ]);
  const make = () =>
    buildPatches({
      settings,
      templates,
      plans: { charts: DIARY_CHARTS, logbooks: LOGBOOK_CORPUS, events: SEED_EVENTS },
      dates: activeDays({ today: "2026-08-23", months: 13, rng: mulberry32(2) }),
      today: "2026-08-23",
      rng: mulberry32(4),
      warn: () => {},
    });

  it("finds each dashboard by the folder-note rule rather than by name", () => {
    // A reader who renames `02 - Diary` still gets their charts, which is the
    // same reason nothing else in this tool spells a path out.
    expect(folderNote("02 - Diary/Weekly")).toBe("02 - Diary/Weekly/Weekly.md");
    const paths = make().map((p: { path: string }) => p.path);
    expect(paths).toContain("02 - Diary/Weekly/Weekly.md");
    expect(paths).toContain("Homepage.md");
  });

  it("patches the six chart surfaces, the three region logbooks and the events note", () => {
    const byWhat = make().reduce((acc: Record<string, number>, p: { what: string }) => {
      acc[p.what] = (acc[p.what] ?? 0) + 1;
      return acc;
    }, {});
    expect(byWhat).toEqual({ charts: 6, logbook: 3, events: 1 });
    // The Meetings logbook is NOT one of them and does not need to be: it reads
    // the events note, so it fills itself the moment the events patch lands.
    expect(make().map((p: { path: string }) => p.path)).not.toContain("02 - Diary/Logbooks/Meetings.md");
  });

  it("leaves a logbook that already has items alone, and replaces it under --force", () => {
    const patch = make().find((p: { what: string }) => p.what === "logbook");
    const empty = "```chronoanvil\nlogbook:work\n```\n";
    const filled = patch.apply(empty, {});
    expect(parseLogItems(readRegion(filled, "logbook")).length).toBeGreaterThan(0);
    expect(patch.apply(filled, {})).toBeNull();
    expect(patch.apply(filled, { force: true })).not.toBeNull();
  });

  it("drops a chart whose tracker has no readings, and says so", () => {
    const warnings: string[] = [];
    const patches = buildPatches({
      settings,
      // A template that writes only Mood: every Sleep, Wake-Up and Bedtime chart
      // in the corpus would be an empty tile, so none of them is written.
      templates: new Map([["T/Daily.md", "---\n# chronoanvil:trackers:start\nMood:\n# chronoanvil:trackers:end\n---\n"]]),
      plans: { charts: DIARY_CHARTS, logbooks: {}, events: [] },
      dates: ["2026-08-23"],
      today: "2026-08-23",
      rng: mulberry32(4),
      warn: (m: string) => warnings.push(m),
    });
    expect(warnings.length).toBeGreaterThan(0);
    const note = "```chronoanvil-charts\nheader:x\n```\n";
    for (const p of patches.filter((p: { what: string }) => p.what === "charts")) {
      for (const spec of parseChartDirectives((p.apply(note, {}) as string).split("\n"))) {
        expect(spec.tracker).toBe("Mood");
        expect(spec.tracker2 ?? "Mood").toBe("Mood");
      }
    }
  });
});

describe("seed-vault: period hierarchy and nested entries", () => {
  const paths = {
    diaryRoot: "02 - Diary",
    diaryEntries: "02 - Diary/Entries",
    templatesDiary: "00 - Infrastructure/Templates/Diary",
  };

  it("calculates containing period hierarchy accurately", () => {
    const h = periodHierarchy("2026-08-29");
    expect(h.day.name).toBe("Day-2026-08-29");
    expect(h.week.name).toBe("Week-2026-W35");
    expect(h.month.name).toBe("Month-2026-08");
    expect(h.quarter.name).toBe("Quarter-2026-Q3");
    expect(h.year.name).toBe("Year-2026");
  });

  it("computes nested folder paths for all grains", () => {
    expect(entryFolder(paths, "yearly", "2026-08-29")).toBe("02 - Diary/Entries/Year-2026");
    expect(entryFolder(paths, "quarterly", "2026-08-29")).toBe("02 - Diary/Entries/Year-2026/Quarter-2026-Q3");
    expect(entryFolder(paths, "monthly", "2026-08-29")).toBe("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08");
    expect(entryFolder(paths, "weekly", "2026-08-29")).toBe("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35");
    expect(entryFolder(paths, "daily", "2026-08-29")).toBe("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35");
  });
});

describe("seed-vault: graph links and zero-width spines", () => {
  it("embeds and updates zero-width hidden graph links", () => {
    const original = "# Title\n\nSome body text.\n";
    const linked = setGraphLinks(original, ["Week-2026-W35"]);
    expect(linked).toContain("%% chronoanvil-graph %%\n%% [[Week-2026-W35|\u200B]] %%");

    const relinked = setGraphLinks(linked, ["Week-2026-W36"]);
    expect(relinked).toContain("%% chronoanvil-graph %%\n%% [[Week-2026-W36|\u200B]] %%");
    expect(relinked).not.toContain("Week-2026-W35");

    const stripped = setGraphLinks(relinked, []);
    expect(stripped).not.toContain("%% chronoanvil-graph %%");
  });
});

describe("seed-vault: period entries generation and corpus", () => {
  it("generates week, month, quarter, and year notes when templates are provided", () => {
    const templates = new Map([
      ["T/Daily.md", "---\njournal-date: \"\"\n---\n<!--chronoanvil:log\n-->\n"],
      ["T/Weekly Entry.md", "---\nweek-start: \"\"\n---\n<!--chronoanvil:focus\n-->\n<!--chronoanvil:highlights\n-->\n<!--chronoanvil:todo\n-->\n"],
      ["T/Monthly Entry.md", "---\nmonth: \"\"\n---\n<!--chronoanvil:focus\n-->\n<!--chronoanvil:highlights\n-->\n<!--chronoanvil:log\n-->\n"],
      ["T/Quarterly Entry.md", "---\nquarter-start: \"\"\n---\n<!--chronoanvil:focus\n-->\n<!--chronoanvil:highlights\n-->\n"],
      ["T/Yearly Entry.md", "---\nyear-start: \"\"\n---\n<!--chronoanvil:focus\n-->\n<!--chronoanvil:highlights\n-->\n<!--chronoanvil:log\n-->\n"],
    ]);

    const settings = {
      paths: {
        templatesDiary: "T",
        diaryRoot: "02 - Diary",
        diaryEntries: "02 - Diary/Entries",
      },
      customJournals: [],
      trackers: [],
    };

    const files = buildPlan({
      settings,
      templates,
      corpus: {},
      dates: ["2026-08-28", "2026-08-29"],
      rng: mulberry32(42),
      warn: () => {},
    });

    const pathsList = files.map((f: { path: string }) => f.path);
    expect(pathsList).toContain("02 - Diary/Entries/Year-2026/Year-2026.md");
    expect(pathsList).toContain("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Quarter-2026-Q3.md");
    expect(pathsList).toContain("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Month-2026-08.md");
    expect(pathsList).toContain("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Week-2026-W35.md");
    expect(pathsList).toContain("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Day-2026-08-28.md");
    expect(pathsList).toContain("02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Day-2026-08-29.md");

    // Check graph link chain: Day -> Week -> Month -> Quarter -> Year (Year detached)
    const dayFile = files.find((f: { path: string }) => f.path.endsWith("Day-2026-08-29.md"));
    expect(dayFile.content).toContain("[[Week-2026-W35|\u200B]]");

    const weekFile = files.find((f: { path: string }) => f.path.endsWith("Week-2026-W35.md"));
    expect(weekFile.content).toContain("[[Month-2026-08|\u200B]]");

    const monthFile = files.find((f: { path: string }) => f.path.endsWith("Month-2026-08.md"));
    expect(monthFile.content).toContain("[[Quarter-2026-Q3|\u200B]]");

    const quarterFile = files.find((f: { path: string }) => f.path.endsWith("Quarter-2026-Q3.md"));
    expect(quarterFile.content).toContain("[[Year-2026|\u200B]]");

    const yearFile = files.find((f: { path: string }) => f.path.endsWith("Year-2026.md"));
    expect(yearFile.content).not.toContain("%% chronoanvil-graph %%");
  });
});

// ── 4.83: the day model, the task window, and the charts that parse ──────
//
// THE DISCIPLINE IS THE ONE THIS FILE OPENED WITH, applied to three more
// formats. Nothing below asserts on a string this repository spells twice: the
// day's numbers are checked against the plugin's own `sleepHours`, the task
// lines against `parseTaskLine`, the chart directives against
// `parseChartDirectives` — and the last of those is not decoration. The seeder
// briefly wrote `chart:…:period:daily-by-month`, which the plugin's own
// serialiser produces and its own `CHART_TAG` does not accept: every line was
// written, every fence looked right, and four charts would have been dropped on
// the first read with nothing said. A test that knew the format would have
// agreed with the bug; this one asks the parser.

describe("seed-vault: the day model", () => {
  const model = (date: string, seed = 7) => dayModel({ date, rng: mulberry32(seed) });

  it("derives Sleep from its own two times, the way the plugin recomputes it", () => {
    // The seeded value has to be the one `recomputeSleepInFrontmatter` would
    // write, or the example vault holds a number that changes the moment
    // anybody edits the note it is in.
    for (const date of ["2026-08-24", "2026-08-29", "2026-08-30", "2026-01-01"]) {
      for (let seed = 1; seed <= 40; seed++) {
        const m = model(date, seed);
        expect(m.sleep).toBe(sleepHours(m.bed, m.wake));
      }
    }
  });

  it("gives a weekend a later morning than a weekday", () => {
    const wake = (date: string) => {
      let total = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const [h, mn] = model(date, seed).wake.split(":").map(Number);
        total += h * 60 + mn;
      }
      return total / 120;
    };
    // 2026-08-29 is a Saturday, 2026-08-26 a Wednesday.
    expect(wake("2026-08-29")).toBeGreaterThan(wake("2026-08-26") + 45);
  });

  it("moves mood with sleep without making it a function of it", () => {
    const days: { sleep: number; mood: number }[] = [];
    const rng = mulberry32(20260818);
    for (let i = 0; i < 400; i++) {
      const m = dayModel({ date: isoShift("2025-08-01", i), rng });
      days.push({ sleep: m.sleep, mood: m.moodN });
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const xs = days.map((d) => d.sleep);
    const ys = days.map((d) => d.mood);
    const mx = mean(xs);
    const my = mean(ys);
    const cov = mean(days.map((d) => (d.sleep - mx) * (d.mood - my)));
    const r = cov / (Math.sqrt(mean(xs.map((x) => (x - mx) ** 2))) * Math.sqrt(mean(ys.map((y) => (y - my) ** 2))));
    // A SLOPE, AND NOT A LINE. The diary ships a chart called "Does sleep move
    // mood?"; against independent draws the honest answer it drew was a
    // shapeless cloud, and against a formula it would draw a straight line and
    // demonstrate nothing but arithmetic.
    expect(r).toBeGreaterThan(0.25);
    expect(r).toBeLessThan(0.85);
    // And the whole scale is used — a year that never has a bad day makes the
    // mood chart a flat band near the top.
    expect(Math.min(...ys)).toBeLessThan(0.3);
    expect(Math.max(...ys)).toBeGreaterThan(0.75);
  });

  it("tells the prose what kind of day it was", () => {
    const rng = mulberry32(3);
    const tones = new Set<string>();
    for (let i = 0; i < 300; i++) tones.add(dayModel({ date: isoShift("2026-01-01", i), rng }).tone);
    expect([...tones].sort()).toEqual(["good", "hard", "mixed"]);
  });

  it("reads a tracker off the day by its builtin kind, not by its name", () => {
    const m = model("2026-08-26");
    // A RENAMED TRACKER IS STILL THE SAME TRACKER. The id follows the label, so
    // a reader whose mood scale is called "Humour" must still get mood values.
    const humour = { id: "Humour", builtin: "mood", type: "scale", min: 1, max: 5, step: 1 };
    const v = trackerValueFor(humour, m, mulberry32(1));
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(5);
    // And a scale the plugin has never heard of is scaled into ITS range.
    const tenner = { id: "Steps", type: "number", min: 0, max: 10, step: 0.5 };
    const s = trackerValueFor(tenner, m, mulberry32(1));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(10);
    expect(Number.isInteger(s * 2)).toBe(true);
  });

  it("finds the edges of the lapse without being told where it is", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-25", "2026-01-26"];
    const { before, after } = gapEdges(dates);
    expect(before.has("2026-01-03")).toBe(true);
    expect(after.has("2026-01-26")).toBe(true);
    expect(before.has("2026-01-25")).toBe(false);
  });
});

describe("seed-vault: the month that bounds the open tasks", () => {
  it("closes everything older than the window, with no exceptions", () => {
    const rng = mulberry32(11);
    for (let age = 31; age < 400; age += 7) {
      const t = taskAging({ date: isoShift("2026-08-29", -age), today: "2026-08-29", rng });
      expect(t.done).toBe(true);
    }
  });

  it("leaves some of the last month open, more of it the nearer it is", () => {
    const openAt = (age: number): number => {
      const rng = mulberry32(4242);
      let open = 0;
      for (let i = 0; i < 300; i++) {
        if (!taskAging({ date: isoShift("2026-08-29", -age), today: "2026-08-29", rng }).done) open++;
      }
      return open;
    };
    expect(openAt(0)).toBeGreaterThan(openAt(28));
    expect(openAt(28)).toBeGreaterThan(0);
  });

  it("writes due dates and hours the plugin's own task parser reads back", () => {
    const line = taskLine({
      text: "Collect the parcel before the depot shuts",
      done: false,
      priority: "high",
      due: "2026-08-30",
      at: "17:30",
    });
    const task = parseTaskLine(line);
    expect(task?.done).toBe(false);
    expect(task?.priority).toBe("high");
    expect(task?.due).toBe("2026-08-30");
    // AN HOUR IS WHAT THE TIME GRID DRAWS A TASK AS A BLOCK BY, and it is
    // dropped by the parser when the line carries no day — so the writer must
    // never emit one alone.
    expect(task?.at).toBe("17:30");
    expect(parseTaskLine(taskLine({ text: "x", done: false, at: "09:00" }))?.at).toBeNull();
    // The minimal form stays minimal: a normal, undated task is a plain line.
    expect(taskLine({ text: "Back up the vault", done: true })).toBe("- (x) Back up the vault");
  });

  it("seeds a whole vault with no open task older than the window", () => {
    const templates = new Map([
      [
        "T/Daily.md",
        [
          "---",
          'journal-date: ""',
          "# chronoanvil:trackers:start",
          "Mood:",
          "# chronoanvil:trackers:end",
          "---",
          "```chronoanvil",
          "# chronoanvil:trackers:start",
          "tracker:Mood",
          "# chronoanvil:trackers:end",
          "```",
          "<!--chronoanvil:log",
          "-->",
          "<!--chronoanvil:todo",
          "-->",
        ].join("\n"),
      ],
      [
        "T/Weekly Entry.md",
        '---\nweek-start: ""\n---\n<!--chronoanvil:focus\n-->\n<!--chronoanvil:todo\n-->\n',
      ],
    ]);
    const settings = {
      paths: { templatesDiary: "T", diaryRoot: "02 - Diary", diaryEntries: "02 - Diary/Entries" },
      customJournals: [],
      trackers: [
        { id: "Mood", builtin: "mood", type: "scale", min: 1, max: 5, step: 1, surface: { kind: "diary", classes: ["daily"] } },
      ],
    };
    const today = "2026-08-29";
    const rng = mulberry32(20260818);
    const dates = activeDays({ today, months: 13, rng });
    const files = buildPlan({ settings, templates, corpus: {}, dates, rng, today, warn: () => {} });

    const stale: string[] = [];
    let open = 0;
    for (const f of files as { path: string; content: string }[]) {
      const date = /Day-(\d{4}-\d{2}-\d{2})/.exec(f.path)?.[1] ?? null;
      const week = /week-start: "(\d{4}-\d{2}-\d{2})"/.exec(f.content)?.[1] ?? null;
      const on = date ?? week;
      for (const line of f.content.split("\n")) {
        const task = parseTaskLine(line);
        if (!task || task.done) continue;
        open++;
        if (on && isoDaysBetween(on, today) > 30) stale.push(`${f.path} — ${line}`);
      }
    }
    // THE WHOLE POINT, IN ONE ASSERTION. Before this the same run left about
    // two hundred open tasks in the vault, the oldest of them thirteen months
    // stale, and `tasks-table` — a folder-scoped rollup of every open task
    // under a folder — opened onto a wall of them.
    expect(stale).toEqual([]);
    // And not so few that the widgets have nothing to draw.
    expect(open).toBeGreaterThan(3);
    expect(open).toBeLessThan(60);
  });

  it("spreads every journal's notes across the whole strip, not the front of it", () => {
    // THE BUG THIS PINS, FOUND ON A SCREENSHOT OF THE SEEDED VAULT. Journal note
    // dates came from one shared cursor — `dates[cursor++ % dates.length]` — so
    // the Nth journal note in the VAULT took the Nth active day. Forty notes
    // against thirteen months of dates put every one of them in the oldest two
    // months, and the activity strip covers 53 weeks back from TODAY: Study's
    // newest note landed 2025-08-24 against a strip opening 2025-08-31, so its
    // dashboard drew a year of empty cells above a Contents section listing
    // seventeen notes.
    //
    // The run reported "402 written, 0 warnings" throughout. Every note existed,
    // every date was real, and every date was an active day — the only thing
    // wrong with them was WHICH days, which nothing outside a dashboard could
    // see. That is why this test reads dates out of the plan rather than
    // counting files.
    const today = "2026-08-29";
    // The window the plugin's own strip draws: 53 whole weeks back from the week
    // containing today. Derived rather than typed, so it tracks STRIP_WEEKS.
    const stripOpens = isoShift(today, -(53 * 7 - 1) - 6);
    const journal = (id: string) => ({
      id,
      name: id,
      root: id,
      templatesFolder: `T/${id}`,
      levels: [{ id: "subject", fallbackEmoji: "📚" }],
      kinds: [{ id: "lesson", emoji: "📝", templates: [{ template: "lesson.md" }] }],
    });
    const templates = new Map(
      ["a", "b"].flatMap((id) => [
        [`T/${id}/subject-index.md`, "---\ncreated: {{created}}\n---\n"],
        [`T/${id}/lesson.md`, "---\ndate: {{date}}\ncreated: {{created}}\n---\n"],
      ])
    );
    const notes = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ kind: "lesson", title: `n${i}` }));
    const files = buildPlan({
      settings: {
        paths: { templatesDiary: "T", diaryDaily: "D" },
        customJournals: [journal("a"), journal("b")],
        trackers: [],
      },
      templates,
      corpus: {
        a: { containers: [{ name: "A", notes: notes(8) }] },
        b: { containers: [{ name: "B", notes: notes(8) }] },
      },
      dates: activeDays({ today, months: 13, rng: mulberry32(20260818) }),
      rng: mulberry32(5),
      today,
      warn: () => {},
    });

    const datesIn = (root: string) =>
      (files as { path: string; content: string }[])
        .filter((f) => f.path.startsWith(`${root}/`))
        .map((f) => /^date: (\d{4}-\d{2}-\d{2})$/m.exec(f.content)?.[1] ?? null)
        .filter((d): d is string => d !== null)
        .sort();

    for (const root of ["a", "b"]) {
      const ds = datesIn(root);
      expect(ds.length).toBe(8);
      // NOT ONE DAY OUTSIDE THE STRIP. This alone fails the old cursor.
      expect(ds[0] >= stripOpens).toBe(true);
      // AND SPANNING IT, PER JOURNAL. A single shared stride across all the
      // journals would satisfy the line above and still give each journal a
      // contiguous QUARTER of the window — four dashboards blank for nine
      // months each. Both halves of the fix are needed and both are asserted:
      // every journal reaches the last month on its own.
      expect(isoDaysBetween(ds[ds.length - 1], today)).toBeLessThan(31);
      // and starts in the first third of it rather than partway through.
      expect(isoDaysBetween(stripOpens, ds[0])).toBeLessThan(130);
    }
    // The two journals overlap in time rather than following one another, which
    // is the same claim read from the other side.
    const a = datesIn("a");
    const b = datesIn("b");
    expect(a[0] < b[b.length - 1] && b[0] < a[a.length - 1]).toBe(true);
  });

  it("always ends on today, so the vault does not read as abandoned", () => {
    for (const seed of [1, 2, 3, 20260818]) {
      const dates = activeDays({ today: "2026-08-29", months: 13, rng: mulberry32(seed) });
      expect(dates[dates.length - 1]).toBe("2026-08-29");
      expect(dates).toContain("2026-08-28");
      // Still sorted and still without duplicates after the two are ensured.
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(dates.length);
    }
  });
});

describe("seed-vault: charts the plugin can read back", () => {
  it("round-trips every chart in the corpus through the plugin's own parser", () => {
    const lost: string[] = [];
    const drifted: string[] = [];
    for (const [surface, specs] of Object.entries(DIARY_CHARTS as Record<string, never[]>)) {
      for (const spec of specs) {
        const line = chartLine(spec);
        const [parsed] = parseChartDirectives([line]);
        if (!parsed) {
          lost.push(`${surface}: ${line}`);
          continue;
        }
        // AND BYTE-IDENTICAL ON THE WAY BACK OUT, because the chart editor
        // rewrites the whole fence the first time somebody touches one — a
        // directive that parses but re-serialises differently turns into a diff
        // in the reader's vault that nobody asked for.
        if (serializeChartSpec(parsed) !== line) drifted.push(`${line} → ${serializeChartSpec(parsed)}`);
      }
    }
    expect(lost).toEqual([]);
    expect(drifted).toEqual([]);
  });

  it("keeps every chart key unique within its own note", () => {
    for (const [surface, specs] of Object.entries(DIARY_CHARTS as Record<string, { key: string }[]>)) {
      const keys = specs.map((s) => s.key);
      expect([surface, new Set(keys).size]).toEqual([surface, keys.length]);
    }
  });

  it("writes journal charts the journal parser reads back", () => {
    const line = journalChartLine({ key: "js1", shape: "breakdown", tracker: "intensity" });
    const [spec] = parseJournalChartDirectives([line]);
    expect(spec.shape).toBe("breakdown");
    expect(spec.tracker).toBe("intensity");
    expect(serializeJournalChartSpec(spec)).toBe(line);
  });

  it("adds a journal-charts fence above the graph block, and only once", () => {
    const note = "```chronoanvil\njournal-header\n```\n\n%% chronoanvil-graph %%\n%% [[Study|​]] %%\n";
    const filled = fillJournalChartsFence(note, ["jchart:js1:trend:confidence"]);
    expect(filled).toContain("```chronoanvil-journal-charts");
    // The hidden link pair is found by matching to the END of the note, so a
    // fence written under it would take the note's graph edge with it.
    expect(filled.indexOf("chronoanvil-journal-charts")).toBeLessThan(filled.indexOf("%% chronoanvil-graph %%"));
    expect(parseJournalChartDirectives(filled.split("\n"))).toHaveLength(1);
    // A second run is a no-op, which is the rule every patch in this tool
    // follows: it fills what is empty and nothing else.
    expect(fillJournalChartsFence(filled, ["jchart:js2:trend:accuracy"])).toBeNull();
    // …until --force empties it first.
    expect(fillJournalChartsFence(clearJournalChartsFence(filled), ["jchart:js2:trend:accuracy"])).toContain(
      "jchart:js2:trend:accuracy"
    );
  });

  it("charts a journal's own quantities before the ones every journal shares", () => {
    const settings = {
      trackers: [
        { id: "confidence", type: "number", surface: { kind: "journal", typeId: null } },
        { id: "status", type: "select", surface: { kind: "journal", typeId: null } },
        { id: "duration", type: "number", surface: { kind: "journal", typeId: "exercise-diet" } },
      ],
    };
    const have = new Set(["confidence", "status", "duration"]);
    expect(journalChartTrackers(settings, "exercise-diet", have)).toEqual(["duration", "confidence"]);
    // A select is not a magnitude — `chartableType` refuses one and so does
    // this, or the dashboard gets a trend line through a set of words.
    expect(journalChartTrackers(settings, "exercise-diet", have)).not.toContain("status");
    // And a tracker with no readings is not charted at all, which is the same
    // refusal `chartableTrackers` makes for the diary.
    expect(journalChartTrackers(settings, "media", new Set())).toEqual([]);
  });
});

describe("seed-vault: per-entry trackers", () => {
  const NOTE = [
    "---",
    'journal-date: "2026-08-29"',
    "# chronoanvil:trackers:start",
    "Mood:",
    "# chronoanvil:trackers:end",
    "---",
    "```chronoanvil",
    "entry-header",
    "```",
    "",
    "```chronoanvil",
    "# chronoanvil:trackers:start",
    "tracker:Mood",
    "sleep",
    "# chronoanvil:trackers:end",
    "```",
    "",
  ].join("\n");

  it("adds the widget inside the note's own tracker fence", () => {
    const next = addTrackerDirective(NOTE, "tracker:Energy");
    // Asked of the plugin's own reader, because the marker this splices at
    // appears TWICE in a daily note — once in the frontmatter, listing keys, and
    // once in a fence, listing widgets — and only one of them is a fence.
    expect(noteTrackerDirectives(next.split("\n"))).toEqual(["tracker:Mood", "sleep", "tracker:Energy"]);
    const region = locateTrackerRegion(next.split("\n"));
    expect(region?.marked).toBe(true);
    // The frontmatter block is untouched: still one key, still closed.
    expect(next.split("---")[1]).toBe('\njournal-date: "2026-08-29"\n# chronoanvil:trackers:start\nMood:\n# chronoanvil:trackers:end\n');
  });

  it("adds it once, and refuses a note with no fence to put it in", () => {
    const once = addTrackerDirective(NOTE, "tracker:Energy");
    expect(addTrackerDirective(once, "tracker:Energy")).toBe(once);
    expect(addTrackerDirective("---\nx: 1\n---\n\nplain note\n", "tracker:Energy")).toBeNull();
  });

  it("charts a per-entry tracker once the run has actually written one", () => {
    const settings = {
      trackers: [
        { id: "Mood", surface: { kind: "diary", classes: ["daily"] } },
        { id: "Energy", surface: { kind: "diary", classes: ["daily"] } },
        { id: "Focus", surface: { kind: "diary", classes: ["daily"] } },
      ],
    };
    const daily = "---\n# chronoanvil:trackers:start\nMood:\n# chronoanvil:trackers:end\n---\n";
    // Unseeded, the old answer stands: declared, chartable, and no readings.
    expect([...chartableTrackers({ settings, dailyTemplate: daily })]).toEqual(["Mood"]);
    expect([...chartableTrackers({ settings, dailyTemplate: daily, seeded: ["Energy"] })]).toEqual([
      "Mood",
      "Energy",
    ]);
    // And a tracker nobody declared is still not chartable however loudly the
    // run claims to have written it.
    expect([...chartableTrackers({ settings, dailyTemplate: daily, seeded: ["Nonsense"] })]).toEqual(["Mood"]);
  });
});

describe("seed-vault: the corpus says what the vault can hold", () => {
  it("gives every status a value the Status tracker actually offers", () => {
    // TWENTY-FOUR NOTES ONCE SAID `status: "done"`, which is not one of the
    // three options the built-in declares. Nothing failed: the key existed, the
    // write succeeded, `journal-tally:status` drew a bar for a value nothing
    // defined, and `scheduleFor` — which drops a COMPLETED note out of the
    // review queue — went on offering all twenty-four of them for review for
    // ever.
    const status = DEFAULT_TRACKERS.find((t) => t.builtin === "status");
    const options = new Set(
      String(status?.options ?? "")
        .split(",")
        .map((pair) => pair.split("=")[0].trim())
    );
    expect(options.size).toBeGreaterThan(0);
    const bad: string[] = [];
    const walk = (nodes: { children?: unknown[]; notes?: { title: string; status?: string }[] }[]): void => {
      for (const n of nodes) {
        for (const note of n.notes ?? []) {
          if (note.status && !options.has(note.status)) bad.push(`${note.title}: ${note.status}`);
        }
        if (n.children) walk(n.children as never);
      }
    };
    for (const j of Object.values(CORPUS) as { containers: never[] }[]) walk(j.containers);
    expect(bad).toEqual([]);
  });

  it("answers a good day and a hard one with different sentences", () => {
    const tones = [DIARY_LINES_GOOD, DIARY_LINES_MIXED, DIARY_LINES_HARD];
    for (const list of tones) expect(list.length).toBeGreaterThanOrEqual(8);
    const all = tones.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(DIARY_LINES).toEqual(all);
    for (const tone of ["good", "mixed", "hard"] as const) {
      expect(DIARY_LINES_BY_TONE[tone].length).toBeGreaterThanOrEqual(8);
    }
  });

  it("does not repeat a line while it is still the one a reader just saw", () => {
    const rng = mulberry32(9);
    const recent: string[] = [];
    const drawn: string[] = [];
    for (let i = 0; i < 60; i++) drawn.push(pickFresh(rng, DIARY_FOCUS, recent));
    // Within any window the size of the memory, no line comes back — which is
    // what the on-this-day widget shows a column of.
    for (let i = 0; i < drawn.length; i++) {
      const window = drawn.slice(Math.max(0, i - Math.floor(DIARY_FOCUS.length / 2) + 1), i);
      expect(window).not.toContain(drawn[i]);
    }
  });

  it("puts something in every month of the history, not just the fortnight ahead", () => {
    // A demo vault whose only scheduled events were within a fortnight of today
    // showed every past month's calendar empty — the widget working and the
    // person apparently doing nothing.
    const events = resolveEvents(SEED_EVENTS, "2026-08-29");
    const past = events.filter((e) => e.kind === "single" && e.start < "2026-08-29");
    expect(past.length).toBeGreaterThanOrEqual(10);
    const months = new Set(past.map((e) => e.start.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(8);
    // Ids stay unique, because an id is how the manager addresses one.
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
