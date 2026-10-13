// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// "Link to diary": a picker in 1.0.29, a window in 1.0.51.
//
// WHAT IS WORTH ASSERTING HERE. The list's ARITHMETIC, which is pure and is
// where the off-by-one lives; the FIND BOX's parse, which is the half that
// makes reach unbounded; and the WIRING, which is what makes the arithmetic
// reach a file. The window itself is a `Modal` and the suite has no DOM, so
// what it can be asked is the shape of its source.
//
// THE THREE BUGS THIS FILE IS WRITTEN AGAINST:
//
//   `subtract(n, "isoWeek")` steps by nothing — `isoWeek` is a unit `startOf`
//   takes and `add`/`subtract` do not — so every week row named this week
//   (1.0.29);
//
//   stepping a month off 31 March lands on 3 March in any implementation that
//   does not clamp, so the list skipped February and named March twice
//   (1.0.29);
//
//   and the list reached BACKWARDS ONLY, so a note dated 22 September could
//   not be filed under a day in October by any gesture the picker offered —
//   while the search box over it answered *No results found*, because a
//   suggester filters the rows it was handed and October was never among them
//   (1.0.51, and the one a reader reported).

import { describe, expect, it } from "vitest";

import {
  GROUP_GRAIN,
  REACH,
  anchorFromQuery,
  attachSections,
  categoryCatalogue,
  defaultDest,
  dropLink,
  groupOf,
  isNow,
  landLink,
  linkNotice,
  monthGrid,
  pageInEntry,
  periodsAround,
  rowSentence,
  stampTarget,
  stateWord,
  targetId,
  targetStartIso,
  weekdayHeads,
} from "../src/diary/diary-link";
import type {
  DiaryLinkResult,
  DiaryRow,
  DiaryTarget,
} from "../src/diary/diary-link";
import {
  ENTRY_ATTACH_CATEGORIES,
  ENTRY_SECTIONS,
  composeEntryTemplate,
} from "../src/diary/entry-sections";
import { readAttachCategories } from "../src/ui/attach-categories";
import { grainTabLabel } from "../src/ui/diary-link-window";
import { currentEntryKey } from "../src/diary/nav";
import { hasTarget, parseAttachments, withoutTarget } from "../src/ui/attachments";
import { CLASS_DEFS, TRACKER_CLASSES } from "../src/trackers/trackers";
import type { TrackerClass } from "../src/trackers/trackers";
import { moment } from "../src/core/util";
import { DEFAULT_PATHS } from "../src/core/constants";
import { entryPath } from "../src/diary/lineage";
import { TFile } from "obsidian";
import type ChronoAnvilPlugin from "../src/main";
import { cssRule, cssRules, readCode, readCss, readSrc } from "./sources";

const of = (grain: TrackerClass, anchor: string, back = REACH[grain], fwd = 0): string[] =>
  periodsAround(grain, anchor, back, fwd);

