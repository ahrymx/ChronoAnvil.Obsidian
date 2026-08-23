// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Patch 3 of 2.59 changes nothing, and this is the whole evidence for that.
//
// The catalogue composes each dashboard and the result is diffed BYTE FOR BYTE
// against the file that ships today. If any of these fail, the composition is
// wrong somewhere subtle and patch 4 — where scaffold stops copying and starts
// composing — must not start.

import { HEADER_PREFIX, TRENDS_HEADING } from "../src/core/constants";
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readCode, readSrc } from "./sources";
import { resolve } from "node:path";
import {
  DIARY_SECTIONS,
  addableDiarySections,
  composeDiaryDashboard,
  detectDiarySections,
  renderDiarySection,
  isOptIn,
  applyDiarySections,
  diarySectionModel,
  planDiarySections,
  sectionsForDashboard,
  titleSummaryFence,
} from "../src/diary/diary-sections";
import type { DashboardGrain } from "../src/diary/diary-sections";
import { isPageWidgetId } from "../src/core/widget-sections";
import { CLASS_DEFS } from "../src/trackers/trackers";
import { repairNote } from "../src/core/repair-plan";

// The byte-for-byte diff that stood here through 2.59.2 is gone with the asset
// files it compared against. It was a MIGRATION gate, not a standing test: its
// job was to prove the catalogue reproduced what shipped before scaffold was
// allowed to switch over, and it did that — it caught the composition building
// frontmatter from `dateProperty` while three of four dashboards passed anyway.
//
// Keeping the assets so it could keep running would mean maintaining a second
// copy of the same arrangement plus a test whose only job is to notice the two
// drifting apart, which is the trade STUDY_COMPOSED already refused in 2.42.
// Composing makes drift impossible rather than detectable.

describe("the composer is what scaffold writes", () => {
  it("leaves no dashboard asset behind to drift from", () => {
    // If one of these comes back, there are two descriptions of a dashboard
    // again and nothing says which wins.
    for (const f of [
      "weekly-overview.md",
      "monthly-overview.md",
      "quarter.md",
      "year.md",
    ]) {
      expect(existsSync(resolve(__dirname, "..", "assets", f)), f).toBe(false);
    }
  });

  it("is the source scaffold reads for all four", () => {
    const src = readSrc("scaffold");
    for (const g of ["weekly", "monthly", "quarterly", "yearly"]) {
      expect(src, g).toContain(`composeDiaryDashboard("${g}")`);
    }
  });

  it("still opens each dashboard with its period property and the spacer", () => {
    // What the byte-diff protected, kept as a property rather than a snapshot:
    // the frontmatter key is what makes the note a dashboard at all, and the
    // spacer is what the banner hangs off.
    for (const [g, prop] of [
      ["weekly", "week-start"],
      ["monthly", "month-start"],
      ["quarterly", "quarter-start"],
      ["yearly", "year-start"],
    ] as const) {
      const out = composeDiaryDashboard(g);
      expect(out.startsWith(`---\n${prop}`), g).toBe(true);
      expect(out, g).toContain("`almanac:spacer`");
      expect(out.endsWith("```\n"), g).toBe(true);
    }
  });
});

describe("what the catalogue made visible", () => {
  // Three divergences that were invisible as four separate files and are
  // obvious as one description. None is changed here: two are probably bugs and
  // one is probably a decision, and telling them apart belongs to a patch
  // allowed to change behaviour. Pinned so that patch cannot happen silently.

  it("gives every grain a period button, monthly included", () => {
    // FLIPPED IN 3.3. Monthly was the exception until then — not by argument
    // but by age: `new-monthly` was written when the monthly note was a
    // "review" and the only way to make one was to be asked which month, and
    // the scoped buttons the other three grew in 2.57 never reached it.
    for (const g of [
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
    ] as DashboardGrain[]) {
      expect(composeDiaryDashboard(g), g).toContain("button:new-");
    }
    expect(composeDiaryDashboard("monthly")).toContain("button:new-month");
  });

  it("and the scoped button is not the prompting one wearing its name", () => {
    // `new-monthly` prompts for any YYYY-MM and is what the command palette
    // invokes; `new-month` keeps the month the dashboard is looking at. One
    // directive, one meaning — a kind that read its host and changed both its
    // label and its behaviour is the shape this codebase keeps declining.
    expect(composeDiaryDashboard("monthly")).not.toContain("button:new-monthly");
  });

  it("gives yearly no Open Tasks, and now gives it a chart header", () => {
    // TWO DIVERGENCES, ONE OF WHICH WAS A BUG. 2.59.3 recorded both and changed
    // neither, on the grounds that telling a defect from a decision needed a
    // patch allowed to change behaviour.
    //
    // The absent Open Tasks section is the decision — 2.58.6, a year of open
    // tasks grouped by source note is a page-long list nobody reads.
    //
    // The absent chart header was the defect, fixed in 3.9. Without it the
    // charts processor takes its no-title path — which exists for notes whose
    // Trends title is a separate block above the fence — and the year has no
    // such block, so the section rendered with no title, no fold arrow and no
    // count, just a loose toolbar that read as belonging to the section above.
    const year = composeDiaryDashboard("yearly");
    expect(year).not.toContain("tasks-table");
    expect(year).toContain(`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`);
  });

  it("titles every grain's charts block the same way", () => {
    // The general form of the above, and the assertion that would have caught
    // it in 2.35. Written over the grains rather than naming the year, because
    // a test that pins "yearly has a header" would pass throughout a future
    // release in which the quarter quietly lost its own.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      expect(composeDiaryDashboard(g), g).toContain(
        `\`\`\`almanac-charts\n${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`
      );
    }
  });

  it("writes every grain's period property bare", () => {
    // 3.11 §7.4. The yearly dashboard wrote `year-start: ""` and this test
    // pinned it, under 2.59.2's byte-for-byte diff against the shipped assets
    // — a gate 2.59.3 retired in the same patch that introduced it.
    //
    // WRITTEN OVER THE GRAINS rather than naming the year, for the reason the
    // charts-header test one block up gives: a test that pinned "yearly is
    // bare" would pass throughout a release in which the quarter quietly
    // gained a quoted one.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const prop = { weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year" }[g];
      expect(composeDiaryDashboard(g), g).toContain(`${prop}-start:\n`);
      expect(composeDiaryDashboard(g), g).not.toContain('""');
    }
  });
});

