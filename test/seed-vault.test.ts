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

import { JOURNAL_PRESETS } from "../src/journals/journal";
import { parseEntries } from "../src/diary/entries";
import { parseRecall } from "../src/review/recall";
import { parseTaskLine } from "../src/ui/tasks";
import {
  activeDays,
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
  DIARY_CHALLENGES,
  DIARY_FOCUS,
  DIARY_HIGHLIGHTS,
  DIARY_LINES,
  DIARY_TASKS,
  // @ts-expect-error — see above.
} from "../tools/seed-corpus.mjs";

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