describe("what the list offers", () => {
  it("opens on the anchor's own period, for every grain", () => {
    // What makes a one-keypress answer possible for a note that states a date:
    // the row a reader wants is the first one, not somewhere down a list they
    // have to read. With no pages of *Later* taken, the anchor's own period is
    // the top row.
    for (const grain of TRACKER_CLASSES) {
      expect(of(grain, "2026-09-19")[0], grain).toBe(
        currentEntryKey(grain, moment("2026-09-19"))
      );
    }
  });

  it("steps by one period a row, and never repeats one", () => {
    // THE `isoWeek` TRAP. `CLASS_DEFS.weekly.unit` is the unit `startOf` needs
    // to land on a Monday; `add` has no such unit and answers by not moving.
    // Eight identical rows is what that looked like, and it looked like a list.
    for (const grain of TRACKER_CLASSES) {
      const keys = of(grain, "2026-09-19");
      expect(keys.length, grain).toBeGreaterThan(1);
      expect(new Set(keys).size, grain).toBe(keys.length);
      // Newest first, which is the order a note is usually written about.
      expect([...keys].sort().reverse(), grain).toEqual(keys);
    }
    // The week rows are seven days apart, which is the assertion the set-size
    // check above cannot make: eight distinct Mondays could still be wrong.
    const weeks = of("weekly", "2026-09-19").map((k) => moment(k).valueOf());
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i - 1] - weeks[i]).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it("does not skip a month off the end of a long one", () => {
    // 31 March minus one month is 28 February, not 3 March. The anchor is
    // snapped to its period BEFORE it is stepped, so the overflow cannot arise
    // whatever the date library does with it — and now that the list steps
    // FORWARDS too, the same trap is live in the other direction.
    expect(of("monthly", "2026-03-31").slice(0, 4)).toEqual([
      "2026-03",
      "2026-02",
      "2026-01",
      "2025-12",
    ]);
    expect(of("quarterly", "2026-05-31").slice(0, 3)).toEqual([
      "2026-04-01",
      "2026-01-01",
      "2025-10-01",
    ]);
    expect(periodsAround("monthly", "2026-01-31", 0, 3)).toEqual([
      "2026-04",
      "2026-03",
      "2026-02",
      "2026-01",
    ]);
    expect(periodsAround("monthly", "2026-03-31", 1, 1)).toEqual([
      "2026-04",
      "2026-03",
      "2026-02",
    ]);
  });

  it("agrees with `currentEntryKey` about every row it names", () => {
    // THE PROPERTY THE SECOND SNAP WAS DEFENDING, stated as a property rather
    // than as a line of code. `periodsAround` steps off the anchor and lets
    // `currentEntryKey` decide what period it landed in; if those two ever
    // disagreed — a date library that overflowed instead of clamping, a unit
    // that stepped by nothing — the n-th row would not be n periods away.
    // Anchored on the last day of a long month in every grain, which is where
    // any such disagreement shows first.
    for (const anchor of ["2026-03-31", "2026-01-31", "2024-02-29", "2026-12-31"]) {
      for (const grain of TRACKER_CLASSES) {
        const rows = periodsAround(grain, anchor, 3, 3);
        expect(rows[3], `${grain} ${anchor}`).toBe(
          currentEntryKey(grain, moment(anchor))
        );
        expect(new Set(rows).size, `${grain} ${anchor}`).toBe(7);
      }
    }
  });

  it("reaches forwards as well as back — the 1.0.51 defect", () => {
    // THE REPORTED BUG, as arithmetic. The note in the recording states
    // `date: 2026-09-22`; the day the reader wanted was 11 October. The old
    // list could not name it from that anchor however far it scrolled, because
    // every row it held was older than the anchor.
    expect(of("daily", "2026-09-22")).not.toContain("2026-10-11");
    // Two presses of *Later* at this grain's page size reach it, and the
    // anchor's own day is still in the list rather than scrolled off.
    const paged = periodsAround("daily", "2026-09-22", REACH.daily, REACH.daily * 2);
    expect(paged).toContain("2026-10-11");
    expect(paged).toContain("2026-09-22");
    expect(paged[0]).toBe("2026-10-20");
    // Newest first still holds with rows on both sides of the anchor.
    expect([...paged].sort().reverse()).toEqual(paged);
  });

  it("counts `back` and `fwd` as periods either side of the anchor", () => {
    // An explicit shape rather than a length: the anchor is always drawn, so
    // the list is `fwd` + 1 + `back` rows and the anchor sits at index `fwd`.
    const rows = periodsAround("daily", "2026-09-22", 2, 2);
    expect(rows).toEqual([
      "2026-09-24",
      "2026-09-23",
      "2026-09-22",
      "2026-09-21",
      "2026-09-20",
    ]);
    expect(rows[2]).toBe("2026-09-22");
    // A page that has not been taken is zero rows, not one — and a nonsense
    // count cannot make the list run the other way.
    expect(periodsAround("daily", "2026-09-22", 0, 0)).toEqual(["2026-09-22"]);
    expect(periodsAround("daily", "2026-09-22", -5, -5)).toEqual(["2026-09-22"]);
  });

  it("keys each grain the way its opener takes it", () => {
    // `Diary.openOrCreateEntry` routes a month to `openOrCreateMonth`, which
    // refuses anything but `YYYY-MM`, and the other four to openers that want
    // an ISO day. A key of the wrong shape is a notice reading "Use the format
    // YYYY-MM" on a control that never mentioned a format.
    for (const grain of TRACKER_CLASSES) {
      for (const key of of(grain, "2026-09-19", 3, 3)) {
        const target: DiaryTarget = { grain, key };
        expect(key, grain).toMatch(
          grain === "monthly" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/
        );
        // And every one of them names a day to stamp `date:` with.
        expect(targetStartIso(target), key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(moment(targetStartIso(target)).isValid(), key).toBe(true);
      }
    }
    expect(targetStartIso({ grain: "monthly", key: "2026-09" })).toBe("2026-09-01");
  });

  it("offers nothing at all for a date it cannot read", () => {
    // The window still opens — the find box and the two shortcuts are drawn
    // whatever the list holds — so an unreadable `date:` in a reader's
    // frontmatter leaves them a way forward rather than a thrown error.
    expect(periodsAround("daily", "soon", 5, 5)).toEqual([]);
    expect(periodsAround("daily", "", 5, 5)).toEqual([]);
  });

  it("names one period once, and tells two grains apart", () => {
    // `targetId` is the Map key the ticks are kept under and the string
    // `linkedPeriods` hands back. A day and the week it starts can share a key
    // — 2026-09-21 is both a Monday and a week-start — so the grain has to be
    // in the id or a tick on one would tick the other.
    expect(targetId({ grain: "daily", key: "2026-09-21" })).toBe("daily:2026-09-21");
    expect(targetId({ grain: "daily", key: "2026-09-21" })).not.toBe(
      targetId({ grain: "weekly", key: "2026-09-21" })
    );
  });
});

describe("what the find box does with what was typed", () => {
  it("aims at the LAST day of the period that was named", () => {
    // The list runs newest first from its anchor, so aiming at the END of what
    // was typed puts the whole of it on screen below. Aiming at the first of
    // the month would have shown one day of October and then September.
    expect(anchorFromQuery("2026-10-12")).toBe("2026-10-12");
    expect(anchorFromQuery("2026-10")).toBe("2026-10-31");
    expect(anchorFromQuery("2026-02")).toBe("2026-02-28");
    expect(anchorFromQuery("2026")).toBe("2026-12-31");
    expect(anchorFromQuery("2026-Q4")).toBe("2026-12-31");
    expect(anchorFromQuery("2026-Q1")).toBe("2026-03-31");
    // ISO week 41 of 2026 runs Mon 5 – Sun 11 October.
    expect(anchorFromQuery("2026-W41")).toBe("2026-10-11");
  });

  it("takes the spelling the rows themselves show", () => {
    // A row's second line is its entry's filename, so those five prefixes are
    // the strings a reader has in front of them when they decide to type.
    expect(anchorFromQuery("Day-2026-10-12")).toBe("2026-10-12");
    expect(anchorFromQuery("Week-2026-W41")).toBe("2026-10-11");
    expect(anchorFromQuery("Month-2026-10")).toBe("2026-10-31");
    expect(anchorFromQuery("Quarter-2026-Q4")).toBe("2026-12-31");
    expect(anchorFromQuery("Year-2026")).toBe("2026-12-31");
    // Case does not decide it, and neither does the dash before W or Q.
    expect(anchorFromQuery("day-2026-10-12")).toBe("2026-10-12");
    expect(anchorFromQuery("2026w41")).toBe("2026-10-11");
    expect(anchorFromQuery("2026q4")).toBe("2026-12-31");
  });

  it("puts the typed period's own row first, on whichever tab is open", () => {
    // THE WHOLE POINT, END TO END: the query that answered *No results found*
    // in the recording now names the top row of the Days tab, and the same
    // query on the Months tab names the month that contains it.
    const aim = anchorFromQuery("Day-2026-10-11");
    expect(aim).not.toBeNull();
    expect(periodsAround("daily", aim as string, REACH.daily, 0)[0]).toBe("2026-10-11");
    expect(periodsAround("monthly", aim as string, REACH.monthly, 0)[0]).toBe("2026-10");
    // And a month typed on the Days tab opens on that month's last day, with
    // the rest of it below rather than the month before it.
    const month = anchorFromQuery("2026-10") as string;
    const days = periodsAround("daily", month, REACH.daily, 0);
    expect(days[0]).toBe("2026-10-31");
    expect(days.every((d) => d.startsWith("2026-10"))).toBe(true);
  });

  it("says no to anything that is not a period, which is what makes it narrow", () => {
    // A DATE AIMS, ANYTHING ELSE NARROWS. The null is the second half of that
    // rule: the window only filters the rows when the box holds no date.
    for (const q of ["", "   ", "monday", "Fractions", "20261", "2026-13-01", "2026-02-30", "2026-13", "2026-W00", "2026-W54", "2026-Q5", "Q4"]) {
      expect(anchorFromQuery(q), q).toBeNull();
    }
  });
});

describe("what the window writes", () => {
  const src = (): string => readSrc("diary/diary-link.ts");
  // The notice's five counts, with everything unsaid left at nothing — so a
  // case names only what it is about and a sixth count is one default here
  // rather than an edit to every call.
  const said = (
    part: Partial<DiaryLinkResult>,
    only: string | null
  ): string =>
    linkNotice(
      {
        linked: 0,
        removed: 0,
        missed: 0,
        stamped: null,
        madeSections: 0,
        madeCategories: 0,
        ...part,
      },
      only
    );

  it("stamps the finest grain of whatever was linked", () => {
    // One Save can file a note under four periods; `date:` is a single day, so
    // it takes the most precise statement on offer rather than whichever row
    // was ticked first.
    const day: DiaryTarget = { grain: "daily", key: "2026-10-11" };
    const year: DiaryTarget = { grain: "yearly", key: "2026-01-01" };
    expect(
      stampTarget([
        { target: year, link: true },
        { target: day, link: true },
      ])
    ).toEqual(day);
    // A removal is not a statement about when the note happened.
    expect(stampTarget([{ target: day, link: false }])).toBeNull();
    expect(stampTarget([])).toBeNull();
    // The order it prefers is the catalogue's own, not a second opinion on it.
    expect(TRACKER_CLASSES[0]).toBe("daily");
  });

  it("leaves a date the reader wrote exactly where it was", () => {
    // 1.0.11 skipped the prompt for a dated note so that picking could not
    // silently rewrite frontmatter. The skip is gone — five grains leave
    // nothing to assume — and this is what was actually protecting the
    // property, now guarding a window that can link four periods at once.
    expect(src()).toContain("if (!already && stamp) {");
  });

  it("goes through the one door onto the diary's three openers", () => {
    // `openOrCreateDay` alone was the whole of the old behaviour. Calling it
    // here now would mean a quarter row filing the note under a day.
    expect(src()).toContain("openOrCreateEntry(");
    expect(src()).not.toContain("openOrCreateDay(");
    expect(readSrc("diary/diary.ts")).toContain("async openOrCreateEntry(");
  });

  it("keeps one copy of the grain dispatch", () => {
    // `resolveGrainEntry` was capture's private switch over the three openers,
    // and this action is the second caller that needs all three. Two copies are
    // two answers to "what does a monthly key look like".
    expect(readSrc("diary/capture.ts")).not.toContain("resolveGrainEntry(");
    expect(readSrc("diary/capture.ts")).toContain("openOrCreateEntry(grain, key");
  });

  it("never makes an entry in order to take something out of it", () => {
    // A removal reaches for the file that is there and stops if it is not.
    // Creating one to empty it would be absurd, and `openOrCreateEntry` on the
    // removal branch is exactly the slip that reads as symmetric.
    const removal = src().slice(src().indexOf("// A REMOVAL NEVER MAKES AN ENTRY"));
    expect(removal).toContain("locateEntry(");
    expect(removal.slice(0, removal.indexOf("return out;"))).not.toContain(
      "openOrCreateEntry("
    );
  });

  it("takes the link out of the region and out of nothing else", () => {
    // A link to this note in the entry's prose is the reader's sentence. The
    // removal is a read-modify-write of the attachments regions inside
    // `vault.process`, exactly as the add is — and `dropLink` is pure, so what
    // it touches is asserted against text rather than read off the source.
    expect(src()).toContain("async function unlinkFromEntry(");
    const cut = src().slice(src().indexOf("async function unlinkFromEntry("));
    expect(cut).toContain("dropLink(text, page.path)");
    const kept = `prose mentioning [[J/F.md|F]] in a sentence`;
    const text = [
      "```chronoanvil",
      "attach:attachments|Files & Links",
      "```",
      "",
      kept,
      "",
      "<!--chronoanvil:attachments",
      "- [[J/F.md|F]]",
      "-->",
    ].join("\n");
    const out = dropLink(text, "J/F.md");
    expect(out.removed).toBe(true);
    expect(out.text).toContain(kept);
    expect(pageInEntry(out.text, "J/F.md")).toBe(false);
    // And nothing to remove is not a write.
    expect(dropLink(out.text, "J/F.md").removed).toBe(false);
  });

  it("matches the same way coming out as it did going in", () => {
    // `withoutTarget` is `hasTarget`'s pair for a reason: a removal that
    // trimmed or cased differently would either miss the chip it put there or
    // take out one the reader did.
    const items = parseAttachments("- [[Journals/Fractions.md|Fractions]]\n- [[Other.md]]");
    expect(hasTarget(items, "Journals/Fractions.md")).toBe(true);
    expect(withoutTarget(items, "Journals/Fractions.md")).toHaveLength(1);
    expect(withoutTarget(items, " journals/fractions.MD ")).toHaveLength(1);
    expect(withoutTarget(items, "Journals/Fraction.md")).toHaveLength(2);
    expect(withoutTarget(items, "Journals/Fractions.md")[0].target).toBe("Other.md");
  });

  it("confirms a link through the region rather than through the link graph", () => {
    // `resolvedLinks` narrows it to the few entries that mention this note at
    // all; the region is what tells a note FILED under a day from one merely
    // named in its prose. Marking the second kind "linked" would offer an undo
    // that could only work by editing a reader's sentences.
    // SLICED TO THE FUNCTION, NOT TO THE END OF THE FILE. A mutant that cut
    // the region check out of `linkedPeriods` measured zero against the first
    // version of this case, because `linkFromEntry` further down the file says
    // `hasTarget(` too and the slice reached it. Third time that shape has been
    // recorded; see `vacuous-sweep-rule`.
    const from = src().indexOf("export async function linkedPeriods(");
    const cut = src().slice(from, src().indexOf("\n}", from));
    expect(cut).toContain("resolvedLinks");
    expect(cut).toContain("if (!pageInEntry(text, pagePath)) continue;");
    expect(cut).toContain("await app.vault.cachedRead(file);");
  });

  it("asks every shelf, not the first one", () => {
    // THE 1.0.52 DEFECT, MEASURED. It asked the region keyed `attachments`
    // alone — every shelf there was when it was written, and one of two in any
    // note composed since 1.0.49 §5 — so a note the reader had filed under
    // *Images* read as not filed at all: the row offered to link it again and
    // Save put a second copy of it in a second region.
    const fence = ["```chronoanvil", "attach:attachments|Files & Links", "attach:images|Images", "```", ""];
    const onImages = [
      ...fence,
      "<!--chronoanvil:attachments",
      "-->",
      "",
      "<!--chronoanvil:images",
      "- ![[A/B.png|B]]",
      "-->",
    ].join("\n");
    expect(pageInEntry(onImages, "A/B.png")).toBe(true);
    expect(pageInEntry(onImages, "A/C.png")).toBe(false);
    // AND THE SECTION'S OWN KEY WITH NO DIRECTIVE FOR IT: an entry written
    // before §5, or one whose `attach:` line somebody deleted by hand, still
    // keeps its files in that region.
    const legacy = ["<!--chronoanvil:attachments", "- [[J/F.md|F]]", "-->"].join("\n");
    expect(pageInEntry(legacy, "J/F.md")).toBe(true);
  });

  it("carries the destination through to the entry, and counts what it made", () => {
    // The window chooses once and every ticked period is written to the same
    // shelf — so `dest` travels from `commit()` to `landLink` and is not
    // re-decided per edit. `vault.process` is the only place a write happens,
    // and the two creation counts come off the same call that did the work
    // rather than being inferred afterwards.
    expect(src()).toContain("dest: LinkDest = defaultDest()");
    expect(src()).toContain("landLink(text, grain, dest, { path: page.path, title: page.basename })");
    // PINNED AT THE USE AND NOT ONLY AT THE SIGNATURE. A mutant that handed
    // `linkFromEntry` a fresh `defaultDest()` inside the loop — every ticked
    // period landing on Files & Links whatever the reader chose — survived the
    // first version of this case, which asserted the parameter's default and
    // the callee's own call and nothing in between. Third shape in
    // `vacuous-sweep-rule`.
    const apply = src().slice(
      src().indexOf("export async function applyDiaryLinks("),
      src().indexOf("// What the notice says afterwards.")
    );
    expect(apply).toContain("        edit.target.grain,\n        dest\n      );");
    expect(apply).not.toContain("defaultDest()\n      );");
    expect(src()).toContain("if (landing.madeSection) out.madeSections++;");
    expect(src()).toContain("if (landing.madeCategory) out.madeCategories++;");
    expect(src()).toContain("if (landing.landed) out.linked++;");
    expect(src()).toContain("else out.missed++;");
    // AND THE CATALOGUE IS READ BEFORE THE WINDOW OPENS, because a render is
    // not asynchronous — the same posture `linkedPeriods` has, for its reason.
    //
    // READ OUT OF THE WINDOW'S FILE SINCE 1.0.66, where `linkPageToDiary` now
    // lives. It stood in `diary-link.ts` and the `import { DiaryLinkWindow }`
    // it needed closed a cycle — see `test/module-cycles.test.ts` for what that
    // cost and how it is checked now.
    const door = readSrc("ui/diary-link-window.ts");
    const open = door.slice(door.indexOf("export async function linkPageToDiary("));
    expect(open).toContain("const cats = await categoryCatalogue(plugin, anchor);");
    expect(open.indexOf("await categoryCatalogue")).toBeLessThan(
      open.indexOf("new DiaryLinkWindow(")
    );
  });

  it("says what it did, and says the stamp only where it happened", () => {
    // A note that already stated a date keeps it, so a notice reading "Dated …"
    // on that path would be reporting a write that did not occur.
    expect(said({ linked: 1, stamped: "2026-10-11" }, "Sunday")).toBe(
      "Dated 2026-10-11, linked to Sunday."
    );
    expect(said({ linked: 2, removed: 1 }, null)).toBe("Linked 2, removed 1.");
    // The period is named only when it is the ONLY thing that happened. Two
    // links and one name would be a notice reporting the wrong write.
    expect(said({ linked: 2 }, "Sunday")).toBe("Linked 2.");
    expect(said({ removed: 1 }, null)).toBe("Removed 1.");
    expect(said({ missed: 1 }, null)).toBe("1 with nowhere to put the link.");
    expect(said({}, null)).toBe("Nothing to change.");
  });

  it("says what it composed into somebody's entry (1.0.52)", () => {
    // A FIELD AND A SHELF ARE WRITES THE READER DID NOT SEPARATELY ASK FOR.
    // Filing a note under a period is the request; composing an Attachments
    // field into an entry that had none is a larger edit than that, and the
    // notice is the only place it is ever mentioned.
    expect(said({ linked: 1, madeSections: 1 }, "Sunday")).toBe(
      "Linked to Sunday, added an attachments field to 1."
    );
    expect(said({ linked: 2, madeCategories: 2 }, null)).toBe(
      "Linked 2, added the category to 2."
    );
    // Nothing composed is nothing said.
    expect(said({ linked: 1 }, null)).toBe("Linked 1.");
  });
});

describe("the Days tab is a calendar (1.0.52)", () => {
  // *"I think the days should be groups into weeks, and weeks are how the view
  // cycles"*, and then *"would a calendar 30 day be a neater choice for the day
  // tab?"*
  //
  // THE GRID IS THE GROUPING. Every row of it is an ISO week, which is what
  // makes this the answer to the first ask rather than a different one — and
  // the assertion below says so against `currentEntryKey`, so the Days tab and
  // the Weeks tab cannot disagree about where a week starts.
  //
  // OCTOBER 2026 IS THE FIXTURE because its shape is the awkward one: the 1st
  // is a Thursday, so the first row is three blanks and four days, and the 31st
  // is a Saturday, so the last row ends on a blank.
  it("lays a month out as five weeks, Monday first", () => {
    const grid = monthGrid("2026-10-11");
    expect(grid).not.toBeNull();
    expect(grid?.month).toBe("2026-10");
    expect(grid?.label).toBe("October 2026");
    expect(grid?.weeks.map((w) => w.label)).toEqual([
      "W40",
      "W41",
      "W42",
      "W43",
      "W44",
    ]);
    expect(grid?.weeks[0].days).toEqual([
      null,
      null,
      null,
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(grid?.weeks[4].days).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      null,
    ]);
  });

  it("is the same calendar wherever in the month it is asked", () => {
    // The anchor is a day and the grid is its month, so the first, the middle
    // and the last of October have to answer identically — otherwise stepping
    // out of a month and back would redraw it.
    const from = (iso: string): string => JSON.stringify(monthGrid(iso));
    expect(from("2026-10-01")).toBe(from("2026-10-31"));
    expect(from("2026-10-01")).toBe(from("2026-10-11"));
  });

  it("makes every row a week the Weeks tab would name", () => {
    // THE GROUPING THE READER ASKED FOR, STATED AS A PROPERTY. A row's key is
    // its Monday, which is `currentEntryKey("weekly", …)` of every day in it —
    // so a cell and the week above it are the same two periods the other tab
    // offers, with no second definition of where a week begins.
    for (const iso of ["2026-01-15", "2026-10-11", "2027-02-01"]) {
      const grid = monthGrid(iso);
      for (const week of grid?.weeks ?? []) {
        expect(week.days).toHaveLength(7);
        for (const day of week.days) {
          if (!day) continue;
          expect(currentEntryKey("weekly", moment(day)), day).toBe(week.key);
          expect(day.slice(0, 7), day).toBe(grid?.month);
        }
        expect(week.label).toBe(moment(week.key).format("[W]WW"));
      }
    }
  });

  it("gives a month that ends on a Monday its sixth row", () => {
    // 30 November 2026 is a Monday, so the week containing the last day of the
    // month starts inside it and the grid is six rows. A loop bounded at five
    // would lose the 30th — a day with no cell, on a calendar.
    const grid = monthGrid("2026-11-10");
    expect(grid?.weeks).toHaveLength(6);
    expect(grid?.weeks[5].days[0]).toBe("2026-11-30");
    expect(grid?.weeks[5].days[1]).toBeNull();
    // And it never draws more rows than a month can have.
    for (let m = 1; m <= 12; m++) {
      const month = `2026-${String(m).padStart(2, "0")}-15`;
      expect(monthGrid(month)?.weeks.length, month).toBeLessThanOrEqual(6);
      expect(monthGrid(month)?.weeks.length, month).toBeGreaterThanOrEqual(4);
    }
  });

  it("holds the turn of the year without renumbering the weeks", () => {
    // January 2027 opens in week 53 of 2026 — the one week in the calendar
    // where the ISO week year and the date's year disagree, and the reason the
    // gutter is a number rather than a key.
    const jan = monthGrid("2027-01-10");
    expect(jan?.weeks[0].key).toBe("2026-12-28");
    expect(jan?.weeks[0].label).toBe("W53");
    expect(jan?.weeks[0].days[4]).toBe("2027-01-01");
  });

  it("declines a date it cannot open on", () => {
    expect(monthGrid("not-a-date")).toBeNull();
    expect(monthGrid("")).toBeNull();
  });

  it("reads its column heads off a real week", () => {
    // Monday first because `startOf("isoWeek")` is, and typed out nowhere: a
    // head row that disagreed with the cells under it is a calendar that is
    // wrong in the one way nobody checks.
    const heads = weekdayHeads();
    expect(heads).toHaveLength(7);
    const grid = monthGrid("2026-10-11");
    const week = grid?.weeks[1];
    for (let n = 0; n < 7; n++) {
      expect(moment(week?.days[n] as string).format("ddd"), heads[n]).toBe(
        heads[n]
      );
    }
    expect(heads[0]).toBe("Mon");
    expect(heads[6]).toBe("Sun");
  });
});

describe("where the link lands (1.0.52)", () => {
  // *"There also needs to be a field for the attachments field and the category
  // (if the attachments section is not on the target, create the section with
  // the default categories)."*
  //
  // `landLink` IS PURE, which is the half of this round that could not be
  // asserted before it was: the old write was three lines inside
  // `vault.process` and the suite could only read its source. These are a
  // composed entry in, a composed entry out.
  const page = { path: "J/Fractions.md", title: "Fractions" };
  const bare = (): string =>
    composeEntryTemplate("daily")
      .split("\n")
      .filter((l) => !/^attach:/.test(l))
      .join("\n")
      .replace(/<!--chronoanvil:(attachments|images)\n-->\n\n?/g, "");

  it("lands on the first shelf when nobody changed the fields", () => {
    // WHICH IS THE REGION THIS ACTION HAS ALWAYS WRITTEN TO. The default is a
    // derivation of `ENTRY_ATTACH_CATEGORIES`, not a repeat of it, so an entry
    // composed today and a Save made today agree by construction.
    const dest = defaultDest();
    expect(dest.key).toBe(ENTRY_ATTACH_CATEGORIES[0].key);
    expect(dest.label).toBe(ENTRY_ATTACH_CATEGORIES[0].label);
    expect(dest.section).toBe("attachments");
    const out = landLink(composeEntryTemplate("daily"), "daily", dest, page);
    expect(out.landed).toBe(true);
    expect(out.madeSection).toBe(false);
    expect(out.madeCategory).toBe(false);
    expect(out.text).toContain(
      "<!--chronoanvil:attachments\n- [[J/Fractions.md|Fractions]]\n-->"
    );
    // And nowhere else.
    expect(out.text).toContain("<!--chronoanvil:images\n-->");
  });

  it("lands on the shelf the reader chose", () => {
    const out = landLink(
      composeEntryTemplate("daily"),
      "daily",
      { section: "attachments", key: "images", label: "Images" },
      { path: "A/B.png", title: "B" }
    );
    expect(out.landed).toBe(true);
    expect(out.text).toContain("<!--chronoanvil:images\n- ![[A/B.png|B]]\n-->");
    expect(out.text).toContain("<!--chronoanvil:attachments\n-->");
    expect(out.madeCategory).toBe(false);
  });

  it("composes the field into an entry that has none, with its own categories", () => {
    // THE ASYMMETRY THIS CLOSES. A period with no ENTRY has been created when
    // it is linked since 1.0.29; an entry with no attachments FIELD was
    // counted as a miss, so the reader asked for the link to land and got a
    // number back. Composed by the catalogue's own `addSectionToNote`, so an
    // entry that gains Attachments this way is the section a fresh entry ships
    // — both categories, both regions.
    const text = bare();
    expect(readAttachCategories(text)).toEqual([]);
    const out = landLink(text, "daily", defaultDest(), page);
    expect(out.landed).toBe(true);
    expect(out.madeSection).toBe(true);
    expect(out.madeCategory).toBe(false);
    expect(readAttachCategories(out.text).map((c) => [c.key, c.label])).toEqual(
      ENTRY_ATTACH_CATEGORIES.map((c) => [c.key, c.label])
    );
    for (const cat of ENTRY_ATTACH_CATEGORIES) {
      expect(out.text, cat.key).toContain(`<!--chronoanvil:${cat.key}`);
    }
    expect(out.text).toContain("- [[J/Fractions.md|Fractions]]");
    expect(pageInEntry(out.text, page.path)).toBe(true);
  });

  it("adds a category that is missing, through the categories window's own plan", () => {
    // Not by writing an `attach:` line here, which would be the second place
    // in the plugin that knows what one looks like — and the key is the one
    // `newCategoryKey` chooses rather than a second slugification of the label.
    const out = landLink(
      composeEntryTemplate("daily"),
      "daily",
      { section: "attachments", key: "receipts", label: "Receipts" },
      { path: "A/R.pdf", title: "R" }
    );
    expect(out.landed).toBe(true);
    expect(out.madeCategory).toBe(true);
    expect(out.madeSection).toBe(false);
    expect(out.text).toContain("attach:receipts|Receipts");
    expect(out.text).toContain("<!--chronoanvil:receipts\n- [[A/R.pdf|R]]\n-->");
    // The shelves it did not come to change are untouched, labels and all.
    expect(readAttachCategories(out.text).map((c) => c.label)).toEqual([
      "Files & Links",
      "Images",
      "Receipts",
    ]);
  });

  it("recognises a shelf by its name when the key is not the usual one", () => {
    // Two entries can keep the same shelf under two keys — one composed by this
    // plugin, one a reader typed — and a reader choosing *Images* means the
    // shelf called Images. Without the label fallback this would add a SECOND
    // Images shelf to an entry that plainly has one.
    const text = [
      "```chronoanvil",
      "attach:photos|Images",
      "```",
      "",
      "<!--chronoanvil:photos",
      "-->",
    ].join("\n");
    const out = landLink(
      text,
      "daily",
      { section: "attachments", key: "images", label: "Images" },
      { path: "A/B.png", title: "B" }
    );
    expect(out.landed).toBe(true);
    expect(out.madeCategory).toBe(false);
    expect(out.text).toContain("<!--chronoanvil:photos\n- ![[A/B.png|B]]\n-->");
    expect(out.text).not.toContain("attach:images");
  });

  it("knows the shelf it has always written to under any name", () => {
    // A READER WHO RENAMED *Files & Links* STILL HAS THAT SHELF. The key is the
    // storage and the label is theirs to change, so the default destination is
    // matched by key before anything is matched by name — without which a Save
    // would add a second shelf called Files & Links beside the one holding
    // every file they have ever dropped.
    const text = [
      "```chronoanvil",
      "attach:attachments|Paperwork",
      "```",
      "",
      "<!--chronoanvil:attachments",
      "-->",
    ].join("\n");
    const out = landLink(text, "daily", defaultDest(), page);
    expect(out.landed).toBe(true);
    expect(out.madeCategory).toBe(false);
    expect(out.text).toContain("attach:attachments|Paperwork");
    expect(readAttachCategories(out.text)).toHaveLength(1);
    expect(out.text).toContain("- [[J/Fractions.md|Fractions]]");
  });

  it("declines a shelf whose region somebody deleted by hand", () => {
    // `applyAttachCategories` writes a directive and its region together, so a
    // directive with nothing behind it is a note that has been edited by hand.
    // There is nowhere to put the link, and inventing a region under a fence we
    // did not compose is not this function's call.
    const text = ["```chronoanvil", "attach:attachments|Files & Links", "```", ""].join("\n");
    const out = landLink(text, "daily", defaultDest(), page);
    expect(out.landed).toBe(false);
    expect(out.text).toBe(text);
  });

  it("does not file the same note twice, whichever shelf it is on", () => {
    // Pressing Save twice, or ticking a period the note is already filed under
    // on another shelf, is an answer that is already true of the file — so it
    // is reported as landed and nothing is written.
    const once = landLink(
      composeEntryTemplate("daily"),
      "daily",
      { section: "attachments", key: "images", label: "Images" },
      page
    );
    const twice = landLink(once.text, "daily", defaultDest(), page);
    expect(twice.landed).toBe(true);
    expect(twice.text).toBe(once.text);
    expect(twice.text.split("J/Fractions.md")).toHaveLength(2);
    // MEASURED, AND IT WAS WRONG BEFORE IT WAS MEASURED. The dedupe asked the
    // CHOSEN shelf — so this case put a second copy of the note on Files &
    // Links while the first sat on Images, and a Save aimed at a shelf the
    // entry lacked would have composed one to hold the duplicate.
    expect(twice.madeCategory).toBe(false);
    const made = landLink(
      once.text,
      "daily",
      { section: "attachments", key: "receipts", label: "Receipts" },
      page
    );
    expect(made.madeCategory).toBe(false);
    expect(made.text).toBe(once.text);
  });

  it("declines a note with nowhere to put the field, and writes nothing", () => {
    // An entry somebody has rewritten by hand: no widget fence, so there is
    // nothing to compose the section into. Counted as a miss, with the text
    // handed back exactly as it came — a half-written field would be worse than
    // the refusal.
    const text = "# Tuesday\n\nI wrote this myself.\n";
    const out = landLink(text, "daily", defaultDest(), page);
    expect(out.landed).toBe(false);
    expect(out.madeSection).toBe(false);
    expect(out.text).toBe(text);
  });

  it("offers the shelves of the entries around the anchor, plus the two that ship", async () => {
    // BOUNDED AT FIVE READS — the five periods containing the anchor — because
    // the categories live in a code fence and the metadata cache cannot answer
    // what they are. A reader's own shelf turns up in the field; a walk of the
    // whole diary would not be something a window can do while it opens.
    const paths = DEFAULT_PATHS;
    const files = new Map<string, string>([
      [
        entryPath(paths, "daily", "2026-10-11"),
        ["```chronoanvil", "attach:attachments|Files & Links", "attach:receipts|Receipts", "```"].join("\n"),
      ],
      [
        entryPath(paths, "monthly", "2026-10"),
        ["```chronoanvil", "attach:sketches|Sketches", "```"].join("\n"),
      ],
    ]);
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: (path: string) =>
            files.has(path) ? new TFile(path) : null,
          cachedRead: async (file: TFile) => files.get(file.path) ?? "",
        },
      },
      settings: { paths },
    } as unknown as ChronoAnvilPlugin;

    const cats = await categoryCatalogue(plugin, "2026-10-11");
    expect(cats.map((c) => c.key)).toEqual([
      ...ENTRY_ATTACH_CATEGORIES.map((c) => c.key),
      "receipts",
      "sketches",
    ]);
    // THE SHIPPED TWO ARE ALWAYS THERE, whatever the vault holds — a window
    // whose Category field was empty would have no default to land on.
    expect(await categoryCatalogue(plugin, "1999-01-01")).toEqual(
      ENTRY_ATTACH_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))
    );
    expect(await categoryCatalogue(plugin, "nonsense")).toHaveLength(2);
  });

  it("names the field off the catalogue rather than spelling it here", () => {
    // `family: "attach"` is already the declaration that a section's lines are
    // shelves, so a second attachment-bearing section would appear in the
    // Section field by being declared and in nothing else.
    expect(attachSections()).toEqual([{ id: "attachments", label: "Attachments" }]);
    expect(
      ENTRY_SECTIONS.filter((s) => s.family === "attach").map((s) => s.id)
    ).toEqual(["attachments"]);
    // AND THE FAMILY IS WHAT DECIDES, proved against a catalogue the shipped
    // one cannot be: there is exactly one attachment-bearing section today, so
    // a filter on the LABEL would answer identically and did — that mutant
    // survived until this list could be handed in. A section with the family
    // and another label is offered; one with the label and no family is not.
    expect(
      attachSections([
        { id: "attachments", label: "Attachments", family: "attach" },
        { id: "receipts", label: "Receipts & scans", family: "attach" },
        { id: "decoy", label: "Attachments", family: "note" },
        { id: "bare" },
      ])
    ).toEqual([
      { id: "attachments", label: "Attachments" },
      { id: "receipts", label: "Receipts & scans" },
    ]);
    // A section with a family and no label falls back to its id rather than
    // drawing an empty option.
    expect(attachSections([{ id: "shelf", family: "attach" }])).toEqual([
      { id: "shelf", label: "shelf" },
    ]);
  });
});