describe("a section is data, which is the point", () => {
  it("gives every section an id, a label and a blurb", () => {
    // A picker needs all three. Writing them beside the markdown is what stops
    // the label and what it renders drifting apart.
    for (const s of DIARY_SECTIONS) {
      expect(s.id, s.id).toBeTruthy();
      expect(s.label, s.id).toBeTruthy();
      expect(s.blurb, s.id).toBeTruthy();
    }
  });

  it("gives each section a distinct id", () => {
    const ids = DIARY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("answers 'does this belong here' per grain", () => {
    // The field that earns the catalogue on its own: as four files, the only
    // way to say "Open Tasks belongs on a week but not a year" was for the two
    // files to be different, and nothing checked that they still agreed.
    const ids = (g: DashboardGrain): string[] =>
      sectionsForDashboard({ grain: g }).map((s) => s.id);
    expect(ids("weekly")).toContain("open-tasks");
    expect(ids("yearly")).not.toContain("open-tasks");
    // `entry-rollup` gained weekly and quarterly in 3.11 §5 and is still
    // absent from the year, which is the assertion that still says something:
    // a year of daily entries is the same page-long list `open-tasks` is kept
    // off it for.
    expect(ids("monthly")).toContain("entry-rollup");
    expect(ids("weekly")).toContain("entry-rollup");
    expect(ids("quarterly")).toContain("entry-rollup");
    expect(ids("yearly")).not.toContain("entry-rollup");
  });
});

// ── 2.59.4: the catalogue answers "what is missing here" ──────────────

describe("what a dashboard already has, and what it could gain", () => {
  it("finds every section in a freshly composed dashboard", () => {
    // The round trip: what the composer writes, the locator finds. If these
    // disagree, an editor offers to add a section the note already has.
    //
    // AGAINST THE SHIPPED SET, NOT THE OFFERED ONE, as of 3.9 §2. This compared
    // against `sectionsForDashboard` — every section that applies here — which
    // was the same list until `optIn` split "may this dashboard have it" from
    // "does a fresh one come with it". Comparing against the offered set now
    // asserts that nothing is opt-in, which is the opposite of what the field
    // is for; comparing against the shipped set still catches the failure this
    // test was written for, which is a composer and a locator disagreeing.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const ctx = { grain: g };
      const found = detectDiarySections(composeDiaryDashboard(g), ctx);
      expect(found.sort(), g).toEqual(
        sectionsForDashboard(ctx)
          .filter((s) => !isOptIn(s, ctx))
          .map((s) => s.id)
          .sort()
      );
    }
  });

  it("composes no opt-in section, and offers every one of them", () => {
    // THE OTHER HALF OF THE SAME INVARIANT, and the test that would fail if
    // `optIn` ever leaked into `composeDiaryDashboard`.
    //
    // A fresh dashboard is deliberately incomplete now. What it is missing must
    // be exactly the opt-in sections — not fewer (a section that ships and is
    // also offered would let a reader add a second copy) and not more (a
    // section that neither ships nor is offered is unreachable).
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const ctx = { grain: g };
      const optIn = sectionsForDashboard(ctx)
        .filter((s) => isOptIn(s, ctx))
        .map((s) => s.id);
      // THE CATALOGUE'S HALF ONLY, AS OF 4.58.0. `addableDiarySections` now also
      // offers every page widget this grain leaves free — which is the release —
      // and those are not catalogue sections and are not what this invariant is
      // about. Filtered by id rather than by set difference so the assertion
      // still fails if a catalogue section goes missing from it.
      expect(
        addableDiarySections(ctx, composeDiaryDashboard(g))
          .map((s) => s.id)
          .filter((id) => !isPageWidgetId(id)),
        g
      ).toEqual(optIn);
    }
  });

  it("and everything it offers on top of them is a page widget", () => {
    // THE OTHER SIDE OF THE FILTER ABOVE, so neither assertion can quietly stop
    // covering what it was written for. A dashboard's add list is the catalogue's
    // opt-ins plus page widgets, and nothing else: an id that is neither would be
    // a section this file cannot account for.
    //
    // AND EVERY WIDGET IS OFFERED EXACTLY ONCE, however many instances a note
    // holds — `widgetInstances` gives the held ones plus one spare, and only the
    // spare is addable. On a freshly composed dashboard that is `#1` for each.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const ctx = { grain: g };
      const widgets = addableDiarySections(ctx, composeDiaryDashboard(g))
        .map((s) => s.id)
        .filter((id) => isPageWidgetId(id));
      expect(widgets.length, g).toBeGreaterThan(0);
      expect(new Set(widgets).size, g).toBe(widgets.length);
      for (const id of widgets) expect(id, g).toMatch(/#1$/);
    }
  });

  it("and withholds the widget for anything the catalogue already writes", () => {
    // THE DE-DUP, READ OFF THE SURFACE THAT NEEDED IT MOST. Four of the widgets
    // are period summaries and the `summary` section's `locate` matches all four
    // — `^(day|week|month|quarter|year)-summary` — so offering any of them would
    // put two ids on one fence and let a Save write one over the other.
    //
    // `links` and `tag-index` are the same fact with narrower anchors: the banner
    // composes a `links:` row and Tags composes a `tag-index`.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const offered = new Set(
        addableDiarySections({ grain: g }, composeDiaryDashboard(g)).map(
          (s) => s.id
        )
      );
      for (const keyword of [
        "week-summary",
        "month-summary",
        "quarter-summary",
        "year-summary",
        "links",
        "tag-index",
      ]) {
        expect(offered.has(`w:${keyword}#1`), `${g}/${keyword}`).toBe(false);
      }
    }
  });

  it("but offers the widget where the section does not apply to this grain", () => {
    // THE PROBE IS GRAIN-AWARE, AND THAT IS WHAT MAKES IT USEFUL RATHER THAN
    // MERELY SAFE. A yearly dashboard has no Open Tasks section — 2.58.6 decided
    // a year of open tasks grouped by source note is a page-long list nobody
    // reads — so nothing on that grain claims `tasks-table`, and a reader who
    // wants one anyway may now add it as a card. A week's catalogue writes one,
    // so a week is offered none.
    const yearly = addableDiarySections(
      { grain: "yearly" },
      composeDiaryDashboard("yearly")
    ).map((s) => s.id);
    expect(yearly).toContain("w:tasks-table#1");
    const weekly = addableDiarySections(
      { grain: "weekly" },
      composeDiaryDashboard("weekly")
    ).map((s) => s.id);
    expect(weekly).not.toContain("w:tasks-table#1");
  });

  it("says what each grain is offered but not given", () => {
    // WAS "gives the year and the quarter a recap to opt into, and nobody
    // else", which was true until 3.11 §5 gave the quarter a second opt-in.
    //
    // Two different reasons for being opt-in now sit side by side, and it is
    // worth being able to read them off one assertion. `recap` is opt-in
    // because 3.9 §2 shortened a banner and would not put the document back by
    // default. `entry-rollup` is opt-in on a quarter alone because a quarter's
    // recap already surfaces its months — an overlap, offered rather than
    // assumed — while a week's and a month's rollup overlap nothing and ship.
    const optIn = (g: DashboardGrain): string[] =>
      sectionsForDashboard({ grain: g })
        .filter((s) => isOptIn(s, { grain: g }))
        .map((s) => s.id);
    //
    // A THIRD REASON JOINED THEM IN 3.14: `tags` is opt-in on all four, and
    // not because of an overlap. A tag cloud reads a folder rather than a
    // period, so it applies to every grain equally — and four dashboards each
    // growing an identical cloud over the same folder would be one view drawn
    // four times.
    //
    // AND A FOURTH IN 4.58.1: `time-grid` is opt-in on the WEEK ALONE, and the
    // grain is doing two jobs in that sentence. It is offered on a week because
    // `weekStartOf` reads the host note's `week-start`, so only there is the
    // grid scoped to the period the page is about; it is opt-in rather than
    // shipped because every weekly dashboard that already exists predates it.
    expect(optIn("yearly")).toEqual(["recap", "tags"]);
    expect(optIn("quarterly")).toEqual(["recap", "entry-rollup", "tags"]);
    expect(optIn("monthly")).toEqual(["tags"]);
    expect(optIn("weekly")).toEqual(["time-grid", "tags"]);
  });

  it("ships the rollup on a week and a month, and offers it on a quarter", () => {
    // The same fact from the composer's side, which is the side a reader
    // meets. A section that is opt-in at one grain and shipped at another is
    // new in 3.11 §5 and `optIn` had to become a predicate to express it.
    expect(composeDiaryDashboard("weekly")).toContain("entry-rollup");
    expect(composeDiaryDashboard("monthly")).toContain("entry-rollup");
    expect(composeDiaryDashboard("quarterly")).not.toContain("entry-rollup");
    expect(composeDiaryDashboard("yearly")).not.toContain("entry-rollup");
  });

  it("asks the quarter for months and everyone else for days", () => {
    // The widget was hardcoded to daily entries, so this is the half of §5
    // that is real code rather than a wider `applies`. `:month` singular,
    // matching `month-start` rather than the index's `monthly`.
    const roll = DIARY_SECTIONS.find((s) => s.id === "entry-rollup")!;
    expect(roll.render({ grain: "quarterly" }).lines).toContain(
      "entry-rollup:month"
    );
    for (const g of ["weekly", "monthly"] as const) {
      expect(roll.render({ grain: g }).lines, g).toContain("entry-rollup");
      expect(roll.render({ grain: g }).lines, g).not.toContain(
        "entry-rollup:month"
      );
    }
  });

  it("writes the grain into the recap directive", () => {
    // `period-recap` cannot read its own period off the note — a year note and
    // a quarter note both carry a `*-start` property and the rollup shapes
    // differ — so the catalogue writes which one it is. A directive that lost
    // the argument refuses rather than guessing (see buildPeriodRecap).
    const recap = DIARY_SECTIONS.find((s) => s.id === "recap")!;
    expect(recap.render({ grain: "yearly" }).lines).toContain("period-recap:year");
    expect(recap.render({ grain: "quarterly" }).lines).toContain(
      "period-recap:quarter"
    );
  });

  it("offers exactly the one that was removed, plus the one never shipped", () => {
    // The editing case: a reader deleted Open Tasks and wants it back. The
    // other five must not be offered again.
    //
    // `tags` joins it from 3.14 for a different reason and it is worth reading
    // the two off one assertion: Open Tasks is offered because it was REMOVED,
    // and Tags because it is never composed in the first place. An opt-in
    // section is addable on a dashboard that has everything.
    const ctx = { grain: "weekly" } as const;
    const without = composeDiaryDashboard("weekly").replace(
      /```almanac\nheader:⏳ Open tasks\ntasks-table:,period\n```\n\n/,
      ""
    );
    expect(
      addableDiarySections(ctx, without)
        .map((s) => s.id)
        .filter((id) => !isPageWidgetId(id))
      // `time-grid` is here for the SAME reason as `tags` — never composed, so
      // always addable — and ahead of Open Tasks because the add list runs in
      // catalogue order, which is where a reader will look for it once it is on
      // the page.
    ).toEqual(["time-grid", "open-tasks", "tags"]);
  });

  it("finds a section whose header the reader retitled", () => {
    // `locate` matches the DIRECTIVE, not the header — retitling is what the
    // `header:` argument is for, and matching on it would make a renamed
    // section invisible and then offer a second copy of it.
    const retitled = composeDiaryDashboard("weekly").replace(
      "header:⏳ Open tasks",
      "header:📋 Things to do"
    );
    expect(
      detectDiarySections(retitled, { grain: "weekly" })
    ).toContain("open-tasks");
  });

  it("renders one section on its own, for adding it back", () => {
    const section = sectionsForDashboard({ grain: "weekly" }).find(
      (s) => s.id === "open-tasks"
    );
    expect(
      renderDiarySection(section as NonNullable<typeof section>, {
        grain: "weekly",
      })
    ).toBe("```almanac\nheader:⏳ Open tasks\ntasks-table:,period\n```");
  });

  it("offers nothing for a grain that has no dashboard", () => {
    // Daily. A daily entry IS the note, so `DashboardGrain` excludes it and
    // `diaryContextFor` returns null rather than an empty catalogue.
    const src = readSrc("section-insert");
    expect(src).toContain('if (kind.grain === "daily") return null;');
  });

  it("tells a dashboard apart from an entry in the same folder", () => {
    // The grain alone cannot: `Weekly/Week-2026-W30.md` and `Weekly/Weekly.md`
    // are both weekly. Only the folder-note path distinguishes them, and
    // offering dashboard sections to an entry would write a summary widget
    // into someone's week.
    const src = readSrc("section-insert");
    expect(src).toContain("folderNotePath(paths[CLASS_DEFS[kind.grain].folderKey])");
  });

  it("resolves through the one resolver, not a second path test", () => {
    expect(readSrc("section-insert")).toContain("noteKindOf(paths, notePath)");
  });
});

