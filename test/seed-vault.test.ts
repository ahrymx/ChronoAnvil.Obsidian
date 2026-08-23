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
// The seeder writes four different formats into `<!--almanac:… -->` regions and
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
// two steps in the same order, and takes the first one with `js-yaml`, which is
// the plugin's own dependency (see `trackers.ts`) rather than a new one.
import { load as loadYaml } from "js-yaml";

import { JOURNAL_PRESETS } from "../src/journals/journal";
import { parseChartDirectives, serializeChartSpec } from "../src/charts/charts";
import { parseEntries } from "../src/diary/entries";
import { parseEvents } from "../src/events/events";
import { parseLogItems } from "../src/diary/log-items";
import { parseRecall } from "../src/review/recall";
import { parseTaskLine } from "../src/ui/tasks";
import {
  activeDays,
  buildPatches,
  buildPlan,
  chartLine,
  chartableTrackers,
  clearEvents,
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
  DIARY_TASKS,
  LOGBOOK_CORPUS,
  SEED_EVENTS,
  // @ts-expect-error — see above.
} from "../tools/seed-corpus.mjs";

// The `almanac-events` value, out of a block of frontmatter YAML.
const yamlList = (text: string): unknown =>
  (loadYaml(text.replace(/^---\n/, "")) as Record<string, unknown>)["almanac-events"];

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
    "```almanac",
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
    expect(out).toContain("```almanac\nrecall\n```");
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
  const REGION = (id: string): string => `head\n\n<!--almanac:${id}\n-->\n\ntail\n`;

  const read = (body: string, id: string): string => {
    const open = `<!--almanac:${id}`;
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
    // `- [ ]` IS OBSIDIAN'S CHECKBOX AND `- ( )` IS ALMANAC'S. A seeder that
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
    const note = "---\ntitle: Work log\n---\n\n```almanac\nlogbook:work\n```\n";
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
      "---\njournal-date: \"\"\n# almanac:trackers:start\nMood:\n# almanac:trackers:end\n---\n" +
      "<!--almanac:log\n-->\n\n<!--almanac:capture\n-->\n";
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
    const note = "`almanac:spacer`\n\n```almanac-charts\nheader:📊 Trends\n```\n";
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
    const daily = "---\n# almanac:trackers:start\nMood:\nSleep:\n# almanac:trackers:end\n---\n";
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
    const note = "---\nalmanac-events: []\n---\nbody\n";
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
    ["T/Daily.md", "---\n# almanac:trackers:start\nMood:\nSleep:\nWake-Up:\nBedtime:\n# almanac:trackers:end\n---\n"],
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
    const empty = "```almanac\nlogbook:work\n```\n";
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
      templates: new Map([["T/Daily.md", "---\n# almanac:trackers:start\nMood:\n# almanac:trackers:end\n---\n"]]),
      plans: { charts: DIARY_CHARTS, logbooks: {}, events: [] },
      dates: ["2026-08-23"],
      today: "2026-08-23",
      rng: mulberry32(4),
      warn: (m: string) => warnings.push(m),
    });
    expect(warnings.length).toBeGreaterThan(0);
    const note = "```almanac-charts\nheader:x\n```\n";
    for (const p of patches.filter((p: { what: string }) => p.what === "charts")) {
      for (const spec of parseChartDirectives((p.apply(note, {}) as string).split("\n"))) {
        expect(spec.tracker).toBe("Mood");
        expect(spec.tracker2 ?? "Mood").toBe("Mood");
      }
    }
  });
});