describe("the shape of the window", () => {
  const win = (): string => readSrc("ui/diary-link-window.ts");

  it("is a window and not a suggester any more", () => {
    // THE READER'S ASK. The two jobs the suggester could not hold — saying what
    // the note is already filed under, and taking one of those back — are both
    // list-shaped, and neither survives a control that closes on contact.
    // THE OPENER IS IN THE WINDOW'S OWN FILE (1.0.66), not in the model's —
    // the model may not reach for the window, which is what kept the cycle.
    expect(win()).toContain("new DiaryLinkWindow(");
    // `readCode`, because the comment left where the opener stood names the
    // class in order to say where it went.
    expect(readCode("diary/diary-link.ts")).not.toContain("DiaryLinkWindow");
    expect(readSrc("diary/diary-link.ts")).not.toContain("promptDetailedSuggester");
    expect(readSrc("diary/diary-link.ts")).not.toContain("Move the list to which date?");
    expect(win()).toContain("export class DiaryLinkWindow extends EditorModal {");
  });

  it("draws one tab per grain, off the catalogue", () => {
    // Five tabs spelled once. A sixth grain would appear here without this file
    // being edited, which is the whole reason `TRACKER_CLASSES` exists.
    expect(win()).toContain("for (const grain of TRACKER_CLASSES) {");
    for (const grain of TRACKER_CLASSES) {
      expect(grainTabLabel(grain)).toBe(
        `${CLASS_DEFS[grain].periodNoun.charAt(0).toUpperCase()}${CLASS_DEFS[
          grain
        ].periodNoun.slice(1)}s`
      );
    }
    expect(grainTabLabel("daily")).toBe("Days");
    expect(grainTabLabel("quarterly")).toBe("Quarters");
  });

  it("types without losing the caret", () => {
    // Going through `refreshBody()` on a keystroke would rebuild the find box
    // the reader is typing in and take the caret with it. The input listener
    // repaints the three parts that change and nothing else.
    expect(win()).toContain('box.addEventListener("input", () => {\n      this.query = box.value;\n      this.paint();');
    const listener = win().slice(win().indexOf('box.addEventListener("input"'));
    expect(listener.slice(0, listener.indexOf("});"))).not.toContain("refreshBody");
  });

  it("aims the list when the box holds a date, and narrows it when it does not", () => {
    // One rule, in one place. Two code paths asking the same question twice is
    // how a box ends up aiming AND filtering, which shows one row of a month.
    expect(win()).toContain(
      "return anchorFromQuery(this.query) ?? this.anchor;"
    );
    const narrow = win().slice(win().indexOf("private narrowing(): string {"));
    expect(narrow.slice(0, narrow.indexOf("\n  }"))).toContain(
      'if (anchorFromQuery(this.query)) return "";'
    );
    // ASKED IN TWO PLACES AND ANSWERED IN ONE. The grid's month, the list's
    // rows and the caption's default all go through `shown()`; a second
    // `anchorFromQuery` beside one of them is how a box ends up aiming the
    // calendar and filtering the list at the same time.
    expect(win().split("anchorFromQuery(this.query)")).toHaveLength(4);
    for (const call of ["monthGrid(this.shown())", "this.shown(),", "this.touched ?? this.shown()"]) {
      expect(win(), call).toContain(call);
    }
  });

  it("narrows a list and never a calendar", () => {
    // A grid has no rows to hide, and hiding cells would leave a month with
    // holes in it — so the narrowing is read by `paintList` and by nothing the
    // Days tab draws.
    const grid = win().slice(
      win().indexOf("private paintGrid(): void {"),
      win().indexOf("private paintCaption(): void {")
    );
    expect(grid).not.toContain("narrowing()");
    expect(win().slice(win().indexOf("private paintList(): void {"))).toContain(
      "const needle = this.narrowing();"
    );
  });

  it("pages in both directions, by the grain's own page size", () => {
    // AND IT OPENS WITH ONE PAGE ALREADY TAKEN, backwards — which is what
    // makes the anchor the top row rather than the only row. `fwd` starts at
    // nothing on purpose: a note is usually written about the past, and a list
    // that opened with a fortnight of future above the anchor would bury it.
    expect(win()).toContain(
      "for (const grain of TRACKER_CLASSES) this.back[grain] = REACH[grain];"
    );
    expect(win()).toContain(
      "this.fwd = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, yearly: 0 };"
    );
    expect(win()).toContain('this.pager(this.body, 1, "chevron-up", "Later");');
    expect(win()).toContain('this.pager(this.body, -1, "chevron-down", "Earlier");');
    expect(win()).toContain("side[this.grain] += REACH[this.grain];");
  });

  it("makes the whole row the tick's label", () => {
    // A row-level click listener that also had to not fight the checkbox under
    // it is the version of this that has a bug in it.
    expect(win()).toContain('this.listEl.createEl("label", {');
    expect(win()).toContain('attr: { type: "checkbox" }');
  });

  it("opens with the periods the note is already filed under ticked", () => {
    // THE READER'S FIRST ANSWER, in one line: a row with no opinion of its own
    // reads the truth off `linked`, so the window draws what IS rather than an
    // empty form. A `?? false` here would make every Save look like a first
    // link and every "to remove" unreachable.
    expect(win()).toContain(
      "return this.picked.get(id)?.link ?? this.linked.has(id);"
    );
    // And the tab badge counts the same two sources, so the four tabs you are
    // not looking at can still say what they hold.
    expect(win()).toContain("if (this.picked.get(id)?.link === false) continue;");
    expect(win()).toContain(
      "if (edit.link && edit.target.grain === grain && !this.linked.has(id)) n++;"
    );
  });

  it("clears the box when a shortcut moves the anchor", () => {
    // A QUERY AIMS THE LIST, so leaving one in the box after pressing *Today*
    // would aim it straight back at whatever was typed and the button would
    // read as broken.
    // ONE MOVER FOR THREE CONTROLS as of 1.0.52 — *Today*, the note's own
    // date, and the two month steppers — because each of them had to clear the
    // box for the same reason and three copies is two chances to forget.
    expect(win()).toContain(
      '  private aim(iso: string): void {\n    this.anchor = iso;\n    this.query = "";'
    );
    expect(win()).toContain("    this.touched = null;\n    this.refreshBody();");
    const shortcut = win().slice(win().indexOf("private shortcut("));
    expect(shortcut.slice(0, shortcut.indexOf("\n  }"))).toContain("this.aim(iso);");
  });

  it("draws one shape per tab and hides the controls of the other", () => {
    // TWO SHAPES IN ONE WINDOW, which is the cost of the calendar. The fork is
    // one question asked in one place, and the four controls that belong to one
    // shape are HIDDEN rather than created and destroyed — building them on a
    // tab switch would mean the find box's caret went with them.
    expect(win()).toContain('const calendar = this.grain === "daily";');
    for (const line of [
      'this.monthEl.toggleClass("ca-dl-off", !calendar);',
      'this.captionEl.toggleClass("ca-dl-off", !calendar);',
      'this.laterEl.toggleClass("ca-dl-off", calendar);',
      'this.earlierEl.toggleClass("ca-dl-off", calendar);',
    ]) {
      expect(win(), line).toContain(line);
    }
    // AND THE LEGEND IS NOT ONE OF THEM as of 1.0.53. It was hidden on four
    // tabs out of five while it was only true of one; the rows wear the same
    // four marks now, so the key that names them belongs under all of them.
    expect(win()).not.toContain("this.legendEl.toggleClass(");
    const paint = win().slice(
      win().indexOf("  private paint(): void {"),
      win().indexOf("  private paintTabs(): void {")
    );
    expect(paint).toContain("if (calendar) {");
    expect(paint).toContain("this.paintGrid();");
    expect(paint).toContain("this.paintList();");
    // And `daily` is asked once, so a sixth grain is a list and not a bug.
    expect(win().split('this.grain === "daily"')).toHaveLength(2);
  });

  it("cycles the calendar by the month, keeping the day it was on", () => {
    // *"weeks are how the view cycles"* — a grid row is a week, so a month is
    // five of them and ◀ ▶ are the cycle. The day of the month is kept and
    // moment clamps it, so stepping out of a long month and back lands where
    // it started rather than one day later.
    expect(win()).toContain(
      'this.aim(moment(this.shown()).add(delta, "months").format("YYYY-MM-DD"));'
    );
    expect(win()).toContain('this.step(this.monthEl, -1, "chevron-left", "The month before");');
    expect(win()).toContain('this.step(this.monthEl, 1, "chevron-right", "The month after");');
    // THE STEPPER IS NOT A PAGER. The two pagers add a page of periods to a
    // list; this moves the one anchor the whole window is drawn around, which
    // is why switching to Months after stepping opens on the month you stepped
    // to.
    const step = win().slice(win().indexOf("  private step("));
    expect(step.slice(0, step.indexOf("\n  }"))).not.toContain("REACH");
  });

  it("says in one place what a cell cannot say at all", () => {
    // A row carried a label, a filename and a state word; a cell carries a
    // number. So the sentence moves to the caption — which follows the pointer,
    // because it is the thing a reader reaches for BEFORE deciding to tick —
    // and to the cell's own title, which is also its `aria-label`.
    expect(win()).toContain('cell.addEventListener("mouseenter", () => {');
    expect(win()).toContain("this.touched = iso;");
    expect(win()).toContain('"aria-label": said,');
    expect(win()).toContain("title: said,");
    const caption = win().slice(win().indexOf("  private paintCaption(): void {"));
    expect(caption).toContain("const iso = this.touched ?? this.shown();");
    // NEVER BLANK: with nothing touched it names the day the grid is anchored
    // on, so the line does not appear and disappear under the calendar.
    expect(caption).toContain("describeTarget(this.plugin,");
  });

  it("names the four marks off the list both shapes wear", () => {
    // A legend written out separately from the classes it explains is a legend
    // that goes stale. `STATE_KEYS` is both — and as of 1.0.53 three of its
    // four words come off `stateWord`, so the key cannot spell a state
    // differently from the row it is explaining.
    expect(win()).toContain('{ cls: "is-written", text: "already written" }');
    expect(win()).toContain('{ cls: "is-on", text: stateWord(true, true) }');
    expect(win()).toContain('{ cls: "is-adding", text: stateWord(false, true) }');
    expect(win()).toContain('{ cls: "is-dropping", text: stateWord(true, false) }');
    expect(win()).toContain("for (const key of STATE_KEYS) {");
    expect(win()).toContain('item.createSpan({ cls: `ca-dl-key-mark ${key.cls}` });');
    // NOT SPELLED A SECOND TIME ANYWHERE IN THE WINDOW: the three state words
    // and the two existence phrases live in `diary-link.ts` now, which is what
    // makes the legend, the row, the cell's tooltip and the caption one
    // vocabulary rather than four that agree today.
    const code = readCode("ui/diary-link-window.ts");
    for (const word of ['"linked"', '"to link"', '"to remove"', '"a new entry"']) {
      expect(code, word).not.toContain(word);
    }
    expect(code.split('"already written"')).toHaveLength(2);
    // All four marks are classes this file applies, so the sweep that keeps
    // every class under the `ca-` prefix sees them (`is-` is the exception it
    // allows) and the stylesheet has a rule for each.
    for (const key of ["is-written", "is-on", "is-adding", "is-dropping"]) {
      expect(win(), key).toContain(key);
    }
    // `is-changed` was the one class that stood for both halves of a pending
    // write. It is gone from the code, not renamed around.
    expect(code).not.toContain("is-changed");
  });

  it("asks where the link lands once, for the whole Save", () => {
    // THE READER'S CALL. A Save is almost always one period, and a pair of
    // dropdowns on every ticked row would be a column of controls answering one
    // question. The window chooses and the model writes — the selects set
    // `this.dest` and nothing in this file knows what an `attach:` line is.
    expect(win()).toContain('this.select(\n      wrap,\n      "Section",');
    expect(win()).toContain('"Category",');
    expect(win()).toContain("const sections = attachSections();");
    expect(win()).toContain("this.cats.map((c) => ({ value: c.key, label: c.label }))");
    expect(win()).not.toContain("attach:");
    // BOTH HALVES OF A CATEGORY TOGETHER: the key recognises a shelf an entry
    // has, the label is what a shelf gets created as. One without the other is
    // how a reader asks for Images and gets a second Files & Links.
    expect(win()).toContain("this.dest = { ...this.dest, key: hit.key, label: hit.label };");
  });

  it("tells the reader what it will compose into their entry", () => {
    // Both creations are writes they did not separately ask for, so they are
    // said before Save and again in the notice afterwards.
    expect(win()).toContain(
      "An attachments field or a category that is missing is created on the entry."
    );
    expect(win()).toContain("under ${this.dest.label}");
  });

  it("aims on Enter instead of saving, when the box holds a date", () => {
    // The frame submits on Enter from any single-line field, which is right for
    // a window whose fields ARE the thing being saved and wrong for one whose
    // only text field moves the view. Enter on anything that is not a date
    // still saves, which is what a keyboard reader expects from a dialog.
    expect(win()).toContain("protected async onEnterKey(): Promise<void> {");
    const enter = win().slice(win().indexOf("protected async onEnterKey()"));
    const body = enter.slice(0, enter.indexOf("\n  }"));
    expect(body).toContain("const aimed = anchorFromQuery(this.query);");
    expect(body).toContain("this.aim(aimed);");
    expect(body).toContain("await super.onEnterKey();");
  });

  it("leaves nothing behind when a tick is put back where it was", () => {
    // Without this the map holds a no-op edit, `edits()` hands it to the
    // writer, and the sentence under the list promises a write nobody asked
    // for.
    expect(win()).toContain("if (link === this.linked.has(id)) this.picked.delete(id);");
  });

  it("writes nothing until Save", () => {
    // The fourth list to make that promise, and the one for which it matters
    // most: a tick can create an entry note.
    expect(win()).toContain("Nothing is written until you press Save.");
    expect(win()).toContain("await this.onSave(this.edits(), this.dest);");
    const body = win().slice(win().indexOf("protected renderBody()"), win().indexOf("protected validate()"));
    expect(body).not.toContain("vault.process");
    expect(body).not.toContain("processFrontMatter");
  });
});