// ── 2.59.6: the refusal names the right reason ────────────────────────

describe("editing sections routes all three surfaces", () => {
  const src = () => readSrc("section-insert");

  it("no longer tells a diary note the editor isn't built", () => {
    // REWRITTEN IN 3.0, and the two sentences it used to assert are gone from
    // the source rather than from this file only. They were correct refusals —
    // 2.59.4 gave a dashboard a catalogue and no caller, and an entry had no
    // editable section list at all — and a correct refusal is worth exactly as
    // long as it takes to build the thing it refuses for. Patches 4 and 5
    // built them.
    expect(src()).not.toContain("section editing isn't available on ");
    expect(src()).not.toContain("the editor for them isn't built yet");
  });

  it("hands each surface a model rather than picking a window", () => {
    // §2's claim made operational: one editor, three models. What varies
    // between the three branches is the argument, not the call.
    for (const model of [
      "journalSectionModel",
      "diarySectionModel",
      "entrySectionModel",
    ]) {
      expect(readSrc("section-insert") + readSrc("template-editor"), model)
        .toContain(model);
    }
    expect(src()).toContain("openSectionEditor");
  });

  it("keeps the journal message for notes that really are unrecognised", () => {
    expect(src()).toContain("isn't one a journal recognises");
  });

  it("asks the one resolver rather than a second path test", () => {
    // Both diary resolvers open the same two lines — read the surface paths,
    // ask `noteKindOf` — so neither can drift from what the entry header and
    // the tracker surfaces believe about the same file.
    const calls = src().match(/noteKindOf\(paths, notePath\)/g) ?? [];
    expect(calls.length).toBe(2);
    expect(src()).toContain("surfacePathConfig(this.plugin)");
  });

  it("refuses a managed entry template, which is generated", () => {
    // The one refusal 3.0 ADDS. An entry template is composed from the
    // catalogue since 2.60.1 and rewritten by "Refresh entry templates", so a
    // section edited into one would survive until the next refresh and then
    // vanish with no explanation.
    expect(src()).toContain("isManagedTemplate");
    expect(src()).toContain("would be overwritten by the next refresh");
  });

  it("resolves the surface once instead of falling down a refusal ladder", () => {
    // REWRITTEN IN 3.0.1. The property this asserted — that the happy path does
    // not sit at the bottom of a growing ladder of refusals — is now structural
    // rather than positional: both commands ask `surfaceOfNote` once and switch
    // on the answer, so there is no ladder for the working case to fall into.
    // Measuring it by string position stopped meaning anything the moment the
    // refusals became named constants at the top of the file.
    const body = src();
    expect(body).toContain("private surfaceOfNote(");
    // ASSERTED PER COMMAND AS OF 4.5, not as a total. The property is that a
    // command asks ONCE and switches on the answer; the total was a proxy for
    // it that broke the moment a third caller appeared which is not a command
    // at all — `canEditSections`, the predicate the page title card asks before
    // drawing a control it might have to apologise for.
    // 4.30 ADDED A THIRD COMMAND AND 4.31 HOISTED THE QUESTION IT ASKS. The
    // clipboard copy resolved the surface itself until the vault export would
    // have been a fifth caller — so both now go through `modelForNote`, which is
    // the door, and the count below does not move for a whole new feature. This
    // is the reason `surfaceOfNote` stayed private: a second copy of "what kind
    // of note is this" is the drift this assertion exists to stop.
    for (const fn of [
      "async editSectionsHere(",
      "async addSectionHere(",
      "  modelForNote(",
    ]) {
      const at = body.indexOf(fn);
      expect(at, fn).toBeGreaterThan(0);
      const end = body.indexOf("\n  }", at);
      const asks = body.slice(at, end).match(/this\.surfaceOfNote\(notePath\)/g) ?? [];
      expect(asks, fn).toHaveLength(1);
    }
    // And the remaining caller is that predicate and nothing else — one line, so
    // it cannot grow a second opinion about which notes are editable. Two
    // editing commands, the read-only door, and the predicate: four, as of 4.31,
    // and unchanged by that release adding a vault-wide export.
    expect(body.match(/this\.surfaceOfNote\(notePath\)/g) ?? []).toHaveLength(4);
    expect(body).toContain("return this.surfaceOfNote(notePath) !== null;");
    // And the refusals are written once rather than once per command. Through
    // readCode, which strips comments: the paragraph above `addSectionHere`
    // quotes the message it used to give a diary note wrongly, and a check that
    // cannot tell a line of code from a line describing one is not checking
    // what it claims to.
    expect(
      readCode("section-insert").match(/isn't one a journal recognises/g) ?? []
    ).toHaveLength(1);
  });

  it("gives the add command the same surfaces as the edit command", () => {
    // THE 3.0.1 BUG. `addSectionHere` resolved the journal host and stopped, so
    // on any diary note it answered "this note isn't one a journal recognises"
    // while `editSectionsHere` opened an editor on the very same file. One
    // command knowing about a surface and its neighbour not is exactly the
    // drift a single resolver exists to prevent.
    const body = src();
    const add = body.slice(body.indexOf("async addSectionHere("));
    expect(add).toContain("this.surfaceOfNote(notePath)");
    // The host folder rides along as of 3.15 — the caller is what knows which
    // file it opened — but it is still ONE resolver feeding both commands.
    //
    // AND THE VAULT'S OWN LISTS RIDE ALONG TOO AS OF 4.15 §4, for the identical
    // reason and from the identical place: `this.vault()` is one method on this
    // class, so a widget offered a dropdown of this vault's journals in the
    // editor is offered the same list from the command. Asserted as the pair,
    // because a version of this that passed the vault to one of them would be
    // the 3.0.1 bug again in a new field.
    expect(add).toContain("modelForSurface(");
    expect(add).toContain("this.hostFolderOf(notePath)");
    expect(add).toContain("this.vault()");
    const edit = body.slice(
      body.indexOf("async editSectionsHere("),
      body.indexOf("async addSectionHere(")
    );
    expect(edit).toContain("this.vault()");
    // It reaches the diary through the interface, not through a second copy of
    // the routing.
    expect(add).not.toContain("resolveSectionHost");
  });

  it("and the add command still cannot remove or reorder anything", () => {
    // Non-destructive by construction rather than by being written in terms of
    // an append: the request is everything the note has PLUS one, so the plan
    // it is checked against can contain no remove and no move.
    //
    // THE PLUS-ONE IS A `SectionWant` AS OF 3.8 PATCH 7, where it used to be
    // the picked id. That is the only thing that changed: a section which
    // cannot render without an answer is asked for one here as well as in the
    // editor, so what gets appended is `{ id, options }` rather than `id`. The
    // property this test is about is the SHAPE of the request — everything
    // present, then one more — and it is untouched, which is why this asserts
    // the spread and not the name of what is spread into it.
    const body = src();
    const add = body.slice(body.indexOf("async addSectionHere("));
    expect(add).toContain("[...model.present(current), want]");
  });

  it("tells an entry from its own dashboard, which share a folder", () => {
    // The one thing the third resolver has to get right. `diaryContextFor`
    // answers "is this the folder note"; `entryContextFor` is the same test
    // read the other way round, so the two cannot both claim a note.
    expect(src()).toContain("if (this.diaryContextFor(notePath)) return null;");
  });
});


// ── 4.58.0: the widget door, on the surface that did not have one ─────
//
// The release's claim in one describe block: a period dashboard offers what the
// homepage offers, holds as many of a card as a reader asks for, lets them sit
// anywhere below the banner, and gives the file back unchanged when they all
// leave. Each of those is a different part of the model, and the last one is the
// property that says the other three did not damage anything.

describe("a dashboard holds page widgets", () => {
  const ctx = { grain: "weekly" } as const;
  const base = (): string => composeDiaryDashboard("weekly");

  it("adds one, and says so before writing it", () => {
    const text = base();
    const want = [...detectDiarySections(text, ctx), "w:events#1"];

    const ops = planDiarySections(text, ctx, want);
    expect(
      ops.find((o) => o.sectionId === "w:events#1")
    ).toMatchObject({ kind: "add", label: "Events" });
    // AND NOTHING ELSE IS TOUCHED. Every catalogue section is reported kept and
    // unchanged, which is the whole of what makes the preview worth reading.
    for (const id of detectDiarySections(text, ctx)) {
      expect(ops.find((o) => o.sectionId === id), id).toMatchObject({
        kind: "keep",
        detail: "unchanged",
      });
    }

    const next = applyDiarySections(text, ctx, want)!;
    expect(next).toContain("```almanac\nevents\n```");
    expect(detectDiarySections(next, ctx)).toEqual(want);
  });

  it("and a second, because a widget repeats where a section does not", () => {
    const one = applyDiarySections(base(), ctx, [
      ...detectDiarySections(base(), ctx),
      "w:events#1",
    ])!;
    const held = detectDiarySections(one, ctx);

    // The editor asks the MODEL for the next id rather than spelling one, which
    // is the reason `instanceOf` is a method. `taken` is what the window is
    // holding, not what the file contains.
    const model = diarySectionModel(ctx);
    expect(model.instanceOf!("w:events#1", one, held)).toBe("w:events#2");

    const two = applyDiarySections(one, ctx, [...held, "w:events#2"])!;
    expect(detectDiarySections(two, ctx)).toEqual([...held, "w:events#2"]);
    // Two lines, two sections. A single-anchor `locate` would have reported one.
    expect(two.match(/^events$/gm)).toHaveLength(2);
  });

  it("and it may sit anywhere below the banner, including above the overview", () => {
    // THE TWO HALVES OF THIS RELEASE MEETING. The widget is a `body` section and
    // so, as of this release, is the period summary — so a card can be dragged
    // above the overview, which the masthead band existed to prevent and which
    // nothing now does.
    const one = applyDiarySections(base(), ctx, [
      ...detectDiarySections(base(), ctx),
      "w:events#1",
    ])!;
    const held = detectDiarySections(one, ctx);
    const want = [
      "banner",
      "w:events#1",
      ...held.filter((id) => id !== "banner" && id !== "w:events#1"),
    ];
    const moved = applyDiarySections(one, ctx, want)!;
    expect(detectDiarySections(moved, ctx)).toEqual(want);

    // And not above the banner, which is the one thing a dashboard still
    // refuses. The request is not refused with a message; it is partitioned,
    // so it resolves to the top of the body.
    const climbed = applyDiarySections(moved, ctx, [
      "w:events#1",
      ...want.filter((id) => id !== "w:events#1"),
    ]);
    expect(detectDiarySections(climbed ?? moved, ctx)[0]).toBe("banner");
  });

  it("and gives the file back byte-for-byte when they all leave", () => {
    // THE PROPERTY THE OTHER THREE REST ON. A reconciler that adds a card and
    // cannot take it back out again without a trace is a formatter, which is the
    // distinction `layout.ts` keeps a list about — and on this surface the trace
    // would be a widening gap where the block used to be.
    const text = base();
    let next = applyDiarySections(text, ctx, [
      ...detectDiarySections(text, ctx),
      "w:events#1",
    ])!;
    next = applyDiarySections(next, ctx, [
      ...detectDiarySections(next, ctx),
      "w:events#2",
    ])!;
    expect(next).not.toBe(text);

    const back = applyDiarySections(
      next,
      ctx,
      detectDiarySections(next, ctx).filter((id) => !isPageWidgetId(id))
    )!;
    expect(back).toBe(text);
  });

  it("but never composes one into a fresh dashboard", () => {
    // THE SEAM THAT KEEPS THIS ADDITIVE. `composeDiaryDashboard` calls
    // `sectionsForDashboard` with no text, which is the arity that answers with
    // the catalogue alone — so no shipped note gains a line, and `reconcileLayouts`
    // has no unit for a widget and will neither insert one nor take one back out.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      expect(
        sectionsForDashboard({ grain: g }).some((s) => isPageWidgetId(s.id)),
        g
      ).toBe(false);
      expect(
        detectDiarySections(composeDiaryDashboard(g), { grain: g }).some(
          isPageWidgetId
        ),
        g
      ).toBe(false);
    }
  });

  it("and repair leaves them alone while it puts a missing section back", () => {
    // THE PATH THAT COULD HAVE COST SOMEBODY THEIR CARDS. `repairNote`
    // reconciles a note toward the composition this release ships, and the
    // shipped composition has no widgets in it — so the question is whether a
    // card a reader added reads as "something the note has that the shipped text
    // does not", which is the shape of a removal.
    //
    // IT DOES NOT, AND FOR A STRUCTURAL REASON RATHER THAN A LUCKY ONE. Repair's
    // want is *everything the note already has, in the order it has it*, plus the
    // shipped sections it lacks. The cards are in the first half. `FORBIDDEN`
    // would throw if the plan produced a `remove` or a `move` for one, so this
    // test fails loudly rather than quietly if that stops being true.
    const shipped = base();
    const model = diarySectionModel(ctx);

    let text = applyDiarySections(shipped, ctx, [
      ...detectDiarySections(shipped, ctx),
      "w:events#1",
    ])!;
    // ...and a shipped section the reader removed, so repair has real work.
    text = applyDiarySections(
      text,
      ctx,
      detectDiarySections(text, ctx).filter((id) => id !== "open-tasks")
    )!;

    const { ops, next } = repairNote(model, text, shipped);
    expect(ops.map((o) => o.kind)).toEqual(["add"]);
    expect(detectDiarySections(next!, ctx)).toEqual([
      "banner",
      "summary",
      "entry-rollup",
      "open-tasks",
      "charts",
      "w:events#1",
    ]);
    // A second run has nothing left to return, which is what makes idempotence
    // structural rather than claimed.
    expect(repairNote(model, next!, shipped).next).toBeNull();
  });

  it("and each card reads its OWN answer back, not the first one's", () => {
    // THE REFUSAL THIS ROUTES AROUND. The window reads an answer back by finding
    // the directive in the whole file and declines when it appears more than
    // once — right for a window holding a file and no extents, and fatal for a
    // widget whose directive is plural by design. The model located the section,
    // so it reads the answer off that section's own line.
    let text = applyDiarySections(base(), ctx, [
      ...detectDiarySections(base(), ctx),
      "w:journal-card#1",
    ])!;
    text = applyDiarySections(text, ctx, [
      ...detectDiarySections(text, ctx),
      "w:journal-card#2",
    ])!;
    text = text
      .replace(/^journal-card$/m, "journal-card:study")
      .replace(/^journal-card$/m, "journal-card:work");

    const answered = (id: string): Record<string, string> | undefined =>
      diarySectionModel(ctx)
        .sections(text)
        .find((v) => v.id === id)!.answered;
    expect(answered("w:journal-card#1")).toEqual({ arg: "study" });
    expect(answered("w:journal-card#2")).toEqual({ arg: "work" });
    // And the spare behind them has answered nothing, because it is not there.
    expect(answered("w:journal-card#3")).toEqual({});
  });

  it("and asks its questions with the lists the caller supplied", () => {
    const withVault = {
      grain: "weekly" as const,
      vault: { journals: [{ value: "study", label: "Study" }] },
    };
    const q = diarySectionModel(withVault)
      .addable(base())
      .find((v) => v.id === "w:journal-card#1")!.questions!;
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe("choice");
    expect(
      (q[0] as { values: { value: string }[] }).values.map((v) => v.value)
    ).toEqual(["study"]);
  });

  it("and reports one as removable and movable, never locked", () => {
    const one = applyDiarySections(base(), ctx, [
      ...detectDiarySections(base(), ctx),
      "w:events#1",
    ])!;
    const view = diarySectionModel(ctx)
      .sections(one)
      .find((v) => v.id === "w:events#1")!;
    // It is there because a reader added it, so it is theirs to move and theirs
    // to remove — `widgetSection`'s sentence, surviving the adaptation.
    expect(view.removable).toBe(true);
    expect(view.movable).toBe(true);
    expect(view.repeatable).toBe(true);
    expect(diarySectionModel(ctx).refusal("w:events#1", one)).toBeNull();
  });
});
describe("the time grid is a section on the week and a widget elsewhere", () => {
  // 4.58.1. The grid HAD only ever been a page widget, and a widget gets a plain
  // block head rather than a collapsible bar — which is the difference a reader
  // reported as "the time-grid section is missing its header bar". It was not
  // missing one; it was not a section. This block pins both halves of the fix:
  // the door it gained, and the doors it deliberately did not.

  const idsFor = (grain: DashboardGrain): string[] =>
    addableDiarySections({ grain }, composeDiaryDashboard(grain)).map((s) => s.id);

  it("offers the week a section and the other three the card", () => {
    // THE GRAIN IS THE DIRECTIVE'S OWN LIMIT, not a taste. `weekStartOf` reads
    // `week-start` from the host note and falls back to the CURRENT week, so a
    // monthly dashboard scoped to March would draw whatever week today is in.
    // A section of a period page claims to be about that period; this one could
    // only make that claim on a week.
    expect(idsFor("weekly")).toContain("time-grid");
    expect(idsFor("weekly").filter((id) => id.startsWith("w:time-grid"))).toEqual(
      []
    );
    for (const grain of ["monthly", "quarterly", "yearly"] as const) {
      // STILL ADDABLE, WHICH IS THE POINT OF TWO DOORS — the reader who wants a
      // grid on their year page may have one. What they do not get is the claim
      // that it is part of what a year dashboard IS.
      expect(idsFor(grain), grain).toContain("w:time-grid#1");
      expect(idsFor(grain), grain).not.toContain("time-grid");
    }
  });

  it("composes the header bar and the directive into one fence", () => {
    // The whole of the reported bug. A `header:` line welded to the directive is
    // what `headerbar.ts` walks to draw a collapsible bar; a widget's own
    // `journal-block-head` is not collapsible and is suppressed when the fence
    // already carries a bar.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    expect(out).toContain(
      "```almanac\nheader:⏱️ The week by the hour\ntime-grid\n```"
    );
  });

  it("is withheld once the page has it, unlike the widget it wraps", () => {
    // A SECTION IS ONE PER PAGE and a widget is not — `widgetInstances` keeps a
    // spare behind every instance so a card never leaves the picker, and that is
    // exactly the behaviour a section must not have: a second grid would claim
    // the first one's region.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    expect(model.present(out)).toContain("time-grid");
    expect(model.addable(out).map((s) => s.id)).not.toContain("time-grid");
    expect(
      model.addable(out).map((s) => s.id).filter((id) => id.startsWith("w:time-grid"))
    ).toEqual([]);
  });

  it("takes the grid back off without a trace", () => {
    // The promise every opt-in section makes: added and removed leaves the file
    // it started as, byte for byte. A section that cannot be cleanly removed is
    // a section a reader is right to be wary of adding.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    expect(
      model.apply(out, model.present(out).filter((id) => id !== "time-grid"))
    ).toBe(base);
  });

  it("asks the registry's question rather than its own", () => {
    // ONE DECLARATION OF THE SOURCES, in `widget-registry.ts`. The section and
    // the widget compose the same directive, so a second list here would be the
    // copy that starts disagreeing the day the grid grows a fourth source —
    // which it did, in 4.62, when captures became drawable. This assertion is
    // the only place that had to change, which is the arrangement working.
    const view = diarySectionModel({ grain: "weekly" })
      .sections(composeDiaryDashboard("weekly"))
      .find((s) => s.id === "time-grid");
    expect(
      view?.questions?.find((q) => q.key === "arg")?.values?.map((v) => v.value)
    ).toEqual(["events", "logbooks", "tasks", "captures"]);
  });

  it("keeps finding the section after the reader narrows it", () => {
    // `locate` matches the KEYWORD, not the argument — the rule every catalogue
    // follows. Matching the whole line would make a narrowed grid invisible and
    // then offer a second one beside it.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const out = model
      .apply(base, [...model.present(base), "time-grid"])
      .replace("\ntime-grid\n", "\ntime-grid:events\n");
    expect(model.present(out)).toContain("time-grid");
    expect(model.addable(out).map((s) => s.id)).not.toContain("time-grid");
    // And the answer reads back out of the file, which is what re-pointing it
    // through the editor depends on.
    //
    // TWO KEYS SINCE 4.62, and the second is empty here on purpose: the grid's
    // argument is now the sources and then the day count, and a line written
    // before that question existed has answered it with "the whole week". A
    // reader who narrows the sources and never touches the days must still read
    // back as somebody who answered both, or re-pointing the first would drop
    // the second.
    expect(
      model.sections(out).find((s) => s.id === "time-grid")?.answered
    ).toEqual({ arg: "events", arg2: "", form: "section" });
  });

  it("never arrives on a dashboard that did not ask", () => {
    // 3.9 §2's rule, and the reason this is `optIn` rather than shipped. Every
    // weekly dashboard in every vault predates the section, and `repairNote` is
    // what runs over them — it must add nothing.
    const base = composeDiaryDashboard("weekly");
    expect(base).not.toContain("time-grid");
    const model = diarySectionModel({ grain: "weekly" });
    // Nothing to do on the page as shipped...
    expect(repairNote(model, base, base).next).toBeNull();
    // ...and nothing to undo on the page a reader added it to. Repair is
    // additive, so the section it never writes is also a section it never takes
    // away — the two halves that make an opt-in section safe to offer.
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    expect(repairNote(model, out, base).next).toBeNull();
  });

  it("is the reader's to move and the reader's to remove", () => {
    // Neither locked nor pinned: nothing of theirs is stored in it. The
    // meetings, the log items and the tasks are in their own notes.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    const view = model.sections(out).find((s) => s.id === "time-grid");
    expect(view?.removable).toBe(true);
    expect(view?.movable).toBe(true);
    expect(model.refusal("time-grid", out)).toBeNull();
  });
});