describe("what the window looks like", () => {
  it("wears the tags window's classes, for the fourth time", () => {
    // `.ca-tags-editor`, `.ca-tags-list`, `.ca-tags-row`, `.ca-tags-name`,
    // `.ca-tags-count` and `.ca-tags-empty` are the same here as they are for
    // tags, habits and categories. A window that re-declared them would be the
    // copy that later disagrees.
    const win = readSrc("ui/diary-link-window.ts");
    for (const cls of [
      "ca-tags-editor",
      "ca-tags-list",
      "ca-tags-row",
      "ca-tags-name",
      "ca-tags-count",
      "ca-tags-empty",
      "ca-tags-input",
    ]) {
      expect(win, cls).toContain(cls);
    }
    expect(cssRules(".ca-dl-row").join("\n")).not.toContain("border-bottom");
  });

  it("resets the height on every button it draws", () => {
    // app.css gives every <button> `height: var(--input-height)`, and only
    // `height: auto; min-height: 0` in the same rule escapes it. Three
    // chip-shaped buttons here, and "no visual change" is what getting this
    // wrong looks like until you measure one.
    for (const sel of [".ca-dl-tab", ".ca-dl-jump", ".ca-dl-pager", ".ca-dl-step"]) {
      const rule = cssRule(sel);
      expect(rule, sel).toContain("height: auto");
      expect(rule, sel).toContain("min-height: 0");
    }
    // A CALENDAR CELL WANTS A FLOOR RATHER THAN NONE, so it says so in the
    // same rule — which is what overrides app.css either way. `min-height: 0`
    // here would give a month of 1em cells and a grid of lines.
    const cell = cssRule(".ca-dl-day");
    expect(cell).toContain("height: auto");
    expect(cell).toMatch(/min-height: 2(\.\d+)?em/);
    // And the blanks hold their column open to the same measurement, so a row
    // with three of them is the same height as every other row.
    expect(cssRule(".ca-dl-blank")).toContain("min-height: 2.2em");
  });

  it("lays the calendar out as a gutter and seven equal days", () => {
    // `auto` for the gutter so `W40` sets its own width, and `1fr` seven times
    // so the day columns stay under their own day names at any window width.
    const grid = cssRule(".ca-dl-grid");
    expect(grid).toContain("display: grid");
    expect(grid).toContain("grid-template-columns: auto repeat(7, 1fr)");
    // The marks a cell wears, each with a rule of its own — and the dot flips
    // to the accent's foreground on a filled cell, or it would vanish into it.
    expect(cssRule(".ca-dl-day.is-written::after")).toContain("content");
    expect(cssRule(".ca-dl-day.is-on")).toContain("background: var(--interactive-accent)");
    expect(cssRule(".ca-dl-day.is-on.is-written::after")).toContain(
      "background: var(--text-on-accent)"
    );
    // THE FILL IS THE DIARY'S DENSITY (1.0.53). Every cell carried
    // `--background-secondary`, so a day with an entry looked exactly like a
    // day with nothing: the ground is transparent and the written day is the
    // one that is filled.
    expect(cssRule(".ca-dl-day")).toContain("background: transparent");
    expect(cssRule(".ca-dl-day.is-written")).toContain(
      "background: var(--background-secondary)"
    );
    // The unsaved tick is a ring INSIDE the cell: an outline would land between
    // the cells and read as a gap. TWO RINGS, because Save does opposite
    // things with them.
    expect(cssRule(".ca-dl-day.is-adding")).toContain(
      "inset 0 0 0 2px var(--interactive-accent)"
    );
    expect(cssRule(".ca-dl-day.is-dropping")).toContain("inset 0 0 0 2px var(--text-error");
    expect(cssRule(".ca-dl-day.is-adding")).not.toContain("outline");
    expect(cssRules(".ca-dl-day.is-changed")).toHaveLength(0);
    // Today says it in the accent on the number as well as on the border, and
    // it is declared BEFORE `.is-on` — one class against one class, so source
    // order is what keeps a linked day's number `--text-on-accent`.
    expect(cssRule(".ca-dl-day.is-today")).toContain("color: var(--text-accent)");
    const sheet = readCss();
    expect(sheet.indexOf(".ca-dl-day.is-today")).toBeLessThan(
      sheet.indexOf(".ca-dl-day.is-on")
    );
    // And a hover is the last of the cell's rules, so it is visible on a cell
    // in any state rather than only on an empty one.
    expect(sheet.indexOf(".ca-dl-day:hover")).toBeGreaterThan(
      sheet.indexOf(".ca-dl-day.is-dropping")
    );
    // The weekend is a reading aid and says so quietly, by the column it is in.
    expect(cssRule(".ca-dl-day.is-weekend")).toContain("color: var(--text-muted)");
    for (const cls of [
      ".ca-dl-key-mark.is-written",
      ".ca-dl-key-mark.is-on",
      ".ca-dl-key-mark.is-adding",
      ".ca-dl-key-mark.is-dropping",
    ]) {
      expect(cssRule(cls), cls).toBeTruthy();
    }
    // A MARK THAT LOOKS LIKE THE MARK IT NAMES: the key for "already written"
    // was a filled square standing for a dot under a number.
    expect(cssRule(".ca-dl-key-mark.is-written::after")).toContain("content");
    expect(cssRule(".ca-dl-key-mark.is-written")).toContain(
      "background: var(--background-secondary)"
    );
  });

  it("hides a shape's own controls by one class beating one class", () => {
    // `.ca-dl-off` is a single class against `.ca-dl-month`'s single class, so
    // SOURCE ORDER is what decides it — which is why it is last in the sheet
    // and why `!important` is not needed anywhere in this window.
    expect(cssRule(".ca-dl-off")).toContain("display: none");
    const sheet = readCss();
    expect(sheet.indexOf(".ca-dl-off")).toBeGreaterThan(sheet.indexOf(".ca-dl-month"));
    expect(sheet.indexOf(".ca-dl-off")).toBeGreaterThan(sheet.indexOf(".ca-dl-pager"));
    expect(cssRule(".ca-dl-off")).not.toContain("!important");
  });

  it("gives the list a floor so the window does not jump between tabs", () => {
    // A tab holding five years and a tab holding fifteen days are the same
    // control, and Obsidian centres a modal vertically — so a list that shrank
    // would move the footer out from under the pointer.
    const rule = cssRule(".ca-dl-list");
    expect(rule).toContain("min-height");
    expect(rule).toContain("max-height");
    expect(rule).toContain("overflow-y: auto");
  });

  it("colours a row by what is true of it, and what a Save would do", () => {
    // THE FOUR STATES, ON THE ROW (1.0.53). Every row of the four list tabs
    // was the same weight and the same colour, and the only thing that
    // differed between them was a phrase halfway down a faint second line.
    //
    // Existence decides the label's contrast: muted means a Save would create
    // the note, full contrast means it is already in the vault.
    expect(cssRule(".ca-dl-label")).toContain("color: var(--text-muted)");
    expect(cssRule(".ca-dl-row.is-written .ca-dl-label")).toContain(
      "color: var(--text-normal)"
    );
    // The accent down the edge of a row is the fill of a cell, and it goes red
    // on the row a Save would unfile — the state that takes something away.
    expect(cssRule(".ca-dl-row.is-on")).toContain(
      "inset 3px 0 0 var(--interactive-accent)"
    );
    expect(cssRule(".ca-dl-row.is-dropping")).toContain("inset 3px 0 0 var(--text-error");
    expect(cssRule(".ca-dl-row.is-adding .ca-dl-state")).toContain(
      "var(--interactive-accent)"
    );
    expect(cssRule(".ca-dl-row.is-dropping .ca-dl-state")).toContain("var(--text-error");
    expect(cssRules(".ca-dl-row.is-changed .ca-dl-state")).toHaveLength(0);
    // The pip is the calendar's dot, in a slot that is there whether it is
    // filled or not: a mark that came and went would move every label beside
    // it. So the empty state is a background and not a display.
    expect(cssRule(".ca-dl-pip")).toContain("background: transparent");
    expect(cssRule(".ca-dl-pip")).not.toContain("display: none");
    expect(cssRule(".ca-dl-row.is-written .ca-dl-pip")).toContain(
      "background: var(--text-faint)"
    );
    // The rung sticks, because "which year am I looking at" is a question a
    // heading that scrolls away answers once.
    expect(cssRule(".ca-dl-group")).toContain("position: sticky");
    expect(cssRule(".ca-dl-group")).toContain("background: var(--background-primary)");
    // And the filename line is information rather than decoration, so it is
    // muted rather than faint.
    expect(cssRule(".ca-dl-sub")).toContain("color: var(--text-muted)");
  });
});