describe("the period summary is a section and wears a section's bar", () => {
  // 4.59.0. It had none: every other section on a dashboard is a `header:` line
  // welded to its directive, and this one was the directive alone — so the one
  // section a reader cannot remove was also the one they could not fold. The
  // card is what made the omission look deliberate.

  const bodyOf = (text: string, grain: DashboardGrain): string[] => {
    const lines = text.split("\n");
    const at = lines.findIndex((l) =>
      l.startsWith(`${CLASS_DEFS[grain].periodNoun}-summary`)
    );
    let open = at;
    while (open >= 0 && !lines[open].startsWith("```")) open--;
    const out: string[] = [];
    for (let i = open + 1; i < lines.length && !lines[i].startsWith("```"); i++) {
      out.push(lines[i]);
    }
    return out;
  };

  it("composes the bar above the directive, on all four grains", () => {
    // ABOVE, NOT BESIDE: a bar anchors the widgets that FOLLOW it, so one
    // written below the summary would title nothing and pull the `button:` line
    // into its own actions strip.
    for (const grain of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const body = bodyOf(composeDiaryDashboard(grain), grain);
      expect(body[0], grain).toBe(
        `${HEADER_PREFIX}📅 This ${CLASS_DEFS[grain].periodNoun}`
      );
      expect(body[1], grain).toMatch(/-summary$/);
    }
  });

  it("turns into a widget and back without a trace", () => {
    // The toggle's whole promise. A section that could not be turned back is a
    // section a reader is right not to touch.
    for (const grain of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const ctx = { grain };
      const model = diarySectionModel(ctx);
      const base = composeDiaryDashboard(grain);
      const asWidget = model.apply(
        base,
        model.present(base).map((id) =>
          id === "summary" ? { id, options: { form: "widget" } } : id
        )
      )!;
      expect(bodyOf(asWidget, grain)[0], grain).toMatch(/-summary$/);
      const back = model.apply(
        asWidget,
        model.present(asWidget).map((id) =>
          id === "summary" ? { id, options: { form: "section" } } : id
        )
      );
      expect(back, grain).toBe(base);
    }
  });

  it("reads its form off the fence, so the editor opens on the truth", () => {
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const formOn = (text: string): string | undefined =>
      model.sections(text).find((s) => s.id === "summary")?.answered?.form;
    expect(formOn(base)).toBe("section");
    expect(formOn(base.replace("header:📅 This week\n", ""))).toBe("widget");
  });

  it("leaves a bar the reader renamed exactly as they left it", () => {
    // `attachHeaderRename` rewrites this very line, so re-answering "a section"
    // on a fence that already is one must write nothing. The first cut of this
    // release spliced the token "section" into the bar's title instead, because
    // the question names `header:` and the argument splices had not been taught
    // to skip it.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const renamed = composeDiaryDashboard("weekly").replace(
      "header:📅 This week",
      "header:🗓 My own week"
    );
    const out = model.apply(
      renamed,
      model.present(renamed).map((id) =>
        id === "summary" ? { id, options: { form: "section" } } : id
      )
    );
    expect(out === null || out.includes("header:🗓 My own week")).toBe(true);
    expect(out ?? renamed).not.toContain("header:section");
  });

  it("says what the toggle does in the plan, in the catalogue's words", () => {
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const op = model
      .plan(
        base,
        model.present(base).map((id) =>
          id === "summary" ? { id, options: { form: "widget" } } : id
        )
      )
      .find((o) => o.sectionId === "summary");
    expect(op?.kind).toBe("reconfigure");
    expect(op?.detail).toContain("sit in a row");
  });

  it("titles an untitled fence on a dashboard that predates the bar", () => {
    // Repair is additive and the section is already there, so the bar can only
    // arrive as a migration — `ensureTrendsHeader`'s shape, for its reason.
    for (const grain of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const shipped = composeDiaryDashboard(grain);
      const older = shipped.replace(
        `${HEADER_PREFIX}📅 This ${CLASS_DEFS[grain].periodNoun}\n`,
        ""
      );
      expect(titleSummaryFence(older), grain).toBe(shipped);
      // AND IT IS IDEMPOTENT, which is what makes it safe to offer every time
      // the repair window opens.
      expect(titleSummaryFence(shipped), grain).toBeNull();
    }
  });

  it("declines the two fences a reader has decided something about", () => {
    const shipped = composeDiaryDashboard("weekly");
    const older = shipped.replace(`${HEADER_PREFIX}📅 This week\n`, "");
    // A GROUPED SUMMARY IS THE WIDGET FORM ON PURPOSE. `isSectionFence` refuses
    // a self-titling fence as cell content, so titling this would drop the bar
    // below the group it appeared to title and break the layout they built.
    expect(
      titleSummaryFence(older.replace("```almanac\nweek-summary", "```almanac\nrow\nweek-summary"))
    ).toBeNull();
    // AND A BAR THEY RENAMED IS STILL A BAR. Ours must not land above theirs.
    expect(
      titleSummaryFence(shipped.replace("📅 This week", "🗓 My own week"))
    ).toBeNull();
  });

  it("still cannot be removed, and can still be moved", () => {
    // 4.58.0's settlement, untouched: the summary is what makes a dashboard say
    // which period it is about, and the toggle changes how it is drawn rather
    // than whether it is there.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const base = composeDiaryDashboard("weekly");
    const view = model.sections(base).find((s) => s.id === "summary");
    expect(view?.removable).toBe(false);
    expect(view?.movable).toBe(true);
  });

  it("allows Period Summary in widget mode to be grouped into a row", () => {
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const shipped = composeDiaryDashboard("weekly");
    // In section mode, summary has header: so blocks() reports empty column
    const blocksSection = model.blocks!(shipped);
    const summaryBlock = blocksSection.find((b) => b.ids.includes("summary"));
    expect(summaryBlock?.column).toEqual([]);

    // In widget mode (no header), summary has week-summary + button
    const widgetMode =
      shipped.replace(`${HEADER_PREFIX}📅 This week\n`, "") +
      "\n```almanac\nevents\n```\n";
    const blocksWidget = model.blocks!(widgetMode);
    const summaryWidgetBlock = blocksWidget.find((b) => b.ids.includes("summary"));
    expect(summaryWidgetBlock?.column).toEqual(["summary"]);

    // Regrouping summary in widget mode with events succeeds
    const regrouped = model.regroup!(widgetMode, [["summary", "w:events#1"]]);
    expect(regrouped).not.toBeNull();
    expect(regrouped).toContain("row\nweek-summary\nbutton:new-week\ncell\nevents");
  });

  it("allows recap and time-grid to be switched to widget form", () => {
    const weeklyModel = diarySectionModel({ grain: "weekly" });
    const weeklyBase = composeDiaryDashboard("weekly");
    const withGrid = weeklyModel.apply(weeklyBase, [...weeklyModel.present(weeklyBase), "time-grid"]);
    expect(withGrid).toContain("header:⏱️ The week by the hour\ntime-grid");

    const gridAsWidget = weeklyModel.apply(
      withGrid,
      weeklyModel.present(withGrid).map((id) =>
        id === "time-grid" ? { id, options: { form: "widget" } } : id
      )
    );
    expect(gridAsWidget).not.toContain("header:⏱️ The week by the hour");
    expect(gridAsWidget).toContain("time-grid");

    const yearlyModel = diarySectionModel({ grain: "yearly" });
    const yearlyBase = composeDiaryDashboard("yearly");
    const withRecap = yearlyModel.apply(yearlyBase, [...yearlyModel.present(yearlyBase), "recap"]);
    expect(withRecap).toContain("header:📝 Recap\nperiod-recap:year");

    const recapAsWidget = yearlyModel.apply(
      withRecap,
      yearlyModel.present(withRecap).map((id) =>
        id === "recap" ? { id, options: { form: "widget" } } : id
      )
    );
    expect(recapAsWidget).not.toContain("header:📝 Recap");
    expect(recapAsWidget).toContain("period-recap:year");
  });
});