// ── ONE VOCABULARY, DRAWN TWO WAYS (1.0.53) ──────────────────────────────
//
// *"improve all tabs to improve readability and smart coloring"*, said of five
// screenshots. The calendar had three marks and the four lists had none: every
// row was one weight and one colour, and the one thing that differed between
// them — whether that entry exists — was a phrase halfway down a faint second
// line that every row repeated.
//
// What is asserted here is the part that is not a matter of taste: that the
// words are spelled ONCE, that both shapes compose their classes in one place,
// and that the arithmetic behind the two new readings (the rung a list breaks
// on, the period we are in) is right at the turns of the month and the year.

describe("one vocabulary, two shapes (1.0.53)", () => {
  it("says what a tick will do in four words, one of which is nothing", () => {
    expect(stateWord(true, true)).toBe("linked");
    expect(stateWord(false, true)).toBe("to link");
    expect(stateWord(true, false)).toBe("to remove");
    // NOTHING TO SAY IS SAID WITH NOTHING. The right-hand slot of an untouched
    // row is empty, so the states that matter are the only ones with text in
    // that column.
    expect(stateWord(false, false)).toBe("");
    // "Remove" rather than any other verb — 1.0.43's house rule.
    expect(stateWord(true, false)).not.toContain("delete");
  });

  it("composes one sentence for the tooltip, the caption and the row's title", () => {
    // THREE COPIES OF `exists ? "already written" : "a new entry"` is three
    // chances for the two shapes to disagree about the same day, and there
    // were three copies until this round.
    const row = (exists: boolean): DiaryRow => ({
      target: { grain: "daily", key: "2026-10-11" },
      label: "Sunday 11 October 2026",
      note: "Day-2026-10-11",
      exists,
    });
    expect(rowSentence(row(true), true, true)).toBe(
      "Day-2026-10-11 — already written — linked"
    );
    expect(rowSentence(row(true), true, false)).toBe(
      "Day-2026-10-11 — already written — to remove"
    );
    expect(rowSentence(row(false), false, true)).toBe(
      "Day-2026-10-11 — a new entry — to link"
    );
    // THE FILENAME COMES FIRST because it is the string the find box accepts,
    // and a state with nothing to say adds no trailing dash.
    expect(rowSentence(row(false), false, false)).toBe("Day-2026-10-11 — a new entry");
  });

  it("marks the period we are in, on every grain", () => {
    // A Sunday in ISO week 41 of the fourth quarter — the one date where the
    // five grains disagree most about what "now" is.
    const now = "2026-10-11";
    for (const grain of TRACKER_CLASSES) {
      const key = currentEntryKey(grain, moment(now));
      expect(isNow({ grain, key }, now), grain).toBe(true);
      expect(isNow({ grain, key }, "2025-05-04"), grain).toBe(false);
    }
    expect(isNow({ grain: "daily", key: "2026-10-12" }, now)).toBe(false);
    expect(isNow({ grain: "weekly", key: "2026-09-28" }, now)).toBe(false);
    expect(isNow({ grain: "monthly", key: "2026-09" }, now)).toBe(false);
    // AND A DATE THAT IS NOT ONE ANSWERS NO rather than throwing: this is
    // asked once per row while a reader is typing in the find box.
    expect(isNow({ grain: "daily", key: "2026-10-11" }, "not a date")).toBe(false);
  });

  it("breaks a list on the grain above it, and leaves two grains alone", () => {
    expect(GROUP_GRAIN.weekly).toBe("monthly");
    expect(GROUP_GRAIN.monthly).toBe("yearly");
    expect(GROUP_GRAIN.quarterly).toBe("yearly");
    // DAYS ARE THE CALENDAR'S, which groups them into the weeks the reader
    // asked for and puts the number in the gutter. A decade is not a period
    // this plugin has, so the Years tab heads nothing.
    expect(GROUP_GRAIN.daily).toBeUndefined();
    expect(GROUP_GRAIN.yearly).toBeUndefined();
    expect(groupOf({ grain: "daily", key: "2026-10-11" })).toBeNull();
    expect(groupOf({ grain: "yearly", key: "2026-01-01" })).toBeNull();
  });

  it("files a week under the month it starts in", () => {
    // THE WEEK THAT STRADDLES THE TURN OF A MONTH is the one a reader would
    // find wrong: 28 September to 4 October is under September, the same month
    // its entry's own `date:` lands in, because `targetStartIso` is what
    // decides rather than a second opinion about where a week sits.
    expect(groupOf({ grain: "weekly", key: "2026-09-28" })).toEqual({
      key: "2026-09",
      label: "September 2026",
    });
    expect(groupOf({ grain: "weekly", key: "2026-10-05" })).toEqual({
      key: "2026-10",
      label: "October 2026",
    });
    // A month and a quarter group under their year, and the key is the year's
    // own entry key rather than four digits — it is compared, not printed.
    expect(groupOf({ grain: "monthly", key: "2026-01" })).toEqual({
      key: "2026-01-01",
      label: "2026",
    });
    expect(groupOf({ grain: "quarterly", key: "2026-10-01" })).toEqual({
      key: "2026-01-01",
      label: "2026",
    });
    // The rung runs with the list: a December row and the January above it are
    // under two different headings.
    expect(groupOf({ grain: "monthly", key: "2025-12" })?.label).toBe("2025");
    // MEASURED EQUIVALENT, AND KEPT ANYWAY — `vacuous-sweep-rule` shape 5,
    // with the DATA rather than the fixture as the thing that cannot
    // disagree. Reading `target.key` in place of the period's start passes
    // every assertion above and every fixture that could be written: a
    // month's key is the only one of the five that is not already a date, and
    // `moment("2026-01")` lands inside the same year as `moment("2026-01-01")`
    // — as it would inside the same quarter, or inside any container, since a
    // period is wholly inside the one above it. So the claim is the source's:
    // the rung reads the same function the `date:` write does rather than
    // resting on moment accepting a seven-character date.
    expect(readCode("diary/diary-link.ts")).toContain(
      "const at = moment(targetStartIso(target));"
    );
  });
});

describe("what the four list tabs say now (1.0.53)", () => {
  const win = (): string => readSrc("ui/diary-link-window.ts");
  // Slices to the end of the method being talked about, which is the
  // `vacuous-sweep-rule` shape that has bitten this file twice: a slice to end
  // of file finds the thing it is looking for in some other function.
  const method = (name: string): string => {
    const src = readCode("ui/diary-link-window.ts");
    const at = src.indexOf(`private ${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    const rest = src.slice(at);
    return rest.slice(0, rest.indexOf("\n  }"));
  };

  it("turns one pair of booleans into the classes both shapes wear", () => {
    expect(win()).toContain(
      "private marks(was: boolean, now: boolean, written: boolean): string {"
    );
    // ONE CALL FROM EACH SHAPE, and no third composition anywhere.
    expect(win().split("this.marks(")).toHaveLength(3);
    // THE FOUR STATES, MAPPED ONCE. `is-on` is what is true now, the pair is
    // what Save would do about it, and `is-written` is the vault's answer —
    // three questions, and the classes for all of them come from here.
    const marks = method("marks");
    expect(marks).toContain('now ? " is-on" : ""');
    expect(marks).toContain('now === was ? "" : now ? " is-adding" : " is-dropping"');
    expect(marks).toContain('written ? " is-written" : ""');
    for (const name of ["drawCell", "drawRow"]) {
      const body = method(name);
      expect(body, name).toContain("this.marks(was, now, row.exists)");
      expect(body, name).not.toContain('" is-on"');
      expect(body, name).not.toContain("is-written");
    }
  });

  it("puts the filename on the second line and the sentence one hover away", () => {
    const body = method("drawRow");
    expect(body).toContain('name.createDiv({ cls: "ca-dl-sub", text: row.note });');
    expect(body).toContain("rowSentence(row, was, now)");
    // `— already written` on every row of fifteen is a phrase a reader stops
    // seeing. The dot says it, the label's contrast says it again, and the
    // title still spells it out — for a screen reader as much as for a pointer.
    expect(body).not.toContain("already written");
    expect(body).toContain("attr: { title:");
    // THE PIP IS DRAWN WHETHER IT IS FILLED OR NOT: a mark that came and went
    // would move every label on the tab beside it.
    expect(body).toContain('el.createSpan({ cls: "ca-dl-pip" });');
    expect(body.split("ca-dl-pip")).toHaveLength(2);
    expect(body.indexOf("ca-dl-pip")).toBeLessThan(body.indexOf("if (current)"));
  });

  it("names the period we are in with the grain's own noun", () => {
    const body = method("drawRow");
    expect(body).toContain("const current = isNow(row.target);");
    expect(body).toContain('cls: "ca-dl-now"');
    expect(body).toContain("text: `this ${CLASS_DEFS[row.target.grain].periodNoun}`");
    // FIVE TABS, ONE STRING. Spelling each of them out would be four more to
    // forget, and none of them could say "today" — which is true of one tab.
    expect(readCode("ui/diary-link-window.ts")).not.toContain('"this week"');
    // The calendar's own landmark says it in words as well as in a border,
    // because a 1px outline is nothing at all to a screen reader.
    expect(method("drawCell")).toContain('current ? " — today" : ""');
    expect(method("drawCell")).toContain('current ? " is-today" : ""');
  });

  it("heads a run of rows, counting only the rows it kept", () => {
    const body = method("paintList");
    expect(body).toContain("const group = groupOf(row.target);");
    expect(body).toContain("if (group && group.key !== rung) {");
    expect(body).toContain('this.listEl.createDiv({ cls: "ca-dl-group", text: group.label });');
    // A HEADING WITH NOTHING UNDER IT is what asking before the narrowing
    // would produce, so the rung is decided after the `continue` that drops a
    // row the find box filtered out.
    expect(body.indexOf("continue;")).toBeLessThan(body.indexOf("groupOf("));
    // And the grid asks for no rungs: `groupOf` answers null for a day, and
    // the calendar's own gutter is the grouping.
    expect(method("paintGrid")).not.toContain("groupOf(");
  });

  it("decides the weekend by the column, not by the date", () => {
    // `monthGrid` starts every row at `startOf("isoWeek")` and `weekdayHeads`
    // is built from a Monday, so columns six and seven ARE Saturday and
    // Sunday. Re-deriving that from each date would be a second opinion about
    // where a week starts.
    const body = method("paintGrid");
    expect(body).toContain("week.days.forEach((iso, col) => {");
    expect(body).toContain("this.drawCell(table, iso, col >= 5);");
    expect(body).not.toContain('format("ddd")');
    expect(win()).toContain(
      "private drawCell(table: HTMLElement, iso: string, weekend: boolean): void {"
    );
    expect(method("drawCell")).toContain('weekend ? " is-weekend" : ""');
  });

  it("keeps the find box's placeholder short enough to read", () => {
    // WHAT WAS ON SCREEN WAS A CLIPPED LIST ending mid-example: five date
    // forms do not fit this box at any width the modal has. Two fit, and the
    // title carries the rest.
    const ph = /placeholder: "([^"]+)"/.exec(win())?.[1] ?? "";
    expect(ph).toContain("2026-10-12");
    expect(ph.length).toBeLessThan(40);
    const title = /title:\n\s+"([^"]+)"/.exec(win())?.[1] ?? "";
    for (const form of ["2026-10-12", "2026-10", "2026-W41", "2026-Q4", "2026"]) {
      expect(title, form).toContain(form);
    }
  });
});
